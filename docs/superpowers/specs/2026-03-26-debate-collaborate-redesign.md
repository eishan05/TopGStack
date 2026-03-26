# TopGStack Redesign: Debate + Collaborate

**Date:** 2026-03-26
**Status:** Draft

## Summary

Restructure TopGStack from a single-tool debate CLI into two independent tools sharing adapter infrastructure:

1. **`topg debate`** — Stripped-down debate engine. Handoff sub-agent: frame question, dispatch, get battle-tested answer back.
2. **`topg collaborate`** — Session-based collaboration. The calling agent opens a session with the other model, exchanges messages over time, and closes when done.

Both tools are in the same repo, share the same adapters and session layer, but are otherwise independent.

## Motivation

The current `topg` CLI bundles debate orchestration with a web dashboard, REPL, and eval framework. This is too heavy for its primary use case: agents invoking it as a tool. Meanwhile, a higher-value pattern — mid-task collaboration between the calling agent and another model — has no structured support. The codex-review-loop skill proves this pattern works but is hardcoded to one direction (Claude implements, Codex reviews). This redesign separates concerns and adds a generic, session-based collaboration system.

## What Gets Deleted

These components are removed entirely:

| Component | Files | Reason |
|-----------|-------|--------|
| Web dashboard | `src/server.ts`, `src/web/` | Not needed for agent-to-agent tool |
| REPL mode | `src/repl.ts` | Replaced by CLI subcommands |
| Eval framework | `src/evals/` | Can be rebuilt later if needed |
| Old skill | `skill/SKILL.md`, `skill/config-reference.md`, `skill/session-management.md`, `skill/install.sh` | Replaced by new skill structure |

`src/utils.ts` moves to `src/core/utils.ts` (it contains `capitalize`, `parseDuration`, `askUser` — all still needed).

## Directory Structure

```
src/
├── index.ts                    # CLI entry — Commander with `debate`, `collaborate`, `session` subcommands
├── core/
│   ├── adapters/
│   │   ├── agent-adapter.ts    # AgentAdapter interface (unchanged)
│   │   ├── claude-adapter.ts   # Claude CLI integration (unchanged)
│   │   └── codex-adapter.ts    # Codex SDK integration (unchanged)
│   ├── session.ts              # Generic session persistence (~/.topg/sessions/)
│   ├── types.ts                # Shared types (AgentName, Message, Artifact, etc.)
│   └── utils.ts                # capitalize, parseDuration, askUser
├── debate/
│   ├── orchestrator.ts         # Turn-based debate loop (trimmed from current)
│   ├── convergence.ts          # Convergence detection (unchanged)
│   ├── prompts.ts              # Debate-specific system prompts
│   ├── formatter.ts            # Consensus/escalation report formatting
│   └── types.ts                # DebateConfig, DebateResult
├── collaborate/
│   ├── manager.ts              # Session lifecycle: start, send, end, list
│   ├── prompts.ts              # Collaboration system prompts
│   └── types.ts                # CollaborateConfig, CollaborateSession, CollaborateResult
skill/
├── debate/
│   └── SKILL.md                # /debate skill — handoff sub-agent
├── collaborate/
│   ├── SKILL.md                # /collaborate skill — lifecycle + patterns
│   └── patterns.md             # Code review, design consultation, validation recipes
```

## CLI Interface

### `topg debate "<prompt>"`

Dispatches a turn-based debate between Claude and Codex. Returns consensus or escalation.

```
topg debate "<prompt>" [flags]

Flags:
  --output <text|json>         Output format (default: text)
  --start-with <claude|codex>  Which agent goes first (default: claude)
  --guardrail <N>              Max rounds before escalation (default: 5)
  --timeout <seconds>          Per-agent turn timeout (default: 900)
  --cwd <dir>                  Working directory (default: cwd)
  --yolo                       Skip all permission checks
  --resume <sessionId>         Resume a paused debate with guidance
  --codex-sandbox <mode>       read-only | workspace-write | danger-full-access
  --codex-web-search <mode>    disabled | cached | live
  --codex-reasoning <level>    minimal | low | medium | high | xhigh
```

**JSON output shape:**

```typescript
{
  type: "consensus" | "escalation";
  sessionId: string;
  rounds: number;
  summary: string;
  messages: Message[];
  artifacts?: Artifact[];
}
```

Running `topg` with no subcommand prints help. No more implicit REPL mode.

### `topg collaborate <action>`

Session-based collaboration with explicit agent selection.

```
topg collaborate start --with <claude|codex> "<prompt>" [flags]
topg collaborate send <sessionId|--last> "<message>" [--output <text|json>]
topg collaborate end <sessionId|--last> [--output <text|json>]
topg collaborate list [--active] [--output <text|json>]

Flags (start only):
  --output <text|json>         Output format (default: json)
  --cwd <dir>                  Working directory (default: cwd)
  --yolo                       Skip permission checks
  --codex-sandbox <mode>       Sandbox mode (default: read-only)
  --codex-web-search <mode>    Web search mode
  --codex-reasoning <level>    Reasoning effort

`send`, `end`, and `list` accept `--output` to override the format. Default: inherits from the session's config (set at `start`). Falls back to `json` if not specified.
```

**JSON output shapes:**

```typescript
// start
{ sessionId: string; agent: AgentName; response: string; artifacts?: Artifact[] }

// send
{ sessionId: string; response: string; artifacts?: Artifact[] }

// end
{ sessionId: string; status: "closed"; messageCount: number }

// list
{ sessions: { sessionId: string; agent: AgentName; status: string; createdAt: string; lastMessageAt: string }[] }
```

**`--last` shorthand:** Resolves to the most recently updated collaboration session. Fails with a clear error if no collaboration sessions exist.

### `topg session <action>`

Shared session management (works for both debate and collaboration sessions).

```
topg session delete <sessionId>
topg session clear --completed [--older-than <duration>]
topg session clear --escalated [--older-than <duration>]
topg session clear --all [--force]
topg session list
```

## Core Layer (`src/core/`)

### Types (`src/core/types.ts`)

Shared types used by both debate and collaborate. These are extracted from the current `src/types.ts` — only the types that both tools need:

```typescript
export type AgentName = "claude" | "codex";

// Session types
export type SessionType = "debate" | "collaborate";
export type SessionStatus = "active" | "paused" | "completed" | "escalated" | "closed";

export interface SessionMeta {
  version: 1;
  sessionId: string;
  type: SessionType;              // NEW: distinguishes debate vs collaborate
  status: SessionStatus;
  agent?: AgentName;              // NEW: for collaborate sessions — which agent is the collaborator
  prompt: string;
  config: Record<string, unknown>; // Opaque — debate and collaborate store their own config shapes
  createdAt: string;
  updatedAt: string;
}

// Agent communication
export interface Artifact {
  path: string;
  content: string;
  type: "code" | "diff" | "config";
}

export type ToolActivityType = "command_execution" | "file_change" | "mcp_tool_call" | "web_search";
export type ToolActivity = CommandActivity | FileChangeActivity | McpCallActivity | WebSearchActivity;
// (individual activity interfaces unchanged from current types.ts)

export interface AgentResponse {
  content: string;
  artifacts?: Artifact[];
  toolActivities?: ToolActivity[];
  convergenceSignal?: ConvergenceSignal;
}

export interface ConversationContext {
  sessionId: string;
  history: Message[];
  workingDirectory: string;
  systemPrompt: string;
}

// Message — used by both tools but with different MessageType values
export interface Message {
  role: string;                    // "initiator" | "reviewer" for debate, "caller" | "collaborator" for collaborate
  agent: AgentName;
  turn: number;
  type: string;                    // Open string — each tool defines its own message types
  content: string;
  artifacts?: Artifact[];
  toolActivities?: ToolActivity[];
  convergenceSignal?: ConvergenceSignal;
  timestamp: string;
}

// Codex configuration (shared — both tools can configure Codex the same way)
export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type WebSearchMode = "disabled" | "cached" | "live";
export type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type ApprovalMode = "never" | "on-request" | "on-failure" | "untrusted";
export type ConvergenceSignal = "agree" | "disagree" | "partial" | "defer";

export interface CodexConfig {
  sandboxMode: SandboxMode;
  webSearchMode: WebSearchMode;
  networkAccessEnabled: boolean;
  model?: string;
  modelReasoningEffort?: ModelReasoningEffort;
  approvalPolicy: ApprovalMode;
  additionalDirectories?: string[];
}

export const DEFAULT_CODEX_CONFIG: CodexConfig = {
  sandboxMode: "workspace-write",
  webSearchMode: "live",
  networkAccessEnabled: true,
  approvalPolicy: "never",
};
```

### Adapters (`src/core/adapters/`)

**No changes to adapter interface or implementations.** The `AgentAdapter` interface, `ClaudeAdapter`, and `CodexAdapter` move to `src/core/adapters/` with only import path updates. Both debate and collaborate instantiate adapters the same way.

### Session Manager (`src/core/session.ts`)

The current `SessionManager` is almost entirely reusable. Changes:

1. `SessionMeta` gains a `type` field (`"debate"` | `"collaborate"`) and an optional `agent` field.
2. `create()` accepts `type` and optional `agent` parameters.
3. `listSessions()` and `filterSessions()` gain an optional `type` filter so `topg collaborate list` only shows collaboration sessions and vice versa.
4. `config` field in `SessionMeta` becomes `Record<string, unknown>` — each tool stores its own config shape.

```typescript
// New signature
create(prompt: string, type: SessionType, config: Record<string, unknown>, agent?: AgentName): SessionMeta

// New filter option
filterSessions(opts: {
  type?: SessionType;
  statuses?: SessionStatus[];
  olderThan?: Date;
}): SessionMeta[]
```

The rest of the API (`load`, `appendMessage`, `updateStatus`, `saveSummary`, `deleteSession`) stays the same.

## Debate Engine (`src/debate/`)

### Types (`src/debate/types.ts`)

Debate-specific types extracted from the current `src/types.ts`:

```typescript
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
```

### Orchestrator (`src/debate/orchestrator.ts`)

The current `Orchestrator` class moves here with minimal changes:

- Imports update to `../core/` paths.
- `OrchestratorConfig` becomes `DebateConfig`, `OrchestratorResult` becomes `DebateResult`.
- Callback types stay the same.
- Session creation passes `type: "debate"`.
- All debate logic (turn loop, convergence checks, escalation, resume, continueWithGuidance) is preserved unchanged.

### Convergence (`src/debate/convergence.ts`)

Unchanged from current `src/convergence.ts`. Only import paths update.

### Prompts (`src/debate/prompts.ts`)

Unchanged from current `src/prompts.ts`. Only import paths update. The `TOPG_PROMPT_<ROLE>` env override mechanism stays.

### Formatter (`src/debate/formatter.ts`)

Unchanged from current `src/formatter.ts`. Only import paths update.

## Collaboration Engine (`src/collaborate/`)

### Types (`src/collaborate/types.ts`)

```typescript
import type { AgentName, CodexConfig, Artifact } from "../core/types.js";

export interface CollaborateConfig {
  with: AgentName;
  workingDirectory: string;
  timeoutMs: number;
  outputFormat: "text" | "json";
  codex: CodexConfig;
  yolo?: boolean;
}

export interface CollaborateStartResult {
  sessionId: string;
  agent: AgentName;
  response: string;
  artifacts?: Artifact[];
}

export interface CollaborateSendResult {
  sessionId: string;
  response: string;
  artifacts?: Artifact[];
}

export interface CollaborateEndResult {
  sessionId: string;
  status: "closed";
  messageCount: number;
}

export interface CollaborateListItem {
  sessionId: string;
  agent: AgentName;
  status: string;
  createdAt: string;
  lastMessageAt: string;
}
```

### Manager (`src/collaborate/manager.ts`)

The `CollaborationManager` handles the session lifecycle. Unlike the debate orchestrator, it does **not** run an autonomous loop. Each method is a single request-response exchange — the calling agent controls the flow.

```typescript
import type { AgentAdapter } from "../core/adapters/agent-adapter.js";
import { SessionManager } from "../core/session.js";
import type { AgentName, Message, AgentResponse } from "../core/types.js";
import type { CollaborateConfig, CollaborateStartResult, CollaborateSendResult, CollaborateEndResult, CollaborateListItem } from "./types.js";
import { collaboratorSystemPrompt } from "./prompts.js";

export class CollaborationManager {
  private adapter: AgentAdapter;
  private session: SessionManager;
  private config: CollaborateConfig;

  constructor(adapter: AgentAdapter, session: SessionManager, config: CollaborateConfig) {
    this.adapter = adapter;
    this.session = session;
    this.config = config;
  }

  async start(prompt: string): Promise<CollaborateStartResult> {
    // 1. Create session with type "collaborate"
    // 2. Build system prompt via collaboratorSystemPrompt()
    // 3. Send prompt to adapter with system prompt + user prompt
    // 4. Append caller message + collaborator response to transcript
    // 5. Return { sessionId, agent, response, artifacts }
  }

  async send(sessionId: string, message: string): Promise<CollaborateSendResult> {
    // 1. Load session, verify it's active and type "collaborate"
    // 2. Build prompt: system prompt + conversation history + new message
    // 3. Send to adapter
    // 4. Append caller message + collaborator response to transcript
    // 5. Return { sessionId, response, artifacts }
  }

  async end(sessionId: string): Promise<CollaborateEndResult> {
    // 1. Load session
    // 2. Update status to "closed"
    // 3. Return { sessionId, status: "closed", messageCount }
  }

  async list(activeOnly?: boolean): Promise<CollaborateListItem[]> {
    // 1. Filter sessions by type "collaborate"
    // 2. Optionally filter by status "active"
    // 3. Return list items
  }

  resolveSessionId(sessionIdOrLast: string): string {
    // If "--last", find most recent collaborate session
    // Otherwise return as-is
  }
}
```

**Key design difference from debate:** The collaboration manager is stateless between calls. Each `start`/`send`/`end` is an independent CLI invocation. Session history is loaded from disk each time. This means:

- No long-running process.
- The calling agent controls timing — it can send a message, do other work, and come back later.
- Context window management: the manager builds prompts from the full session transcript. For long sessions, it uses the same `summarizeHistory` approach from the debate prompts (summarize older messages, keep recent ones verbatim).

### Prompts (`src/collaborate/prompts.ts`)

```typescript
import type { AgentName } from "../core/types.js";

export function collaboratorSystemPrompt(callerAgent: AgentName): string {
  // Determines the other agent dynamically
  return `You are collaborating with ${callerAgent}. You are being consulted as a peer — not a subordinate.

Instructions:
- Provide your honest assessment. If you disagree with the caller's approach, say so clearly.
- Be specific: reference file paths, line numbers, code snippets when relevant.
- If asked to review code, evaluate correctness, completeness, and quality.
- If asked for design input, consider trade-offs and alternatives.
- If asked to validate, check assumptions and edge cases.
- Do not be deferential — you were consulted because a second perspective has value.
- Keep responses focused and actionable.`;
}
```

The caller's identity (which agent is the caller) is inferred from the `--with` flag: if `--with codex`, the caller is Claude, and vice versa. This is passed to the system prompt so the collaborator knows who it's talking to.

## CLI Entry Point (`src/index.ts`)

Three top-level subcommands:

### `topg debate`

Handles:
- `topg debate "<prompt>" [flags]` — one-shot debate
- `topg debate --resume <sessionId> "<guidance>" [flags]` — resume debate

No more implicit REPL. No more `topg "<prompt>"` without subcommand.

### `topg collaborate`

Handles:
- `topg collaborate start --with <agent> "<prompt>" [flags]`
- `topg collaborate send <sessionId|--last> "<message>"`
- `topg collaborate end <sessionId|--last>`
- `topg collaborate list [--active]`

### `topg session`

Handles:
- `topg session delete <sessionId>`
- `topg session clear [--all|--completed|--escalated] [--older-than <duration>] [--force]`
- `topg session list`

Running bare `topg` prints help with subcommand overview.

## Skills

### `/debate` Skill (`skill/debate/SKILL.md`)

A streamlined version of the current topg-debate skill. Same workflow:

1. Frame the question from conversation context
2. Present to user for approval
3. Dispatch: `topg debate "<prompt>" --output json --yolo --cwd "$(pwd)" --guardrail 3 --timeout 300`
4. Parse JSON result
5. Fold into reasoning (consensus → strong signal, escalation → present to user)

Changes from current skill:
- Command is now `topg debate` not `topg`
- Remove `--no-dashboard` (no dashboard exists)
- Simplify — remove references to REPL, dashboard, eval
- Keep prerequisites (auto-install, env vars), error handling, quick reference table

### `/collaborate` Skill (`skill/collaborate/SKILL.md`)

Teaches agents when and how to use `topg collaborate`. Covers:

**When to use:**
- Mid-task code review (have the other model review what you just implemented)
- Design consultation (get a second opinion on an approach before committing)
- Validation (have the other model verify your assumptions, test coverage, edge cases)
- Any point where a different model's perspective would improve the work

**When NOT to use:**
- When you need a full adversarial debate (use `/debate` instead)
- Simple, unambiguous tasks
- When the user hasn't indicated they want multi-model collaboration

**Core lifecycle:**
```
# Start a session
topg collaborate start --with codex "Review my implementation of X" --output json --yolo --cwd "$(pwd)"

# Send follow-up messages
topg collaborate send --last "I've fixed issues 1 and 3. Re-review?" --output json

# Close when done
topg collaborate end --last
```

**Agent detection:**
- If the calling agent is Claude Code → `--with codex`
- If the calling agent is Codex → `--with claude`
- The skill should instruct the agent to detect its own identity and select the other model automatically.

**Critical evaluation:**
- Treat the collaborator as a colleague, not an authority
- If you disagree with a finding, push back in the next `send`
- Don't implement suggestions you believe are wrong

### Collaboration Patterns (`skill/collaborate/patterns.md`)

#### Pattern 1: Code Review Loop

The calling agent implements, the collaborator reviews. Iterate until clean or capped.

```
1. Start session: "Review these changes for bugs, correctness, edge cases. List findings as numbered items with [BUG], [POTENTIAL ISSUE], [STYLE], [SUGGESTION] severity tags."
2. Parse findings from response
3. Evaluate each finding critically — skip any you disagree with
4. Implement valid fixes
5. Send: "Fixed N issues: [list]. Skipped M: [reasons]. Re-review and report new findings."
6. Repeat until clean or 3 iterations
7. End session
```

#### Pattern 2: Design Consultation

Get input on an approach before implementing.

```
1. Start session: "I'm about to implement X. Here's my approach: [description]. What am I missing? What would you do differently?"
2. Evaluate response — incorporate good suggestions, push back on bad ones
3. Optionally send: "Good point on Y. I'll adjust. What about Z?"
4. End session when satisfied
```

#### Pattern 3: Validation

Have the collaborator verify assumptions or test coverage.

```
1. Start session: "I've implemented X. Verify: [list of assumptions]. Check for edge cases I might have missed."
2. Review response — address any valid concerns
3. Optionally send follow-ups for specific areas
4. End session
```

## Session Storage

Both tools share `~/.topg/sessions/`. Sessions are distinguished by the `type` field in `meta.json`:

```json
{
  "version": 1,
  "sessionId": "abc123def456",
  "type": "collaborate",
  "status": "active",
  "agent": "codex",
  "prompt": "Review my implementation of...",
  "config": { ... },
  "createdAt": "2026-03-26T...",
  "updatedAt": "2026-03-26T..."
}
```

- `type: "debate"` — debate sessions (no `agent` field, since both agents participate)
- `type: "collaborate"` — collaboration sessions (`agent` field indicates the collaborator)
- `status` values: `active`, `paused`, `completed`, `escalated` (debate), `closed` (collaborate)

Transcript format (`transcript.jsonl`) is the same for both — append-only JSONL of `Message` objects.

## Testing

Tests move from `tests/` to align with the new structure. The existing convergence, types, and utils tests are preserved. Server/REPL tests are deleted. New tests needed:

- `tests/collaborate/manager.test.ts` — session lifecycle (start/send/end/list), error cases
- `tests/debate/orchestrator.test.ts` — existing debate tests, updated imports
- `tests/core/session.test.ts` — session type filtering, --last resolution

Integration tests (`tests/integration/`) can be added later — they require live API keys.

## Migration Notes

- The `topg` binary changes from accepting a bare prompt (`topg "<prompt>"`) to requiring a subcommand (`topg debate "<prompt>"`). This is a breaking change.
- Session format gains a `type` field. Old sessions without `type` should be treated as `type: "debate"` for backwards compatibility.
- `npm run build` continues to work — just compiles the new structure.
- The `bin` field in `package.json` stays as `topg → ./dist/index.ts`.

## Out of Scope

- Dashboard, REPL, eval framework — removed, may return later as separate concerns
- Additional adapter support (Gemini, Llama, etc.) — future work, adapter interface supports it
- Installing skills to `~/.claude/skills/` — will be done separately
- MCP server integration — future work
