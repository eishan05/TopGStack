# topg Interactive REPL Design

**Date:** 2026-03-22
**Status:** Draft

## Overview

Transform topg from a one-shot CLI (`topg "prompt"`) into a persistent interactive REPL (`topg` with no args), while preserving backward compatibility with the existing one-shot mode.

The REPL provides a `topg> ` prompt where users submit questions, watch a condensed spinner during agent debate, and receive the final consensus or escalation result. Context accumulates across rounds so agents build on prior conclusions.

## Goals

- Persistent multi-turn REPL with cumulative context across debate rounds
- Condensed output: spinner during debate, final result printed on completion
- Slash commands for session management, transcript viewing, and configuration
- Backward compatible: `topg "prompt"` still runs the one-shot flow
- Minimal changes to existing code

## Non-Goals

- Token-by-token streaming (future enhancement — condensed spinner makes this unnecessary now)
- Rich TUI framework (Ink, blessed, etc.)
- Mid-debate interruption (only `/steer` on escalation)
- Context windowing/summarization for long sessions (acknowledged as a scaling concern — deferred to v2; for v1, the full history is sent and users should be aware that very long sessions may hit token limits)

## Approach

Node's built-in `readline` module for the REPL loop, `chalk` for terminal colors. No heavy dependencies.

## Architecture

### New File: `src/repl.ts`

The REPL module exports a single entry point:

```typescript
export async function startRepl(
  config: OrchestratorConfig,
  resumeSessionId?: string
): Promise<void>
```

#### REPL Loop

1. Creates adapters and SessionManager
2. If `resumeSessionId` provided, loads session via `session.load()`; otherwise calls `session.create()` with a placeholder prompt `"(interactive session)"` — the REPL owns session lifecycle, not the orchestrator
3. Creates Orchestrator with config and `onTurnStart` callback
4. Creates `readline.Interface` on stdin/stderr (stderr for prompt to keep stdout clean)
5. Prints welcome banner with session ID
6. Prompts `topg> `
7. On each line:
   - If starts with `/`: dispatch to slash command handler map
   - Otherwise: submit as a debate prompt to orchestrator via `runWithHistory()`
8. After each debate round, print result and re-prompt
9. On `/quit`: graceful shutdown (see Ctrl+C & Shutdown Handling)
10. On Ctrl+C: graceful shutdown (see Ctrl+C & Shutdown Handling)

#### Session Creation Responsibility

The REPL creates sessions, not the orchestrator. For the first REPL round, `startRepl()` calls `session.create()` during initialization and holds the `sessionId`. The `runWithHistory()` method on Orchestrator never creates sessions — it only appends messages to an existing session. This is the key difference from `run()`, which creates its own session.

#### State & Dependencies

The REPL holds its state and dependencies as closure variables within `startRepl`:

```typescript
// Dependencies (closure variables, not in ReplState)
const session = new SessionManager();
const claude = new ClaudeAdapter(config.timeoutMs);
const codex = new CodexAdapter(config.timeoutMs);

// Config is held as a mutable reference — the orchestrator receives
// this same object reference, so mutations via /config propagate
// to subsequent runWithHistory calls. If startWith changes, a new
// Orchestrator must be constructed (since agent ordering is set in constructor).
let orchestrator = new Orchestrator(claude, codex, session, config, onTurnStart);

// Mutable state
interface ReplState {
  sessionId: string;
  messages: Message[];        // cumulative across all rounds
  roundIndex: number;         // current round number
  roundStartTurn: number;     // absolute turn number at start of current round
  config: OrchestratorConfig; // mutable reference, shared with orchestrator
  lastResult: OrchestratorResult | null;
  debateInProgress: boolean;  // true while orchestrator is running
  escalationPending: boolean; // true after escalation, cleared on next prompt or /steer
}
```

Slash command handlers are closures that capture both `ReplState` and the dependency variables (`session`, `orchestrator`, etc.), so they have full access without needing these on the state interface.

### Spinner

The `onTurnStart` callback drives a spinner that overwrites the current terminal line on stderr.

The spinner displays **round-relative** turn numbers, not absolute turn numbers. The REPL tracks `roundStartTurn` and computes `relativeTurn = absoluteTurn - roundStartTurn + 1`:

```
⠋ Claude (initiator) responding... turn 1/8
⠙ Codex (reviewer) responding... turn 2/8
```

The denominator is `config.guardrailRounds` and represents the debate loop limit (excluding escalation turns). If the debate reaches escalation, the spinner shows `escalating...` without a turn fraction, since escalation is beyond the guardrail limit.

Spinner frames: `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`
Cycle interval: 80ms
Clears on round completion.

### Output After Debate

**Consensus:**
```
✓ Consensus reached (3 rounds)

## Agreed Approach
...formatConsensus output...

topg>
```

**Escalation:**
```
⚠ Escalation (8 rounds, no convergence)

### Claude's Summary
...

### Codex's Summary
...

Your guidance (or press Enter to skip):
```

If user provides guidance, debate resumes with `continueWithGuidance` and `escalationPending` is cleared. If Enter, `escalationPending` remains `true` (user can still `/steer` later) and the prompt returns.

### Colors (chalk)

| Element | Color |
|---------|-------|
| `claude` label | Purple |
| `codex` label | Green |
| Consensus marker | Green (✓) |
| Escalation marker | Yellow (⚠) |
| Slash command output | Dim/gray |
| Prompt `topg> ` | Bold white |

### Slash Commands

Dispatched via a `Map<string, (args: string) => void | Promise<void>>`. Each handler is a closure capturing `ReplState` and dependencies.

| Command | Behavior |
|---------|----------|
| `/quit` | Graceful shutdown (see Ctrl+C & Shutdown Handling section) |
| `/transcript` | Print full debate transcript for the most recent round with agent labels and turn numbers |
| `/history` | Print summary of all rounds: round number, prompt snippet (60 chars), outcome, turn count |
| `/sessions` | List all sessions from `~/.topg/sessions/` via `session.listSessions()` — session ID, date, status, prompt snippet |
| `/resume <id>` | Load a different session's history into the REPL via `session.load(id)`, swap active session. Adopt the loaded session's full config (replacing the current `state.config`). Construct a new `Orchestrator` with the loaded config. |
| `/steer <text>` | Inject user guidance and resume debate. Valid when `state.escalationPending === true`; otherwise prints "No pending escalation to steer. Submit a new prompt instead." |
| `/status` | Print current session ID, round count, last outcome, agent config |
| `/config [key] [value]` | No args: print config. With args: update `guardrailRounds`, `timeoutMs`, or `startWith` on the shared config object. If `startWith` changes, construct a new `Orchestrator` with the updated config (since agent ordering is set in the constructor). Other config changes propagate automatically via the shared reference. |
| `/help` | List all commands with one-line descriptions |

Unknown commands print: `Unknown command: /foo. Type /help for available commands.`

All command output goes to stderr.

### Cumulative Context

When a user submits a new prompt in the REPL:

1. `state.escalationPending` is cleared (new round supersedes prior escalation)
2. A synthetic message is appended to the running `messages[]`:
   ```typescript
   {
     role: "initiator",
     agent: "claude",
     turn: state.roundStartTurn,  // assigned before incrementing
     type: "user-prompt",         // distinct type, filtered by convergence/formatting
     content: "[USER PROMPT #N]: <text>",
     timestamp: new Date().toISOString()
   }
   ```
3. `state.roundStartTurn` is set to `Math.max(...state.messages.map(m => m.turn), 0) + 1`
4. The orchestrator's `runWithHistory()` receives the full history plus only the current round's prompt as `userPrompt`
5. Agents see prior rounds' prompts via history messages and the current round's prompt as "User's Original Request" via `formatTurnPrompt()`
6. The existing `formatTurnPrompt()` handles history formatting — no changes needed to that function

**Note:** `runWithHistory` passes only the current round's prompt as the `userPrompt` parameter to `formatTurnPrompt`. Prior round prompts are visible to agents via the synthetic `[USER PROMPT #N]` messages in the conversation history. This is intentional — the current prompt is the active request, prior prompts are context.

### Session Metadata Across Rounds

`meta.prompt` stores the first prompt submitted in the session (or `"(interactive session)"` if no prompt has been submitted yet). It is updated to the first real prompt when the user submits their first debate question via a new `SessionManager.updatePrompt(sessionId, prompt)` method. The `/sessions` command displays this first prompt as the snippet. Subsequent prompts are only in the transcript.

### Ctrl+C & Shutdown Handling

**At idle prompt (no debate running):**
- `readline` `close` event fires
- Update session status to `paused`
- Print resume command: `Resume with: topg --resume <sessionId>`
- `process.exit(0)`

**During active debate (`state.debateInProgress === true`):**
- The REPL passes an `AbortSignal` (from an `AbortController`) to `runWithHistory()`, which forwards it to the active adapter's `send()` call
- On SIGINT, the REPL calls `abortController.abort()`
- `ClaudeAdapter`: uses the signal to kill the spawned child process (`proc.kill()`)
- `CodexAdapter`: passes the signal to the SDK call (or races with an abort Promise)
- The `runWithHistory()` Promise rejects with an `AbortError`
- The REPL catches this, sets `state.debateInProgress = false`
- Discards messages from the incomplete round (messages added after `roundStartTurn` are removed from `state.messages`; the session transcript already has them appended, but they are harmless context on resume)
- Prints "Debate interrupted." and returns to prompt
- This means Ctrl+C mid-debate cancels the current round but doesn't exit the REPL. A second Ctrl+C at the prompt exits.

### Session Lifecycle (REPL Mode)

- **REPL start:** Session created by the REPL (or loaded via `/resume`) with status `active`
- **During REPL:** Each round appends to the same session's `transcript.jsonl`
- **Between rounds:** Status stays `active`
- **On `/quit` or Ctrl+C at idle:** Status set to `paused`
- **On resume (`topg --resume <id>`):** Launches REPL with loaded history

## Changes to Existing Files

### `src/index.ts`

**Remove** the existing error guard at lines 46-49:
```typescript
// REMOVE THIS:
if (!prompt && !opts.resume) {
  console.error("Error: provide a prompt or use --resume <sessionId>");
  process.exit(1);
}
```

**Replace** with four routing cases in the action handler:

```typescript
// Case 1: No prompt and no --resume → launch REPL
if (!prompt && !opts.resume) {
  await startRepl(config);
  return;
}

// Case 2: --resume with no prompt → launch REPL with loaded session
if (opts.resume && !prompt) {
  await startRepl(config, opts.resume);
  return;
}

// Case 3: --resume with prompt → one-shot resume with guidance (existing behavior, unchanged)
if (opts.resume && prompt) {
  // ... existing resume logic at lines 71-84, unchanged ...
}

// Case 4: prompt provided, no --resume → one-shot mode (existing behavior, unchanged)
```

### `src/orchestrator.ts`

Add one new method:

```typescript
async runWithHistory(
  userPrompt: string,
  existingMessages: Message[],
  sessionId: string,
  signal?: AbortSignal
): Promise<OrchestratorResult>
```

Same logic as `run()` but:
- Starts with `existingMessages` instead of empty `[]`
- Uses provided `sessionId` instead of creating a new session (never calls `session.create()`)
- Turn counter starts from `Math.max(...existingMessages.map(m => m.turn), 0) + 1`
- Passes `signal` through to adapter `send()` calls for abort support

Add `signal?: AbortSignal` to `continueWithGuidance()` as well (for `/steer` abort support). No changes to `run()` or `resume()`.

### `src/types.ts`

- Add `"user-prompt"` to the `MessageType` union: `"code" | "review" | "debate" | "consensus" | "deadlock" | "user-prompt"`

This distinct type allows convergence detection and formatting to filter out synthetic user prompt messages, preventing them from being mistaken for agent responses.

### `src/convergence.ts`

- `detectConvergence()` and `checkDiffStability()` filter out messages with `type: "user-prompt"` before processing. This prevents synthetic user messages from interfering with agent-attribution logic (e.g., the `lastByAgent` map).

### `src/formatter.ts`

- `getLastMessagePerAgent()` filters out messages with `type: "user-prompt"` before building the `byAgent` map. This prevents a synthetic user prompt message from overwriting an agent's actual last debate message.

### `src/session.ts`

Add one new method:

```typescript
listSessions(): SessionMeta[] {
  // Read all subdirectories of this.baseDir
  // For each, read meta.json and return the parsed SessionMeta
  // Sort by updatedAt descending
}

updatePrompt(sessionId: string, prompt: string): void {
  // Read meta.json, update prompt field, write back
}
```

### `src/adapters/agent-adapter.ts`

Update the `AgentAdapter` interface to accept an optional `AbortSignal`:

```typescript
export interface AgentAdapter {
  name: AgentName;
  send(prompt: string, context: ConversationContext, signal?: AbortSignal): Promise<AgentResponse>;
}
```

### `src/adapters/claude-adapter.ts`

- Accept `signal?: AbortSignal` in `send()`
- If signal is aborted, call `proc.kill('SIGTERM')` on the spawned child process and reject with `AbortError`
- Listen to `signal.addEventListener('abort', ...)` to kill the process mid-flight

### `src/adapters/codex-adapter.ts`

- Accept `signal?: AbortSignal` in `send()`
- Race the SDK call with the abort signal, rejecting with `AbortError` when aborted

### No Changes To

- `src/prompts.ts`

## New Dependency

- `chalk` — terminal colors. Lightweight, zero transitive dependencies (chalk v5+).

## Testing

- Unit tests for slash command parsing and dispatch
- Unit tests for spinner start/stop/clear
- Unit tests for cumulative context building (synthetic user prompt messages appended correctly with `type: "user-prompt"`)
- Unit test that convergence detection ignores `user-prompt` type messages
- Unit test that `getLastMessagePerAgent` ignores `user-prompt` type messages
- Unit test for `SessionManager.listSessions()`
- Unit test for adapter abort via `AbortSignal`
- Integration test for REPL startup and `/quit` flow (mock readline)
- Existing tests remain unchanged — one-shot mode is not modified

## File Summary

| File | Action |
|------|--------|
| `src/repl.ts` | **New** — REPL loop, slash commands, spinner, banner |
| `src/index.ts` | **Modified** — remove error guard, route to REPL when no prompt, preserve all existing one-shot paths |
| `src/orchestrator.ts` | **Modified** — add `runWithHistory()` method with `AbortSignal` support |
| `src/types.ts` | **Modified** — add `"user-prompt"` to `MessageType` union |
| `src/convergence.ts` | **Modified** — filter out `user-prompt` messages |
| `src/formatter.ts` | **Modified** — filter out `user-prompt` messages in `getLastMessagePerAgent` |
| `src/session.ts` | **Modified** — add `listSessions()` method |
| `src/adapters/agent-adapter.ts` | **Modified** — add optional `AbortSignal` to `send()` |
| `src/adapters/claude-adapter.ts` | **Modified** — implement abort support |
| `src/adapters/codex-adapter.ts` | **Modified** — implement abort support |
| `package.json` | **Modified** — add `chalk` dependency |
