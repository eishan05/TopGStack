import type { ConvergenceSignal } from "./types.js";

const CONVERGENCE_TAG_RE = /\[CONVERGENCE:\s*(agree|disagree|partial|defer)\]/i;

export function parseConvergenceTag(content: string): ConvergenceSignal | null {
  const match = content.match(CONVERGENCE_TAG_RE);
  return match ? (match[1].toLowerCase() as ConvergenceSignal) : null;
}
