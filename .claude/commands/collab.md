---
name: collab
description: Start an inter-agent collaboration between Claude Code and Codex
---

Run the topg CLI to start an autonomous collaboration session between Claude Code and Codex.

Usage: /collab <prompt>

Execute the following command with the user's prompt:

```bash
topg "$ARGUMENTS" --cwd "$(pwd)" --output text
```

Present the output to the user. If the result is an escalation (disagreement), help the user understand the disagreement and ask which direction they'd like to go.
