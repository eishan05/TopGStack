import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseCommand, createSpinner, selectTranscriptMessages } from "../src/repl.js";
import type { Message } from "../src/types.js";

describe("parseCommand", () => {
  it("should parse a slash command with no args", () => {
    const result = parseCommand("/quit");
    expect(result).toEqual({ command: "quit", args: "" });
  });

  it("should parse a slash command with args", () => {
    const result = parseCommand("/steer use React instead");
    expect(result).toEqual({ command: "steer", args: "use React instead" });
  });

  it("should parse /resume with session ID", () => {
    const result = parseCommand("/resume abc123xyz");
    expect(result).toEqual({ command: "resume", args: "abc123xyz" });
  });

  it("should return null for non-command input", () => {
    const result = parseCommand("What architecture should we use?");
    expect(result).toBeNull();
  });

  it("should return null for empty input", () => {
    const result = parseCommand("");
    expect(result).toBeNull();
  });

  it("should parse /config with key value", () => {
    const result = parseCommand("/config guardrailRounds 6");
    expect(result).toEqual({ command: "config", args: "guardrailRounds 6" });
  });
});

describe("createSpinner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start and stop without errors", () => {
    const write = vi.fn();
    const spinner = createSpinner(write);
    spinner.start("Claude (initiator) responding...", 1, 8);
    vi.advanceTimersByTime(200);
    spinner.stop();
    expect(write).toHaveBeenCalled();
  });

  it("should update message", () => {
    const write = vi.fn();
    const spinner = createSpinner(write);
    spinner.start("Claude (initiator) responding...", 1, 8);
    spinner.update("Codex (reviewer) responding...", 2, 8);
    vi.advanceTimersByTime(100);
    spinner.stop();
    const calls = write.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes("Codex"))).toBe(true);
  });
});

describe("selectTranscriptMessages", () => {
  it("should exclude user guidance from the last round transcript", () => {
    const messages: Message[] = [
      {
        role: "initiator",
        agent: "claude",
        turn: 1,
        type: "user-prompt",
        content: "[USER PROMPT #1]: Build a dashboard",
        timestamp: new Date().toISOString(),
      },
      {
        role: "initiator",
        agent: "claude",
        turn: 2,
        type: "code",
        content: "Use React.",
        timestamp: new Date().toISOString(),
      },
      {
        role: "reviewer",
        agent: "codex",
        turn: 3,
        type: "deadlock",
        content: "Need product direction.",
        timestamp: new Date().toISOString(),
      },
      {
        role: "initiator",
        agent: "claude",
        turn: 4,
        type: "user-guidance",
        content: "[USER GUIDANCE]: Keep it lightweight",
        timestamp: new Date().toISOString(),
      },
      {
        role: "initiator",
        agent: "claude",
        turn: 5,
        type: "review",
        content: "Use Vite and React.",
        timestamp: new Date().toISOString(),
      },
      {
        role: "reviewer",
        agent: "codex",
        turn: 6,
        type: "review",
        content: "Agreed.",
        timestamp: new Date().toISOString(),
      },
    ];

    expect(selectTranscriptMessages(messages).map((msg) => msg.turn)).toEqual([2, 3, 5, 6]);
    expect(selectTranscriptMessages(messages).some((msg) => msg.type === "user-guidance")).toBe(false);
  });
});
