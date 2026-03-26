# Collaboration Patterns

Recipes for common collaboration workflows using `topg collaborate`.

## Pattern 1: Code Review Loop

The calling agent implements, the collaborator reviews. Iterate until clean or 3 iterations.

### Flow

1. **Start review session:**
```bash
topg collaborate start --with codex "Review the code changes in this directory for bugs, correctness issues, edge cases, and code quality problems. List each finding as a numbered item with:
- The file path and line number(s)
- Severity: [BUG] [POTENTIAL ISSUE] [STYLE] [SUGGESTION]
- A clear description of the problem
- A recommended fix

Focus on substantive issues. Be thorough." --output json --yolo --cwd "$(pwd)"
```

2. **Parse findings** from the response. Present to user as summary.

3. **Evaluate each finding critically.** If you believe a finding is incorrect:
   - Note your disagreement
   - Skip that fix
   - Explain why in the next send

4. **Implement valid fixes** using your normal editing tools.

5. **Send re-review request:**
```bash
topg collaborate send --last "I've addressed your findings:
1. [BUG] path:42 — Fixed: <what you did>
2. [POTENTIAL ISSUE] path:15 — Fixed: <what you did>
3. [STYLE] path:88 — Skipped: I disagree because <reason>

Please verify fixes, reconsider findings I pushed back on, and report any NEW issues." --output json
```

6. **Repeat** until clean or 3 iterations.

7. **End session:** `topg collaborate end --last`

### When to Stop

- Collaborator reports no issues → done
- 3 iterations reached → present remaining issues to user, let them decide
- Only style nits remain → done (diminishing returns)

## Pattern 2: Design Consultation

Get input on an approach before implementing.

### Flow

1. **Start consultation:**
```bash
topg collaborate start --with codex "I'm about to implement <feature>. Here's my approach:

<description of approach, key decisions, constraints>

Questions:
1. What am I missing?
2. What would you do differently?
3. Are there edge cases I haven't considered?" --output json --yolo --cwd "$(pwd)"
```

2. **Evaluate response.** Incorporate good suggestions, push back on bad ones.

3. **Optionally follow up:**
```bash
topg collaborate send --last "Good point on <X>. I'll adjust my approach to <Y>. But I disagree on <Z> because <reason>. What about <new question>?" --output json
```

4. **End when satisfied:** `topg collaborate end --last`

### Tips

- Be specific about your constraints — the collaborator can't read your mind
- If the collaborator suggests a completely different architecture, evaluate whether it's genuinely better or just different
- One round is often enough for design consultation

## Pattern 3: Validation

Have the collaborator verify assumptions or test coverage.

### Flow

1. **Start validation:**
```bash
topg collaborate start --with codex "I've implemented <feature>. Please verify these assumptions:

1. <assumption 1>
2. <assumption 2>
3. <assumption 3>

Also check for edge cases I might have missed. The implementation is in <file paths>." --output json --yolo --cwd "$(pwd)"
```

2. **Review response.** Address any valid concerns.

3. **Optionally deep-dive:**
```bash
topg collaborate send --last "You flagged <concern>. Here's how I handle it: <explanation>. Is that sufficient, or do you see a gap?" --output json
```

4. **End session:** `topg collaborate end --last`

### When Validation Matters Most

- Before merging security-sensitive code
- When implementing unfamiliar algorithms
- When test coverage feels thin but you're not sure what to add
- Before shipping a public API
