# Session Management

Deep reference for managing topg debate sessions. Read this when a debate escalates or the user wants to manage past sessions.

## Resume After Escalation

When a debate escalates (agents couldn't converge), you can resume with user guidance:

```bash
topg --resume <sessionId> "<user guidance>" --output json --yolo --no-dashboard
```

- `<user guidance>` is the positional `[prompt]` argument, not a flag value
- `--resume <sessionId>` loads the paused session
- This always runs in one-shot mode (not REPL)
- Parse the result identically to the initial dispatch

### Example Resume Flow

1. Initial debate escalates — you receive `sessionId: "abc123def456"`
2. User says: "Focus on the TypeScript approach, ignore Go"
3. Run: `topg --resume abc123def456 "Focus on the TypeScript approach, ignore Go" --output json --yolo --no-dashboard`
4. Parse new result — may reach consensus this time, or escalate again

## Listing Sessions

There is no `topg list` CLI command. To list sessions, read the filesystem directly:

```bash
# List all session directories
ls ~/.topg/sessions/

# Read a specific session's metadata
cat ~/.topg/sessions/<sessionId>/meta.json
```

The `meta.json` file contains:
```json
{
  "version": 1,
  "sessionId": "abc123def456",
  "status": "active | paused | completed | escalated",
  "prompt": "Original user prompt",
  "config": { "startWith": "claude", "guardrailRounds": 3, "timeoutMs": 300000 },
  "createdAt": "2026-03-23T...",
  "updatedAt": "2026-03-23T..."
}
```

Note: `config` contains the full `OrchestratorConfig` snapshot (including codex settings). See `src/types.ts` for the complete shape.

## Cleanup

```bash
# Delete a specific session
topg delete <sessionId>

# Bulk cleanup: completed sessions older than 7 days
topg clear --completed --older-than 7d

# Bulk cleanup: all sessions older than 30 days
topg clear --older-than 30d
```

## Multi-Debate Context

When working through complex problems that spawn multiple debates:

- **Track sessionIds in conversation context.** The skill has no file-based persistence between invocations — it relies on the LLM's context window.
- **Reference prior outcomes** when framing new questions: "In a previous debate (session abc123), we agreed on PostgreSQL for caching. Now we need to decide on the cache invalidation strategy."
- **Save transcripts** for workflows spanning multiple sessions: add `--transcript /tmp/debate-<topic>.json` to the dispatch command.

### Multi-Debate Example

1. Debate 1: "Redis vs PostgreSQL for caching?" → Consensus: PostgreSQL (session: abc123)
2. Debate 2: "Cache invalidation strategy for our PostgreSQL caching layer? Prior debate (abc123) chose PostgreSQL because team has no Redis ops experience." → Consensus: TTL-based with event-driven invalidation for critical paths (session: def456)
3. Debate 3: "Should we add a cache warming step to the deploy pipeline? Context from debates abc123 and def456: using PostgreSQL caching with TTL + event-driven invalidation." → ...
