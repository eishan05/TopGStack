# topg — Inter-Agent Collaboration Tool

**Date:** 2026-03-22
**Status:** Approved

## Overview

`topg` is a TypeScript CLI tool that enables autonomous collaboration between Claude Code and OpenAI Codex. When invoked, it orchestrates a turn-based conversation where both agents can write code, review each other's work, debate approaches, and converge on a recommendation — all before returning a result to the user.

## Goals

- Allow Claude Code and Codex to autonomously debate, review, and collaborate
- Support explicit invocation (`/collab`) and auto-detection (agent suggests collaboration)
- Converge on consensus or produce a structured disagreement report
- Soft guardrail escalation when agents can't agree

## Architecture

### Components

```
┌─────────────────────────────────────────────┐
│                  topg CLI                    │
│                                             │
│  ┌─────────────┐    ┌───────────────────┐   │
│  │ Orchestrator │───▶│ Session Manager   │   │
│  └──────┬───┬──┘    └───────────────────┘   │
│         │   │                               │
│    ┌────▼┐ ┌▼────┐                          │
│    │Claude│ │Codex│                          │
│    │Adapt.│ │Adapt│                          │
│    └──┬──┘ └──┬──┘                          │
│       │       │                             │
└───────┼───────┼─────────────────────────────┘
        │       │
   claude -p   @openai/codex-sdk
```

### 1. Agent Adapters

Two adapters with a shared interface:

```typescript
interface AgentResponse {
  content: string;
  artifacts?: Artifact[];
  convergenceSignal?: "agree" | "disagree" | "partial" | "defer";
}

interface Artifact {
  path: string;
  content: string;
  type: "code" | "diff" | "config";
}

interface ConversationContext {
  sessionId: string;
  history: Message[];       // all prior turns
  workingDirectory: string;
  systemPrompt: string;     // role-specific instructions for this turn
}

interface AgentAdapter {
  name: string;
  send(prompt: string, context: ConversationContext): Promise<AgentResponse>;
}
```

**ClaudeAdapter:**
- Spawns `claude -p --output-format stream-json` with prompt and context passed via **stdin** (avoids OS argument length limits for long conversations)
- Parses streaming JSON responses
- Supports passing conversation context and working directory

**CodexAdapter:**
- Uses `@openai/codex-sdk` TypeScript SDK
- Manages sessions via `startThread()` / `thread.run()`
- Supports session persistence and resume

### 2. Orchestrator

The core conversation loop:

1. Accepts initial prompt + configuration
2. Sends prompt to Agent A (initiator)
3. Sends Agent A's response to Agent B (reviewer) with review instructions
4. Agent A receives B's feedback, revises or argues
5. Loop continues, alternating reviewer role each cycle
6. Evaluates convergence after each turn
7. Exits on consensus or triggers soft guardrail escalation

### 3. Session Manager

Persists conversation state to `~/.topg/sessions/<session-id>/`:

```
~/.topg/sessions/
  <session-id>/
    meta.json          # session config, status, timestamps
    transcript.jsonl   # full message-by-message log
    artifacts/         # code files produced during collaboration
    summary.md         # final consensus or disagreement report
```

## Conversation Protocol

### Message Format

```typescript
interface Message {
  role: "initiator" | "reviewer";
  agent: "claude" | "codex";
  turn: number;
  type: "code" | "review" | "debate" | "consensus" | "deadlock";
  content: string;
  artifacts?: Artifact[];
  convergenceSignal?: "agree" | "disagree" | "partial" | "defer";
}
```

### Turn Flow

1. **Initiator prompt** — Agent A receives the user's request with a system prompt instructing collaborative behavior: produce best response, cite trade-offs, be open to revision.

2. **Reviewer prompt** — Agent B receives Agent A's response with instructions to review critically: identify strengths, weaknesses, improvements. If it's good, say so explicitly.

3. **Rebuttal/revision** — Agent A gets B's review and either revises or argues their position.

4. **Loop** — Steps 2-3 repeat. The `role` field in each `Message` describes the function for that specific turn (initiator vs reviewer), not a fixed identity — the `agent` field captures which agent it is. In even-numbered cycles, roles swap so neither agent is permanently the reviewer.

### Convergence Detection

After each turn, the orchestrator checks for:

- **Explicit agreement** — Phrases like "I agree," "this looks good," "no further changes"
- **Structured signal** — Agents are instructed to end responses with `[CONVERGENCE: agree|disagree|partial]`
- **Diff stability** — If proposed code/design hasn't materially changed for 2 consecutive turns

Convergence requires both agents signaling `agree` or diff stability detected.

### Soft Guardrail Escalation

After N rounds (configurable, default 8) without convergence:

1. Both agents receive a final prompt: "Produce a joint summary — what you agree on, disagree on, and your individual recommendations."
2. Responses are combined into a **disagreement report** for the user.
3. User can: pick a side, provide guidance to continue, or resolve manually.

## Integration

### From Claude Code

- Custom slash command `/collab <prompt>` — Claude Code invokes `topg` via Bash tool
- Auto-detection via CLAUDE.md system prompt: agent suggests `/collab` for architectural decisions, complex debugging, or situations benefiting from a second opinion
- Result is returned inline to the Claude Code conversation

### From Codex

- Custom slash command `/collab` configured to shell out to `topg`
- Result piped back into Codex session

### Standalone CLI

```bash
topg <prompt>
  --start-with <claude|codex>    # which agent goes first (default: claude)
  --cwd <path>                   # working directory for agents
  --guardrail <N>                # soft escalation after N rounds (default: 8)
  --output <text|json>           # output format
  --transcript <path>            # save full conversation transcript
  --resume <session-id>          # resume a paused session
```

## Output Format

### Consensus Result

```
[CONSENSUS after N rounds]

## Agreed Approach
<merged recommendation>

## Key Decisions
- <what they agreed on and why>

## Artifacts
- <code files with paths>
```

### Disagreement Report

```
[ESCALATION after N rounds — no convergence]

## Agreed Points
- <shared ground>

## Disagreements
| Topic | Claude's Position | Codex's Position |
|-------|------------------|-----------------|
| ...   | ...              | ...             |

## Individual Recommendations
### Claude: ...
### Codex: ...
```

## Technology Stack

- **Runtime:** Node.js 22+
- **Language:** TypeScript
- **Dependencies:**
  - `@openai/codex-sdk` — Codex programmatic control
  - `child_process` (Node built-in) — Claude Code CLI spawning
  - `commander` or `yargs` — CLI argument parsing
  - `nanoid` — Session ID generation

## Credentials

- **Claude Code:** Requires `ANTHROPIC_API_KEY` environment variable (or an active `claude` login session)
- **Codex SDK:** Requires `OPENAI_API_KEY` environment variable
- At startup, the orchestrator validates both credentials are present and fails fast with a clear error if not

## Failure Modes and Recovery

- **Agent process crash / timeout:** Each `send()` call has a configurable timeout (default 120s). On timeout or crash, the orchestrator retries once. If the retry fails, the session is paused with state persisted — the user can `--resume` later.
- **Rate limiting (429) / server errors (5xx):** Exponential backoff with 3 retries, then pause the session.
- **Malformed response (missing convergence tag):** Fall back to phrase-based detection. If no signal can be extracted, assume `partial` and continue.
- **Context window overflow:** When cumulative transcript exceeds 80% of an agent's context window, earlier turns are summarized into a condensed recap before sending. The full transcript is always preserved in the session files.
- **Session file corruption:** The `meta.json` includes a `version` field (starting at `1`) for forward-compatible migration. JSONL transcript is append-only — partial corruption only loses the last incomplete line.

## Non-Goals

- Real-time streaming of the inter-agent conversation to the user (v1 returns the final result)
- More than two agents collaborating simultaneously
- Web UI or dashboard
- Agent-to-agent file system modifications during collaboration (artifacts are proposed, not written)
