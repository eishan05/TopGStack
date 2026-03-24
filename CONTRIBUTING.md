# Contributing to TOPG

You want to make TOPG better? That's Top G behavior. Let's go.

---

## Setup

```bash
git clone https://github.com/eishan05/topgstack.git
cd topgstack
npm install
```

You need Node.js 22+ and both API keys:

```bash
export ANTHROPIC_API_KEY="your-key"
export OPENAI_API_KEY="your-key"
```

Already on Claude Pro/Max or Codex subscription? You're covered.

---

## Development

```bash
npm run dev             # Run from source (tsx)
npm run build           # Compile TypeScript to dist/
npm test                # Run tests (Vitest)
npm run test:watch      # Watch mode
```

The entry point is `src/index.ts`. Built output goes to `dist/`.

---

## Project Structure

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical breakdown. The short version:

- `src/orchestrator.ts` — The debate engine
- `src/adapters/` — Claude and Codex integrations
- `src/convergence.ts` — Consensus detection
- `src/session.ts` — Persistence layer
- `src/server.ts` + `src/web/` — Dashboard
- `skill/` — Claude Code skill integration
- `tests/` — Test files

---

## Making Changes

1. **Fork and branch** — `git checkout -b your-feature`
2. **Write tests** — If it's not tested, it doesn't exist
3. **Keep the voice** — TOPG has a personality. Read the README and ETHOS.md. Match the energy.
4. **One thing per PR** — Don't bundle unrelated changes
5. **Run tests before pushing** — `npm test`

---

## What We Need

- **New adapters** — Gemini, Llama, Mistral, whatever's next. The adapter interface is clean — see `src/adapters/agent-adapter.ts`.
- **Better convergence detection** — Smarter consensus signals, semantic diff comparison
- **Dashboard improvements** — The web UI is functional but could be sharper
- **Skill improvements** — Make the Claude Code integration smoother
- **Bug fixes** — If you find one, crush it

---

## Code Style

- TypeScript strict mode, no `any` unless absolutely necessary
- ES modules (`import` / `export`, not `require`)
- Descriptive names, minimal comments — the code should speak for itself
- Keep it simple. If you're writing an abstraction for one use case, don't.

---

## Submitting

Open a PR against `main`. Describe what you changed and why. If it's a new feature, show it working. If it's a bug fix, show the bug and the fix.

Don't overthink it. Ship it.
