#!/usr/bin/env node

// src/index.ts

import { Command } from "commander";
import { Orchestrator } from "./debate/orchestrator.js";
import { ClaudeAdapter } from "./core/adapters/claude-adapter.js";
import { CodexAdapter } from "./core/adapters/codex-adapter.js";
import { SessionManager } from "./core/session.js";
import { CollaborationManager } from "./collaborate/manager.js";
import { askUser, parseDuration } from "./core/utils.js";
import type { AgentName, CodexConfig } from "./core/types.js";
import type { DebateConfig } from "./debate/types.js";
import type { CollaborateConfig } from "./collaborate/types.js";

function validateAgent(value: string, flag: string): AgentName {
  if (value !== "claude" && value !== "codex") {
    console.error(`Error: ${flag} must be "claude" or "codex", got "${value}".`);
    process.exit(1);
  }
  return value;
}

const program = new Command();

program
  .name("topg")
  .description("Inter-agent collaboration between Claude Code and OpenAI Codex")
  .version("2.0.0");

// ─── topg debate ───────────────────────────────────────────────────────────

const debate = program
  .command("debate [prompt]")
  .description("Dispatch a turn-based debate between Claude and Codex")
  .option("--start-with <agent>", "Which agent goes first (claude or codex)", "claude")
  .option("--cwd <path>", "Working directory for agents", process.cwd())
  .option("--guardrail <rounds>", "Soft escalation after N rounds", "5")
  .option("--timeout <seconds>", "Timeout per agent turn in seconds", "900")
  .option("--output <format>", "Output format (text or json)", "text")
  .option("--resume <sessionId>", "Resume a paused debate with guidance")
  .option("--codex-sandbox <mode>", "Codex sandbox mode", "workspace-write")
  .option("--codex-web-search <mode>", "Codex web search mode", "live")
  .option("--codex-network", "Enable network access for Codex", true)
  .option("--no-codex-network", "Disable network access for Codex")
  .option("--codex-model <model>", "Override model for Codex agent")
  .option("--codex-reasoning <effort>", "Codex reasoning effort")
  .option("--yolo", "Skip all permission checks")
  .action(async (prompt: string | undefined, opts) => {
    if (!prompt && !opts.resume) {
      debate.help();
      return;
    }

    if (opts.resume && !prompt) {
      console.error("Error: --resume requires a guidance prompt. Usage: topg debate --resume <sessionId> \"your guidance\"");
      process.exit(1);
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error("Error: OPENAI_API_KEY is required for Codex.");
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
    const startWith = validateAgent(opts.startWith, "--start-with");
    const config: DebateConfig = {
      startWith,
      workingDirectory: opts.cwd,
      guardrailRounds: parseInt(opts.guardrail, 10),
      timeoutMs: parseInt(opts.timeout, 10) * 1000,
      outputFormat: opts.output as "text" | "json",
      codex: codexCfg,
      yolo,
    };

    if (yolo) {
      console.error("WARNING: --yolo mode enabled. All permission checks are disabled.");
    }

    const claude = new ClaudeAdapter(config.timeoutMs, yolo);
    const codex = new CodexAdapter(config.timeoutMs, config.codex, yolo);
    const session = new SessionManager();

    if (opts.resume) {
      try {
        const loaded = session.load(opts.resume as string);
        if (loaded.meta.config && typeof loaded.meta.config === "object" && "codex" in loaded.meta.config) {
          codex.updateConfig(loaded.meta.config.codex as Partial<CodexConfig>);
        }
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
        console.error(`Resuming session: ${opts.resume}`);
        result = await orchestrator.resume(opts.resume as string, prompt);
      } else {
        console.error(`Starting debate (${config.startWith} goes first)...`);
        result = await orchestrator.run(prompt!);
        console.error(`Session ID: ${result.sessionId}`);
        console.error(`Resume with: topg debate --resume ${result.sessionId} "your guidance"\n`);
      }

      while (true) {
        if (config.outputFormat === "json") {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.summary);
        }

        if (result.type === "consensus") break;

        console.error(`\nResume later with: topg debate --resume ${result.sessionId} "your guidance"`);
        const guidance = await askUser("\nYour guidance (or 'q' to quit): ");
        if (!guidance || guidance.toLowerCase() === "q") break;

        console.error(`\nResuming with your guidance...\n`);
        result = await orchestrator.continueWithGuidance(result, guidance, result.sessionId);
      }
    } catch (err) {
      console.error("Debate failed:", (err as Error).message);
      process.exit(1);
    }
  });

// ─── topg collaborate ──────────────────────────────────────────────────────

const collaborate = program.command("collaborate").description("Session-based collaboration with another agent");

collaborate
  .command("start <prompt>")
  .description("Start a new collaboration session")
  .requiredOption("--with <agent>", "Agent to collaborate with (claude or codex)")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--output <format>", "Output format (text or json)", "json")
  .option("--timeout <seconds>", "Timeout per turn in seconds", "900")
  .option("--codex-sandbox <mode>", "Codex sandbox mode", "read-only")
  .option("--codex-web-search <mode>", "Codex web search mode", "live")
  .option("--codex-reasoning <effort>", "Codex reasoning effort")
  .option("--yolo", "Skip all permission checks")
  .action(async (prompt: string, opts) => {
    const withAgent = validateAgent(opts.with, "--with");

    if (!process.env.OPENAI_API_KEY && withAgent === "codex") {
      console.error("Error: OPENAI_API_KEY is required for Codex.");
      process.exit(1);
    }

    const yolo = !!opts.yolo;
    const codexCfg: CodexConfig = {
      sandboxMode: opts.codexSandbox as CodexConfig["sandboxMode"],
      webSearchMode: opts.codexWebSearch as CodexConfig["webSearchMode"],
      networkAccessEnabled: true,
      approvalPolicy: "never",
      modelReasoningEffort: opts.codexReasoning as CodexConfig["modelReasoningEffort"],
    };

    const config: CollaborateConfig = {
      with: withAgent,
      workingDirectory: opts.cwd,
      timeoutMs: parseInt(opts.timeout, 10) * 1000,
      outputFormat: opts.output as "text" | "json",
      codex: codexCfg,
      yolo,
    };

    const adapter = withAgent === "codex"
      ? new CodexAdapter(config.timeoutMs, config.codex, yolo)
      : new ClaudeAdapter(config.timeoutMs, yolo);
    const session = new SessionManager();
    const manager = new CollaborationManager(adapter, session, config);

    try {
      const result = await manager.start(prompt);
      if (config.outputFormat === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Session: ${result.sessionId}\nAgent: ${result.agent}\n\n${result.response}`);
      }
    } catch (err) {
      console.error("Collaboration start failed:", (err as Error).message);
      process.exit(1);
    }
  });

collaborate
  .command("send <message>")
  .description("Send a follow-up message to an active collaboration session")
  .option("--session <id>", "Session ID to send to")
  .option("--last", "Use the most recent collaboration session")
  .option("--output <format>", "Output format (text or json)", "json")
  .action(async (message: string, opts) => {
    if (opts.session && opts.last) {
      console.error("Error: --session and --last are mutually exclusive.");
      process.exit(1);
    }
    if (!opts.session && !opts.last) {
      console.error("Error: Provide --session <id> or --last.");
      process.exit(1);
    }

    const session = new SessionManager();

    try {
    const resolvedId = opts.last
      ? session.filterSessions({ type: "collaborate", statuses: ["active"] })?.[0]?.sessionId
      : opts.session;

    if (!resolvedId) {
      console.error("Error: No active collaboration sessions found.");
      process.exit(1);
    }

    const { meta } = session.load(resolvedId);
    if (meta.type !== "collaborate") {
      console.error(`Error: Session ${resolvedId} is not a collaborate session.`);
      process.exit(1);
    }

    const agentName = meta.agent as AgentName;
    const savedConfig = meta.config as unknown as CollaborateConfig;
    const yolo = savedConfig.yolo ?? false;
    const defaultCodex = { sandboxMode: "read-only" as const, webSearchMode: "live" as const, networkAccessEnabled: true, approvalPolicy: "never" as const };

    const config: CollaborateConfig = {
      with: agentName,
      workingDirectory: savedConfig.workingDirectory ?? process.cwd(),
      timeoutMs: savedConfig.timeoutMs ?? 900000,
      outputFormat: opts.output as "text" | "json",
      codex: savedConfig.codex ?? defaultCodex,
      yolo,
    };

    const adapter = agentName === "codex"
      ? new CodexAdapter(config.timeoutMs, config.codex, yolo)
      : new ClaudeAdapter(config.timeoutMs, yolo);
    const manager = new CollaborationManager(adapter, session, config);

    const result = await manager.send(resolvedId, message);
    if (config.outputFormat === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(result.response);
    }
    } catch (err) {
      console.error("Collaboration send failed:", (err as Error).message);
      process.exit(1);
    }
  });

collaborate
  .command("end")
  .description("Close a collaboration session")
  .option("--session <id>", "Session ID to close")
  .option("--last", "Use the most recent collaboration session")
  .option("--output <format>", "Output format (text or json)", "json")
  .action(async (opts) => {
    if (opts.session && opts.last) {
      console.error("Error: --session and --last are mutually exclusive.");
      process.exit(1);
    }
    if (!opts.session && !opts.last) {
      console.error("Error: Provide --session <id> or --last.");
      process.exit(1);
    }

    const session = new SessionManager();

    try {
    const resolvedId = opts.last
      ? session.filterSessions({ type: "collaborate", statuses: ["active"] })?.[0]?.sessionId
      : opts.session;

    if (!resolvedId) {
      console.error("Error: No active collaboration sessions found.");
      process.exit(1);
    }

    const { meta } = session.load(resolvedId);
    if (meta.type !== "collaborate") {
      console.error(`Error: Session ${resolvedId} is not a collaborate session.`);
      process.exit(1);
    }

    const config: CollaborateConfig = {
      with: (meta.agent ?? "codex") as AgentName,
      workingDirectory: process.cwd(),
      timeoutMs: 900000,
      outputFormat: opts.output as "text" | "json",
      codex: { sandboxMode: "read-only", webSearchMode: "live", networkAccessEnabled: true, approvalPolicy: "never" },
    };

    const adapter = config.with === "codex"
      ? new CodexAdapter(config.timeoutMs, config.codex, false)
      : new ClaudeAdapter(config.timeoutMs, false);
    const manager = new CollaborationManager(adapter, session, config);

    const result = await manager.end(resolvedId);
    if (config.outputFormat === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Session ${result.sessionId} closed. ${result.messageCount} messages.`);
    }
    } catch (err) {
      console.error("Collaboration end failed:", (err as Error).message);
      process.exit(1);
    }
  });

collaborate
  .command("list")
  .description("List collaboration sessions")
  .option("--active", "Only show active sessions")
  .option("--output <format>", "Output format (text or json)", "json")
  .action(async (opts) => {
    const session = new SessionManager();
    const config: CollaborateConfig = {
      with: "codex",
      workingDirectory: process.cwd(),
      timeoutMs: 900000,
      outputFormat: opts.output as "text" | "json",
      codex: { sandboxMode: "read-only", webSearchMode: "live", networkAccessEnabled: true, approvalPolicy: "never" },
    };

    const adapter = new CodexAdapter(config.timeoutMs, config.codex, false);
    const manager = new CollaborationManager(adapter, session, config);

    const list = await manager.list(!!opts.active);

    if (config.outputFormat === "json") {
      console.log(JSON.stringify({ sessions: list }, null, 2));
    } else {
      if (list.length === 0) {
        console.log("No collaboration sessions found.");
      } else {
        for (const s of list) {
          console.log(`${s.sessionId}  ${s.agent}  ${s.status}  ${s.lastMessageAt}`);
        }
      }
    }
  });

// ─── topg session ──────────────────────────────────────────────────────────

const sessionCmd = program.command("session").description("Manage sessions (debate and collaborate)");

sessionCmd
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

sessionCmd
  .command("clear")
  .description("Bulk-delete sessions")
  .option("--all", "Delete all sessions")
  .option("--completed", "Delete completed sessions")
  .option("--escalated", "Delete escalated sessions")
  .option("--closed", "Delete closed sessions (collaborate)")
  .option("--older-than <duration>", "Only sessions not updated within duration")
  .option("--force", "Skip confirmation prompt")
  .action(async (opts) => {
    if (!opts.all && !opts.completed && !opts.escalated && !opts.closed && !opts.olderThan) {
      console.error("Error: At least one filter required (--all, --completed, --escalated, --closed, --older-than).");
      process.exit(1);
    }
    if (opts.all && (opts.completed || opts.escalated || opts.closed || opts.olderThan)) {
      console.error("Error: --all cannot be combined with other filters.");
      process.exit(1);
    }

    const session = new SessionManager();
    let sessions;
    if (opts.all) {
      sessions = session.listSessions();
    } else {
      const statuses: Array<"completed" | "escalated" | "closed"> = [];
      if (opts.completed) statuses.push("completed");
      if (opts.escalated) statuses.push("escalated");
      if (opts.closed) statuses.push("closed");
      let olderThan: Date | undefined;
      if (opts.olderThan) {
        olderThan = new Date(Date.now() - parseDuration(opts.olderThan));
      }
      sessions = session.filterSessions({ statuses: statuses.length > 0 ? statuses : undefined, olderThan });
    }

    if (sessions.length === 0) {
      console.error("No sessions match the given filters.");
      return;
    }

    // Warn about active/paused sessions that could be resumed
    if (!opts.all && !opts.completed && !opts.escalated && !opts.closed) {
      const resumable = sessions.filter((s) => s.status === "active" || s.status === "paused");
      if (resumable.length > 0) {
        console.error(`Warning: ${resumable.length} active/paused session(s) will be deleted.`);
        console.error("Use --completed, --escalated, or --closed to target only finished sessions.");
      }
    }

    if (!opts.force) {
      const statusCounts = new Map<string, number>();
      for (const s of sessions) {
        statusCounts.set(s.status, (statusCounts.get(s.status) ?? 0) + 1);
      }
      const breakdown = Array.from(statusCounts.entries())
        .map(([status, count]) => `${count} ${status}`)
        .join(", ");
      console.error(`About to delete ${sessions.length} session(s): ${breakdown}`);
      const answer = await askUser("Continue? (y/N) ");
      if (answer.toLowerCase() !== "y") {
        console.error("Aborted.");
        return;
      }
    }

    for (const s of sessions) {
      session.deleteSession(s.sessionId);
    }
    console.error(`Deleted ${sessions.length} session(s).`);
  });

sessionCmd
  .command("list")
  .description("List all sessions")
  .option("--output <format>", "Output format (text or json)", "text")
  .action(async (opts) => {
    const session = new SessionManager();
    const sessions = session.listSessions();
    if (opts.output === "json") {
      console.log(JSON.stringify({ sessions }, null, 2));
    } else {
      if (sessions.length === 0) {
        console.log("No sessions.");
      } else {
        for (const s of sessions) {
          const snippet = s.prompt.length > 40 ? s.prompt.slice(0, 40) + "..." : s.prompt;
          console.log(`${s.sessionId}  ${s.type}  ${s.status}  "${snippet}"`);
        }
      }
    }
  });

program.parse();
