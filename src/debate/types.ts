import type { AgentName, CodexConfig, Message, Artifact } from "../core/types.js";

export type DebateMessageType = "code" | "review" | "debate" | "consensus" | "deadlock" | "user-prompt" | "user-guidance";

export interface DebateConfig {
  startWith: AgentName;
  workingDirectory: string;
  guardrailRounds: number;
  timeoutMs: number;
  outputFormat: "text" | "json";
  codex: CodexConfig;
  yolo?: boolean;
}

export interface DebateResult {
  type: "consensus" | "escalation";
  sessionId: string;
  rounds: number;
  summary: string;
  messages: Message[];
  artifacts?: Artifact[];
}
