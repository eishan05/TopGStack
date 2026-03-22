import { describe, it, expect } from "vitest";
import { detectConvergence, parseConvergenceTag, checkDiffStability } from "../src/convergence.js";
import type { Message } from "../src/types.js";

describe("parseConvergenceTag", () => {
  it("should extract agree signal from tag", () => {
    const content = "Looks great!\n[CONVERGENCE: agree]";
    expect(parseConvergenceTag(content)).toBe("agree");
  });

  it("should extract disagree signal", () => {
    const content = "I have concerns.\n[CONVERGENCE: disagree]";
    expect(parseConvergenceTag(content)).toBe("disagree");
  });

  it("should extract partial signal", () => {
    const content = "Some parts are good.\n[CONVERGENCE: partial]";
    expect(parseConvergenceTag(content)).toBe("partial");
  });

  it("should return null when no tag present", () => {
    const content = "Just a regular response with no tag.";
    expect(parseConvergenceTag(content)).toBeNull();
  });
});

const makeMsg = (agent: "claude" | "codex", content: string, signal?: "agree" | "disagree" | "partial" | "defer"): Message => ({
  role: "initiator",
  agent,
  turn: 1,
  type: "review",
  content,
  convergenceSignal: signal,
  timestamp: new Date().toISOString(),
});

describe("detectConvergence", () => {
  it("should detect convergence when both agents signal agree", () => {
    const messages = [
      makeMsg("claude", "Here is my proposal.\n[CONVERGENCE: agree]", "agree"),
      makeMsg("codex", "I agree with this.\n[CONVERGENCE: agree]", "agree"),
    ];
    expect(detectConvergence(messages)).toBe(true);
  });

  it("should not detect convergence when only one agrees", () => {
    const messages = [
      makeMsg("claude", "Proposal.\n[CONVERGENCE: agree]", "agree"),
      makeMsg("codex", "I disagree.\n[CONVERGENCE: disagree]", "disagree"),
    ];
    expect(detectConvergence(messages)).toBe(false);
  });

  it("should detect convergence from phrase matching when tags are missing", () => {
    const messages = [
      makeMsg("claude", "This looks good, I have no further changes."),
      makeMsg("codex", "I agree with this approach, no modifications needed."),
    ];
    expect(detectConvergence(messages)).toBe(true);
  });

  it("should not detect convergence from ambiguous phrases", () => {
    const messages = [
      makeMsg("claude", "Here is a revised version."),
      makeMsg("codex", "I have some suggestions for improvement."),
    ];
    expect(detectConvergence(messages)).toBe(false);
  });
});

describe("checkDiffStability", () => {
  it("should detect stability when content unchanged for 2 rounds", () => {
    const messages: Message[] = [
      makeMsg("claude", "Use approach A with pattern X"),
      makeMsg("codex", "I agree. Use approach A with pattern X"),
      makeMsg("claude", "Confirmed. Use approach A with pattern X"),
      makeMsg("codex", "Use approach A with pattern X"),
    ];
    expect(checkDiffStability(messages)).toBe(true);
  });

  it("should not detect stability when content changes", () => {
    const messages: Message[] = [
      makeMsg("claude", "Use approach A"),
      makeMsg("codex", "No, use approach B"),
      makeMsg("claude", "Actually, use approach C"),
    ];
    expect(checkDiffStability(messages)).toBe(false);
  });

  it("should return false with fewer than 4 messages", () => {
    const messages: Message[] = [
      makeMsg("claude", "Use approach A"),
      makeMsg("codex", "Use approach A"),
    ];
    expect(checkDiffStability(messages)).toBe(false);
  });
});
