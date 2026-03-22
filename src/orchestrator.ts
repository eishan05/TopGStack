import type { AgentAdapter } from "./adapters/agent-adapter.js";
import type { Message, OrchestratorConfig, OrchestratorResult, AgentName } from "./types.js";
import { detectConvergence, checkDiffStability } from "./convergence.js";
import { initiatorPrompt, reviewerPrompt, rebuttalPrompt, escalationPrompt, formatTurnPrompt } from "./prompts.js";
import { formatConsensus, formatEscalation } from "./formatter.js";
import { SessionManager } from "./session.js";

export class Orchestrator {
  private agentA: AgentAdapter;
  private agentB: AgentAdapter;
  private session: SessionManager;
  private config: OrchestratorConfig;

  constructor(
    agentA: AgentAdapter,
    agentB: AgentAdapter,
    session: SessionManager,
    config: OrchestratorConfig
  ) {
    this.agentA = config.startWith === agentA.name ? agentA : agentB;
    this.agentB = config.startWith === agentA.name ? agentB : agentA;
    this.config = config;
    this.session = session;
  }

  async run(userPrompt: string): Promise<OrchestratorResult> {
    const meta = this.session.create(userPrompt, this.config);
    const messages: Message[] = [];
    let turn = 0;

    // Turn 1: Initiator
    turn++;
    const initResponse = await this.agentA.send(
      formatTurnPrompt(initiatorPrompt(this.agentB.name), "", userPrompt),
      {
        sessionId: meta.sessionId,
        history: messages,
        workingDirectory: this.config.workingDirectory,
        systemPrompt: initiatorPrompt(this.agentB.name),
      }
    );

    const initMsg = this.toMessage("initiator", this.agentA.name, turn, "code", initResponse);
    messages.push(initMsg);
    this.session.appendMessage(meta.sessionId, initMsg);

    // Turn 2+: Review loop
    let currentReviewer = this.agentB;
    let currentInitiator = this.agentA;

    while (turn < this.config.guardrailRounds) {
      turn++;

      // Reviewer turn
      const prevContent = messages[messages.length - 1].content;
      const isFirstReview = turn === 2;
      const sysPrompt = isFirstReview
        ? reviewerPrompt(currentInitiator.name)
        : rebuttalPrompt(currentInitiator.name);

      const reviewResponse = await currentReviewer.send(
        formatTurnPrompt(sysPrompt, prevContent, turn === 2 ? userPrompt : undefined),
        {
          sessionId: meta.sessionId,
          history: messages,
          workingDirectory: this.config.workingDirectory,
          systemPrompt: sysPrompt,
        }
      );

      const reviewMsg = this.toMessage(
        "reviewer",
        currentReviewer.name,
        turn,
        "review",
        reviewResponse
      );
      messages.push(reviewMsg);
      this.session.appendMessage(meta.sessionId, reviewMsg);

      // Check convergence
      if (detectConvergence(messages) || checkDiffStability(messages)) {
        const summary = formatConsensus(messages, turn);
        this.session.saveSummary(meta.sessionId, summary);
        this.session.updateStatus(meta.sessionId, "completed");
        return { type: "consensus", rounds: turn, summary, messages };
      }

      // Swap roles for next cycle
      [currentReviewer, currentInitiator] = [currentInitiator, currentReviewer];
    }

    // Escalation: ask both for final summaries
    turn++;
    const escPrompt = escalationPrompt();

    const escResponseA = await this.agentA.send(
      formatTurnPrompt(escPrompt, messages[messages.length - 1].content, userPrompt),
      {
        sessionId: meta.sessionId,
        history: messages,
        workingDirectory: this.config.workingDirectory,
        systemPrompt: escPrompt,
      }
    );
    const escMsgA = this.toMessage("initiator", this.agentA.name, turn, "deadlock", escResponseA);
    messages.push(escMsgA);
    this.session.appendMessage(meta.sessionId, escMsgA);

    const escResponseB = await this.agentB.send(
      formatTurnPrompt(escPrompt, messages[messages.length - 2].content, userPrompt),
      {
        sessionId: meta.sessionId,
        history: messages,
        workingDirectory: this.config.workingDirectory,
        systemPrompt: escPrompt,
      }
    );
    const escMsgB = this.toMessage("reviewer", this.agentB.name, turn, "deadlock", escResponseB);
    messages.push(escMsgB);
    this.session.appendMessage(meta.sessionId, escMsgB);

    const summary = formatEscalation(messages.slice(-2), this.config.guardrailRounds);
    this.session.saveSummary(meta.sessionId, summary);
    this.session.updateStatus(meta.sessionId, "escalated");
    return { type: "escalation", rounds: this.config.guardrailRounds, summary, messages };
  }

  private toMessage(
    role: "initiator" | "reviewer",
    agent: AgentName,
    turn: number,
    type: Message["type"],
    response: { content: string; artifacts?: any[]; convergenceSignal?: any }
  ): Message {
    return {
      role,
      agent,
      turn,
      type,
      content: response.content,
      artifacts: response.artifacts,
      convergenceSignal: response.convergenceSignal,
      timestamp: new Date().toISOString(),
    };
  }
}
