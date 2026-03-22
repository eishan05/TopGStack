# topg Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript CLI tool that orchestrates autonomous collaboration between Claude Code and OpenAI Codex, with convergence detection, soft guardrail escalation, and session persistence.

**Architecture:** A Node.js CLI (`topg`) with pluggable agent adapters (Claude via child_process stdin, Codex via @openai/codex-sdk), a turn-based orchestrator with convergence detection, and a file-based session manager. CLI parsing via `commander`.

**Tech Stack:** TypeScript, Node.js 22+, @openai/codex-sdk, commander, nanoid, vitest (testing)

**Spec:** `docs/superpowers/specs/2026-03-22-topg-inter-agent-collaboration-design.md`

---

## File Structure

```
src/
  index.ts              # CLI entry point (commander setup, arg parsing)
  types.ts              # All shared interfaces (Message, Artifact, AgentResponse, etc.)
  adapters/
    agent-adapter.ts    # AgentAdapter interface export
    claude-adapter.ts   # ClaudeAdapter — spawns claude CLI via stdin
    codex-adapter.ts    # CodexAdapter — uses @openai/codex-sdk
  orchestrator.ts       # Core turn-based loop, role assignment, convergence check calls
  convergence.ts        # Convergence detection logic (phrase, tag, diff stability)
  session.ts            # Session manager — create, append, load, resume
  prompts.ts            # System prompt templates for initiator/reviewer/escalation roles
  formatter.ts          # Output formatting — consensus report, disagreement report
tests/
  types.test.ts         # Validates type contracts with fixture data
  convergence.test.ts   # Convergence detection unit tests
  session.test.ts       # Session manager tests (create, append, load, resume)
  orchestrator.test.ts  # Orchestrator tests with mock adapters
  formatter.test.ts     # Output formatter tests
  adapters/
    claude-adapter.test.ts  # Claude adapter tests (mocked child_process)
    codex-adapter.test.ts   # Codex adapter tests (mocked SDK)
  integration/
    full-loop.test.ts   # End-to-end test with both mock adapters
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/types.ts`

- [ ] **Step 1: Initialize the project**

```bash
cd /Users/eishanlawrence/dev/topgstack
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install commander nanoid @openai/codex-sdk
npm install -D typescript vitest @types/node
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Add scripts to package.json**

Add to `package.json`:
```json
{
  "type": "module",
  "bin": { "topg": "./dist/index.js" },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx src/index.ts"
  }
}
```

Also install tsx for dev: `npm install -D tsx`

- [ ] **Step 5b: Create .gitignore**

```
node_modules/
dist/
.topg/
```

- [ ] **Step 6: Create src/types.ts with all shared interfaces**

```typescript
export type AgentName = "claude" | "codex";
export type Role = "initiator" | "reviewer";
export type MessageType = "code" | "review" | "debate" | "consensus" | "deadlock";
export type ConvergenceSignal = "agree" | "disagree" | "partial" | "defer";
export type ArtifactType = "code" | "diff" | "config";

export interface Artifact {
  path: string;
  content: string;
  type: ArtifactType;
}

export interface Message {
  role: Role;
  agent: AgentName;
  turn: number;
  type: MessageType;
  content: string;
  artifacts?: Artifact[];
  convergenceSignal?: ConvergenceSignal;
  timestamp: string;
}

export interface AgentResponse {
  content: string;
  artifacts?: Artifact[];
  convergenceSignal?: ConvergenceSignal;
}

export interface ConversationContext {
  sessionId: string;
  history: Message[];
  workingDirectory: string;
  systemPrompt: string;
}

export interface SessionMeta {
  version: 1;
  sessionId: string;
  status: "active" | "paused" | "completed" | "escalated";
  prompt: string;
  config: OrchestratorConfig;
  createdAt: string;
  updatedAt: string;
}

export interface OrchestratorConfig {
  startWith: AgentName;
  workingDirectory: string;
  guardrailRounds: number;
  timeoutMs: number;
  outputFormat: "text" | "json";
}

export interface OrchestratorResult {
  type: "consensus" | "escalation";
  rounds: number;
  summary: string;
  messages: Message[];
  artifacts?: Artifact[];
}
```

- [ ] **Step 7: Write types validation test**

Create `tests/types.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import type { Message, SessionMeta, OrchestratorConfig } from "../src/types.js";

describe("types", () => {
  it("should create a valid Message", () => {
    const msg: Message = {
      role: "initiator",
      agent: "claude",
      turn: 1,
      type: "code",
      content: "Here is my implementation...",
      convergenceSignal: "partial",
      timestamp: new Date().toISOString(),
    };
    expect(msg.agent).toBe("claude");
    expect(msg.turn).toBe(1);
  });

  it("should create a valid SessionMeta", () => {
    const meta: SessionMeta = {
      version: 1,
      sessionId: "test-123",
      status: "active",
      prompt: "Design auth system",
      config: {
        startWith: "claude",
        workingDirectory: "/tmp",
        guardrailRounds: 8,
        timeoutMs: 120000,
        outputFormat: "text",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(meta.version).toBe(1);
    expect(meta.config.guardrailRounds).toBe(8);
  });
});
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/types.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts src/types.ts tests/types.test.ts
git commit -m "feat: project scaffolding with shared type definitions"
```

---

### Task 2: Session Manager

**Files:**
- Create: `src/session.ts`
- Test: `tests/session.test.ts`

- [ ] **Step 1: Write failing tests for session manager**

Create `tests/session.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SessionManager } from "../src/session.js";
import type { Message, OrchestratorConfig } from "../src/types.js";

describe("SessionManager", () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "topg-test-"));
    manager = new SessionManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const defaultConfig: OrchestratorConfig = {
    startWith: "claude",
    workingDirectory: "/tmp",
    guardrailRounds: 8,
    timeoutMs: 120000,
    outputFormat: "text",
  };

  it("should create a new session with meta.json", () => {
    const session = manager.create("Design an auth system", defaultConfig);
    expect(session.sessionId).toBeTruthy();
    const metaPath = path.join(tmpDir, session.sessionId, "meta.json");
    expect(fs.existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    expect(meta.version).toBe(1);
    expect(meta.status).toBe("active");
    expect(meta.prompt).toBe("Design an auth system");
  });

  it("should append messages to transcript.jsonl", () => {
    const session = manager.create("Test prompt", defaultConfig);
    const msg: Message = {
      role: "initiator",
      agent: "claude",
      turn: 1,
      type: "code",
      content: "Here is my response",
      timestamp: new Date().toISOString(),
    };
    manager.appendMessage(session.sessionId, msg);
    const transcriptPath = path.join(tmpDir, session.sessionId, "transcript.jsonl");
    const lines = fs.readFileSync(transcriptPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).agent).toBe("claude");
  });

  it("should load an existing session", () => {
    const session = manager.create("Test prompt", defaultConfig);
    const msg: Message = {
      role: "initiator",
      agent: "claude",
      turn: 1,
      type: "code",
      content: "Response content",
      timestamp: new Date().toISOString(),
    };
    manager.appendMessage(session.sessionId, msg);
    const loaded = manager.load(session.sessionId);
    expect(loaded.meta.prompt).toBe("Test prompt");
    expect(loaded.messages).toHaveLength(1);
    expect(loaded.messages[0].content).toBe("Response content");
  });

  it("should update session status", () => {
    const session = manager.create("Test prompt", defaultConfig);
    manager.updateStatus(session.sessionId, "paused");
    const loaded = manager.load(session.sessionId);
    expect(loaded.meta.status).toBe("paused");
  });

  it("should save summary", () => {
    const session = manager.create("Test prompt", defaultConfig);
    manager.saveSummary(session.sessionId, "# Consensus\nThey agreed.");
    const summaryPath = path.join(tmpDir, session.sessionId, "summary.md");
    expect(fs.readFileSync(summaryPath, "utf-8")).toContain("They agreed.");
  });

  it("should throw when loading a nonexistent session", () => {
    expect(() => manager.load("nonexistent")).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/session.test.ts`
Expected: FAIL — `SessionManager` not found

- [ ] **Step 3: Implement SessionManager**

Create `src/session.ts`:
```typescript
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { nanoid } from "nanoid";
import type { Message, SessionMeta, OrchestratorConfig } from "./types.js";

export interface SessionData {
  meta: SessionMeta;
  messages: Message[];
}

export class SessionManager {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.join(
      process.env.TOPG_HOME ?? path.join(os.homedir(), ".topg"),
      "sessions"
    );
  }

  private sessionDir(sessionId: string): string {
    return path.join(this.baseDir, sessionId);
  }

  create(prompt: string, config: OrchestratorConfig): SessionMeta {
    const sessionId = nanoid(12);
    const dir = this.sessionDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });

    const now = new Date().toISOString();
    const meta: SessionMeta = {
      version: 1,
      sessionId,
      status: "active",
      prompt,
      config,
      createdAt: now,
      updatedAt: now,
    };

    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 2));
    fs.writeFileSync(path.join(dir, "transcript.jsonl"), "");
    return meta;
  }

  appendMessage(sessionId: string, message: Message): void {
    const transcriptPath = path.join(this.sessionDir(sessionId), "transcript.jsonl");
    fs.appendFileSync(transcriptPath, JSON.stringify(message) + "\n");
    this.touchUpdatedAt(sessionId);
  }

  load(sessionId: string): SessionData {
    const dir = this.sessionDir(sessionId);
    if (!fs.existsSync(dir)) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const meta: SessionMeta = JSON.parse(
      fs.readFileSync(path.join(dir, "meta.json"), "utf-8")
    );

    const transcriptPath = path.join(dir, "transcript.jsonl");
    const raw = fs.readFileSync(transcriptPath, "utf-8").trim();
    const messages: Message[] = raw
      ? raw.split("\n").map((line) => JSON.parse(line))
      : [];

    return { meta, messages };
  }

  updateStatus(sessionId: string, status: SessionMeta["status"]): void {
    const metaPath = path.join(this.sessionDir(sessionId), "meta.json");
    const meta: SessionMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    meta.status = status;
    meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

  saveSummary(sessionId: string, summary: string): void {
    const summaryPath = path.join(this.sessionDir(sessionId), "summary.md");
    fs.writeFileSync(summaryPath, summary);
  }

  private touchUpdatedAt(sessionId: string): void {
    const metaPath = path.join(this.sessionDir(sessionId), "meta.json");
    const meta: SessionMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/session.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/session.ts tests/session.test.ts
git commit -m "feat: session manager with create, append, load, resume"
```

---

### Task 3: Convergence Detection

**Files:**
- Create: `src/convergence.ts`
- Test: `tests/convergence.test.ts`

- [ ] **Step 1: Write failing tests for convergence detection**

Create `tests/convergence.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { detectConvergence, parseConvergenceTag, checkDiffStability } from "../src/convergence.js";
import type { Message } from "../src/types.js";

describe("parseConvergenceTag", () => {
  it("should extract agree signal from tag", () => {
    const content = "Looks great!\n[CONVERGENCE: agree]";
    expect(parseConvergenceTag(content)).toBe("agree");
  });

  it("should extract disagree signal", () => {
    const content = "I have concerns.\n[CONVERGENCE: disagree]";
    expect(parseConvergenceTag(content)).toBe("disagree");
  });

  it("should extract partial signal", () => {
    const content = "Some parts are good.\n[CONVERGENCE: partial]";
    expect(parseConvergenceTag(content)).toBe("partial");
  });

  it("should return null when no tag present", () => {
    const content = "Just a regular response with no tag.";
    expect(parseConvergenceTag(content)).toBeNull();
  });
});

describe("detectConvergence", () => {
  const makeMsg = (agent: "claude" | "codex", content: string, signal?: "agree" | "disagree" | "partial" | "defer"): Message => ({
    role: "initiator",
    agent,
    turn: 1,
    type: "review",
    content,
    convergenceSignal: signal,
    timestamp: new Date().toISOString(),
  });

  it("should detect convergence when both agents signal agree", () => {
    const messages = [
      makeMsg("claude", "Here is my proposal.\n[CONVERGENCE: agree]", "agree"),
      makeMsg("codex", "I agree with this.\n[CONVERGENCE: agree]", "agree"),
    ];
    expect(detectConvergence(messages)).toBe(true);
  });

  it("should not detect convergence when only one agrees", () => {
    const messages = [
      makeMsg("claude", "Proposal.\n[CONVERGENCE: agree]", "agree"),
      makeMsg("codex", "I disagree.\n[CONVERGENCE: disagree]", "disagree"),
    ];
    expect(detectConvergence(messages)).toBe(false);
  });

  it("should detect convergence from phrase matching when tags are missing", () => {
    const messages = [
      makeMsg("claude", "This looks good, I have no further changes."),
      makeMsg("codex", "I agree with this approach, no modifications needed."),
    ];
    expect(detectConvergence(messages)).toBe(true);
  });

  it("should not detect convergence from ambiguous phrases", () => {
    const messages = [
      makeMsg("claude", "Here is a revised version."),
      makeMsg("codex", "I have some suggestions for improvement."),
    ];
    expect(detectConvergence(messages)).toBe(false);
  });
});

describe("checkDiffStability", () => {
  it("should detect stability when content unchanged for 2 rounds", () => {
    const messages: Message[] = [
      makeMsg("claude", "Use approach A with pattern X"),
      makeMsg("codex", "I agree. Use approach A with pattern X"),
      makeMsg("claude", "Confirmed. Use approach A with pattern X"),
      makeMsg("codex", "Use approach A with pattern X"),
    ];
    expect(checkDiffStability(messages)).toBe(true);
  });

  it("should not detect stability when content changes", () => {
    const messages: Message[] = [
      makeMsg("claude", "Use approach A"),
      makeMsg("codex", "No, use approach B"),
      makeMsg("claude", "Actually, use approach C"),
    ];
    expect(checkDiffStability(messages)).toBe(false);
  });

  it("should return false with fewer than 4 messages", () => {
    const messages: Message[] = [
      makeMsg("claude", "Use approach A"),
      makeMsg("codex", "Use approach A"),
    ];
    expect(checkDiffStability(messages)).toBe(false);
  });
});
```

Note: `makeMsg` is defined as a local helper. Duplicate it in this test file — no shared test utils needed yet.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/convergence.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement convergence detection**

Create `src/convergence.ts`:
```typescript
import type { Message, ConvergenceSignal } from "./types.js";

const CONVERGENCE_TAG_RE = /\[CONVERGENCE:\s*(agree|disagree|partial|defer)\]/i;

const AGREEMENT_PHRASES = [
  "i agree",
  "looks good",
  "no further changes",
  "no modifications needed",
  "this is correct",
  "no objections",
  "lgtm",
  "ship it",
  "well done",
  "this looks right",
  "i'm satisfied",
  "no issues found",
];

export function parseConvergenceTag(content: string): ConvergenceSignal | null {
  const match = content.match(CONVERGENCE_TAG_RE);
  return match ? (match[1].toLowerCase() as ConvergenceSignal) : null;
}

function getSignalForMessage(msg: Message): ConvergenceSignal | null {
  // Priority: explicit signal field > tag in content > phrase detection
  if (msg.convergenceSignal) return msg.convergenceSignal;

  const tagSignal = parseConvergenceTag(msg.content);
  if (tagSignal) return tagSignal;

  const lower = msg.content.toLowerCase();
  const hasAgreement = AGREEMENT_PHRASES.some((phrase) => lower.includes(phrase));
  return hasAgreement ? "agree" : null;
}

export function detectConvergence(messages: Message[]): boolean {
  if (messages.length < 2) return false;

  // Get the last message from each agent
  const lastByAgent = new Map<string, Message>();
  for (const msg of messages) {
    lastByAgent.set(msg.agent, msg);
  }

  if (lastByAgent.size < 2) return false;

  const signals = [...lastByAgent.values()].map(getSignalForMessage);
  return signals.every((s) => s === "agree");
}

export function checkDiffStability(messages: Message[]): boolean {
  if (messages.length < 4) return false;

  // Compare the last 4 messages — if the substantive content
  // (stripped of meta-phrases) hasn't changed, consider it stable.
  const recent = messages.slice(-4);
  const contents = recent.map((m) =>
    m.content
      .replace(CONVERGENCE_TAG_RE, "")
      .replace(/^(i agree|confirmed|yes|looks good)[.,!]?\s*/i, "")
      .trim()
      .toLowerCase()
  );

  // Check if the last 2 pairs are substantially similar
  const similarity = (a: string, b: string): number => {
    if (a === b) return 1;
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    if (longer.length === 0) return 1;
    // Simple containment check — if shorter is mostly contained in longer
    const words = shorter.split(/\s+/);
    const matchedWords = words.filter((w) => longer.includes(w));
    return matchedWords.length / words.length;
  };

  return similarity(contents[0], contents[2]) > 0.8 && similarity(contents[1], contents[3]) > 0.8;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/convergence.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/convergence.ts tests/convergence.test.ts
git commit -m "feat: convergence detection via tags, phrases, and diff stability"
```

---

### Task 4: System Prompt Templates

**Files:**
- Create: `src/prompts.ts`

No dedicated test file — these are string templates tested implicitly via orchestrator tests.

- [ ] **Step 1: Create prompt templates**

Create `src/prompts.ts`:
```typescript
import type { AgentName } from "./types.js";

export function initiatorPrompt(otherAgent: AgentName): string {
  return `You are collaborating with another AI agent (${otherAgent}). Your counterpart will review your response.

Instructions:
- Produce your best response to the user's request
- Be specific and cite trade-offs for any decisions you make
- Be open to revision — this is a collaborative process
- If you produce code, include complete implementations, not pseudocode
- End your response with a convergence signal: [CONVERGENCE: agree|disagree|partial]
  - Use "agree" if you believe your response is final and complete
  - Use "partial" if you think it's good but open to feedback
  - Use "disagree" if you are pushing back on prior feedback`;
}

export function reviewerPrompt(otherAgent: AgentName): string {
  return `Another AI agent (${otherAgent}) produced the following response. You are the reviewer.

Instructions:
- Review the response critically — identify strengths, weaknesses, and potential improvements
- If you agree the response is good and complete, say so explicitly
- If you disagree, provide a concrete counter-proposal or specific revisions
- Do not be contrarian for its own sake — if the work is solid, approve it
- If you produce revised code, include the complete implementation
- End your response with a convergence signal: [CONVERGENCE: agree|disagree|partial]
  - Use "agree" if you approve the response as-is
  - Use "partial" if it's mostly good but needs specific changes
  - Use "disagree" if you believe a fundamentally different approach is needed`;
}

export function rebuttalPrompt(reviewerAgent: AgentName): string {
  return `Your reviewer (${reviewerAgent}) has provided feedback on your previous response.

Instructions:
- Consider the feedback carefully
- If the feedback is valid, revise your response accordingly
- If you disagree with the feedback, explain why with specific reasoning
- You may incorporate some suggestions and reject others — be specific about which and why
- End your response with a convergence signal: [CONVERGENCE: agree|disagree|partial]`;
}

export function escalationPrompt(): string {
  return `You have been in a multi-round collaboration and have not yet reached full agreement. This is the final round before escalating to the user.

Instructions:
- Produce a structured summary with these sections:
  1. **What we agree on** — list points of consensus
  2. **Where we disagree** — list remaining disagreements with your position and reasoning
  3. **My recommendation** — your final recommendation to the user
- Be concise and specific
- End with [CONVERGENCE: disagree]`;
}

export function formatTurnPrompt(systemPrompt: string, previousResponse: string, userPrompt?: string): string {
  let prompt = systemPrompt + "\n\n";
  if (userPrompt) {
    prompt += `## User's Original Request\n\n${userPrompt}\n\n`;
  }
  if (previousResponse) {
    prompt += `## Previous Response\n\n${previousResponse}\n\n`;
  }
  prompt += "## Your Response\n\n";
  return prompt;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/prompts.ts
git commit -m "feat: system prompt templates for collaboration roles"
```

---

### Task 5: Agent Adapters

**Files:**
- Create: `src/adapters/agent-adapter.ts`
- Create: `src/adapters/claude-adapter.ts`
- Create: `src/adapters/codex-adapter.ts`
- Test: `tests/adapters/claude-adapter.test.ts`
- Test: `tests/adapters/codex-adapter.test.ts`

- [ ] **Step 1: Create the adapter interface**

Create `src/adapters/agent-adapter.ts`:
```typescript
import type { AgentName, AgentResponse, ConversationContext } from "../types.js";

export interface AgentAdapter {
  name: AgentName;
  send(prompt: string, context: ConversationContext): Promise<AgentResponse>;
}
```

- [ ] **Step 2: Write failing test for ClaudeAdapter**

Create `tests/adapters/claude-adapter.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeAdapter } from "../../src/adapters/claude-adapter.js";
import type { ConversationContext } from "../../src/types.js";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";

function mockProcess(stdout: string): ChildProcess {
  const proc = new EventEmitter() as ChildProcess;
  proc.stdout = new EventEmitter() as any;
  proc.stderr = new EventEmitter() as any;
  proc.stdin = { write: vi.fn(), end: vi.fn() } as any;

  setTimeout(() => {
    (proc.stdout as EventEmitter).emit("data", Buffer.from(stdout));
    (proc.stdout as EventEmitter).emit("end");
    proc.emit("close", 0);
  }, 10);

  return proc;
}

describe("ClaudeAdapter", () => {
  const ctx: ConversationContext = {
    sessionId: "test-123",
    history: [],
    workingDirectory: "/tmp",
    systemPrompt: "You are a reviewer.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send a prompt and parse the response", async () => {
    const responseJson = JSON.stringify({
      type: "result",
      result: "Here is my review.\n[CONVERGENCE: agree]",
    });
    vi.mocked(spawn).mockReturnValue(mockProcess(responseJson));

    const adapter = new ClaudeAdapter();
    const result = await adapter.send("Review this code", ctx);

    expect(result.content).toContain("Here is my review");
    expect(result.convergenceSignal).toBe("agree");
  });

  it("should have name 'claude'", () => {
    const adapter = new ClaudeAdapter();
    expect(adapter.name).toBe("claude");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/adapters/claude-adapter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement ClaudeAdapter**

Create `src/adapters/claude-adapter.ts`:
```typescript
import { spawn } from "node:child_process";
import { parseConvergenceTag } from "../convergence.js";
import type { AgentName, AgentResponse, ConversationContext } from "../types.js";
import type { AgentAdapter } from "./agent-adapter.js";

export class ClaudeAdapter implements AgentAdapter {
  name: AgentName = "claude";
  private timeoutMs: number;

  constructor(timeoutMs = 120_000) {
    this.timeoutMs = timeoutMs;
  }

  async send(prompt: string, context: ConversationContext): Promise<AgentResponse> {
    const fullPrompt = context.systemPrompt + "\n\n" + prompt;

    return new Promise((resolve, reject) => {
      const proc = spawn("claude", ["-p", "--output-format", "json"], {
        cwd: context.workingDirectory,
        env: { ...process.env },
        stdio: ["pipe", "pipe", "pipe"],
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

      proc.on("close", (code) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          const content = parsed.result ?? parsed.content ?? stdout;
          const signal = parseConvergenceTag(content);
          resolve({
            content,
            convergenceSignal: signal ?? undefined,
          });
        } catch {
          // If JSON parse fails, treat raw stdout as content
          const signal = parseConvergenceTag(stdout);
          resolve({
            content: stdout,
            convergenceSignal: signal ?? undefined,
          });
        }
      });

      proc.stdin?.write(fullPrompt);
      proc.stdin?.end();
    });
  }
}
```

- [ ] **Step 5: Run Claude adapter test**

Run: `npx vitest run tests/adapters/claude-adapter.test.ts`
Expected: PASS

- [ ] **Step 6: Write failing test for CodexAdapter**

Create `tests/adapters/codex-adapter.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CodexAdapter } from "../../src/adapters/codex-adapter.js";
import type { ConversationContext } from "../../src/types.js";

// Mock the codex SDK
vi.mock("@openai/codex-sdk", () => {
  const mockThread = {
    run: vi.fn().mockResolvedValue({
      text: "Here is my code review.\n[CONVERGENCE: partial]",
    }),
  };
  return {
    default: class MockCodex {
      startThread = vi.fn().mockResolvedValue(mockThread);
    },
  };
});

describe("CodexAdapter", () => {
  const ctx: ConversationContext = {
    sessionId: "test-123",
    history: [],
    workingDirectory: "/tmp",
    systemPrompt: "You are a reviewer.",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send a prompt and parse the response", async () => {
    const adapter = new CodexAdapter();
    const result = await adapter.send("Review this code", ctx);

    expect(result.content).toContain("Here is my code review");
    expect(result.convergenceSignal).toBe("partial");
  });

  it("should have name 'codex'", () => {
    const adapter = new CodexAdapter();
    expect(adapter.name).toBe("codex");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run tests/adapters/codex-adapter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 8: Implement CodexAdapter**

Create `src/adapters/codex-adapter.ts`:
```typescript
import Codex from "@openai/codex-sdk";
import { parseConvergenceTag } from "../convergence.js";
import type { AgentName, AgentResponse, ConversationContext } from "../types.js";
import type { AgentAdapter } from "./agent-adapter.js";

export class CodexAdapter implements AgentAdapter {
  name: AgentName = "codex";
  private client: InstanceType<typeof Codex>;
  private timeoutMs: number;

  constructor(timeoutMs = 120_000) {
    this.client = new Codex();
    this.timeoutMs = timeoutMs;
  }

  async send(prompt: string, context: ConversationContext): Promise<AgentResponse> {
    const fullPrompt = context.systemPrompt + "\n\n" + prompt;

    const thread = await this.client.startThread({
      cwd: context.workingDirectory,
    });

    const result = await Promise.race([
      thread.run(fullPrompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Codex adapter timed out after ${this.timeoutMs}ms`)), this.timeoutMs)
      ),
    ]);

    const content = result.text ?? String(result);
    const signal = parseConvergenceTag(content);

    return {
      content,
      convergenceSignal: signal ?? undefined,
    };
  }
}
```

Note: The exact Codex SDK API (`.startThread()`, `.run()`, `.text`) should be verified against the installed `@openai/codex-sdk` version at implementation time. The mock structure in the test above reflects the documented API — adjust both adapter and test if the real SDK differs.

- [ ] **Step 9: Run Codex adapter test**

Run: `npx vitest run tests/adapters/codex-adapter.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/adapters/ tests/adapters/
git commit -m "feat: Claude and Codex agent adapters with shared interface"
```

---

### Task 6: Output Formatter

**Files:**
- Create: `src/formatter.ts`
- Test: `tests/formatter.test.ts`

- [ ] **Step 1: Write failing tests for formatter**

Create `tests/formatter.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { formatConsensus, formatEscalation } from "../src/formatter.js";
import type { Message, Artifact } from "../src/types.js";

describe("formatConsensus", () => {
  it("should format a consensus result", () => {
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
        convergenceSignal: "agree",
        timestamp: new Date().toISOString(),
      },
    ];

    const output = formatConsensus(messages, 2);
    expect(output).toContain("[CONSENSUS after 2 rounds]");
    expect(output).toContain("React");
  });

  it("should include artifacts when present", () => {
    const artifacts: Artifact[] = [{ path: "src/app.tsx", content: "export default App;", type: "code" }];
    const messages: Message[] = [
      {
        role: "initiator",
        agent: "claude",
        turn: 1,
        type: "code",
        content: "Here is the app.",
        artifacts,
        timestamp: new Date().toISOString(),
      },
      {
        role: "reviewer",
        agent: "codex",
        turn: 2,
        type: "consensus",
        content: "LGTM.\n[CONVERGENCE: agree]",
        convergenceSignal: "agree",
        timestamp: new Date().toISOString(),
      },
    ];

    const output = formatConsensus(messages, 2);
    expect(output).toContain("src/app.tsx");
  });
});

describe("formatEscalation", () => {
  it("should format a disagreement report", () => {
    const messages: Message[] = [
      {
        role: "initiator",
        agent: "claude",
        turn: 7,
        type: "deadlock",
        content: "## What we agree on\n- Use TypeScript\n## Where we disagree\n- I prefer React\n## My recommendation\n- Use React",
        timestamp: new Date().toISOString(),
      },
      {
        role: "reviewer",
        agent: "codex",
        turn: 8,
        type: "deadlock",
        content: "## What we agree on\n- Use TypeScript\n## Where we disagree\n- I prefer Vue\n## My recommendation\n- Use Vue",
        timestamp: new Date().toISOString(),
      },
    ];

    const output = formatEscalation(messages, 8);
    expect(output).toContain("[ESCALATION after 8 rounds");
    expect(output).toContain("Claude");
    expect(output).toContain("Codex");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/formatter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement formatter**

Create `src/formatter.ts`:
```typescript
import type { Message, Artifact } from "./types.js";

export function formatConsensus(messages: Message[], rounds: number): string {
  const lastMessages = getLastMessagePerAgent(messages);
  const allArtifacts = collectArtifacts(messages);

  let output = `[CONSENSUS after ${rounds} rounds]\n\n`;
  output += `## Agreed Approach\n\n`;

  // Use the last message as the agreed approach
  const finalMsg = messages[messages.length - 1];
  output += finalMsg.content.replace(/\[CONVERGENCE:.*?\]/gi, "").trim();
  output += "\n\n";

  if (lastMessages.length > 1) {
    output += `## Key Decisions\n\n`;
    for (const msg of lastMessages) {
      output += `- **${capitalize(msg.agent)}**: ${firstSentence(msg.content)}\n`;
    }
    output += "\n";
  }

  if (allArtifacts.length > 0) {
    output += `## Artifacts\n\n`;
    for (const artifact of allArtifacts) {
      output += `- \`${artifact.path}\` (${artifact.type})\n`;
    }
    output += "\n";
  }

  return output;
}

export function formatEscalation(messages: Message[], rounds: number): string {
  const lastMessages = getLastMessagePerAgent(messages);

  let output = `[ESCALATION after ${rounds} rounds — no convergence]\n\n`;

  // Extract each agent's final summary
  for (const msg of lastMessages) {
    output += `### ${capitalize(msg.agent)}'s Summary\n\n`;
    output += msg.content.replace(/\[CONVERGENCE:.*?\]/gi, "").trim();
    output += "\n\n";
  }

  return output;
}

function getLastMessagePerAgent(messages: Message[]): Message[] {
  const byAgent = new Map<string, Message>();
  for (const msg of messages) {
    byAgent.set(msg.agent, msg);
  }
  return [...byAgent.values()];
}

function collectArtifacts(messages: Message[]): Artifact[] {
  const seen = new Set<string>();
  const artifacts: Artifact[] = [];
  for (const msg of messages) {
    for (const a of msg.artifacts ?? []) {
      if (!seen.has(a.path)) {
        seen.add(a.path);
        artifacts.push(a);
      }
    }
  }
  return artifacts;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function firstSentence(s: string): string {
  const clean = s.replace(/\[CONVERGENCE:.*?\]/gi, "").trim();
  const match = clean.match(/^(.+?[.!?])\s/);
  return match ? match[1] : clean.slice(0, 120);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/formatter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/formatter.ts tests/formatter.test.ts
git commit -m "feat: output formatter for consensus and escalation reports"
```

---

### Task 7: Orchestrator

**Files:**
- Create: `src/orchestrator.ts`
- Test: `tests/orchestrator.test.ts`

- [ ] **Step 1: Write failing tests for orchestrator**

Create `tests/orchestrator.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "../src/orchestrator.js";
import type { AgentAdapter } from "../src/adapters/agent-adapter.js";
import type { AgentResponse, ConversationContext, OrchestratorConfig } from "../src/types.js";
import { SessionManager } from "../src/session.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function createMockAdapter(name: "claude" | "codex", responses: AgentResponse[]): AgentAdapter {
  let callIndex = 0;
  return {
    name,
    send: vi.fn(async (_prompt: string, _ctx: ConversationContext) => {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return response;
    }),
  };
}

describe("Orchestrator", () => {
  const defaultConfig: OrchestratorConfig = {
    startWith: "claude",
    workingDirectory: "/tmp",
    guardrailRounds: 8,
    timeoutMs: 120000,
    outputFormat: "text",
  };

  it("should reach consensus in 2 rounds when both agree immediately", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "topg-orch-"));
    const session = new SessionManager(tmpDir);

    const claude = createMockAdapter("claude", [
      { content: "Use React.\n[CONVERGENCE: agree]", convergenceSignal: "agree" },
    ]);
    const codex = createMockAdapter("codex", [
      { content: "I agree, React is great.\n[CONVERGENCE: agree]", convergenceSignal: "agree" },
    ]);

    const orch = new Orchestrator(claude, codex, session, defaultConfig);
    const result = await orch.run("What frontend framework?");

    expect(result.type).toBe("consensus");
    expect(result.rounds).toBeLessThanOrEqual(2);
    expect(result.messages.length).toBeGreaterThanOrEqual(2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should escalate after guardrail rounds when agents disagree", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "topg-orch-"));
    const session = new SessionManager(tmpDir);

    const claude = createMockAdapter("claude", [
      { content: "Use React.\n[CONVERGENCE: disagree]", convergenceSignal: "disagree" },
    ]);
    const codex = createMockAdapter("codex", [
      { content: "Use Vue.\n[CONVERGENCE: disagree]", convergenceSignal: "disagree" },
    ]);

    const config = { ...defaultConfig, guardrailRounds: 3 };
    const orch = new Orchestrator(claude, codex, session, config);
    const result = await orch.run("What frontend framework?");

    expect(result.type).toBe("escalation");
    expect(result.rounds).toBe(3);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should converge mid-loop when agents reach agreement", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "topg-orch-"));
    const session = new SessionManager(tmpDir);

    const claude = createMockAdapter("claude", [
      { content: "Use React.\n[CONVERGENCE: partial]", convergenceSignal: "partial" },
      { content: "OK, React with Next.js.\n[CONVERGENCE: agree]", convergenceSignal: "agree" },
    ]);
    const codex = createMockAdapter("codex", [
      { content: "React is fine but add Next.js.\n[CONVERGENCE: partial]", convergenceSignal: "partial" },
      { content: "Agreed, React + Next.js.\n[CONVERGENCE: agree]", convergenceSignal: "agree" },
    ]);

    const orch = new Orchestrator(claude, codex, session, defaultConfig);
    const result = await orch.run("What frontend framework?");

    expect(result.type).toBe("consensus");
    expect(result.rounds).toBeGreaterThan(2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/orchestrator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement orchestrator**

Create `src/orchestrator.ts`:
```typescript
import type { AgentAdapter } from "./adapters/agent-adapter.js";
import type { Message, OrchestratorConfig, OrchestratorResult, AgentName } from "./types.js";
import { detectConvergence, checkDiffStability } from "./convergence.js";
import { initiatorPrompt, reviewerPrompt, rebuttalPrompt, escalationPrompt, formatTurnPrompt } from "./prompts.js";
import { formatConsensus, formatEscalation } from "./formatter.js";
import { SessionManager } from "./session.js";

export class Orchestrator {
  private agentA: AgentAdapter;
  private agentB: AgentAdapter;
  private session: SessionManager;
  private config: OrchestratorConfig;

  constructor(
    agentA: AgentAdapter,
    agentB: AgentAdapter,
    session: SessionManager,
    config: OrchestratorConfig
  ) {
    this.agentA = config.startWith === agentA.name ? agentA : agentB;
    this.agentB = config.startWith === agentA.name ? agentB : agentA;
    this.config = config;
    this.session = session;
  }

  async run(userPrompt: string): Promise<OrchestratorResult> {
    const meta = this.session.create(userPrompt, this.config);
    const messages: Message[] = [];
    let turn = 0;

    // Turn 1: Initiator
    turn++;
    const initResponse = await this.agentA.send(
      formatTurnPrompt(initiatorPrompt(this.agentB.name), "", userPrompt),
      {
        sessionId: meta.sessionId,
        history: messages,
        workingDirectory: this.config.workingDirectory,
        systemPrompt: initiatorPrompt(this.agentB.name),
      }
    );

    const initMsg = this.toMessage("initiator", this.agentA.name, turn, "code", initResponse);
    messages.push(initMsg);
    this.session.appendMessage(meta.sessionId, initMsg);

    // Turn 2+: Review loop
    let currentReviewer = this.agentB;
    let currentInitiator = this.agentA;

    while (turn < this.config.guardrailRounds) {
      turn++;

      // Reviewer turn
      const prevContent = messages[messages.length - 1].content;
      const isFirstReview = turn === 2;
      const sysPrompt = isFirstReview
        ? reviewerPrompt(currentInitiator.name)
        : rebuttalPrompt(currentInitiator.name);

      const reviewResponse = await currentReviewer.send(
        formatTurnPrompt(sysPrompt, prevContent, turn === 2 ? userPrompt : undefined),
        {
          sessionId: meta.sessionId,
          history: messages,
          workingDirectory: this.config.workingDirectory,
          systemPrompt: sysPrompt,
        }
      );

      const reviewMsg = this.toMessage(
        "reviewer",
        currentReviewer.name,
        turn,
        "review",
        reviewResponse
      );
      messages.push(reviewMsg);
      this.session.appendMessage(meta.sessionId, reviewMsg);

      // Check convergence
      if (detectConvergence(messages) || checkDiffStability(messages)) {
        const summary = formatConsensus(messages, turn);
        this.session.saveSummary(meta.sessionId, summary);
        this.session.updateStatus(meta.sessionId, "completed");
        return { type: "consensus", rounds: turn, summary, messages };
      }

      // Swap roles for next cycle
      [currentReviewer, currentInitiator] = [currentInitiator, currentReviewer];
    }

    // Escalation: ask both for final summaries
    turn++;
    const escPrompt = escalationPrompt();

    const escResponseA = await this.agentA.send(
      formatTurnPrompt(escPrompt, messages[messages.length - 1].content, userPrompt),
      {
        sessionId: meta.sessionId,
        history: messages,
        workingDirectory: this.config.workingDirectory,
        systemPrompt: escPrompt,
      }
    );
    const escMsgA = this.toMessage("initiator", this.agentA.name, turn, "deadlock", escResponseA);
    messages.push(escMsgA);
    this.session.appendMessage(meta.sessionId, escMsgA);

    const escResponseB = await this.agentB.send(
      formatTurnPrompt(escPrompt, messages[messages.length - 2].content, userPrompt),
      {
        sessionId: meta.sessionId,
        history: messages,
        workingDirectory: this.config.workingDirectory,
        systemPrompt: escPrompt,
      }
    );
    const escMsgB = this.toMessage("reviewer", this.agentB.name, turn, "deadlock", escResponseB);
    messages.push(escMsgB);
    this.session.appendMessage(meta.sessionId, escMsgB);

    const summary = formatEscalation(messages.slice(-2), this.config.guardrailRounds);
    this.session.saveSummary(meta.sessionId, summary);
    this.session.updateStatus(meta.sessionId, "escalated");
    return { type: "escalation", rounds: this.config.guardrailRounds, summary, messages };
  }

  private toMessage(
    role: "initiator" | "reviewer",
    agent: AgentName,
    turn: number,
    type: Message["type"],
    response: { content: string; artifacts?: any[]; convergenceSignal?: any }
  ): Message {
    return {
      role,
      agent,
      turn,
      type,
      content: response.content,
      artifacts: response.artifacts,
      convergenceSignal: response.convergenceSignal,
      timestamp: new Date().toISOString(),
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/orchestrator.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator.ts tests/orchestrator.test.ts
git commit -m "feat: orchestrator with turn loop, convergence, and escalation"
```

---

### Task 8: CLI Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement CLI with commander**

Create `src/index.ts`:
```typescript
#!/usr/bin/env node

import { Command } from "commander";
import { Orchestrator } from "./orchestrator.js";
import { ClaudeAdapter } from "./adapters/claude-adapter.js";
import { CodexAdapter } from "./adapters/codex-adapter.js";
import { SessionManager } from "./session.js";
import type { AgentName, OrchestratorConfig } from "./types.js";

const program = new Command();

program
  .name("topg")
  .description("Inter-agent collaboration between Claude Code and OpenAI Codex")
  .version("0.1.0")
  .argument("<prompt>", "The prompt or question to collaborate on")
  .option("--start-with <agent>", "Which agent goes first (claude or codex)", "claude")
  .option("--cwd <path>", "Working directory for agents", process.cwd())
  .option("--guardrail <rounds>", "Soft escalation after N rounds", "8")
  .option("--output <format>", "Output format (text or json)", "text")
  .option("--transcript <path>", "Save full transcript to path")
  .option("--resume <sessionId>", "Resume a paused session")
  .action(async (prompt: string, opts) => {
    // Validate credentials (Claude Code also works with active login session,
    // so only warn — don't hard-exit — if ANTHROPIC_API_KEY is missing)
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
      timeoutMs: 120_000,
      outputFormat: opts.output as "text" | "json",
    };

    const claude = new ClaudeAdapter(config.timeoutMs);
    const codex = new CodexAdapter(config.timeoutMs);
    const session = new SessionManager();

    const orchestrator = new Orchestrator(claude, codex, session, config);

    try {
      console.error(`Starting collaboration (${config.startWith} goes first)...\n`);
      const result = await orchestrator.run(prompt);

      if (config.outputFormat === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.summary);
      }
    } catch (err) {
      console.error("Collaboration failed:", (err as Error).message);
      process.exit(1);
    }
  });

program.parse();
```

- [ ] **Step 2: Build and verify CLI help**

```bash
npx tsc
node dist/index.js --help
```

Expected: Shows usage with all flags listed.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: CLI entry point with commander argument parsing"
```

---

### Task 9: Integration Test

**Files:**
- Test: `tests/integration/full-loop.test.ts`

- [ ] **Step 1: Write end-to-end test with mock adapters**

Create `tests/integration/full-loop.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "../../src/orchestrator.js";
import { SessionManager } from "../../src/session.js";
import type { AgentAdapter } from "../../src/adapters/agent-adapter.js";
import type { AgentResponse, ConversationContext, OrchestratorConfig } from "../../src/types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function createScriptedAdapter(name: "claude" | "codex", script: AgentResponse[]): AgentAdapter {
  let i = 0;
  return {
    name,
    send: vi.fn(async () => {
      const resp = script[i] ?? script[script.length - 1];
      i++;
      return resp;
    }),
  };
}

describe("Full collaboration loop", () => {
  const config: OrchestratorConfig = {
    startWith: "claude",
    workingDirectory: "/tmp",
    guardrailRounds: 6,
    timeoutMs: 120000,
    outputFormat: "text",
  };

  it("should run a full debate that converges after 4 turns", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "topg-int-"));
    const session = new SessionManager(tmpDir);

    const claude = createScriptedAdapter("claude", [
      { content: "I propose a REST API with Express.\n[CONVERGENCE: partial]", convergenceSignal: "partial" },
      { content: "Good point about type safety. REST API with Express + Zod validation.\n[CONVERGENCE: agree]", convergenceSignal: "agree" },
    ]);

    const codex = createScriptedAdapter("codex", [
      { content: "REST is fine, but add input validation with Zod.\n[CONVERGENCE: partial]", convergenceSignal: "partial" },
      { content: "I agree, Express + Zod is the right approach.\n[CONVERGENCE: agree]", convergenceSignal: "agree" },
    ]);

    const orch = new Orchestrator(claude, codex, session, config);
    const result = await orch.run("Design the API layer");

    expect(result.type).toBe("consensus");
    expect(result.rounds).toBe(4);
    expect(result.summary).toContain("[CONSENSUS");
    expect(result.messages).toHaveLength(4);

    // Verify session files were created
    const sessionId = result.messages[0].timestamp; // we need to get session ID differently
    // Just verify the session dir exists with at least one session
    const dirs = fs.readdirSync(tmpDir);
    expect(dirs.length).toBe(1);

    const sessionDir = path.join(tmpDir, dirs[0]);
    expect(fs.existsSync(path.join(sessionDir, "meta.json"))).toBe(true);
    expect(fs.existsSync(path.join(sessionDir, "transcript.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(sessionDir, "summary.md"))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should escalate and produce a disagreement report", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "topg-int-"));
    const session = new SessionManager(tmpDir);

    const claude = createScriptedAdapter("claude", [
      { content: "Use GraphQL.\n[CONVERGENCE: disagree]", convergenceSignal: "disagree" },
      // Escalation response:
      { content: "## What we agree on\n- Need an API\n## Where we disagree\n- I prefer GraphQL\n## My recommendation\n- GraphQL", convergenceSignal: "disagree" },
    ]);

    const codex = createScriptedAdapter("codex", [
      { content: "Use REST.\n[CONVERGENCE: disagree]", convergenceSignal: "disagree" },
      // Escalation response:
      { content: "## What we agree on\n- Need an API\n## Where we disagree\n- I prefer REST\n## My recommendation\n- REST", convergenceSignal: "disagree" },
    ]);

    const smallConfig = { ...config, guardrailRounds: 3 };
    const orch = new Orchestrator(claude, codex, session, smallConfig);
    const result = await orch.run("Design the API layer");

    expect(result.type).toBe("escalation");
    expect(result.summary).toContain("[ESCALATION");
    expect(result.summary).toContain("Claude");
    expect(result.summary).toContain("Codex");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/integration/full-loop.test.ts`
Expected: PASS

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add tests/integration/
git commit -m "test: end-to-end integration tests for full collaboration loop"
```

---

### Task 10: Claude Code Integration (Skill + CLAUDE.md)

**Files:**
- Create: `.claude/commands/collab.md` (Claude Code custom slash command)
- Modify: `CLAUDE.md` (add auto-detection prompt)

- [ ] **Step 1: Create the /collab slash command**

Create `.claude/commands/collab.md`:
```markdown
---
name: collab
description: Start an inter-agent collaboration between Claude Code and Codex
---

Run the topg CLI to start an autonomous collaboration session between Claude Code and Codex.

Usage: /collab <prompt>

Execute the following command with the user's prompt:

```bash
topg "<user's prompt>" --cwd "$(pwd)" --output text
```

Present the output to the user. If the result is an escalation (disagreement), help the user understand the disagreement and ask which direction they'd like to go.
```

- [ ] **Step 2: Add auto-detection guidance to CLAUDE.md**

Create or append to `CLAUDE.md`:
```markdown
## Inter-Agent Collaboration

When facing architectural decisions, complex debugging, or situations where a second opinion from a different AI model would add value, suggest running `/collab` with the relevant context. Examples of good triggers:

- Choosing between two viable architectural approaches
- Reviewing security-sensitive code
- Designing a public API surface
- Debugging a subtle issue after initial attempts fail

Do not suggest `/collab` for straightforward tasks, simple bug fixes, or questions with clear answers.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/collab.md CLAUDE.md
git commit -m "feat: Claude Code /collab command and auto-detection guidance"
```

---

### Task 11: Build & Link

- [ ] **Step 1: Run full test suite**

```bash
npm run test
```

Expected: ALL PASS.

- [ ] **Step 2: Build the project**

```bash
npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 3: Verify Codex SDK API shape**

```bash
node -e "const pkg = require('@openai/codex-sdk'); console.log(Object.keys(pkg))"
```

If the SDK API doesn't match `startThread()` / `thread.run()` / `.text`, update `src/adapters/codex-adapter.ts` and its test accordingly before proceeding.

- [ ] **Step 4: Link the CLI globally**

```bash
npm link
```

Expected: `topg` command is now available globally.

- [ ] **Step 5: Verify CLI works**

```bash
topg --help
```

Expected: Shows full help text with all flags.

- [ ] **Step 6: Commit any remaining files**

```bash
git add -A
git commit -m "chore: build artifacts and npm link setup"
```
