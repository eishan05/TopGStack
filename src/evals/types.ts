import type { AgentName, OrchestratorResult } from "../types.js";

export type JudgeProvider = "claude" | "codex";

export interface EvalCase {
  id: string;
  prompt: string;
  /** Expected outcome type — null means no expectation */
  expectedOutcome?: "consensus" | "escalation";
  /** Keywords the final summary should mention for a quality check */
  qualityKeywords?: string[];
  /** Max acceptable rounds — exceeding this counts as a penalty */
  maxRounds?: number;
  /** Category for grouping in reports */
  category: "trivial" | "architectural" | "adversarial" | "debugging" | "security";
}

export interface PromptOverrides {
  initiator?: string;
  reviewer?: string;
  rebuttal?: string;
  synthesis?: string;
  escalation?: string;
}

export interface CliOverrides {
  guardrail?: number;
  timeout?: number;
  startWith?: AgentName;
  codexSandbox?: string;
  codexWebSearch?: string;
  codexModel?: string;
  codexReasoning?: string;
}

export interface VariantConfig {
  name: string;
  promptOverrides?: PromptOverrides;
  cliFlags?: CliOverrides;
  judge?: JudgeProvider;
}

export interface JudgeScores {
  /** Did the debate surface real tradeoffs? (1-5) */
  tradeoffSurfacing: number;
  /** Is the final synthesis coherent and complete? (1-5) */
  synthesisQuality: number;
  /** Did agents converge efficiently without wasted rounds? (1-5) */
  convergenceEfficiency: number;
  /** Did either agent capitulate without reasoning? (1-5, 5 = no capitulation) */
  noCapitulation: number;
  /** Free-form rationale from the judge */
  rationale: string;
}

export interface CaseResult {
  caseId: string;
  variant: string;
  outcome: OrchestratorResult | null;
  scores: JudgeScores | null;
  rounds: number;
  converged: boolean;
  durationMs: number;
  error?: string;
}

export interface EvalReport {
  timestamp: string;
  variantA: VariantSummary;
  variantB: VariantSummary;
  cases: CaseComparison[];
}

export interface VariantSummary {
  name: string;
  config: VariantConfig;
  meanScores: JudgeScores;
  consensusRate: number;
  meanRounds: number;
  wins: number;
}

export interface CaseComparison {
  caseId: string;
  category: string;
  a: CaseResult;
  b: CaseResult;
  winner: "a" | "b" | "tie";
}
