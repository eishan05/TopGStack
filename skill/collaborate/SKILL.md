---
name: topg-collaborate
description: Use when you want to consult the other AI model mid-task — for code review, design input, validation, or any collaboration where a second perspective adds value. Also use when user says "collaborate", "review with codex", "review with claude", "get codex to review", "cross-model review". Do not use for full adversarial debates (use /debate) or straightforward tasks.
---

# topg-collaborate — Session-Based Cross-Model Collaboration

Open a collaboration session with another AI model. Exchange messages over time. Close when done. You control the flow — the collaborator responds to your requests.

## When to Use

- Mid-task code review (have the other model review what you just implemented)
- Design consultation (get a second opinion before committing to an approach)
- Validation (verify assumptions, test coverage, edge cases)
- Any point where a different model's perspective would improve your work

## When NOT to Use

- Full adversarial debate — use `/debate` instead
- Simple, unambiguous tasks
- User hasn't indicated they want multi-model collaboration

## Prerequisites

Same as `/debate`. Run `which topg`. If not found, auto-install from https://github.com/eishan05/topgstack.

`OPENAI_API_KEY` is required when collaborating with Codex.

## Agent Detection

- If you are **Claude Code** → use `--with codex`
- If you are **Codex** → use `--with claude`

Always select the *other* model as collaborator.

## Core Lifecycle

### Start a Session

```bash
topg collaborate start --with codex "<your request>" --output json --yolo --cwd "$(pwd)"
```

Returns JSON:
```json
{
  "sessionId": "abc123",
  "agent": "codex",
  "response": "I found 3 issues..."
}
```

### Send Follow-Up Messages

```bash
topg collaborate send --last "<your message>" --output json
```

Or with explicit session ID:
```bash
topg collaborate send abc123 "<your message>" --output json
```

### Close the Session

```bash
topg collaborate end --last
```

### List Sessions

```bash
topg collaborate list --active --output json
```

## Critical Evaluation

- Treat the collaborator as a **colleague, not an authority**
- If you disagree with a finding, push back in the next `send`
- Don't implement suggestions you believe are wrong
- Either AI can be wrong — frame disagreements as discussions

## Collaboration Patterns

See [patterns.md](patterns.md) for detailed recipes:

1. **Code Review Loop** — implement → review → fix → re-review → converge
2. **Design Consultation** — describe approach → get feedback → refine
3. **Validation** — present assumptions → get verification → address concerns

## Error Handling

| Error | Action |
|-------|--------|
| topg not found | Auto-install |
| `OPENAI_API_KEY` missing | Warn user, abort |
| Timeout | Report, suggest shorter prompt or increased `--timeout` |
| Session not found | List sessions with `topg collaborate list` |
| Session already closed | Start a new session |
