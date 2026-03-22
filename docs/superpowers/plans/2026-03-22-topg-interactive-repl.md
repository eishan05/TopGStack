# topg Interactive REPL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform topg from a one-shot CLI into a persistent interactive REPL with cumulative context, condensed spinner output, and slash commands, while preserving backward compatibility.

**Architecture:** Add a new `src/repl.ts` module containing the REPL loop, spinner, and slash command dispatch. Modify existing files minimally: add `user-prompt` message type, filter it in convergence/formatter, add `AbortSignal` to adapters, add `runWithHistory()` to orchestrator, and add `listSessions()`/`updatePrompt()` to SessionManager. Entry point routes to REPL when no prompt is given.

**Tech Stack:** Node.js readline, chalk (terminal colors), vitest (testing)

**Spec:** `docs/superpowers/specs/2026-03-22-topg-interactive-repl-design.md`

---

### Task 1: Add `chalk` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install chalk**

```bash
npm install chalk
```

- [ ] **Step 2: Verify installation**

```bash
node -e "import('chalk').then(c => console.log(c.default.green('ok')))"
```

Expected: prints green "ok"

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add chalk dependency for terminal colors"
```

---

### Task 2: Add `"user-prompt"` to `MessageType` union

**Files:**
- Modify: `src/types.ts`
- Test: `tests/types.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/types.test.ts`, add a test that creates a `Message` with `type: "user-prompt"`:

```typescript
it("should allow user-prompt message type", () => {
  const msg: Message = {
    role: "initiator",
    agent: "claude",
    turn: 0,
    type: "user-prompt",
    content: "[USER PROMPT #1]: test",
    timestamp: new Date().toISOString(),
  };
  expect(msg.type).toBe("user-prompt");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/types.test.ts
```

Expected: TypeScript compilation error — `"user-prompt"` is not assignable to `MessageType`.

- [ ] **Step 3: Update the type**

In `src/types.ts` line 3, change:

```typescript
export type MessageType = "code" | "review" | "debate" | "consensus" | "deadlock" | "user-prompt";
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/types.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/types.test.ts
git commit -m "feat: add user-prompt to MessageType union"
```

---

### Task 3: Filter `user-prompt` messages in convergence detection

**Files:**
- Modify: `src/convergence.ts`
- Test: `tests/convergence.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/convergence.test.ts`:

```typescript
it("should ignore user-prompt messages in convergence detection", () => {
  const messages: Message[] = [
    makeMsg("claude", "Here is my proposal.\n[CONVERGENCE: agree]", "agree"),
    makeMsg("codex", "I agree.\n[CONVERGENCE: agree]", "agree"),
    {
      role: "initiator",
      agent: "claude",
      turn: 3,
      type: "user-prompt",
      content: "[USER PROMPT #2]: new question",
      timestamp: new Date().toISOString(),
    },
  ];
  // The user-prompt should NOT overwrite claude's "agree" signal
  expect(detectConvergence(messages)).toBe(true);
});

it("should ignore user-prompt messages in diff stability check", () => {
  const messages: Message[] = [
    makeMsg("claude", "Use approach A with pattern X"),
    makeMsg("codex", "I agree. Use approach A with pattern X"),
    makeMsg("claude", "Confirmed. Use approach A with pattern X"),
    makeMsg("codex", "Use approach A with pattern X"),
    {
      role: "initiator",
      agent: "claude",
      turn: 5,
      type: "user-prompt",
      content: "[USER PROMPT #2]: something else entirely",
      timestamp: new Date().toISOString(),
    },
  ];
  // user-prompt should be filtered out, so the last 4 agent messages still show stability
  expect(checkDiffStability(messages)).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/convergence.test.ts
```

Expected: first test fails (user-prompt overwrites claude's agree signal), second test fails (user-prompt disrupts diff stability window).

- [ ] **Step 3: Add filtering to convergence functions**

In `src/convergence.ts`, modify `detectConvergence`:

```typescript
export function detectConvergence(messages: Message[]): boolean {
  const agentMessages = messages.filter((m) => m.type !== "user-prompt");
  if (agentMessages.length < 2) return false;
  const lastByAgent = new Map<string, Message>();
  for (const msg of agentMessages) {
    lastByAgent.set(msg.agent, msg);
  }
  if (lastByAgent.size < 2) return false;
  const signals = [...lastByAgent.values()].map(getSignalForMessage);
  return signals.every((s) => s === "agree");
}
```

Modify `checkDiffStability`:

```typescript
export function checkDiffStability(messages: Message[]): boolean {
  const agentMessages = messages.filter((m) => m.type !== "user-prompt");
  if (agentMessages.length < 4) return false;
  const recent = agentMessages.slice(-4);
  // ... rest unchanged
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/convergence.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/convergence.ts tests/convergence.test.ts
git commit -m "fix: filter user-prompt messages from convergence detection"
```

---

### Task 4: Filter `user-prompt` messages in formatter

**Files:**
- Modify: `src/formatter.ts`
- Test: `tests/formatter.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/formatter.test.ts`:

```typescript
it("should ignore user-prompt messages in getLastMessagePerAgent", () => {
  const messages: Message[] = [
    {
      role: "initiator",
      agent: "claude",
      turn: 1,
      type: "code",
      content: "Use React with TypeScript for the frontend.",
      timestamp: new Date().toISOString(),
    },
    {
      role: "reviewer",
      agent: "codex",
      turn: 2,
      type: "review",
      content: "I agree. React + TypeScript is the right choice.\n[CONVERGENCE: agree]",
      convergenceSignal: "agree" as const,
      timestamp: new Date().toISOString(),
    },
    {
      role: "initiator",
      agent: "claude",
      turn: 3,
      type: "user-prompt" as const,
      content: "[USER PROMPT #2]: now discuss the database",
      timestamp: new Date().toISOString(),
    },
  ];

  const output = formatConsensus(messages, 2);
  // The consensus should reference the codex review, not the user-prompt
  expect(output).toContain("React");
  expect(output).not.toContain("USER PROMPT");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/formatter.test.ts
```

Expected: FAIL — the user-prompt message becomes Claude's "last message" and appears in output.

- [ ] **Step 3: Add filtering to `getLastMessagePerAgent` and `formatConsensus`**

In `src/formatter.ts`, modify `getLastMessagePerAgent`:

```typescript
function getLastMessagePerAgent(messages: Message[]): Message[] {
  const byAgent = new Map<string, Message>();
  for (const msg of messages) {
    if (msg.type === "user-prompt") continue;
    byAgent.set(msg.agent, msg);
  }
  return [...byAgent.values()];
}
```

Also modify `formatConsensus` to filter user-prompt messages when selecting the final message. Change line 10-11 from:

```typescript
const finalMsg = messages[messages.length - 1];
```

to:

```typescript
const agentMessages = messages.filter((m) => m.type !== "user-prompt");
const finalMsg = agentMessages[agentMessages.length - 1];
```

This ensures the "Agreed Approach" section shows the last agent message, not a synthetic user prompt.

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/formatter.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/formatter.ts tests/formatter.test.ts
git commit -m "fix: filter user-prompt messages from formatter output"
```

---

### Task 5: Add `AbortSignal` support to adapters

**Files:**
- Modify: `src/adapters/agent-adapter.ts`
- Modify: `src/adapters/claude-adapter.ts`
- Modify: `src/adapters/codex-adapter.ts`
- Test: `tests/adapters/claude-adapter.test.ts`
- Test: `tests/adapters/codex-adapter.test.ts`

- [ ] **Step 1: Write the failing test for ClaudeAdapter abort**

Add this test **inside the existing `describe("ClaudeAdapter", ...)` block** in `tests/adapters/claude-adapter.test.ts` (the `ctx` variable is already defined there):

```typescript
it("should abort when signal is triggered", async () => {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as any;
  proc.stderr = new EventEmitter() as any;
  proc.stdin = null as any;
  proc.kill = vi.fn();

  // Process never completes on its own
  vi.mocked(spawn).mockReturnValue(proc);

  const controller = new AbortController();
  const adapter = new ClaudeAdapter();
  const promise = adapter.send("test prompt", ctx, controller.signal);

  // Abort after a tick
  setTimeout(() => controller.abort(), 50);

  await expect(promise).rejects.toThrow("aborted");
  expect(proc.kill).toHaveBeenCalledWith("SIGTERM");
});
```

- [ ] **Step 1b: Write the failing test for CodexAdapter abort**

Add this test **inside the existing `describe("CodexAdapter", ...)` block** in `tests/adapters/codex-adapter.test.ts`. First, update the mock at the top of the file to make the thread's `run` return a promise that never resolves (for the abort test):

```typescript
it("should abort when signal is triggered", async () => {
  // Override the mock to create a thread whose run never resolves
  const { Codex } = await import("@openai/codex-sdk");
  const mockInstance = new Codex();
  const thread = await mockInstance.startThread({ workingDirectory: "/tmp" });
  // Replace run with a never-resolving promise for this test
  (thread as any).run = vi.fn(() => new Promise(() => {}));

  const controller = new AbortController();
  const adapter = new CodexAdapter();
  // We need to test the adapter's abort behavior directly
  // Since the mock is module-level, override the adapter's send behavior:
  const promise = adapter.send("test prompt", ctx, controller.signal);

  setTimeout(() => controller.abort(), 50);

  await expect(promise).rejects.toThrow("aborted");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/adapters/claude-adapter.test.ts
```

Expected: FAIL — `send()` doesn't accept a third argument.

- [ ] **Step 3: Update `AgentAdapter` interface**

In `src/adapters/agent-adapter.ts`:

```typescript
import type { AgentName, AgentResponse, ConversationContext } from "../types.js";

export interface AgentAdapter {
  name: AgentName;
  send(prompt: string, context: ConversationContext, signal?: AbortSignal): Promise<AgentResponse>;
}
```

- [ ] **Step 4: Update `ClaudeAdapter` to support abort**

In `src/adapters/claude-adapter.ts`, modify the `send` method signature and add abort handling:

```typescript
async send(prompt: string, context: ConversationContext, signal?: AbortSignal): Promise<AgentResponse> {
  const fullPrompt = context.systemPrompt + "\n\n" + prompt;

  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["-p", fullPrompt, "--output-format", "json"], {
      cwd: context.workingDirectory,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Claude adapter timed out after ${this.timeoutMs}ms`));
    }, this.timeoutMs);

    if (signal) {
      if (signal.aborted) {
        proc.kill("SIGTERM");
        clearTimeout(timeout);
        reject(new Error("aborted"));
        return;
      }
      signal.addEventListener("abort", () => {
        proc.kill("SIGTERM");
        clearTimeout(timeout);
        reject(new Error("aborted"));
      }, { once: true });
    }

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (signal?.aborted) return; // already rejected
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const content = parsed.result ?? parsed.content ?? stdout;
        const convergenceSignal = parseConvergenceTag(content);
        resolve({
          content,
          convergenceSignal: convergenceSignal ?? undefined,
        });
      } catch {
        const convergenceSignal = parseConvergenceTag(stdout);
        resolve({
          content: stdout,
          convergenceSignal: convergenceSignal ?? undefined,
        });
      }
    });
  });
}
```

- [ ] **Step 5: Update `CodexAdapter` to support abort**

In `src/adapters/codex-adapter.ts`, modify `send`:

```typescript
async send(prompt: string, context: ConversationContext, signal?: AbortSignal): Promise<AgentResponse> {
  const fullPrompt = context.systemPrompt + "\n\n" + prompt;

  const thread = await this.client.startThread({
    workingDirectory: context.workingDirectory,
  });

  const result = await Promise.race([
    thread.run(fullPrompt),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Codex adapter timed out after ${this.timeoutMs}ms`)), this.timeoutMs)
    ),
    ...(signal
      ? [new Promise<never>((_, reject) => {
          if (signal.aborted) reject(new Error("aborted"));
          signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        })]
      : []),
  ]);

  const content = result.finalResponse ?? String(result);
  const convergenceSignal = parseConvergenceTag(content);

  return {
    content,
    convergenceSignal: convergenceSignal ?? undefined,
  };
}
```

- [ ] **Step 6: Run all adapter tests**

```bash
npx vitest run tests/adapters/
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/adapters/agent-adapter.ts src/adapters/claude-adapter.ts src/adapters/codex-adapter.ts tests/adapters/
git commit -m "feat: add AbortSignal support to agent adapters"
```

---

### Task 6: Add `listSessions()` and `updatePrompt()` to SessionManager

**Files:**
- Modify: `src/session.ts`
- Test: `tests/session.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/session.test.ts`:

```typescript
it("should list all sessions", () => {
  manager.create("First prompt", defaultConfig);
  manager.create("Second prompt", defaultConfig);

  const sessions = manager.listSessions();
  expect(sessions).toHaveLength(2);
  // Both sessions should be present
  const prompts = sessions.map((s) => s.prompt);
  expect(prompts).toContain("First prompt");
  expect(prompts).toContain("Second prompt");
});

it("should return empty array when no sessions exist", () => {
  const sessions = manager.listSessions();
  expect(sessions).toHaveLength(0);
});

it("should update the prompt in session metadata", () => {
  const session = manager.create("(interactive session)", defaultConfig);
  manager.updatePrompt(session.sessionId, "Should we use React?");
  const loaded = manager.load(session.sessionId);
  expect(loaded.meta.prompt).toBe("Should we use React?");
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/session.test.ts
```

Expected: FAIL — `listSessions` and `updatePrompt` are not functions.

- [ ] **Step 3: Implement `listSessions()` and `updatePrompt()`**

Add to `src/session.ts`:

```typescript
listSessions(): SessionMeta[] {
  if (!fs.existsSync(this.baseDir)) return [];
  const entries = fs.readdirSync(this.baseDir, { withFileTypes: true });
  const sessions: SessionMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const metaPath = path.join(this.baseDir, entry.name, "meta.json");
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta: SessionMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      sessions.push(meta);
    } catch {
      // skip corrupted sessions
    }
  }
  return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

updatePrompt(sessionId: string, prompt: string): void {
  const metaPath = path.join(this.sessionDir(sessionId), "meta.json");
  const meta: SessionMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  meta.prompt = prompt;
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/session.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/session.ts tests/session.test.ts
git commit -m "feat: add listSessions and updatePrompt to SessionManager"
```

---

### Task 7: Add `runWithHistory()` and `AbortSignal` to `continueWithGuidance()` on Orchestrator

**Files:**
- Modify: `src/orchestrator.ts`
- Test: `tests/orchestrator.test.ts`

- [ ] **Step 1: Read the existing orchestrator test for patterns**

Read `tests/orchestrator.test.ts` to understand the mock adapter pattern used.

- [ ] **Step 2: Write the failing test**

Add `Message` to the imports at the top of `tests/orchestrator.test.ts`:

```typescript
import type { AgentResponse, ConversationContext, OrchestratorConfig, Message } from "../src/types.js";
```

Then add a new `describe` block after the existing tests (inside or after the main `describe("Orchestrator", ...)`):

```typescript
describe("runWithHistory", () => {
  it("should start with existing messages and reach consensus", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "topg-hist-"));
    const session = new SessionManager(tmpDir);

    const existingMessages: Message[] = [
      {
        role: "initiator",
        agent: "claude",
        turn: 1,
        type: "code",
        content: "Previous round response.",
        timestamp: new Date().toISOString(),
      },
    ];

    const claude = createMockAdapter("claude", [
      { content: "Building on prior context.\n[CONVERGENCE: agree]", convergenceSignal: "agree" },
    ]);
    const codex = createMockAdapter("codex", [
      { content: "I agree with this approach.\n[CONVERGENCE: agree]", convergenceSignal: "agree" },
    ]);

    const config = { ...defaultConfig, guardrailRounds: 8 };
    const orch = new Orchestrator(claude, codex, session, config);

    // Create a session first (REPL creates sessions, not runWithHistory)
    const meta = session.create("test prompt", config);

    const result = await orch.runWithHistory(
      "New question",
      existingMessages,
      meta.sessionId
    );

    expect(result.type).toBe("consensus");
    expect(result.messages.length).toBeGreaterThan(existingMessages.length);
    expect(result.sessionId).toBe(meta.sessionId);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/orchestrator.test.ts
```

Expected: FAIL — `runWithHistory` is not a function.

- [ ] **Step 4: Implement `runWithHistory()`**

Add to `src/orchestrator.ts`:

```typescript
async runWithHistory(
  userPrompt: string,
  existingMessages: Message[],
  sessionId: string,
  signal?: AbortSignal
): Promise<OrchestratorResult> {
  const messages: Message[] = [...existingMessages];
  let turn = Math.max(...existingMessages.map((m) => m.turn), 0);

  // Turn 1: Initiator
  turn++;
  this.onTurnStart?.(turn, this.agentA.name, "initiator");
  const initResponse = await this.agentA.send(
    formatTurnPrompt(initiatorPrompt(this.agentB.name), messages, userPrompt),
    {
      sessionId,
      history: messages,
      workingDirectory: this.config.workingDirectory,
      systemPrompt: initiatorPrompt(this.agentB.name),
    },
    signal
  );

  const initMsg = this.toMessage("initiator", this.agentA.name, turn, "code", initResponse);
  messages.push(initMsg);
  this.session.appendMessage(sessionId, initMsg);

  // Review loop
  let currentReviewer = this.agentB;
  let currentInitiator = this.agentA;
  const maxTurn = turn + this.config.guardrailRounds - 1;

  while (turn < maxTurn) {
    turn++;

    const isFirstReview = turn === Math.max(...existingMessages.map((m) => m.turn), 0) + 2;
    const sysPrompt = isFirstReview
      ? reviewerPrompt(currentInitiator.name)
      : rebuttalPrompt(currentInitiator.name);

    this.onTurnStart?.(turn, currentReviewer.name, isFirstReview ? "reviewer" : "rebuttal");
    const reviewResponse = await currentReviewer.send(
      formatTurnPrompt(sysPrompt, messages, userPrompt),
      {
        sessionId,
        history: messages,
        workingDirectory: this.config.workingDirectory,
        systemPrompt: sysPrompt,
      },
      signal
    );

    const reviewMsg = this.toMessage("reviewer", currentReviewer.name, turn, "review", reviewResponse);
    messages.push(reviewMsg);
    this.session.appendMessage(sessionId, reviewMsg);

    if (detectConvergence(messages) || checkDiffStability(messages)) {
      const summary = formatConsensus(messages, turn);
      this.session.saveSummary(sessionId, summary);
      this.session.updateStatus(sessionId, "completed");
      return { type: "consensus", sessionId, rounds: turn, summary, messages };
    }

    [currentReviewer, currentInitiator] = [currentInitiator, currentReviewer];
  }

  // Escalation
  turn++;
  const escPrompt = escalationPrompt();

  this.onTurnStart?.(turn, this.agentA.name, "escalation");
  const escA = await this.agentA.send(
    formatTurnPrompt(escPrompt, messages, userPrompt),
    { sessionId, history: messages, workingDirectory: this.config.workingDirectory, systemPrompt: escPrompt },
    signal
  );
  const escMsgA = this.toMessage("initiator", this.agentA.name, turn, "deadlock", escA);
  messages.push(escMsgA);
  this.session.appendMessage(sessionId, escMsgA);

  this.onTurnStart?.(turn, this.agentB.name, "escalation");
  const escB = await this.agentB.send(
    formatTurnPrompt(escPrompt, messages, userPrompt),
    { sessionId, history: messages, workingDirectory: this.config.workingDirectory, systemPrompt: escPrompt },
    signal
  );
  const escMsgB = this.toMessage("reviewer", this.agentB.name, turn, "deadlock", escB);
  messages.push(escMsgB);
  this.session.appendMessage(sessionId, escMsgB);

  const summary = formatEscalation(messages.slice(-2), turn);
  this.session.saveSummary(sessionId, summary);
  this.session.updateStatus(sessionId, "escalated");
  return { type: "escalation", sessionId, rounds: turn, summary, messages };
}
```

- [ ] **Step 5: Add `signal` parameter to `continueWithGuidance()`**

Update the signature of `continueWithGuidance` in `src/orchestrator.ts`:

```typescript
async continueWithGuidance(
  previousResult: OrchestratorResult,
  userGuidance: string,
  sessionId: string,
  signal?: AbortSignal
): Promise<OrchestratorResult> {
```

Thread `signal` through to all `this.agentA.send(...)` and `this.agentB.send(...)` calls within the method by adding `signal` as the third argument after the context object.

- [ ] **Step 6: Run tests**

```bash
npx vitest run tests/orchestrator.test.ts
```

Expected: all tests PASS.

- [ ] **Step 7: Run full test suite to check nothing is broken**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/orchestrator.ts tests/orchestrator.test.ts
git commit -m "feat: add runWithHistory and AbortSignal support to orchestrator"
```

---

### Task 8: Build the REPL module — spinner and command dispatch

**Files:**
- Create: `src/repl.ts`
- Test: `tests/repl.test.ts`

This is the core new file. Build it in stages: first the spinner utility and command parsing, then the full REPL loop.

- [ ] **Step 1: Write tests for spinner and command parsing**

Create `tests/repl.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseCommand, createSpinner } from "../src/repl.js";

describe("parseCommand", () => {
  it("should parse a slash command with no args", () => {
    const result = parseCommand("/quit");
    expect(result).toEqual({ command: "quit", args: "" });
  });

  it("should parse a slash command with args", () => {
    const result = parseCommand("/steer use React instead");
    expect(result).toEqual({ command: "steer", args: "use React instead" });
  });

  it("should parse /resume with session ID", () => {
    const result = parseCommand("/resume abc123xyz");
    expect(result).toEqual({ command: "resume", args: "abc123xyz" });
  });

  it("should return null for non-command input", () => {
    const result = parseCommand("What architecture should we use?");
    expect(result).toBeNull();
  });

  it("should return null for empty input", () => {
    const result = parseCommand("");
    expect(result).toBeNull();
  });

  it("should parse /config with key value", () => {
    const result = parseCommand("/config guardrailRounds 6");
    expect(result).toEqual({ command: "config", args: "guardrailRounds 6" });
  });
});

describe("createSpinner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start and stop without errors", () => {
    const write = vi.fn();
    const spinner = createSpinner(write);
    spinner.start("Claude (initiator) responding...", 1, 8);
    vi.advanceTimersByTime(200);
    spinner.stop();
    expect(write).toHaveBeenCalled();
  });

  it("should update message", () => {
    const write = vi.fn();
    const spinner = createSpinner(write);
    spinner.start("Claude (initiator) responding...", 1, 8);
    spinner.update("Codex (reviewer) responding...", 2, 8);
    vi.advanceTimersByTime(100);
    spinner.stop();
    // verify the updated message was written
    const calls = write.mock.calls.map((c: any[]) => c[0]);
    expect(calls.some((c: string) => c.includes("Codex"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/repl.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Create `src/repl.ts` with spinner and command parsing**

```typescript
import { createInterface } from "node:readline";
import chalk from "chalk";
import { ClaudeAdapter } from "./adapters/claude-adapter.js";
import { CodexAdapter } from "./adapters/codex-adapter.js";
import { Orchestrator } from "./orchestrator.js";
import { SessionManager } from "./session.js";
import type { Message, OrchestratorConfig, OrchestratorResult } from "./types.js";

// --- Command parsing ---

export interface ParsedCommand {
  command: string;
  args: string;
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx === -1) {
    return { command: trimmed.slice(1), args: "" };
  }
  return {
    command: trimmed.slice(1, spaceIdx),
    args: trimmed.slice(spaceIdx + 1).trim(),
  };
}

// --- Spinner ---

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface Spinner {
  start(message: string, turn: number, maxTurns: number): void;
  update(message: string, turn: number, maxTurns: number): void;
  stop(): void;
}

export function createSpinner(write: (text: string) => void): Spinner {
  let frameIdx = 0;
  let interval: ReturnType<typeof setInterval> | null = null;
  let currentMessage = "";
  let currentTurn = 0;
  let currentMax = 0;

  function render() {
    const frame = SPINNER_FRAMES[frameIdx % SPINNER_FRAMES.length];
    const turnDisplay = currentTurn > currentMax
      ? "escalating..."
      : `turn ${currentTurn}/${currentMax}`;
    write(`\r${frame} ${currentMessage} ${turnDisplay}`);
    frameIdx++;
  }

  return {
    start(message, turn, maxTurns) {
      currentMessage = message;
      currentTurn = turn;
      currentMax = maxTurns;
      frameIdx = 0;
      interval = setInterval(render, 80);
      render();
    },
    update(message, turn, maxTurns) {
      currentMessage = message;
      currentTurn = turn;
      currentMax = maxTurns;
    },
    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      write("\r\x1b[K"); // clear the line
    },
  };
}

// --- REPL State ---

interface ReplState {
  sessionId: string;
  messages: Message[];
  roundIndex: number;
  roundStartTurn: number;
  config: OrchestratorConfig;
  lastResult: OrchestratorResult | null;
  debateInProgress: boolean;
  escalationPending: boolean;
}

// --- REPL ---

export async function startRepl(
  config: OrchestratorConfig,
  resumeSessionId?: string
): Promise<void> {
  const session = new SessionManager();
  const claude = new ClaudeAdapter(config.timeoutMs);
  const codex = new CodexAdapter(config.timeoutMs);

  const spinner = createSpinner((text) => process.stderr.write(text));

  let abortController: AbortController | null = null;

  const onTurnStart = (turn: number, agent: string, role: string) => {
    const label = agent === "claude"
      ? chalk.magenta(agent.charAt(0).toUpperCase() + agent.slice(1))
      : chalk.green(agent.charAt(0).toUpperCase() + agent.slice(1));
    const relativeTurn = turn - state.roundStartTurn + 1;
    if (role === "escalation") {
      spinner.update(`${label} (${role}) responding...`, state.config.guardrailRounds + 1, state.config.guardrailRounds);
    } else {
      spinner.start(`${label} (${role}) responding...`, relativeTurn, state.config.guardrailRounds);
    }
  };

  let orchestrator = new Orchestrator(claude, codex, session, config, onTurnStart);

  // Initialize state
  const state: ReplState = {
    sessionId: "",
    messages: [],
    roundIndex: 0,
    roundStartTurn: 1,
    config,
    lastResult: null,
    debateInProgress: false,
    escalationPending: false,
  };

  // Load or create session
  if (resumeSessionId) {
    const loaded = session.load(resumeSessionId);
    state.sessionId = resumeSessionId;
    state.messages = loaded.messages;
    state.roundStartTurn = Math.max(...loaded.messages.map((m) => m.turn), 0) + 1;
    state.config = { ...config, ...loaded.meta.config };
    orchestrator = new Orchestrator(claude, codex, session, state.config, onTurnStart);
    session.updateStatus(resumeSessionId, "active");
  } else {
    const meta = session.create("(interactive session)", config);
    state.sessionId = meta.sessionId;
  }

  // Welcome banner
  process.stderr.write(`\n${chalk.bold("topg")} — inter-agent collaboration\n`);
  process.stderr.write(`Session: ${chalk.dim(state.sessionId)}\n`);
  process.stderr.write(`Agents: ${chalk.magenta("Claude")} vs ${chalk.green("Codex")} (${state.config.startWith} goes first)\n`);
  process.stderr.write(`Type a prompt to start a debate, or ${chalk.dim("/help")} for commands.\n\n`);

  // Readline
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    prompt: chalk.bold("topg> "),
  });

  // Slash command handlers
  const commands = new Map<string, (args: string) => void | Promise<void>>();

  commands.set("quit", () => {
    session.updateStatus(state.sessionId, "paused");
    process.stderr.write(`\nSession paused. Resume with: ${chalk.dim(`topg --resume ${state.sessionId}`)}\n`);
    rl.close();
    process.exit(0);
  });

  commands.set("help", () => {
    process.stderr.write(chalk.dim([
      "",
      "  /quit              Exit the REPL",
      "  /transcript        Show full transcript of last round",
      "  /history           Show summary of all rounds",
      "  /sessions          List all saved sessions",
      "  /resume <id>       Switch to a different session",
      "  /steer <text>      Provide guidance after escalation",
      "  /status            Show current session info",
      "  /config [key] [val] View or change settings",
      "  /help              Show this help",
      "",
    ].join("\n")) + "\n");
  });

  commands.set("status", () => {
    process.stderr.write(chalk.dim([
      "",
      `  Session:    ${state.sessionId}`,
      `  Rounds:     ${state.roundIndex}`,
      `  Start with: ${state.config.startWith}`,
      `  Guardrail:  ${state.config.guardrailRounds} rounds`,
      `  Timeout:    ${state.config.timeoutMs / 1000}s per turn`,
      `  Last:       ${state.lastResult ? state.lastResult.type : "none"}`,
      "",
    ].join("\n")) + "\n");
  });

  commands.set("transcript", () => {
    if (state.messages.length === 0) {
      process.stderr.write(chalk.dim("  No messages yet.\n\n"));
      return;
    }
    const roundMessages = state.messages.filter(
      (m) => m.turn >= state.roundStartTurn - state.config.guardrailRounds - 2 && m.type !== "user-prompt"
    );
    const msgs = roundMessages.length > 0 ? roundMessages : state.messages.filter((m) => m.type !== "user-prompt");
    process.stderr.write("\n");
    for (const msg of msgs) {
      const label = msg.agent === "claude"
        ? chalk.magenta(msg.agent.charAt(0).toUpperCase() + msg.agent.slice(1))
        : chalk.green(msg.agent.charAt(0).toUpperCase() + msg.agent.slice(1));
      process.stderr.write(`  ${chalk.dim(`[Turn ${msg.turn}]`)} ${label} (${msg.role}):\n`);
      process.stderr.write(`  ${msg.content.split("\n").join("\n  ")}\n\n`);
    }
  });

  commands.set("history", () => {
    if (state.roundIndex === 0) {
      process.stderr.write(chalk.dim("  No rounds yet.\n\n"));
      return;
    }
    process.stderr.write("\n");
    // Find user-prompt messages to identify rounds
    const userPrompts = state.messages.filter((m) => m.type === "user-prompt");
    for (let i = 0; i < userPrompts.length; i++) {
      const promptSnippet = userPrompts[i].content.replace("[USER PROMPT #" + (i + 1) + "]: ", "").slice(0, 60);
      const outcome = state.lastResult && i === userPrompts.length - 1 ? state.lastResult.type : "completed";
      process.stderr.write(chalk.dim(`  Round ${i + 1}: "${promptSnippet}" → ${outcome}\n`));
    }
    process.stderr.write("\n");
  });

  commands.set("sessions", () => {
    const allSessions = session.listSessions();
    if (allSessions.length === 0) {
      process.stderr.write(chalk.dim("  No sessions found.\n\n"));
      return;
    }
    process.stderr.write("\n");
    for (const s of allSessions) {
      const current = s.sessionId === state.sessionId ? chalk.green(" (current)") : "";
      const date = new Date(s.updatedAt).toLocaleDateString();
      const snippet = s.prompt.slice(0, 50);
      process.stderr.write(chalk.dim(`  ${s.sessionId}  ${date}  ${s.status.padEnd(10)}  "${snippet}"${current}\n`));
    }
    process.stderr.write("\n");
  });

  commands.set("resume", (args) => {
    const targetId = args.trim();
    if (!targetId) {
      process.stderr.write(chalk.dim("  Usage: /resume <sessionId>\n\n"));
      return;
    }
    try {
      const loaded = session.load(targetId);
      state.sessionId = targetId;
      state.messages = loaded.messages;
      state.roundIndex = loaded.messages.filter((m) => m.type === "user-prompt").length;
      state.roundStartTurn = Math.max(...loaded.messages.map((m) => m.turn), 0) + 1;
      state.lastResult = null;
      state.escalationPending = false;
      // Adopt the loaded session's config
      Object.assign(state.config, loaded.meta.config);
      orchestrator = new Orchestrator(claude, codex, session, state.config, onTurnStart);
      session.updateStatus(targetId, "active");
      process.stderr.write(`  Switched to session ${chalk.dim(targetId)} (${state.roundIndex} rounds)\n\n`);
    } catch (err) {
      process.stderr.write(chalk.red(`  Session not found: ${targetId}\n\n`));
    }
  });

  commands.set("steer", async (args) => {
    const guidance = args.trim();
    if (!guidance) {
      process.stderr.write(chalk.dim("  Usage: /steer <your guidance>\n\n"));
      return;
    }
    if (!state.escalationPending || !state.lastResult) {
      process.stderr.write(chalk.dim("  No pending escalation to steer. Submit a new prompt instead.\n\n"));
      return;
    }
    state.debateInProgress = true;
    state.escalationPending = false;
    abortController = new AbortController();
    spinner.start("Resuming with guidance...", 1, state.config.guardrailRounds);
    try {
      const result = await orchestrator.continueWithGuidance(
        state.lastResult,
        guidance,
        state.sessionId,
        abortController.signal
      );
      spinner.stop();
      state.debateInProgress = false;
      state.lastResult = result;
      state.messages = result.messages;
      state.roundStartTurn = Math.max(...state.messages.map((m) => m.turn), 0) + 1;

      if (result.type === "consensus") {
        process.stderr.write(chalk.green("✓") + ` Consensus reached (${result.rounds} rounds)\n\n`);
      } else {
        process.stderr.write(chalk.yellow("⚠") + ` Escalation (${result.rounds} rounds, no convergence)\n\n`);
        state.escalationPending = true;
      }
      console.log(result.summary);
    } catch (err) {
      spinner.stop();
      state.debateInProgress = false;
      if ((err as Error).message === "aborted") {
        // Discard incomplete round messages
        state.messages = state.messages.filter((m) => m.turn < state.roundStartTurn);
        process.stderr.write(chalk.dim("\n  Debate interrupted.\n\n"));
      } else {
        process.stderr.write(chalk.red(`  Error: ${(err as Error).message}\n\n`));
      }
    }
  });

  commands.set("config", (args) => {
    const parts = args.trim().split(/\s+/);
    if (!args.trim()) {
      // Show config
      process.stderr.write(chalk.dim([
        "",
        `  startWith:       ${state.config.startWith}`,
        `  guardrailRounds: ${state.config.guardrailRounds}`,
        `  timeoutMs:       ${state.config.timeoutMs}`,
        `  outputFormat:    ${state.config.outputFormat}`,
        "",
      ].join("\n")) + "\n");
      return;
    }
    const [key, value] = parts;
    if (key === "startWith" && (value === "claude" || value === "codex")) {
      state.config.startWith = value;
      orchestrator = new Orchestrator(claude, codex, session, state.config, onTurnStart);
      process.stderr.write(chalk.dim(`  startWith set to ${value}\n\n`));
    } else if (key === "guardrailRounds" && !isNaN(parseInt(value, 10))) {
      state.config.guardrailRounds = parseInt(value, 10);
      process.stderr.write(chalk.dim(`  guardrailRounds set to ${value}\n\n`));
    } else if (key === "timeoutMs" && !isNaN(parseInt(value, 10))) {
      state.config.timeoutMs = parseInt(value, 10);
      process.stderr.write(chalk.dim(`  timeoutMs set to ${value}\n\n`));
    } else {
      process.stderr.write(chalk.dim(`  Unknown config key or invalid value: ${key} ${value ?? ""}\n\n`));
    }
  });

  // Handle debate submission
  async function submitPrompt(prompt: string) {
    state.roundIndex++;
    state.escalationPending = false;

    // Synthetic user prompt message
    const userMsg: Message = {
      role: "initiator",
      agent: "claude",
      turn: state.roundStartTurn,
      type: "user-prompt",
      content: `[USER PROMPT #${state.roundIndex}]: ${prompt}`,
      timestamp: new Date().toISOString(),
    };
    state.messages.push(userMsg);
    session.appendMessage(state.sessionId, userMsg);
    state.roundStartTurn = Math.max(...state.messages.map((m) => m.turn), 0) + 1;

    // Update meta.prompt on first real prompt
    if (state.roundIndex === 1) {
      session.updatePrompt(state.sessionId, prompt);
    }

    state.debateInProgress = true;
    abortController = new AbortController();
    spinner.start(
      `${chalk.magenta("Claude")} (initiator) responding...`,
      1,
      state.config.guardrailRounds
    );

    try {
      const result = await orchestrator.runWithHistory(
        prompt,
        state.messages,
        state.sessionId,
        abortController.signal
      );
      spinner.stop();
      state.debateInProgress = false;
      state.lastResult = result;
      state.messages = result.messages;
      state.roundStartTurn = Math.max(...state.messages.map((m) => m.turn), 0) + 1;

      if (result.type === "consensus") {
        process.stderr.write(chalk.green("✓") + ` Consensus reached (${result.rounds} rounds)\n\n`);
        console.log(result.summary);
      } else {
        process.stderr.write(chalk.yellow("⚠") + ` Escalation (${result.rounds} rounds, no convergence)\n\n`);
        console.log(result.summary);
        state.escalationPending = true;
        process.stderr.write(chalk.dim("\nProvide guidance with /steer <text>, or submit a new prompt.\n\n"));
      }
    } catch (err) {
      spinner.stop();
      state.debateInProgress = false;
      if ((err as Error).message === "aborted") {
        state.messages = state.messages.filter((m) => m.turn < state.roundStartTurn);
        process.stderr.write(chalk.dim("\n  Debate interrupted.\n\n"));
      } else {
        process.stderr.write(chalk.red(`  Error: ${(err as Error).message}\n\n`));
      }
    }
  }

  // Ctrl+C handling
  rl.on("SIGINT", () => {
    if (state.debateInProgress && abortController) {
      abortController.abort();
    } else {
      session.updateStatus(state.sessionId, "paused");
      process.stderr.write(`\n\nSession paused. Resume with: ${chalk.dim(`topg --resume ${state.sessionId}`)}\n`);
      process.exit(0);
    }
  });

  // Main loop
  rl.prompt();

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      continue;
    }

    const cmd = parseCommand(trimmed);
    if (cmd) {
      const handler = commands.get(cmd.command);
      if (handler) {
        await handler(cmd.args);
      } else {
        process.stderr.write(chalk.dim(`  Unknown command: /${cmd.command}. Type /help for available commands.\n\n`));
      }
    } else {
      await submitPrompt(trimmed);
    }

    rl.prompt();
  }

  // EOF / readline close
  session.updateStatus(state.sessionId, "paused");
  process.stderr.write(`\nSession paused. Resume with: ${chalk.dim(`topg --resume ${state.sessionId}`)}\n`);
}

// Note: No askGuidance helper — inline guidance uses /steer command
// to avoid readline question/iterator conflicts. After escalation,
// the user is prompted to use /steer <text> from the main prompt.
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/repl.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repl.ts tests/repl.test.ts
git commit -m "feat: add REPL module with spinner, command parsing, and interactive loop"
```

---

### Task 9: Wire up REPL in entry point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update `src/index.ts` routing**

Replace the action handler body in `src/index.ts`. The key changes:
1. Remove the error guard at lines 46-49
2. Add import for `startRepl`
3. Add REPL routing before the existing one-shot logic

At the top of the file, add:
```typescript
import { startRepl } from "./repl.js";
```

**Note:** This changes the behavior of `--resume <id>` without a prompt — it now launches the REPL instead of continuing the debate in one-shot mode. This is intentional per the spec (Case 2). One-shot resume with guidance (`--resume <id> "guidance"`) is preserved.

Replace the action handler body (inside `.action(async (prompt, opts) => { ... })`) with:

```typescript
    // Validate credentials
    if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_API_KEY) {
      console.error("Warning: ANTHROPIC_API_KEY not set. Claude Code will attempt to use your active login session.");
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error("Error: OPENAI_API_KEY is required for Codex.");
      console.error("Set it via: export OPENAI_API_KEY=your-key");
      process.exit(1);
    }

    const config: OrchestratorConfig = {
      startWith: opts.startWith as AgentName,
      workingDirectory: opts.cwd,
      guardrailRounds: parseInt(opts.guardrail, 10),
      timeoutMs: parseInt(opts.timeout, 10) * 1000,
      outputFormat: opts.output as "text" | "json",
    };

    // Case 1: No prompt and no --resume → launch REPL
    if (!prompt && !opts.resume) {
      await startRepl(config);
      return;
    }

    // Case 2: --resume with no prompt → launch REPL with loaded session
    if (opts.resume && !prompt) {
      await startRepl(config, opts.resume as string);
      return;
    }

    // Case 3 & 4: One-shot mode (existing behavior)
    const claude = new ClaudeAdapter(config.timeoutMs);
    const codex = new CodexAdapter(config.timeoutMs);
    const session = new SessionManager();

    const orchestrator = new Orchestrator(claude, codex, session, config, (turn, agent, role) => {
      const label = agent.charAt(0).toUpperCase() + agent.slice(1);
      console.error(`[Turn ${turn}] ${label} (${role}): responding...`);
    });

    try {
      let result;

      if (opts.resume) {
        // Resume existing session with guidance (one-shot)
        const sessionId = opts.resume as string;
        console.error(`Resuming session: ${sessionId}`);
        console.error(`With guidance: "${prompt}"\n`);
        result = await orchestrator.resume(sessionId, prompt);
      } else {
        // New one-shot session
        console.error(`Starting collaboration (${config.startWith} goes first)...`);
        result = await orchestrator.run(prompt!);
        console.error(`Session ID: ${result.sessionId}`);
        console.error(`Resume with: topg --resume ${result.sessionId} "your guidance"\n`);
      }

      while (true) {
        if (config.outputFormat === "json") {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.summary);
        }

        if (result.type === "consensus") {
          break;
        }

        console.error(`\nResume later with: topg --resume ${result.sessionId} "your guidance"`);
        const guidance = await askUser("\nYour guidance (or 'q' to quit): ");

        if (!guidance || guidance.toLowerCase() === "q") {
          break;
        }

        console.error(`\nResuming with your guidance...\n`);
        result = await orchestrator.continueWithGuidance(result, guidance, result.sessionId);
      }
    } catch (err) {
      console.error("Collaboration failed:", (err as Error).message);
      process.exit(1);
    }
```

- [ ] **Step 2: Build to check for TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire REPL into entry point, preserve one-shot mode"
```

---

### Task 10: Build, verify, and smoke test

**Files:**
- None — verification only

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 3: Verify one-shot mode still works**

```bash
node dist/index.js "What is 2+2?" --guardrail 2 --timeout 30 2>/dev/null || echo "One-shot mode runs (may fail without API keys, that's OK)"
```

- [ ] **Step 4: Verify REPL launches**

```bash
echo "/help" | node dist/index.js 2>&1 | head -20
```

Expected: shows the welcome banner and help output.

- [ ] **Step 5: Verify REPL handles /quit**

```bash
echo "/quit" | node dist/index.js 2>&1 | head -10
```

Expected: shows "Session paused" with resume command.

- [ ] **Step 6: Commit any fixes**

If any fixes were needed, commit them:

```bash
git add -A
git commit -m "fix: address smoke test issues in REPL"
```
