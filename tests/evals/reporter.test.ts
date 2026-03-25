import { describe, it, expect } from "vitest";
import { buildReport, formatReport } from "../../src/evals/reporter.js";
import type { CaseResult, VariantConfig } from "../../src/evals/types.js";

function makeResult(caseId: string, variant: string, scores: [number, number, number, number], converged = true, rounds = 3): CaseResult {
  return {
    caseId,
    variant,
    outcome: null,
    scores: {
      tradeoffSurfacing: scores[0],
      synthesisQuality: scores[1],
      convergenceEfficiency: scores[2],
      noCapitulation: scores[3],
      rationale: "test",
    },
    rounds,
    converged,
    durationMs: 10000,
  };
}

const configA: VariantConfig = { name: "baseline" };
const configB: VariantConfig = { name: "verbose-reviewer" };

describe("buildReport", () => {
  it("should compute correct mean scores", () => {
    const resultsA = [
      makeResult("case1", "baseline", [4, 4, 4, 4]),
      makeResult("case2", "baseline", [2, 2, 2, 2]),
    ];
    const resultsB = [
      makeResult("case1", "verbose-reviewer", [5, 5, 5, 5]),
      makeResult("case2", "verbose-reviewer", [3, 3, 3, 3]),
    ];
    const cats = new Map([["case1", "arch"], ["case2", "trivial"]]);
    const report = buildReport(configA, resultsA, configB, resultsB, cats);

    expect(report.variantA.meanScores.tradeoffSurfacing).toBe(3);
    expect(report.variantB.meanScores.tradeoffSurfacing).toBe(4);
  });

  it("should count wins correctly", () => {
    const resultsA = [
      makeResult("case1", "baseline", [5, 5, 5, 5]),
      makeResult("case2", "baseline", [1, 1, 1, 1]),
      makeResult("case3", "baseline", [3, 3, 3, 3]),
    ];
    const resultsB = [
      makeResult("case1", "verbose-reviewer", [3, 3, 3, 3]),
      makeResult("case2", "verbose-reviewer", [5, 5, 5, 5]),
      makeResult("case3", "verbose-reviewer", [3, 3, 3, 3]),
    ];
    const cats = new Map([["case1", "arch"], ["case2", "debug"], ["case3", "trivial"]]);
    const report = buildReport(configA, resultsA, configB, resultsB, cats);

    expect(report.variantA.wins).toBe(1);
    expect(report.variantB.wins).toBe(1);
    expect(report.cases[2].winner).toBe("tie");
  });

  it("should compute consensus rate", () => {
    const resultsA = [
      makeResult("case1", "baseline", [4, 4, 4, 4], true),
      makeResult("case2", "baseline", [2, 2, 2, 2], false),
    ];
    const resultsB = [
      makeResult("case1", "verbose-reviewer", [4, 4, 4, 4], true),
      makeResult("case2", "verbose-reviewer", [4, 4, 4, 4], true),
    ];
    const cats = new Map([["case1", "arch"], ["case2", "trivial"]]);
    const report = buildReport(configA, resultsA, configB, resultsB, cats);

    expect(report.variantA.consensusRate).toBe(0.5);
    expect(report.variantB.consensusRate).toBe(1);
  });

  it("should compute mean rounds", () => {
    const resultsA = [
      makeResult("case1", "baseline", [4, 4, 4, 4], true, 2),
      makeResult("case2", "baseline", [2, 2, 2, 2], true, 4),
    ];
    const resultsB = [
      makeResult("case1", "verbose-reviewer", [4, 4, 4, 4], true, 3),
      makeResult("case2", "verbose-reviewer", [4, 4, 4, 4], true, 3),
    ];
    const cats = new Map([["case1", "arch"], ["case2", "trivial"]]);
    const report = buildReport(configA, resultsA, configB, resultsB, cats);

    expect(report.variantA.meanRounds).toBe(3);
    expect(report.variantB.meanRounds).toBe(3);
  });

  it("should handle cases where one variant has errors", () => {
    const resultsA = [
      makeResult("case1", "baseline", [4, 4, 4, 4]),
    ];
    const resultsB: CaseResult[] = [{
      caseId: "case1",
      variant: "verbose-reviewer",
      outcome: null,
      scores: null,
      rounds: 0,
      converged: false,
      durationMs: 0,
      error: "topg crashed",
    }];
    const cats = new Map([["case1", "arch"]]);
    const report = buildReport(configA, resultsA, configB, resultsB, cats);

    expect(report.cases[0].winner).toBe("a");
  });
});

describe("formatReport", () => {
  it("should produce a formatted string with both variant names", () => {
    const resultsA = [makeResult("case1", "baseline", [4, 4, 4, 4])];
    const resultsB = [makeResult("case1", "verbose-reviewer", [3, 3, 3, 3])];
    const cats = new Map([["case1", "arch"]]);
    const report = buildReport(configA, resultsA, configB, resultsB, cats);
    const output = formatReport(report);

    expect(output).toContain("baseline");
    expect(output).toContain("verbose-reviewer");
    expect(output).toContain("A/B EVAL REPORT");
    expect(output).toContain("Winner: baseline");
  });

  it("should show tie when scores are equal", () => {
    const resultsA = [makeResult("case1", "baseline", [4, 4, 4, 4])];
    const resultsB = [makeResult("case1", "verbose-reviewer", [4, 4, 4, 4])];
    const cats = new Map([["case1", "arch"]]);
    const report = buildReport(configA, resultsA, configB, resultsB, cats);
    const output = formatReport(report);

    expect(output).toContain("Tie");
  });
});
