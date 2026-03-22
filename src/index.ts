#!/usr/bin/env node

import { Command } from "commander";
import { Orchestrator } from "./orchestrator.js";
import { ClaudeAdapter } from "./adapters/claude-adapter.js";
import { CodexAdapter } from "./adapters/codex-adapter.js";
import { SessionManager } from "./session.js";
import type { AgentName, OrchestratorConfig } from "./types.js";

const program = new Command();

program
  .name("topg")
  .description("Inter-agent collaboration between Claude Code and OpenAI Codex")
  .version("0.1.0")
  .argument("<prompt>", "The prompt or question to collaborate on")
  .option("--start-with <agent>", "Which agent goes first (claude or codex)", "claude")
  .option("--cwd <path>", "Working directory for agents", process.cwd())
  .option("--guardrail <rounds>", "Soft escalation after N rounds", "8")
  .option("--output <format>", "Output format (text or json)", "text")
  .option("--transcript <path>", "Save full transcript to path")
  .option("--resume <sessionId>", "Resume a paused session")
  .action(async (prompt: string, opts) => {
    // Validate credentials (Claude Code also works with active login session,
    // so only warn — don't hard-exit — if ANTHROPIC_API_KEY is missing)
    if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_API_KEY) {
      console.error("Warning: ANTHROPIC_API_KEY not set. Claude Code will attempt to use your active login session.");
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error("Error: OPENAI_API_KEY is required for Codex.");
      console.error("Set it via: export OPENAI_API_KEY=your-key");
      process.exit(1);
    }

    const config: OrchestratorConfig = {
      startWith: opts.startWith as AgentName,
      workingDirectory: opts.cwd,
      guardrailRounds: parseInt(opts.guardrail, 10),
      timeoutMs: 120_000,
      outputFormat: opts.output as "text" | "json",
    };

    const claude = new ClaudeAdapter(config.timeoutMs);
    const codex = new CodexAdapter(config.timeoutMs);
    const session = new SessionManager();

    const orchestrator = new Orchestrator(claude, codex, session, config);

    try {
      console.error(`Starting collaboration (${config.startWith} goes first)...\n`);
      const result = await orchestrator.run(prompt);

      if (config.outputFormat === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.summary);
      }
    } catch (err) {
      console.error("Collaboration failed:", (err as Error).message);
      process.exit(1);
    }
  });

program.parse();
