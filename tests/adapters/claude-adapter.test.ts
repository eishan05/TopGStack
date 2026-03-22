import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeAdapter } from "../../src/adapters/claude-adapter.js";
import type { ConversationContext } from "../../src/types.js";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";

function mockProcess(stdout: string): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as any;
  proc.stderr = new EventEmitter() as any;
  proc.stdin = null as any;

  setTimeout(() => {
    (proc.stdout as EventEmitter).emit("data", Buffer.from(stdout));
    (proc.stdout as EventEmitter).emit("end");
    proc.emit("close", 0);
  }, 10);

  return proc;
}

describe("ClaudeAdapter", () => {
  const ctx: ConversationContext = {
    sessionId: "test-123",
    history: [],
    workingDirectory: "/tmp",
    systemPrompt: "You are a reviewer.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send a prompt and parse the response", async () => {
    const responseJson = JSON.stringify({
      type: "result",
      result: "Here is my review.\n[CONVERGENCE: agree]",
    });
    vi.mocked(spawn).mockReturnValue(mockProcess(responseJson));

    const adapter = new ClaudeAdapter();
    const result = await adapter.send("Review this code", ctx);

    expect(result.content).toContain("Here is my review");
    expect(result.convergenceSignal).toBe("agree");
  });

  it("should have name 'claude'", () => {
    const adapter = new ClaudeAdapter();
    expect(adapter.name).toBe("claude");
  });
});
