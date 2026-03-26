# Changelog

All notable changes to TOPG. Format based on [Keep a Changelog](https://keepachangelog.com/).

---

## [2.0.0] — 2026-03-26

The restructure. Two tools enter. Maximum leverage achieved.

### Added
- `topg collaborate` — session-based cross-model collaboration (start/send/end/list)
- Explicit `--with <claude|codex>` agent selection for collaboration
- `--session <id>` and `--last` flags for targeting collaboration sessions
- `--closed` flag for `session clear` to clean up closed collaboration sessions
- `src/collaborate/` module — manager, prompts, types
- `src/core/` shared layer — types, adapters, session manager, convergence tag parser
- `/collaborate` skill with code review loop, design consultation, and validation patterns
- `/debate` skill (updated from old `/topg-debate`)
- `topg session` subcommand for managing both debate and collaborate sessions
- Session type field (`"debate"` | `"collaborate"`) with backwards compatibility for legacy sessions
- Agent validation (`--with`, `--start-with` must be "claude" or "codex")
- Mutual exclusivity enforcement for `--session` and `--last`

### Changed
- **BREAKING:** `topg "<prompt>"` is now `topg debate "<prompt>"`
- **BREAKING:** `topg delete/clear` is now `topg session delete/clear`
- Codebase restructured into `src/core/`, `src/debate/`, `src/collaborate/`
- Session manager generalized to support both session types
- `--last` resolves to the most recent *active* session (not any session)
- Version bumped to 2.0.0

### Removed
- Web dashboard (`src/server.ts`, `src/web/`)
- REPL mode (`src/repl.ts`)
- Eval framework (`src/evals/`)
- `--no-dashboard` flag (no dashboard to disable)
- `topg serve` command
- Implicit REPL when running bare `topg`

---

## [1.0.0] — 2026-03-23

The first release. Two models enter. One answer leaves.

### Added
- Turn-based debate orchestration between Claude and Codex
- Claude adapter via CLI stdin, Codex adapter via official SDK
- Convergence detection — agreement phrases, structured tags, diff stability
- Session persistence to `~/.topg/sessions/` with resume support
- Interactive REPL mode with live web dashboard (Express + WebSocket)
- One-shot mode for quick debates
- `--yolo` flag — skip all permission checks, full send
- `--guardrail` rounds before escalation
- `--start-with` to pick who throws the first punch
- Session management commands: `topg delete`, `topg clear`
- `topg serve` for standalone dashboard
- Claude Code skill integration (`/topg-debate`)
- JSON and text output formats
- Claim tracking with `[claim-N]` sections
