import { describe, it, expect, afterEach } from "vitest";
import {
  initiatorPrompt,
  reviewerPrompt,
  rebuttalPrompt,
  synthesisPrompt,
  escalationPrompt,
} from "../../src/prompts.js";

describe("prompt env overrides", () => {
  afterEach(() => {
    delete process.env.TOPG_PROMPT_INITIATOR;
    delete process.env.TOPG_PROMPT_REVIEWER;
    delete process.env.TOPG_PROMPT_REBUTTAL;
    delete process.env.TOPG_PROMPT_SYNTHESIS;
    delete process.env.TOPG_PROMPT_ESCALATION;
  });

  it("should use default initiator prompt when no env var set", () => {
    const prompt = initiatorPrompt("codex");
    expect(prompt).toContain("collaborating with another AI agent");
  });

  it("should override initiator prompt via env var", () => {
    process.env.TOPG_PROMPT_INITIATOR = "Custom initiator for {{otherAgent}}";
    const prompt = initiatorPrompt("codex");
    expect(prompt).toBe("Custom initiator for codex");
  });

  it("should override reviewer prompt via env var", () => {
    process.env.TOPG_PROMPT_REVIEWER = "Custom reviewer for {{otherAgent}}";
    const prompt = reviewerPrompt("claude");
    expect(prompt).toBe("Custom reviewer for claude");
  });

  it("should override rebuttal prompt via env var", () => {
    process.env.TOPG_PROMPT_REBUTTAL = "Custom rebuttal for {{reviewerAgent}}";
    const prompt = rebuttalPrompt("codex");
    expect(prompt).toBe("Custom rebuttal for codex");
  });

  it("should override synthesis prompt via env var", () => {
    process.env.TOPG_PROMPT_SYNTHESIS = "Custom synthesis prompt";
    const prompt = synthesisPrompt();
    expect(prompt).toBe("Custom synthesis prompt");
  });

  it("should override escalation prompt via env var", () => {
    process.env.TOPG_PROMPT_ESCALATION = "Custom escalation prompt";
    const prompt = escalationPrompt();
    expect(prompt).toBe("Custom escalation prompt");
  });
});
