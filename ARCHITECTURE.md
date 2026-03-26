# Architecture

Technical reference for contributors and the curious. For the philosophy, see [ETHOS.md](ETHOS.md).

---

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Language | TypeScript | Type safety across the entire orchestration layer |
| Runtime | Node.js 22+ | Native ES modules, stable async |
| CLI | Commander.js | Battle-tested CLI framework |
| Claude | Spawns `claude` CLI via stdin | Uses existing auth, no API key required if logged in |
| Codex | `@openai/codex-sdk` | Official SDK, full sandbox control |
| Testing | Vitest | Fast, native ESM support |

---

## Directory Structure

```
src/
├── index.ts                    # CLI entry point — debate, collaborate, session subcommands
├── core/
│   ├── adapters/
│   │   ├── agent-adapter.ts    # Base adapter interface
│   │   ├── claude-adapter.ts   # Claude CLI integration
│   │   └── codex-adapter.ts    # Codex SDK integration
│   ├── session.ts              # Session persistence manager
│   ├── convergence-tag.ts      # Shared convergence tag parser
│   ├── types.ts                # Core type definitions (shared by debate + collaborate)
│   └── utils.ts                # Utility functions
├── debate/
│   ├── orchestrator.ts         # Turn-based debate loop
│   ├── convergence.ts          # Convergence detection
│   ├── prompts.ts              # Debate system prompts
│   ├── formatter.ts            # Consensus/escalation report formatting
│   └── types.ts                # Debate-specific types
├── collaborate/
│   ├── manager.ts              # Session lifecycle: start, send, end, list
│   ├── prompts.ts              # Collaboration system prompts
│   └── types.ts                # Collaborate-specific types
skill/
├── debate/
│   └── SKILL.md                # /debate skill for Claude Code
├── collaborate/
│   ├── SKILL.md                # /collaborate skill for Claude Code
│   └── patterns.md             # Code review, design consultation, validation recipes
tests/
├── core/
│   └── session.test.ts         # Session persistence tests
├── debate/
│   ├── convergence.test.ts     # Convergence detection tests
│   └── formatter.test.ts       # Report formatting tests
├── collaborate/
│   └── manager.test.ts         # Collaboration lifecycle tests
```

---

## Core Components

### Shared Core (`src/core/`)

The core layer is shared by both debate and collaborate. It provides:

- **Types** (`types.ts`) — `AgentName`, `SessionType`, `SessionStatus`, `SessionMeta`, `Message`, `AgentResponse`, `CodexConfig`, `Artifact`, `ToolActivity`, `ConvergenceSignal`
- **Adapters** (`adapters/`) — Model-agnostic `AgentAdapter` interface with Claude and Codex implementations
- **Session Manager** (`session.ts`) — Disk-based session persistence to `~/.topg/sessions/`
- **Convergence Tag Parser** (`convergence-tag.ts`) — Shared `[CONVERGENCE: signal]` regex parser used by both adapters

### Debate Engine (`src/debate/`)

#### Orchestrator (`orchestrator.ts`)

The brain. Manages the turn-based debate loop:

1. Assigns roles (initiator / reviewer) based on `--start-with`
2. Sends the prompt to the initiator for the opening proposal
3. Passes each response to the opposing agent for critique
4. Checks for convergence after every turn
5. Escalates if `--guardrail` rounds are exceeded without consensus

#### Convergence Detection (`convergence.ts`)

Determines when the debate is over. Looks for:

- Explicit agreement phrases and structured `[consensus]` tags
- Diff stability — when proposed solutions stop materially changing
- Convergence signals in agent responses (`agree` / `disagree` / `partial` / `defer`)

#### Report Formatting (`formatter.ts`)

Produces the final output in two modes:
- **Text** — Human-readable consensus or escalation report
- **JSON** — Machine-parseable for piping into other tools

### Collaboration Engine (`src/collaborate/`)

#### Manager (`manager.ts`)

Handles session-based collaboration lifecycle. Unlike the debate orchestrator, it does **not** run an autonomous loop. Each method is a single request-response exchange — the calling agent controls the flow.

- `start(prompt)` — Creates session, sends prompt, returns initial response
- `send(sessionId, message)` — Loads session, validates active status, sends with conversation history
- `end(sessionId)` — Closes the session
- `list(activeOnly?)` — Lists collaboration sessions
- `resolveSessionId("--last")` — Resolves to the most recent active collaboration session

**Key design:** The manager is stateless between calls. Each `start`/`send`/`end` is an independent CLI invocation. Session history is loaded from disk each time.

### Adapter Pattern (`src/core/adapters/`)

Each AI model gets an adapter that implements the same interface. This keeps both engines model-agnostic.

- **`claude-adapter.ts`** — Spawns the `claude` CLI as a child process, communicates via stdin/stdout. Supports `--dangerously-skip-permissions` in `--yolo` mode.
- **`codex-adapter.ts`** — Uses the `@openai/codex-sdk`. Configurable sandbox mode, web search, network access, reasoning effort.

### Session Persistence (`src/core/session.ts`)

Every session is saved to `~/.topg/sessions/<session-id>/`:

```
├── meta.json           # Config, status, timestamps, type (debate/collaborate)
├── transcript.jsonl    # Full transcript (append-only)
├── artifacts/          # Code files produced
└── summary.md          # Final verdict (debate only)
```

Sessions are distinguished by `type` in `meta.json`:
- `"debate"` — Both agents participate (initiator/reviewer roles)
- `"collaborate"` — One agent is the collaborator (caller/collaborator roles)

Status values: `active`, `paused`, `completed`, `escalated` (debate), `closed` (collaborate).

Sessions can be managed with `topg session delete`, `topg session clear`, and `topg session list`.

---

## Message Flow

### Debate

```
User Prompt
     │
     ▼
Orchestrator
     │
     ├──→ Initiator (Turn 1: propose)
     │         │
     │         ▼
     ├──→ Reviewer (Turn 2: critique)
     │         │
     │         ▼
     ├──→ Initiator (Turn 3: rebut)
     │         │
     │    [convergence check]
     │    ┌────┴────┐
     │   YES        NO
     │    │          │
     │    ▼          ▼
     │ CONSENSUS   continue / ESCALATION
     │
     ▼
  Report
```

### Collaborate

```
Calling Agent                TOPG CLI              Collaborator
     │                          │                       │
     ├── start ────────────────→│── prompt ────────────→│
     │                          │←─ response ──────────│
     │←── { sessionId, ... } ──│                       │
     │                          │                       │
     │ (does other work...)     │                       │
     │                          │                       │
     ├── send ─────────────────→│── history + msg ────→│
     │                          │←─ response ──────────│
     │←── { response, ... } ───│                       │
     │                          │                       │
     ├── end ──────────────────→│── close session      │
     │←── { status: closed } ──│                       │
```

Each message carries:
- `role` — initiator/reviewer (debate) or caller/collaborator (collaborate)
- `agent` — claude or codex
- `turn` — sequential number
- `convergenceSignal` — agree / disagree / partial / defer (debate only)
- `artifacts` — any code files produced
- `toolActivities` — commands run, files changed, web searches

---

## Running Tests

```bash
npm test            # Single run
npm run test:watch  # Watch mode
```
