import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodexAdapter } from "../../src/adapters/codex-adapter.js";
import type { ConversationContext } from "../../src/types.js";

// Mock the codex SDK
vi.mock("@openai/codex-sdk", () => {
  const mockThread = {
    run: vi.fn().mockResolvedValue({
      finalResponse: "Here is my code review.\n[CONVERGENCE: partial]",
      items: [],
      usage: null,
    }),
  };
  return {
    Codex: class MockCodex {
      startThread = vi.fn().mockResolvedValue(mockThread);
    },
  };
});

describe("CodexAdapter", () => {
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
    const adapter = new CodexAdapter();
    const result = await adapter.send("Review this code", ctx);

    expect(result.content).toContain("Here is my code review");
    expect(result.convergenceSignal).toBe("partial");
  });

  it("should have name 'codex'", () => {
    const adapter = new CodexAdapter();
    expect(adapter.name).toBe("codex");
  });
});
