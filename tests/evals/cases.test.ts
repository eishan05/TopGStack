import { describe, it, expect } from "vitest";
import { DEFAULT_CASES } from "../../src/evals/cases.js";

describe("DEFAULT_CASES", () => {
  it("should have at least 5 cases", () => {
    expect(DEFAULT_CASES.length).toBeGreaterThanOrEqual(5);
  });

  it("should have unique IDs", () => {
    const ids = DEFAULT_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should cover multiple categories", () => {
    const categories = new Set(DEFAULT_CASES.map((c) => c.category));
    expect(categories.size).toBeGreaterThanOrEqual(3);
  });

  it("should have a trivial case with low maxRounds", () => {
    const trivial = DEFAULT_CASES.find((c) => c.category === "trivial");
    expect(trivial).toBeDefined();
    expect(trivial!.maxRounds).toBeLessThanOrEqual(3);
  });

  it("every case should have an id, prompt, and category", () => {
    for (const c of DEFAULT_CASES) {
      expect(c.id).toBeTruthy();
      expect(c.prompt).toBeTruthy();
      expect(c.category).toBeTruthy();
    }
  });
});
