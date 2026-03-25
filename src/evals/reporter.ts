import type {
  CaseResult,
  CaseComparison,
  EvalReport,
  JudgeScores,
  VariantConfig,
  VariantSummary,
} from "./types.js";

const SCORE_DIMS = ["tradeoffSurfacing", "synthesisQuality", "convergenceEfficiency", "noCapitulation"] as const;

function averageScores(results: CaseResult[]): JudgeScores {
  const scored = results.filter((r) => r.scores !== null);
  if (scored.length === 0) {
    return {
      tradeoffSurfacing: 0,
      synthesisQuality: 0,
      convergenceEfficiency: 0,
      noCapitulation: 0,
      rationale: "No scored results",
    };
  }

  const sums = { tradeoffSurfacing: 0, synthesisQuality: 0, convergenceEfficiency: 0, noCapitulation: 0 };
  for (const r of scored) {
    for (const dim of SCORE_DIMS) {
      sums[dim] += r.scores![dim];
    }
  }

  const n = scored.length;
  return {
    tradeoffSurfacing: round2(sums.tradeoffSurfacing / n),
    synthesisQuality: round2(sums.synthesisQuality / n),
    convergenceEfficiency: round2(sums.convergenceEfficiency / n),
    noCapitulation: round2(sums.noCapitulation / n),
    rationale: `Averaged over ${n} cases`,
  };
}

function totalScore(scores: JudgeScores): number {
  return scores.tradeoffSurfacing + scores.synthesisQuality + scores.convergenceEfficiency + scores.noCapitulation;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function compareCase(a: CaseResult, b: CaseResult): CaseComparison {
  let winner: "a" | "b" | "tie" = "tie";
  if (a.scores && b.scores) {
    const scoreA = totalScore(a.scores);
    const scoreB = totalScore(b.scores);
    if (scoreA > scoreB) winner = "a";
    else if (scoreB > scoreA) winner = "b";
  } else if (a.scores && !b.scores) {
    winner = "a";
  } else if (!a.scores && b.scores) {
    winner = "b";
  }

  return {
    caseId: a.caseId,
    category: "",
    a,
    b,
    winner,
  };
}

export function buildReport(
  configA: VariantConfig,
  resultsA: CaseResult[],
  configB: VariantConfig,
  resultsB: CaseResult[],
  caseCategories: Map<string, string>,
): EvalReport {
  const comparisons: CaseComparison[] = [];
  const bByCaseId = new Map(resultsB.map((r) => [r.caseId, r]));

  let winsA = 0;
  let winsB = 0;

  for (const a of resultsA) {
    const b = bByCaseId.get(a.caseId);
    if (!b) continue;

    const comp = compareCase(a, b);
    comp.category = caseCategories.get(a.caseId) ?? "unknown";
    comparisons.push(comp);

    if (comp.winner === "a") winsA++;
    else if (comp.winner === "b") winsB++;
  }

  const meanA = averageScores(resultsA);
  const meanB = averageScores(resultsB);

  return {
    timestamp: new Date().toISOString(),
    variantA: {
      name: configA.name,
      config: configA,
      meanScores: meanA,
      consensusRate: round2(resultsA.filter((r) => r.converged).length / (resultsA.length || 1)),
      meanRounds: round2(resultsA.reduce((s, r) => s + r.rounds, 0) / (resultsA.length || 1)),
      wins: winsA,
    },
    variantB: {
      name: configB.name,
      config: configB,
      meanScores: meanB,
      consensusRate: round2(resultsB.filter((r) => r.converged).length / (resultsB.length || 1)),
      meanRounds: round2(resultsB.reduce((s, r) => s + r.rounds, 0) / (resultsB.length || 1)),
      wins: winsB,
    },
    cases: comparisons,
  };
}

export function formatReport(report: EvalReport): string {
  const lines: string[] = [];
  const { variantA: a, variantB: b } = report;

  lines.push("╔══════════════════════════════════════════════════════════════════╗");
  lines.push("║                    A/B EVAL REPORT                             ║");
  lines.push("╚══════════════════════════════════════════════════════════════════╝");
  lines.push("");
  lines.push(`  Variant A: ${a.name}`);
  lines.push(`  Variant B: ${b.name}`);
  lines.push(`  Cases:     ${report.cases.length}`);
  lines.push(`  Time:      ${report.timestamp}`);
  lines.push("");

  // Aggregate summary
  lines.push("┌─────────────────────────┬───────────┬───────────┐");
  lines.push("│ Metric                  │ A         │ B         │");
  lines.push("├─────────────────────────┼───────────┼───────────┤");
  lines.push(`│ Tradeoff Surfacing      │ ${pad(a.meanScores.tradeoffSurfacing)}│ ${pad(b.meanScores.tradeoffSurfacing)}│`);
  lines.push(`│ Synthesis Quality       │ ${pad(a.meanScores.synthesisQuality)}│ ${pad(b.meanScores.synthesisQuality)}│`);
  lines.push(`│ Convergence Efficiency  │ ${pad(a.meanScores.convergenceEfficiency)}│ ${pad(b.meanScores.convergenceEfficiency)}│`);
  lines.push(`│ No Capitulation         │ ${pad(a.meanScores.noCapitulation)}│ ${pad(b.meanScores.noCapitulation)}│`);
  lines.push("├─────────────────────────┼───────────┼───────────┤");
  const totalA = round2(totalScore(a.meanScores));
  const totalB = round2(totalScore(b.meanScores));
  lines.push(`│ Total (max 20)          │ ${pad(totalA)}│ ${pad(totalB)}│`);
  lines.push("├─────────────────────────┼───────────┼───────────┤");
  lines.push(`│ Consensus Rate          │ ${pad(pct(a.consensusRate))}│ ${pad(pct(b.consensusRate))}│`);
  lines.push(`│ Mean Rounds             │ ${pad(a.meanRounds)}│ ${pad(b.meanRounds)}│`);
  lines.push(`│ Wins                    │ ${pad(a.wins)}│ ${pad(b.wins)}│`);
  lines.push("└─────────────────────────┴───────────┴───────────┘");
  lines.push("");

  // Per-case breakdown
  lines.push("Per-Case Breakdown:");
  lines.push("┌──────────────────────────┬──────────────┬───────┬───────┬────────┐");
  lines.push("│ Case                     │ Category     │ A     │ B     │ Winner │");
  lines.push("├──────────────────────────┼──────────────┼───────┼───────┼────────┤");

  for (const c of report.cases) {
    const scoreA = c.a.scores ? round2(totalScore(c.a.scores)) : "err";
    const scoreB = c.b.scores ? round2(totalScore(c.b.scores)) : "err";
    const winner = c.winner === "tie" ? "tie" : c.winner.toUpperCase();
    lines.push(
      `│ ${padR(c.caseId, 24)} │ ${padR(c.category, 12)} │ ${padR(String(scoreA), 5)} │ ${padR(String(scoreB), 5)} │ ${padR(winner, 6)} │`
    );

    if (c.a.error) lines.push(`│   A error: ${padR(c.a.error.slice(0, 50), 53)} │`);
    if (c.b.error) lines.push(`│   B error: ${padR(c.b.error.slice(0, 50), 53)} │`);
  }

  lines.push("└──────────────────────────┴──────────────┴───────┴───────┴────────┘");
  lines.push("");

  // Winner
  if (a.wins > b.wins) {
    lines.push(`Winner: ${a.name} (${a.wins}-${b.wins})`);
  } else if (b.wins > a.wins) {
    lines.push(`Winner: ${b.name} (${b.wins}-${a.wins})`);
  } else {
    lines.push(`Result: Tie (${a.wins}-${b.wins})`);
  }

  return lines.join("\n");
}

function pad(v: number | string, width = 10): string {
  return String(v).padStart(width - 1).padEnd(width);
}

function padR(s: string, width: number): string {
  return s.padEnd(width).slice(0, width);
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
