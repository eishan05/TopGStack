import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SessionManager } from "../session.js";
import { judge } from "./judge.js";
import type {
  EvalCase,
  VariantConfig,
  CaseResult,
  JudgeProvider,
} from "./types.js";
import type { OrchestratorResult } from "../types.js";

function buildTopgArgs(evalCase: EvalCase, variant: VariantConfig, cwd: string): string[] {
  const args = [evalCase.prompt, "--output", "json", "--yolo", "--no-dashboard", "--cwd", cwd];

  const flags = variant.cliFlags;
  if (flags?.guardrail !== undefined) {
    args.push("--guardrail", String(flags.guardrail));
  } else if (evalCase.maxRounds) {
    args.push("--guardrail", String(evalCase.maxRounds));
  }
  if (flags?.timeout !== undefined) {
    args.push("--timeout", String(flags.timeout));
  } else {
    args.push("--timeout", "300");
  }
  if (flags?.startWith) {
    args.push("--start-with", flags.startWith);
  }
  if (flags?.codexSandbox) {
    args.push("--codex-sandbox", flags.codexSandbox);
  }
  if (flags?.codexWebSearch) {
    args.push("--codex-web-search", flags.codexWebSearch);
  }
  if (flags?.codexModel) {
    args.push("--codex-model", flags.codexModel);
  }
  if (flags?.codexReasoning) {
    args.push("--codex-reasoning", flags.codexReasoning);
  }

  return args;
}

function runTopg(args: string[], env: Record<string, string | undefined>, timeoutMs: number): Promise<OrchestratorResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("topg", args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`topg timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`topg exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Failed to parse topg output as JSON:\n${stdout.slice(0, 1000)}`));
      }
    });
  });
}

/**
 * Build environment variables for prompt overrides.
 * The topg CLI reads TOPG_PROMPT_<ROLE> env vars to override default prompts.
 */
function buildPromptEnv(variant: VariantConfig): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  const overrides = variant.promptOverrides;
  if (!overrides) return env;

  const roles = ["initiator", "reviewer", "rebuttal", "synthesis", "escalation"] as const;
  for (const role of roles) {
    const filePath = overrides[role];
    if (filePath) {
      const resolved = path.resolve(filePath);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Prompt override file not found: ${resolved} (variant: ${variant.name}, role: ${role})`);
      }
      env[`TOPG_PROMPT_${role.toUpperCase()}`] = fs.readFileSync(resolved, "utf-8");
    }
  }

  return env;
}

export interface RunOptions {
  cwd: string;
  judgeProvider: JudgeProvider;
  judgeTimeoutMs?: number;
  debateTimeoutMs?: number;
  onCaseStart?: (caseId: string, variant: string) => void;
  onCaseEnd?: (result: CaseResult) => void;
}

export async function runLive(
  cases: EvalCase[],
  variant: VariantConfig,
  opts: RunOptions,
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];
  const promptEnv = buildPromptEnv(variant);
  const judgeProvider = variant.judge ?? opts.judgeProvider;
  const debateTimeout = opts.debateTimeoutMs ?? 600_000;
  const judgeTimeout = opts.judgeTimeoutMs ?? 120_000;

  for (const evalCase of cases) {
    opts.onCaseStart?.(evalCase.id, variant.name);
    const start = Date.now();

    let outcome: OrchestratorResult | null = null;
    let error: string | undefined;

    try {
      const args = buildTopgArgs(evalCase, variant, opts.cwd);
      outcome = await runTopg(args, promptEnv, debateTimeout);
    } catch (err) {
      error = (err as Error).message;
    }

    let scores = null;
    if (outcome && !error) {
      try {
        scores = await judge(evalCase.prompt, outcome, judgeProvider, judgeTimeout);
      } catch (err) {
        error = `Judge failed: ${(err as Error).message}`;
      }
    }

    const caseResult: CaseResult = {
      caseId: evalCase.id,
      variant: variant.name,
      outcome,
      scores,
      rounds: outcome?.rounds ?? 0,
      converged: outcome?.type === "consensus",
      durationMs: Date.now() - start,
      error,
    };

    results.push(caseResult);
    opts.onCaseEnd?.(caseResult);
  }

  return results;
}

export async function runReplay(
  sessionIds: string[],
  judgeProvider: JudgeProvider,
  judgeTimeoutMs = 120_000,
  sessionBaseDir?: string,
  onSessionStart?: (sessionId: string) => void,
): Promise<CaseResult[]> {
  const session = new SessionManager(sessionBaseDir);
  const results: CaseResult[] = [];

  for (const sessionId of sessionIds) {
    onSessionStart?.(sessionId);

    try {
      const data = session.load(sessionId);

      const outcome: OrchestratorResult = {
        type: data.meta.status === "completed" ? "consensus" : "escalation",
        sessionId: data.meta.sessionId,
        rounds: Math.ceil(data.messages.filter((m) => m.type !== "user-prompt" && m.type !== "user-guidance").length / 2),
        summary: "",
        messages: data.messages,
      };

      // Read summary if available
      const summaryPath = path.join(
        sessionBaseDir ?? path.join(process.env.TOPG_HOME ?? path.join(require("node:os").homedir(), ".topg"), "sessions"),
        sessionId,
        "summary.md"
      );
      if (fs.existsSync(summaryPath)) {
        outcome.summary = fs.readFileSync(summaryPath, "utf-8");
      }

      const scores = await judge(data.meta.prompt, outcome, judgeProvider, judgeTimeoutMs);

      results.push({
        caseId: sessionId,
        variant: "replay",
        outcome,
        scores,
        rounds: outcome.rounds,
        converged: outcome.type === "consensus",
        durationMs: 0,
      });
    } catch (err) {
      results.push({
        caseId: sessionId,
        variant: "replay",
        outcome: null,
        scores: null,
        rounds: 0,
        converged: false,
        durationMs: 0,
        error: (err as Error).message,
      });
    }
  }

  return results;
}
