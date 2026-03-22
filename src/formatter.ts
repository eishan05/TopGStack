import type { Message, Artifact } from "./types.js";

export function formatConsensus(messages: Message[], rounds: number): string {
  const lastMessages = getLastMessagePerAgent(messages);
  const allArtifacts = collectArtifacts(messages);

  let output = `[CONSENSUS after ${rounds} rounds]\n\n`;
  output += `## Agreed Approach\n\n`;

  const agentMessages = messages.filter((m) => m.type !== "user-prompt");
  const finalMsg = agentMessages[agentMessages.length - 1];
  output += finalMsg.content.replace(/\[CONVERGENCE:.*?\]/gi, "").trim();
  output += "\n\n";

  if (lastMessages.length > 1) {
    output += `## Key Decisions\n\n`;
    for (const msg of lastMessages) {
      output += `- **${capitalize(msg.agent)}**: ${firstSentence(msg.content)}\n`;
    }
    output += "\n";
  }

  if (allArtifacts.length > 0) {
    output += `## Artifacts\n\n`;
    for (const artifact of allArtifacts) {
      output += `- \`${artifact.path}\` (${artifact.type})\n`;
    }
    output += "\n";
  }

  return output;
}

export function formatEscalation(messages: Message[], rounds: number): string {
  const lastMessages = getLastMessagePerAgent(messages);

  let output = `[ESCALATION after ${rounds} rounds — no convergence]\n\n`;

  for (const msg of lastMessages) {
    output += `### ${capitalize(msg.agent)}'s Summary\n\n`;
    output += msg.content.replace(/\[CONVERGENCE:.*?\]/gi, "").trim();
    output += "\n\n";
  }

  return output;
}

function getLastMessagePerAgent(messages: Message[]): Message[] {
  const byAgent = new Map<string, Message>();
  for (const msg of messages) {
    if (msg.type === "user-prompt") continue;
    byAgent.set(msg.agent, msg);
  }
  return [...byAgent.values()];
}

function collectArtifacts(messages: Message[]): Artifact[] {
  const seen = new Set<string>();
  const artifacts: Artifact[] = [];
  for (const msg of messages) {
    for (const a of msg.artifacts ?? []) {
      if (!seen.has(a.path)) {
        seen.add(a.path);
        artifacts.push(a);
      }
    }
  }
  return artifacts;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function firstSentence(s: string): string {
  const clean = s.replace(/\[CONVERGENCE:.*?\]/gi, "").trim();
  const match = clean.match(/^(.+?[.!?])\s/);
  return match ? match[1] : clean.slice(0, 120);
}
