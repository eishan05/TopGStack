import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseCommand, createSpinner } from "../src/repl.js";

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
