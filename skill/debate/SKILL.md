---
name: topg-debate
description: Use when facing architectural decisions, choosing between competing approaches, debugging subtle issues after initial attempts fail, reviewing security-sensitive code, designing public APIs, or when a second opinion from a different AI model would add value. Also use when user says "debate", "topg", "get a second opinion", or "multi-agent". Do not use for straightforward tasks with clear answers.
---

# topg-debate — Multi-Agent Debate Orchestration

Dispatch structured debates between Claude and Codex via the `topg` CLI. The debate result informs your reasoning — it does not replace your judgment.

## When to Use

- Architecture decisions with 2+ viable approaches
- Debugging that has failed after initial attempts
- Security-sensitive code review
- Public API surface design
- Trade-off-heavy decisions where both sides have merit
- User explicitly asks: "debate this", "topg", "get a second opinion", "multi-agent"

## When NOT to Use

- Straightforward tasks with clear answers
- Simple syntax/API questions
- Tasks where only one reasonable approach exists
- Mid-task consultation (use `/collaborate` instead)

## Prerequisites

### Check

Run `which topg`. If not found, auto-install:

### Auto-Install

```bash
git clone https://github.com/eishan05/topgstack.git /tmp/topgstack-install
cd /tmp/topgstack-install && npm install && npm run build && npm install -g .
topg --help  # verify
rm -rf /tmp/topgstack-install
```

### Environment

- `OPENAI_API_KEY` — **required** for Codex agent. If missing, warn the user and abort.
- `ANTHROPIC_API_KEY` — **not required** when invoked from within Claude Code.
- `claude` CLI — must be on PATH (always true inside Claude Code).

## Core Workflow

### 1. Frame the Question

Extract or formulate the debate prompt from your current conversation context:

- State the specific decision or question
- Include relevant code snippets, file paths, and constraints
- Reference prior decisions that constrain the solution space
- **Present the framed question to the user for approval** before dispatching (use `AskUserQuestion`)

### 2. Dispatch the Debate

```bash
topg debate "<framed prompt>" \
  --output json \
  --yolo \
  --cwd "$(pwd)" \
  --guardrail 3 \
  --timeout 300
```

Tell the user: "Debate in progress between Claude and Codex..."

### 3. Parse the Result

The JSON output contains:

```json
{
  "type": "consensus | escalation",
  "sessionId": "abc123def456",
  "rounds": 3,
  "summary": "## Consensus\n...",
  "messages": ["..."],
  "artifacts": ["..."]
}
```

Key fields:
- **`summary`** — the primary output to present and reason from
- **`type`** — consensus vs. escalation determines next step
- **`sessionId`** — needed for resume
- **`artifacts`** — suggested code/files

### 4. Fold Into Reasoning

**If consensus:** Present the agreed approach. Incorporate as a strong signal.

**If escalation:** Present the disagreement report. Use `AskUserQuestion` with options:
1. Side with Claude's recommendation
2. Side with Codex's recommendation
3. Provide guidance to resume the debate

If the user provides guidance: `topg debate --resume <sessionId> "<guidance>" --output json --yolo`

## Quick Reference

| Scenario | Command |
|----------|---------|
| Standard debate | `topg debate "<prompt>" --output json --yolo --guardrail 3 --timeout 300` |
| Deep/complex debate | `topg debate "<prompt>" --output json --yolo --guardrail 8 --timeout 900` |
| Codex leads | Add `--start-with codex` |
| Read-only reasoning | Add `--codex-sandbox read-only` |
| Resume after escalation | `topg debate --resume <sessionId> "<guidance>" --output json --yolo` |

## Error Handling

| Error | Action |
|-------|--------|
| topg not found | Auto-install (see Prerequisites) |
| `OPENAI_API_KEY` missing | Warn user, abort |
| Timeout | Report, offer resume with tighter `--timeout` or fewer rounds |
| JSON parse failure | Show raw output to user, abort structured processing |
| Crash mid-debate | Session auto-paused, offer `--resume` |
