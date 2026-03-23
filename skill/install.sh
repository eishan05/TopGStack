#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$HOME/.claude/skills/topg-debate"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing topg-debate skill to $SKILL_DIR..."
mkdir -p "$SKILL_DIR"
cp "$SCRIPT_DIR/SKILL.md" "$SKILL_DIR/"
cp "$SCRIPT_DIR/session-management.md" "$SKILL_DIR/"
cp "$SCRIPT_DIR/config-reference.md" "$SKILL_DIR/"
echo "Done. The topg-debate skill is now available in Claude Code."
