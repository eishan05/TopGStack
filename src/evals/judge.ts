import { spawn } from "node:child_process";
import { Codex } from "@openai/codex-sdk";
import type { JudgeProvider, JudgeScores } from "./types.js";
import type { OrchestratorResult } from "../types.js";

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator of multi-agent AI debates. You will be given a debate transcript between two AI agents and the original user prompt they were debating.

Score the debate on exactly four dimensions, each from 1 (worst) to 5 (best):

1. **tradeoffSurfacing** — Did the debate surface real, meaningful tradeoffs? Did agents identify genuine tensions rather than agreeing on the obvious? (1 = no tradeoffs explored, 5 = deep, nuanced tradeoffs identified)

2. **synthesisQuality** — Is the final output coherent, complete, and actionable? Does it directly address the user's question? (1 = incoherent or missing, 5 = excellent deliverable)

3. **convergenceEfficiency** — Did agents converge without wasted rounds? Did they avoid circular arguments or restating the same points? (1 = many wasted rounds, 5 = every round added value)

4. **noCapitulation** — Did both agents maintain intellectual integrity? Did they push back when they had valid points rather than caving to converge? (1 = agent caved without reasoning, 5 = both agents held their ground appropriately)

Respond with ONLY valid JSON in this exact format, no other text:
{
  "tradeoffSurfacing": <1-5>,
  "synthesisQuality": <1-5>,
  "convergenceEfficiency": <1-5>,
  "noCapitulation": <1-5>,
  "rationale": "<2-3 sentence explanation of your scores>"
}`;

function buildJudgePrompt(originalPrompt: string, result: OrchestratorResult): string {
  const transcript = result.messages
    .map((m) => {
      const label = m.agent.charAt(0).toUpperCase() + m.agent.slice(1);
      const signal = m.convergenceSignal ? ` [${m.convergenceSignal}]` : "";
      return `### Turn ${m.turn} — ${label} (${m.role})${signal}\n${m.content}`;
    })
    .join("\n\n---\n\n");

  return `## Original Prompt\n${originalPrompt}\n\n## Debate Outcome\nType: ${result.type} | Rounds: ${result.rounds}\n\n## Summary\n${result.summary}\n\n## Full Transcript\n${transcript}`;
}

function parseJudgeResponse(raw: string): JudgeScores {
  // Extract JSON from response — handle markdown code blocks
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) ?? raw.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    throw new Error(`Judge response contained no JSON:\n${raw.slice(0, 500)}`);
  }

  const parsed = JSON.parse(jsonMatch[1].trim());

  const dims = ["tradeoffSurfacing", "synthesisQuality", "convergenceEfficiency", "noCapitulation"] as const;
  for (const dim of dims) {
    const val = parsed[dim];
    if (typeof val !== "number" || val < 1 || val > 5) {
      throw new Error(`Invalid score for ${dim}: ${val}`);
    }
  }
  if (typeof parsed.rationale !== "string") {
    throw new Error("Missing rationale in judge response");
  }

  return parsed as JudgeScores;
}

async function judgeWithClaude(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const fullPrompt = `${JUDGE_SYSTEM_PROMPT}\n\n${prompt}`;
    const proc = spawn("claude", ["-p", fullPrompt, "--output-format", "json"], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Claude judge timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Claude judge exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed.result ?? parsed.content ?? stdout);
      } catch {
        resolve(stdout);
      }
    });
  });
}

async function judgeWithCodex(prompt: string, timeoutMs: number): Promise<string> {
  const client = new Codex();
  const thread = await client.startThread({
    workingDirectory: process.cwd(),
    sandboxMode: "read-only",
    approvalPolicy: "never",
  });

  const fullPrompt = `${JUDGE_SYSTEM_PROMPT}\n\n${prompt}`;

  const result = await Promise.race([
    thread.run(fullPrompt),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Codex judge timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);

  return result.finalResponse ?? String(result);
}

export async function judge(
  originalPrompt: string,
  result: OrchestratorResult,
  provider: JudgeProvider = "claude",
  timeoutMs = 120_000,
): Promise<JudgeScores> {
  const prompt = buildJudgePrompt(originalPrompt, result);

  const raw = provider === "claude"
    ? await judgeWithClaude(prompt, timeoutMs)
    : await judgeWithCodex(prompt, timeoutMs);

  return parseJudgeResponse(raw);
}

export { JUDGE_SYSTEM_PROMPT, buildJudgePrompt, parseJudgeResponse };
