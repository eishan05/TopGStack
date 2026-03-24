# Changelog

All notable changes to TOPG. Format based on [Keep a Changelog](https://keepachangelog.com/).

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
