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
| Dashboard | Express + WebSocket | Real-time debate streaming |
| Testing | Vitest | Fast, native ESM support |

---

## Directory Structure

```
src/
├── index.ts              # CLI entry point, Commander setup
├── orchestrator.ts       # The arena — turn-based debate loop
├── convergence.ts        # Detects when the fight is over
├── adapters/
│   ├── agent-adapter.ts  # Base adapter interface
│   ├── claude-adapter.ts # Claude CLI integration
│   └── codex-adapter.ts  # Codex SDK integration
├── session.ts            # Session persistence manager
├── prompts.ts            # System prompts for each role
├── formatter.ts          # Consensus/escalation report formatting
├── types.ts              # Core type definitions
├── utils.ts              # Utility functions
├── server.ts             # Dashboard HTTP + WebSocket server
├── repl.ts               # Interactive REPL mode
└── web/public/           # Dashboard frontend
    ├── index.html
    ├── styles.css
    └── app.js
```

---

## Core Components

### Orchestrator (`orchestrator.ts`)

The brain. Manages the turn-based debate loop:

1. Assigns roles (initiator / reviewer) based on `--start-with`
2. Sends the prompt to the initiator for the opening proposal
3. Passes each response to the opposing agent for critique
4. Checks for convergence after every turn
5. Escalates if `--guardrail` rounds are exceeded without consensus

### Adapter Pattern (`adapters/`)

Each AI model gets an adapter that implements the same interface. This keeps the orchestrator model-agnostic.

- **`claude-adapter.ts`** — Spawns the `claude` CLI as a child process, communicates via stdin/stdout. Supports `--dangerously-skip-permissions` in `--yolo` mode.
- **`codex-adapter.ts`** — Uses the `@openai/codex-sdk`. Configurable sandbox mode, web search, network access, reasoning effort.

### Convergence Detection (`convergence.ts`)

Determines when the debate is over. Looks for:

- Explicit agreement phrases and structured `[consensus]` tags
- Diff stability — when proposed solutions stop materially changing
- Convergence signals in agent responses (`agree` / `disagree` / `partial` / `defer`)

### Session Persistence (`session.ts`)

Every debate is saved to `~/.topg/sessions/<session-id>/`:

```
├── meta.json           # Config, status, timestamps
├── transcript.jsonl    # Full debate transcript (append-only)
├── artifacts/          # Code files produced during debate
└── summary.md          # Final verdict
```

Sessions can be resumed with `--resume <id>` and managed with `topg delete` / `topg clear`.

### Report Formatting (`formatter.ts`)

Produces the final output in two modes:
- **Text** — Human-readable consensus or escalation report
- **JSON** — Machine-parseable for piping into other tools

### Web Dashboard (`server.ts` + `web/public/`)

Express server with WebSocket for real-time streaming. Shows:
- Live debate turns as they happen
- Agent roles and turn numbers
- Convergence status
- Final report

---

## Message Flow

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

Each message carries:
- `role` — initiator or reviewer
- `agent` — claude or codex
- `turn` — sequential number
- `convergenceSignal` — agree / disagree / partial / defer
- `artifacts` — any code files produced
- `toolActivities` — commands run, files changed, web searches

---

## Running Tests

```bash
npm test            # Single run
npm run test:watch  # Watch mode
```
