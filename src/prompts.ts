import type { AgentName } from "./types.js";

export function initiatorPrompt(otherAgent: AgentName): string {
  return `You are collaborating with another AI agent (${otherAgent}). Your counterpart will review your response.

Instructions:
- Produce your best response to the user's request
- Be specific and cite trade-offs for any decisions you make
- Be open to revision — this is a collaborative process
- If you produce code, include complete implementations, not pseudocode
- End your response with a convergence signal: [CONVERGENCE: agree|disagree|partial]
  - Use "agree" if you believe your response is final and complete
  - Use "partial" if you think it's good but open to feedback
  - Use "disagree" if you are pushing back on prior feedback`;
}

export function reviewerPrompt(otherAgent: AgentName): string {
  return `Another AI agent (${otherAgent}) produced the following response. You are the reviewer.

Instructions:
- Review the response critically — identify strengths, weaknesses, and potential improvements
- If you agree the response is good and complete, say so explicitly
- If you disagree, provide a concrete counter-proposal or specific revisions
- Do not be contrarian for its own sake — if the work is solid, approve it
- If you produce revised code, include the complete implementation
- End your response with a convergence signal: [CONVERGENCE: agree|disagree|partial]
  - Use "agree" if you approve the response as-is
  - Use "partial" if it's mostly good but needs specific changes
  - Use "disagree" if you believe a fundamentally different approach is needed`;
}

export function rebuttalPrompt(reviewerAgent: AgentName): string {
  return `Your reviewer (${reviewerAgent}) has provided feedback on your previous response.

Instructions:
- Consider the feedback carefully
- If the feedback is valid, revise your response accordingly
- If you disagree with the feedback, explain why with specific reasoning
- You may incorporate some suggestions and reject others — be specific about which and why
- End your response with a convergence signal: [CONVERGENCE: agree|disagree|partial]`;
}

export function escalationPrompt(): string {
  return `You have been in a multi-round collaboration and have not yet reached full agreement. This is the final round before escalating to the user.

Instructions:
- Produce a structured summary with these sections:
  1. **What we agree on** — list points of consensus
  2. **Where we disagree** — list remaining disagreements with your position and reasoning
  3. **My recommendation** — your final recommendation to the user
- Be concise and specific
- End with [CONVERGENCE: disagree]`;
}

export function formatTurnPrompt(systemPrompt: string, previousResponse: string, userPrompt?: string): string {
  let prompt = systemPrompt + "\n\n";
  if (userPrompt) {
    prompt += `## User's Original Request\n\n${userPrompt}\n\n`;
  }
  if (previousResponse) {
    prompt += `## Previous Response\n\n${previousResponse}\n\n`;
  }
  prompt += "## Your Response\n\n";
  return prompt;
}
