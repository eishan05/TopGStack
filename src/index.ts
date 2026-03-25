#!/usr/bin/env node

import { Command } from "commander";
import { Orchestrator } from "./orchestrator.js";
import { ClaudeAdapter } from "./adapters/claude-adapter.js";
import { CodexAdapter } from "./adapters/codex-adapter.js";
import { SessionManager } from "./session.js";
import { startRepl } from "./repl.js";
import { createTopgServer } from "./server.js";
import { askUser, parseDuration } from "./utils.js";
import type { AgentName, CodexConfig, OrchestratorConfig, SessionMeta } from "./types.js";
import { DEFAULT_CASES, runLive, runReplay, buildReport, formatReport } from "./evals/index.js";
import type { VariantConfig, JudgeProvider, EvalCase } from "./evals/types.js";

const program = new Command();

program
  .name("topg")
  .description("Inter-agent collaboration between Claude Code and OpenAI Codex")
  .version("0.1.0");

program
  .command("serve")
  .description("Start the web dashboard")
  .option("--port <number>", "Port to listen on", "4747")
  .action(async (opts) => {
    if (!process.env.OPENAI_API_KEY) {
      console.error("Error: OPENAI_API_KEY is required for Codex.");
      console.error("Set it via: export OPENAI_API_KEY=your-key");
      process.exit(1);
    }

    const port = parseInt(opts.port, 10);
    const session = new SessionManager();
    const server = createTopgServer({ port, sessionManager: session });

    const actualPort = await server.start();
    console.error(`topg dashboard running at http://localhost:${actualPort}`);
    console.error("Press Ctrl+C to stop.\n");

    process.on("SIGINT", () => {
      console.error("\nShutting down...");
      server.close();
      process.exit(0);
    });
  });

program
  .command("delete <sessionId>")
  .description("Delete a single session")
  .action(async (sessionId: string) => {
    const session = new SessionManager();
    try {
      const data = session.load(sessionId);
      const snippet = data.meta.prompt.length > 50
        ? data.meta.prompt.slice(0, 50) + "..."
        : data.meta.prompt;
      session.deleteSession(sessionId);
      console.error(`Deleted session ${sessionId} ("${snippet}")`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("eval")
  .description("A/B test prompt variants and CLI configurations")
  .requiredOption("--variant-a <path>", "Path to variant A config JSON")
  .requiredOption("--variant-b <path>", "Path to variant B config JSON")
  .option("--cases <path>", "Path to custom cases module (default: built-in cases)")
  .option("--judge <provider>", "Judge provider: claude or codex", "claude")
  .option("--judge-timeout <seconds>", "Judge timeout per case in seconds", "120")
  .option("--debate-timeout <seconds>", "Debate timeout per case in seconds", "600")
  .option("--cwd <path>", "Working directory for debates", process.cwd())
  .option("--replay <sessionIds...>", "Replay mode: score existing session IDs instead of running live debates")
  .option("--save <path>", "Save raw results JSON to path")
  .action(async (opts) => {
    const fs = await import("node:fs");
    const path = await import("node:path");

    // Load variant configs
    let configA: VariantConfig;
    let configB: VariantConfig;
    try {
      configA = JSON.parse(fs.readFileSync(path.resolve(opts.variantA), "utf-8"));
      configB = JSON.parse(fs.readFileSync(path.resolve(opts.variantB), "utf-8"));
    } catch (err) {
      console.error(`Error loading variant configs: ${(err as Error).message}`);
      process.exit(1);
    }

    if (!configA.name || !configB.name) {
      console.error("Error: Both variant configs must have a \"name\" field.");
      process.exit(1);
    }

    const judgeProvider = (opts.judge as JudgeProvider) ?? "claude";
    const judgeTimeout = parseInt(opts.judgeTimeout, 10) * 1000;
    const debateTimeout = parseInt(opts.debateTimeout, 10) * 1000;

    // Replay mode
    if (opts.replay) {
      console.error(`Replay mode: scoring ${opts.replay.length} session(s) with ${judgeProvider} judge...\n`);
      const results = await runReplay(
        opts.replay as string[],
        judgeProvider,
        judgeTimeout,
        undefined,
        (sid) => console.error(`  Scoring session ${sid}...`),
      );

      for (const r of results) {
        if (r.error) {
          console.error(`  ${r.caseId}: ERROR — ${r.error}`);
        } else if (r.scores) {
          const total = r.scores.tradeoffSurfacing + r.scores.synthesisQuality +
            r.scores.convergenceEfficiency + r.scores.noCapitulation;
          console.error(`  ${r.caseId}: ${total}/20 (${r.converged ? "consensus" : "escalation"}, ${r.rounds} rounds)`);
          console.error(`    ${r.scores.rationale}`);
        }
      }

      if (opts.save) {
        fs.writeFileSync(path.resolve(opts.save), JSON.stringify(results, null, 2));
        console.error(`\nResults saved to ${opts.save}`);
      }
      return;
    }

    // Live A/B mode
    let cases: EvalCase[] = DEFAULT_CASES;
    if (opts.cases) {
      try {
        const casesModule = await import(path.resolve(opts.cases));
        cases = casesModule.default ?? casesModule.cases ?? casesModule.DEFAULT_CASES;
      } catch (err) {
        console.error(`Error loading cases: ${(err as Error).message}`);
        process.exit(1);
      }
    }

    console.error(`A/B Eval: "${configA.name}" vs "${configB.name}"`);
    console.error(`Cases: ${cases.length} | Judge: ${judgeProvider}`);
    console.error(`Debate timeout: ${debateTimeout / 1000}s | Judge timeout: ${judgeTimeout / 1000}s\n`);

    const runOpts = {
      cwd: opts.cwd as string,
      judgeProvider,
      judgeTimeoutMs: judgeTimeout,
      debateTimeoutMs: debateTimeout,
      onCaseStart: (caseId: string, variant: string) => {
        console.error(`  [${variant}] Running case: ${caseId}...`);
      },
      onCaseEnd: (result: import("./evals/types.js").CaseResult) => {
        if (result.error) {
          console.error(`  [${result.variant}] ${result.caseId}: ERROR — ${result.error}`);
        } else {
          const total = result.scores
            ? result.scores.tradeoffSurfacing + result.scores.synthesisQuality +
              result.scores.convergenceEfficiency + result.scores.noCapitulation
            : 0;
          console.error(`  [${result.variant}] ${result.caseId}: ${total}/20 (${Math.round(result.durationMs / 1000)}s)`);
        }
      },
    };

    console.error("Running variant A...");
    const resultsA = await runLive(cases, configA, runOpts);

    console.error("\nRunning variant B...");
    const resultsB = await runLive(cases, configB, runOpts);

    const caseCategories = new Map(cases.map((c) => [c.id, c.category]));
    const report = buildReport(configA, resultsA, configB, resultsB, caseCategories);

    console.error("");
    console.log(formatReport(report));

    if (opts.save) {
      const savePath = path.resolve(opts.save);
      fs.writeFileSync(savePath, JSON.stringify(report, null, 2));
      console.error(`\nFull report saved to ${savePath}`);
    }
  });

program
  .command("clear")
  .description("Bulk-delete sessions by status or age")
  .option("--all", "Delete all sessions")
  .option("--completed", "Delete completed sessions")
  .option("--escalated", "Delete escalated sessions")
  .option("--older-than <duration>", "Delete sessions not updated within duration (e.g., 7d, 2w, 1m)")
  .option("--force", "Skip confirmation prompt")
  .action(async (opts) => {
    // Validate: at least one filter required
    if (!opts.all && !opts.completed && !opts.escalated && !opts.olderThan) {
      console.error("Error: At least one filter is required (--all, --completed, --escalated, --older-than).");
      console.error("\nExamples:");
      console.error("  topg clear --all                        Delete all sessions");
      console.error("  topg clear --completed                  Delete completed sessions");
      console.error("  topg clear --completed --older-than 7d  Delete completed sessions older than 7 days");
      process.exit(1);
    }

    // Validate: --all cannot combine with other filters
    if (opts.all && (opts.completed || opts.escalated || opts.olderThan)) {
      console.error("Error: --all cannot be combined with --completed, --escalated, or --older-than.");
      process.exit(1);
    }

    const session = new SessionManager();

    let sessions: SessionMeta[];
    if (opts.all) {
      sessions = session.listSessions();
    } else {
      const statuses: SessionMeta["status"][] = [];
      if (opts.completed) statuses.push("completed");
      if (opts.escalated) statuses.push("escalated");

      let olderThan: Date | undefined;
      if (opts.olderThan) {
        const ms = parseDuration(opts.olderThan);
        olderThan = new Date(Date.now() - ms);
      }

      sessions = session.filterSessions({
        statuses: statuses.length > 0 ? statuses : undefined,
        olderThan,
      });
    }

    if (sessions.length === 0) {
      console.error("No sessions match the given filters.");
      return;
    }

    // Warn when active/paused sessions would be deleted without an explicit status filter
    if (!opts.all && !opts.completed && !opts.escalated) {
      const resumable = sessions.filter((s) => s.status === "active" || s.status === "paused");
      if (resumable.length > 0) {
        console.error(`Warning: ${resumable.length} active/paused session${resumable.length === 1 ? "" : "s"} will be deleted.`);
        console.error("Use --completed or --escalated to target only finished sessions.");
      }
    }

    // Show confirmation unless --force
    if (!opts.force) {
      const statusCounts = new Map<string, number>();
      for (const s of sessions) {
        statusCounts.set(s.status, (statusCounts.get(s.status) ?? 0) + 1);
      }
      const breakdown = Array.from(statusCounts.entries())
        .map(([status, count]) => `${count} ${status}`)
        .join(", ");

      console.error(`About to delete ${sessions.length} session${sessions.length === 1 ? "" : "s"}:`);
      console.error(`  ${breakdown}`);
      const answer = await askUser("Continue? (y/N) ");
      if (answer.toLowerCase() !== "y") {
        console.error("Aborted.");
        return;
      }
    }

    // Delete all matched sessions
    for (const s of sessions) {
      session.deleteSession(s.sessionId);
    }
    console.error(`Deleted ${sessions.length} session${sessions.length === 1 ? "" : "s"}.`);
  });

program
  .argument("[prompt]", "The prompt or question to collaborate on")
  .option("--start-with <agent>", "Which agent goes first (claude or codex)", "claude")
  .option("--cwd <path>", "Working directory for agents", process.cwd())
  .option("--guardrail <rounds>", "Soft escalation after N rounds", "5")
  .option("--timeout <seconds>", "Timeout per agent turn in seconds", "900")
  .option("--output <format>", "Output format (text or json)", "text")
  .option("--transcript <path>", "Save full transcript to path")
  .option("--resume <sessionId>", "Resume a paused session")
  .option("--codex-sandbox <mode>", "Codex sandbox mode (read-only, workspace-write, danger-full-access)", "workspace-write")
  .option("--codex-web-search <mode>", "Codex web search (disabled, cached, live)", "live")
  .option("--codex-network", "Enable network access for Codex", true)
  .option("--no-codex-network", "Disable network access for Codex")
  .option("--codex-model <model>", "Override model for Codex agent")
  .option("--codex-reasoning <effort>", "Codex reasoning effort (minimal, low, medium, high, xhigh)")
  .option("--dashboard", "Start the web dashboard alongside the REPL (default: true)", true)
  .option("--no-dashboard", "Disable the auto-started web dashboard")
  .option("--yolo", "Skip all permission checks: Claude gets --dangerously-skip-permissions, Codex gets full sandbox access")
  .action(async (prompt: string | undefined, opts) => {
    // Validate credentials
    if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_API_KEY) {
      console.error("Warning: ANTHROPIC_API_KEY not set. Claude Code will attempt to use your active login session.");
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error("Error: OPENAI_API_KEY is required for Codex.");
      console.error("Set it via: export OPENAI_API_KEY=your-key");
      process.exit(1);
    }

    const codexCfg: CodexConfig = {
      sandboxMode: opts.codexSandbox as CodexConfig["sandboxMode"],
      webSearchMode: opts.codexWebSearch as CodexConfig["webSearchMode"],
      networkAccessEnabled: !!opts.codexNetwork,
      approvalPolicy: "never",
      model: opts.codexModel,
      modelReasoningEffort: opts.codexReasoning as CodexConfig["modelReasoningEffort"],
    };

    const yolo = !!opts.yolo;

    const config: OrchestratorConfig = {
      startWith: opts.startWith as AgentName,
      workingDirectory: opts.cwd,
      guardrailRounds: parseInt(opts.guardrail, 10),
      timeoutMs: parseInt(opts.timeout, 10) * 1000,
      outputFormat: opts.output as "text" | "json",
      codex: codexCfg,
      yolo,
    };

    const replOptions = { dashboard: opts.dashboard as boolean };

    // Case 1: No prompt and no --resume → launch REPL
    if (!prompt && !opts.resume) {
      await startRepl(config, undefined, replOptions);
      return;
    }

    // Case 2: --resume with no prompt → launch REPL with loaded session
    if (opts.resume && !prompt) {
      await startRepl(config, opts.resume as string, replOptions);
      return;
    }

    // Case 3 & 4: One-shot mode (existing behavior)
    if (yolo) {
      console.error("WARNING: --yolo mode enabled. All permission checks are disabled.");
    }
    const claude = new ClaudeAdapter(config.timeoutMs, yolo);
    const codex = new CodexAdapter(config.timeoutMs, config.codex, yolo);
    const session = new SessionManager();

    // When resuming, restore the session's stored Codex config
    if (opts.resume) {
      try {
        const loaded = session.load(opts.resume as string);
        if (loaded.meta.config.codex) {
          codex.updateConfig(loaded.meta.config.codex);
        }
        // If launched with --yolo, re-apply yolo overrides so a saved session
        // can never downgrade permissions below what yolo guarantees.
        if (yolo) {
          codex.updateConfig({
            sandboxMode: "danger-full-access",
            approvalPolicy: "never",
            networkAccessEnabled: true,
          });
        }
      } catch (err) {
        console.error(`Failed to load session: ${(err as Error).message}`);
        process.exit(1);
      }
    }

    const orchestrator = new Orchestrator(claude, codex, session, config, {
      onTurnStart: (turn, agent, role) => {
        const label = agent.charAt(0).toUpperCase() + agent.slice(1);
        console.error(`[Turn ${turn}] ${label} (${role}): responding...`);
      },
    });

    try {
      let result;

      if (opts.resume && prompt) {
        // Resume existing session with guidance (one-shot)
        const sessionId = opts.resume as string;
        console.error(`Resuming session: ${sessionId}`);
        console.error(`With guidance: "${prompt}"\n`);
        result = await orchestrator.resume(sessionId, prompt);
      } else {
        // New one-shot session
        console.error(`Starting collaboration (${config.startWith} goes first)...`);
        result = await orchestrator.run(prompt!);
        console.error(`Session ID: ${result.sessionId}`);
        console.error(`Resume with: topg --resume ${result.sessionId} "your guidance"\n`);
      }

      while (true) {
        if (config.outputFormat === "json") {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.summary);
        }

        if (result.type === "consensus") {
          break;
        }

        // Escalation — ask user for input
        console.error(`\nResume later with: topg --resume ${result.sessionId} "your guidance"`);
        const guidance = await askUser("\nYour guidance (or 'q' to quit): ");

        if (!guidance || guidance.toLowerCase() === "q") {
          break;
        }

        console.error(`\nResuming with your guidance...\n`);
        result = await orchestrator.continueWithGuidance(result, guidance, result.sessionId);
      }
    } catch (err) {
      console.error("Collaboration failed:", (err as Error).message);
      process.exit(1);
    }
  });

program.parse();
