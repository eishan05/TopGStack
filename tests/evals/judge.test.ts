import { describe, it, expect } from "vitest";
import { buildJudgePrompt, parseJudgeResponse, JUDGE_SYSTEM_PROMPT } from "../../src/evals/judge.js";
import type { OrchestratorResult } from "../../src/types.js";

const MOCK_RESULT: OrchestratorResult = {
  type: "consensus",
  sessionId: "test123",
  rounds: 2,
  summary: "Use PostgreSQL with proper indexing.",
  messages: [
    {
      role: "initiator",
      agent: "claude",
      turn: 1,
      type: "review",
      content: "I recommend PostgreSQL for the relational data model.\n[CONVERGENCE: partial]",
      convergenceSignal: "partial",
      timestamp: "2026-03-24T00:00:00Z",
    },
    {
      role: "reviewer",
      agent: "codex",
      turn: 2,
      type: "review",
      content: "I agree with PostgreSQL. Add proper indexes.\n[CONVERGENCE: agree]",
      convergenceSignal: "agree",
      timestamp: "2026-03-24T00:01:00Z",
    },
  ],
};

describe("JUDGE_SYSTEM_PROMPT", () => {
  it("should mention all four scoring dimensions", () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain("tradeoffSurfacing");
    expect(JUDGE_SYSTEM_PROMPT).toContain("synthesisQuality");
    expect(JUDGE_SYSTEM_PROMPT).toContain("convergenceEfficiency");
    expect(JUDGE_SYSTEM_PROMPT).toContain("noCapitulation");
  });

  it("should specify JSON response format", () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain("valid JSON");
  });
});

describe("buildJudgePrompt", () => {
  it("should include the original prompt", () => {
    const prompt = buildJudgePrompt("Pick a database", MOCK_RESULT);
    expect(prompt).toContain("## Original Prompt");
    expect(prompt).toContain("Pick a database");
  });

  it("should include debate outcome metadata", () => {
    const prompt = buildJudgePrompt("Pick a database", MOCK_RESULT);
    expect(prompt).toContain("Type: consensus");
    expect(prompt).toContain("Rounds: 2");
  });

  it("should include full transcript with turn labels", () => {
    const prompt = buildJudgePrompt("Pick a database", MOCK_RESULT);
    expect(prompt).toContain("Turn 1 — Claude (initiator)");
    expect(prompt).toContain("Turn 2 — Codex (reviewer)");
    expect(prompt).toContain("[agree]");
  });

  it("should include the summary", () => {
    const prompt = buildJudgePrompt("Pick a database", MOCK_RESULT);
    expect(prompt).toContain("## Summary");
    expect(prompt).toContain("PostgreSQL with proper indexing");
  });
});

describe("parseJudgeResponse", () => {
  it("should parse valid JSON response", () => {
    const raw = JSON.stringify({
      tradeoffSurfacing: 4,
      synthesisQuality: 5,
      convergenceEfficiency: 3,
      noCapitulation: 4,
      rationale: "Good debate with real tradeoffs explored.",
    });
    const scores = parseJudgeResponse(raw);
    expect(scores.tradeoffSurfacing).toBe(4);
    expect(scores.synthesisQuality).toBe(5);
    expect(scores.convergenceEfficiency).toBe(3);
    expect(scores.noCapitulation).toBe(4);
    expect(scores.rationale).toContain("tradeoffs");
  });

  it("should extract JSON from markdown code blocks", () => {
    const raw = `Here is my evaluation:\n\`\`\`json\n${JSON.stringify({
      tradeoffSurfacing: 3,
      synthesisQuality: 4,
      convergenceEfficiency: 5,
      noCapitulation: 3,
      rationale: "Efficient convergence.",
    })}\n\`\`\``;
    const scores = parseJudgeResponse(raw);
    expect(scores.convergenceEfficiency).toBe(5);
  });

  it("should reject scores outside 1-5 range", () => {
    const raw = JSON.stringify({
      tradeoffSurfacing: 6,
      synthesisQuality: 4,
      convergenceEfficiency: 3,
      noCapitulation: 4,
      rationale: "test",
    });
    expect(() => parseJudgeResponse(raw)).toThrow("Invalid score");
  });

  it("should reject scores of 0", () => {
    const raw = JSON.stringify({
      tradeoffSurfacing: 0,
      synthesisQuality: 4,
      convergenceEfficiency: 3,
      noCapitulation: 4,
      rationale: "test",
    });
    expect(() => parseJudgeResponse(raw)).toThrow("Invalid score");
  });

  it("should reject missing rationale", () => {
    const raw = JSON.stringify({
      tradeoffSurfacing: 3,
      synthesisQuality: 4,
      convergenceEfficiency: 3,
      noCapitulation: 4,
    });
    expect(() => parseJudgeResponse(raw)).toThrow("Missing rationale");
  });

  it("should throw on non-JSON response", () => {
    expect(() => parseJudgeResponse("I think it was a good debate.")).toThrow("no JSON");
  });
});
