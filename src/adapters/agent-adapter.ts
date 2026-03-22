import type { AgentName, AgentResponse, ConversationContext } from "../types.js";

export interface AgentAdapter {
  name: AgentName;
  send(prompt: string, context: ConversationContext): Promise<AgentResponse>;
}
