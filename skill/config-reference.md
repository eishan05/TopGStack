# Configuration Reference

Full topg CLI flag reference with scenario-based recommendations. The skill defaults are tuned for agent-mode invocation (tighter timeouts, no dashboard, YOLO on).

## Flag Reference

| Flag | Type | Skill Default | CLI Default | Description |
|------|------|---------------|-------------|-------------|
| `--yolo` | boolean | **ON** | off | Skip all permission checks. That's the way. |
| `--output` | `text\|json` | `json` | `text` | Output format. Always use `json` for agent consumption. |
| `--start-with` | `claude\|codex` | `claude` | `claude` | Which agent goes first (initiator). |
| `--guardrail` | number | `3` | `5` | Max rounds before escalation. |
| `--timeout` | seconds | `300` | `900` | Per-agent turn timeout. |
| `--cwd` | path | `$(pwd)` | `process.cwd()` | Working directory for agents. |
| `--no-dashboard` | boolean | **ON** | off | Suppress web dashboard auto-start. |
| `--transcript` | path | — | — | Save full transcript to file. |
| `--codex-sandbox` | mode | `workspace-write` | `workspace-write` | `read-only`, `workspace-write`, `danger-full-access` |
| `--codex-web-search` | mode | `live` | `live` | `disabled`, `cached`, `live` |
| `--codex-network` | boolean | `true` | `true` | Enable/disable Codex network access. |
| `--codex-model` | string | — | — | Override Codex model. |
| `--codex-reasoning` | effort | — | — | `minimal`, `low`, `medium`, `high`, `xhigh` |

## Scenario Quick-Pick

| Scenario | Flags to Add/Override |
|----------|----------------------|
| **Quick opinion** (simple trade-off) | `--guardrail 2 --timeout 120` |
| **Standard debate** (arch decision) | Use skill defaults |
| **Deep deliberation** (complex system design) | `--guardrail 8 --timeout 900` |
| **Codex-led** (frontend, OpenAI ecosystem) | `--start-with codex` |
| **Reasoning-only** (no file changes) | `--codex-sandbox read-only` |
| **Full access investigation** | `--codex-sandbox danger-full-access` |
| **Maximum reasoning** | `--codex-reasoning xhigh` |
| **Save for later** | `--transcript /tmp/debate-<topic>.json` |

## YOLO Philosophy

`--yolo` is ON by default because:

1. The invoking Claude Code session already has the user's trust and permission context
2. Debate agents need to read files, run commands, and explore the codebase freely to give informed opinions
3. Permission prompts during a debate break the autonomous flow and add friction without safety benefit (the debate result is advisory, not destructive)

**When to turn off YOLO:** If the debate topic involves agents making actual changes to production systems (rare — debates are usually deliberative). In that case, use `--codex-sandbox read-only` instead of disabling YOLO entirely.
