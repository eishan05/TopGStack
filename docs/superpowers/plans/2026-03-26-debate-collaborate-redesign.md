# TopGStack Debate + Collaborate Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure TopGStack from a monolithic debate CLI into two independent tools (`topg debate` and `topg collaborate`) sharing adapter infrastructure, then write skills for both.

**Architecture:** Clean rewrite with shared `src/core/` layer (adapters, session, types), independent `src/debate/` engine (moved from current orchestrator), and new `src/collaborate/` engine (session-based request-response lifecycle). CLI entry point exposes three subcommands: `debate`, `collaborate`, `session`.

**Tech Stack:** TypeScript, Commander.js, Node.js 22+, Vitest, `@openai/codex-sdk`, nanoid

**Spec:** `docs/superpowers/specs/2026-03-26-debate-collaborate-redesign.md`

---

## File Structure

### Files to Create

| Path | Responsibility |
|------|---------------|
| `src/core/types.ts` | Shared types: AgentName, SessionMeta, Message, Artifact, CodexConfig, etc. |
| `src/core/utils.ts` | Shared utilities: capitalize, parseDuration, askUser |
| `src/core/session.ts` | Generic session persistence with type filtering |
| `src/core/adapters/agent-adapter.ts` | AgentAdapter interface |
| `src/core/adapters/claude-adapter.ts` | Claude CLI adapter |
| `src/core/adapters/codex-adapter.ts` | Codex SDK adapter |
| `src/debate/types.ts` | DebateConfig, DebateResult, DebateMessageType |
| `src/debate/orchestrator.ts` | Turn-based debate loop |
| `src/debate/convergence.ts` | Convergence detection |
| `src/debate/prompts.ts` | Debate system prompts |
| `src/debate/formatter.ts` | Consensus/escalation formatting |
| `src/collaborate/types.ts` | CollaborateConfig, result types |
| `src/collaborate/manager.ts` | Session lifecycle: start/send/end/list |
| `src/collaborate/prompts.ts` | Collaboration system prompts |
| `src/index.ts` | CLI entry with debate/collaborate/session subcommands |
| `tests/core/session.test.ts` | Session manager tests with type filtering |
| `tests/debate/convergence.test.ts` | Convergence tests (moved) |
| `tests/debate/formatter.test.ts` | Formatter tests (moved) |
| `tests/collaborate/manager.test.ts` | Collaboration manager tests |
| `skill/debate/SKILL.md` | /debate skill |
| `skill/collaborate/SKILL.md` | /collaborate skill |
| `skill/collaborate/patterns.md` | Collaboration pattern recipes |

### Files to Delete

| Path | Reason |
|------|--------|
| `src/server.ts` | Dashboard removed |
| `src/web/` (entire directory) | Dashboard removed |
| `src/repl.ts` | REPL removed |
| `src/evals/` (entire directory) | Eval framework removed |
| `src/types.ts` | Replaced by `src/core/types.ts` |
| `src/utils.ts` | Replaced by `src/core/utils.ts` |
| `src/session.ts` | Replaced by `src/core/session.ts` |
| `src/convergence.ts` | Replaced by `src/debate/convergence.ts` |
| `src/prompts.ts` | Replaced by `src/debate/prompts.ts` |
| `src/formatter.ts` | Replaced by `src/debate/formatter.ts` |
| `src/orchestrator.ts` | Replaced by `src/debate/orchestrator.ts` |
| `src/adapters/` (entire directory) | Replaced by `src/core/adapters/` |
| `skill/SKILL.md` | Replaced by `skill/debate/SKILL.md` |
| `skill/config-reference.md` | Folded into new skill |
| `skill/session-management.md` | Folded into new skill |
| `skill/install.sh` | Replaced in new skill |
| `tests/server.test.ts` | Dashboard removed |
| `tests/server-debate.test.ts` | Dashboard removed |
| `tests/server-ws.test.ts` | Dashboard removed |
| `tests/repl.test.ts` | REPL removed |
| `tests/evals/` (entire directory) | Eval framework removed |
| `tests/integration/server-full.test.ts` | Dashboard removed |

---

## Task 1: Create `src/core/types.ts`

Extract shared types from `src/types.ts` into the new core module, adding `SessionType`, `SessionStatus`, and making `SessionMeta.config` opaque.

**Files:**
- Create: `src/core/types.ts`
- Reference: `src/types.ts` (current source)

- [ ] **Step 1: Create the core types file**

```typescript
// src/core/types.ts

export type AgentName = "claude" | "codex";

// --- Session types ---

export type SessionType = "debate" | "collaborate";
export type SessionStatus = "active" | "paused" | "completed" | "escalated" | "closed";

export interface SessionMeta {
  version: 1;
  sessionId: string;
  type: SessionType;
  status: SessionStatus;
  agent?: AgentName;
  prompt: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// --- Artifact types ---

export type ArtifactType = "code" | "diff" | "config";

export interface Artifact {
  path: string;
  content: string;
  type: ArtifactType;
}

// --- Tool activity tracking ---

export type ToolActivityType = "command_execution" | "file_change" | "mcp_tool_call" | "web_search";

export interface CommandActivity {
  type: "command_execution";
  command: string;
  output: string;
  exitCode?: number;
}

export interface FileChangeActivity {
  type: "file_change";
  changes: Array<{ path: string; kind: "add" | "delete" | "update" }>;
}

export interface McpCallActivity {
  type: "mcp_tool_call";
  server: string;
  tool: string;
  arguments: unknown;
  error?: string;
}

export interface WebSearchActivity {
  type: "web_search";
  query: string;
}

export type ToolActivity = CommandActivity | FileChangeActivity | McpCallActivity | WebSearchActivity;

// --- Codex configuration ---

export type SandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export type WebSearchMode = "disabled" | "cached" | "live";
export type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export type ApprovalMode = "never" | "on-request" | "on-failure" | "untrusted";

export interface CodexConfig {
  sandboxMode: SandboxMode;
  webSearchMode: WebSearchMode;
  networkAccessEnabled: boolean;
  model?: string;
  modelReasoningEffort?: ModelReasoningEffort;
  approvalPolicy: ApprovalMode;
  additionalDirectories?: string[];
}

export const DEFAULT_CODEX_CONFIG: CodexConfig = {
  sandboxMode: "workspace-write",
  webSearchMode: "live",
  networkAccessEnabled: true,
  approvalPolicy: "never",
};

// --- Convergence ---

export type ConvergenceSignal = "agree" | "disagree" | "partial" | "defer";

// --- Agent communication ---

export interface AgentResponse {
  content: string;
  artifacts?: Artifact[];
  toolActivities?: ToolActivity[];
  convergenceSignal?: ConvergenceSignal;
}

export interface Message {
  role: string;
  agent: AgentName;
  turn: number;
  type: string;
  content: string;
  artifacts?: Artifact[];
  toolActivities?: ToolActivity[];
  convergenceSignal?: ConvergenceSignal;
  timestamp: string;
}

export interface ConversationContext {
  sessionId: string;
  history: Message[];
  workingDirectory: string;
  systemPrompt: string;
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsc --noEmit src/core/types.ts --moduleResolution Node16 --module Node16 --target ES2022 --strict`
Expected: No errors (this file has no imports)

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat: add core shared types for debate + collaborate redesign"
```

---

## Task 2: Create `src/core/utils.ts`

Move utilities from `src/utils.ts` to `src/core/utils.ts`. No logic changes.

**Files:**
- Create: `src/core/utils.ts`
- Reference: `src/utils.ts`

- [ ] **Step 1: Create the core utils file**

```typescript
// src/core/utils.ts

import { createInterface } from "node:readline";

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseDuration(input: string): number {
  const match = input.match(/^(\d+)(d|w|m)$/);
  if (!match) {
    throw new Error(`Invalid duration "${input}". Use format: <number><d|w|m> (e.g., 7d, 2w, 1m)`);
  }
  const value = parseInt(match[1], 10);
  if (value === 0) {
    throw new Error(`Duration must be greater than zero: "${input}"`);
  }
  const unit = match[2];
  const MS_PER_DAY = 86400000;
  switch (unit) {
    case "d": return value * MS_PER_DAY;
    case "w": return value * 7 * MS_PER_DAY;
    case "m": return value * 30 * MS_PER_DAY;
    default: throw new Error(`Unknown duration unit: ${unit}`);
  }
}

export function askUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/utils.ts
git commit -m "feat: add core utils (capitalize, parseDuration, askUser)"
```

---

## Task 3: Create `src/core/adapters/`

Move adapter files from `src/adapters/` to `src/core/adapters/`. Update import paths to point to `../types.js` (now `../../core/types.js` relative path becomes `../types.js` since adapters are inside core).

**Files:**
- Create: `src/core/adapters/agent-adapter.ts`
- Create: `src/core/adapters/claude-adapter.ts`
- Create: `src/core/adapters/codex-adapter.ts`
- Reference: `src/adapters/agent-adapter.ts`, `src/adapters/claude-adapter.ts`, `src/adapters/codex-adapter.ts`

- [ ] **Step 1: Create agent-adapter.ts**

```typescript
// src/core/adapters/agent-adapter.ts

import type { AgentName, AgentResponse, ConversationContext } from "../types.js";

export interface AgentAdapter {
  name: AgentName;
  send(prompt: string, context: ConversationContext, signal?: AbortSignal): Promise<AgentResponse>;
}
```

- [ ] **Step 2: Create claude-adapter.ts**

Copy `src/adapters/claude-adapter.ts` to `src/core/adapters/claude-adapter.ts`. Update two imports:

```typescript
// src/core/adapters/claude-adapter.ts

import { spawn } from "node:child_process";
import { parseConvergenceTag } from "../../debate/convergence.js";
import type { AgentName, AgentResponse, ConversationContext } from "../types.js";
import type { AgentAdapter } from "./agent-adapter.js";

// ... rest of the file is identical to src/adapters/claude-adapter.ts
```

**Note:** The `parseConvergenceTag` import points to `../../debate/convergence.js`. This creates a dependency from core → debate. This is acceptable because convergence tag parsing is a string utility needed by both adapters. An alternative would be to extract `parseConvergenceTag` into `src/core/convergence-tag.ts`, but the function is tiny (3 lines) and only used by the adapters. Keep the cross-reference for now.

**Actually — better approach:** Extract just `parseConvergenceTag` (the regex + match) into a tiny core utility to avoid the circular dependency. Create `src/core/convergence-tag.ts`:

```typescript
// src/core/convergence-tag.ts

import type { ConvergenceSignal } from "./types.js";

const CONVERGENCE_TAG_RE = /\[CONVERGENCE:\s*(agree|disagree|partial|defer)\]/i;

export function parseConvergenceTag(content: string): ConvergenceSignal | null {
  const match = content.match(CONVERGENCE_TAG_RE);
  return match ? (match[1].toLowerCase() as ConvergenceSignal) : null;
}
```

Then `claude-adapter.ts` and `codex-adapter.ts` import from `../convergence-tag.js` instead:

```typescript
// src/core/adapters/claude-adapter.ts

import { spawn } from "node:child_process";
import { parseConvergenceTag } from "../convergence-tag.js";
import type { AgentName, AgentResponse, ConversationContext } from "../types.js";
import type { AgentAdapter } from "./agent-adapter.js";

export class ClaudeAdapter implements AgentAdapter {
  name: AgentName = "claude";
  private timeoutMs: number;
  private yolo: boolean;

  constructor(timeoutMs = 120_000, yolo = false) {
    this.timeoutMs = timeoutMs;
    this.yolo = yolo;
  }

  async send(prompt: string, context: ConversationContext, signal?: AbortSignal): Promise<AgentResponse> {
    const fullPrompt = prompt;

    return new Promise((resolve, reject) => {
      const args = ["-p", fullPrompt, "--output-format", "json"];
      if (this.yolo) {
        args.push("--dangerously-skip-permissions");
      }

      const proc = spawn("claude", args, {
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
        if (signal?.aborted) return;
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
}
```

- [ ] **Step 3: Create codex-adapter.ts**

Copy `src/adapters/codex-adapter.ts` to `src/core/adapters/codex-adapter.ts`. Update imports:

```typescript
// src/core/adapters/codex-adapter.ts

import { Codex } from "@openai/codex-sdk";
import type { ThreadOptions, ThreadItem } from "@openai/codex-sdk";
import { parseConvergenceTag } from "../convergence-tag.js";
import type {
  AgentName,
  AgentResponse,
  CodexConfig,
  ConversationContext,
  ToolActivity,
} from "../types.js";
import type { AgentAdapter } from "./agent-adapter.js";

// ... rest of the file (class and extractToolActivities function) is identical to src/adapters/codex-adapter.ts
```

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -20`
Expected: Errors only from old `src/` files that still import old paths (not from new `src/core/` files). Check that no errors reference `src/core/`.

- [ ] **Step 5: Commit**

```bash
git add src/core/adapters/ src/core/convergence-tag.ts
git commit -m "feat: add core adapters and convergence tag parser"
```

---

## Task 4: Create `src/core/session.ts`

Adapt `src/session.ts` to support the new `SessionType` field, optional `agent` field, and type-based filtering.

**Files:**
- Create: `src/core/session.ts`
- Test: `tests/core/session.test.ts`
- Reference: `src/session.ts`, `tests/session.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/core/session.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { SessionManager } from "../../src/core/session.js";
import type { SessionMeta, Message } from "../../src/core/types.js";

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

  const debateConfig = { startWith: "claude", guardrailRounds: 5 };
  const collabConfig = { with: "codex", timeoutMs: 120000 };

  it("should create a debate session with type field", () => {
    const session = manager.create("Design auth", "debate", debateConfig);
    expect(session.type).toBe("debate");
    expect(session.agent).toBeUndefined();
    expect(session.status).toBe("active");
  });

  it("should create a collaborate session with type and agent fields", () => {
    const session = manager.create("Review my code", "collaborate", collabConfig, "codex");
    expect(session.type).toBe("collaborate");
    expect(session.agent).toBe("codex");
    expect(session.status).toBe("active");
  });

  it("should persist type and agent to meta.json", () => {
    const session = manager.create("Review", "collaborate", collabConfig, "codex");
    const loaded = manager.load(session.sessionId);
    expect(loaded.meta.type).toBe("collaborate");
    expect(loaded.meta.agent).toBe("codex");
  });

  it("should filter sessions by type", () => {
    manager.create("Debate 1", "debate", debateConfig);
    manager.create("Collab 1", "collaborate", collabConfig, "codex");
    manager.create("Debate 2", "debate", debateConfig);

    const debates = manager.filterSessions({ type: "debate" });
    expect(debates).toHaveLength(2);
    expect(debates.every((s) => s.type === "debate")).toBe(true);

    const collabs = manager.filterSessions({ type: "collaborate" });
    expect(collabs).toHaveLength(1);
    expect(collabs[0].type).toBe("collaborate");
  });

  it("should filter by type and status combined", () => {
    const s1 = manager.create("Debate done", "debate", debateConfig);
    manager.create("Collab active", "collaborate", collabConfig, "codex");
    manager.updateStatus(s1.sessionId, "completed");

    const result = manager.filterSessions({ type: "debate", statuses: ["completed"] });
    expect(result).toHaveLength(1);
    expect(result[0].prompt).toBe("Debate done");
  });

  it("should treat sessions without type as debate (backwards compat)", () => {
    // Manually create a legacy session without type field
    const sessionId = "legacy-session";
    const dir = path.join(tmpDir, sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });
    fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({
      version: 1,
      sessionId,
      status: "completed",
      prompt: "Legacy debate",
      config: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    fs.writeFileSync(path.join(dir, "transcript.jsonl"), "");

    const loaded = manager.load(sessionId);
    expect(loaded.meta.type).toBe("debate");
  });

  it("should support 'closed' status for collaborate sessions", () => {
    const session = manager.create("Review", "collaborate", collabConfig, "codex");
    manager.updateStatus(session.sessionId, "closed");
    const loaded = manager.load(session.sessionId);
    expect(loaded.meta.status).toBe("closed");
  });

  it("should append and load messages", () => {
    const session = manager.create("Test", "collaborate", collabConfig, "codex");
    const msg: Message = {
      role: "caller",
      agent: "claude",
      turn: 1,
      type: "request",
      content: "Review this",
      timestamp: new Date().toISOString(),
    };
    manager.appendMessage(session.sessionId, msg);
    const loaded = manager.load(session.sessionId);
    expect(loaded.messages).toHaveLength(1);
    expect(loaded.messages[0].content).toBe("Review this");
  });

  it("should reject path traversal", () => {
    expect(() => manager.load("../../etc")).toThrow("Invalid session ID");
  });

  it("should delete a session", () => {
    const session = manager.create("Delete me", "debate", debateConfig);
    manager.deleteSession(session.sessionId);
    expect(() => manager.load(session.sessionId)).toThrow();
  });

  it("should list all sessions sorted by updatedAt desc", () => {
    manager.create("First", "debate", debateConfig);
    manager.create("Second", "collaborate", collabConfig, "codex");
    const sessions = manager.listSessions();
    expect(sessions).toHaveLength(2);
    // Most recent first
    expect(new Date(sessions[0].updatedAt).getTime())
      .toBeGreaterThanOrEqual(new Date(sessions[1].updatedAt).getTime());
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run tests/core/session.test.ts 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/core/session.ts`**

```typescript
// src/core/session.ts

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { nanoid } from "nanoid";
import type { AgentName, Message, SessionMeta, SessionStatus, SessionType } from "./types.js";

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
    const dir = path.join(this.baseDir, sessionId);
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(path.resolve(this.baseDir) + path.sep)) {
      throw new Error(`Invalid session ID: ${sessionId}`);
    }
    return resolved;
  }

  create(
    prompt: string,
    type: SessionType,
    config: Record<string, unknown>,
    agent?: AgentName
  ): SessionMeta {
    const sessionId = nanoid(12);
    const dir = this.sessionDir(sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "artifacts"), { recursive: true });

    const now = new Date().toISOString();
    const meta: SessionMeta = {
      version: 1,
      sessionId,
      type,
      status: "active",
      ...(agent ? { agent } : {}),
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

    // Backwards compatibility: sessions without type are debates
    if (!meta.type) {
      (meta as SessionMeta).type = "debate";
    }

    const transcriptPath = path.join(dir, "transcript.jsonl");
    const raw = fs.readFileSync(transcriptPath, "utf-8").trim();
    const messages: Message[] = raw
      ? raw.split("\n").map((line) => JSON.parse(line))
      : [];

    return { meta, messages };
  }

  updateStatus(sessionId: string, status: SessionStatus): void {
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

  updatePrompt(sessionId: string, prompt: string): void {
    const metaPath = path.join(this.sessionDir(sessionId), "meta.json");
    const meta: SessionMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    meta.prompt = prompt;
    meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }

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
        if (!meta.type) (meta as SessionMeta).type = "debate";
        sessions.push(meta);
      } catch {
        // skip corrupted sessions
      }
    }
    return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  deleteSession(sessionId: string): void {
    const dir = this.sessionDir(sessionId);
    if (!fs.existsSync(dir)) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  filterSessions(opts: {
    type?: SessionType;
    statuses?: SessionStatus[];
    olderThan?: Date;
  }): SessionMeta[] {
    return this.listSessions().filter((s) => {
      if (opts.type && s.type !== opts.type) return false;
      if (opts.statuses && !opts.statuses.includes(s.status)) return false;
      if (opts.olderThan && new Date(s.updatedAt) >= opts.olderThan) return false;
      return true;
    });
  }

  private touchUpdatedAt(sessionId: string): void {
    const metaPath = path.join(this.sessionDir(sessionId), "meta.json");
    const meta: SessionMeta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/core/session.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/core/session.ts tests/core/session.test.ts
git commit -m "feat: add core session manager with type filtering and backwards compat"
```

---

## Task 5: Create `src/debate/types.ts`

Debate-specific types.

**Files:**
- Create: `src/debate/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/debate/types.ts

import type { AgentName, CodexConfig, Message, Artifact } from "../core/types.js";

export type DebateMessageType = "code" | "review" | "debate" | "consensus" | "deadlock" | "user-prompt" | "user-guidance";

export interface DebateConfig {
  startWith: AgentName;
  workingDirectory: string;
  guardrailRounds: number;
  timeoutMs: number;
  outputFormat: "text" | "json";
  codex: CodexConfig;
  yolo?: boolean;
}

export interface DebateResult {
  type: "consensus" | "escalation";
  sessionId: string;
  rounds: number;
  summary: string;
  messages: Message[];
  artifacts?: Artifact[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/debate/types.ts
git commit -m "feat: add debate-specific types"
```

---

## Task 6: Move debate engine files

Move convergence, prompts, formatter, and orchestrator to `src/debate/`, updating import paths. This is a bulk move with surgical import edits.

**Files:**
- Create: `src/debate/convergence.ts` (from `src/convergence.ts`)
- Create: `src/debate/prompts.ts` (from `src/prompts.ts`)
- Create: `src/debate/formatter.ts` (from `src/formatter.ts`)
- Create: `src/debate/orchestrator.ts` (from `src/orchestrator.ts`)
- Move: `tests/convergence.test.ts` → `tests/debate/convergence.test.ts`
- Move: `tests/formatter.test.ts` → `tests/debate/formatter.test.ts`

- [ ] **Step 1: Create `src/debate/convergence.ts`**

Copy `src/convergence.ts` verbatim, update one import:

```typescript
// src/debate/convergence.ts
// Change: import type { Message, ConvergenceSignal } from "./types.js";
// To:
import type { Message, ConvergenceSignal } from "../core/types.js";

// Rest of the file is identical — all functions (parseConvergenceTag, detectConvergence, checkDiffStability) unchanged.
// NOTE: parseConvergenceTag is duplicated here and in src/core/convergence-tag.ts.
// The debate version re-exports it. The core version is for adapters only.
// Keep both — they serve different dependency paths.
```

Copy the entire contents of `src/convergence.ts`, replacing only the import line.

- [ ] **Step 2: Create `src/debate/prompts.ts`**

Copy `src/prompts.ts` verbatim, update imports:

```typescript
// src/debate/prompts.ts
// Change: import type { AgentName } from "./types.js";
// To:
import type { AgentName } from "../core/types.js";

// Change: import type { Message } from "./types.js";
// To:
import type { Message } from "../core/types.js";

// Rest of the file is identical.
```

- [ ] **Step 3: Create `src/debate/formatter.ts`**

Copy `src/formatter.ts` verbatim, update imports:

```typescript
// src/debate/formatter.ts
// Change: import type { Message, Artifact, ToolActivity } from "./types.js";
// To:
import type { Message, Artifact, ToolActivity } from "../core/types.js";

// Change: import { capitalize } from "./utils.js";
// To:
import { capitalize } from "../core/utils.js";

// Rest of the file is identical.
```

- [ ] **Step 4: Create `src/debate/orchestrator.ts`**

Copy `src/orchestrator.ts`, update all imports:

```typescript
// src/debate/orchestrator.ts

import type { AgentAdapter } from "../core/adapters/agent-adapter.js";
import type { Message, AgentName } from "../core/types.js";
import type { DebateConfig, DebateResult } from "./types.js";
import { detectConvergence, checkDiffStability } from "./convergence.js";
import { initiatorPrompt, reviewerPrompt, rebuttalPrompt, escalationPrompt, userGuidancePrompt, formatTurnPrompt, synthesisPrompt } from "./prompts.js";
import { formatConsensus, formatEscalation } from "./formatter.js";
import { SessionManager } from "../core/session.js";
import { capitalize } from "../core/utils.js";

// Type rename: OrchestratorConfig → DebateConfig, OrchestratorResult → DebateResult
// Session creation: change `this.session.create(userPrompt, this.config)` to
//   `this.session.create(userPrompt, "debate", this.config as unknown as Record<string, unknown>)`
// All other logic is unchanged.
```

The class stays named `Orchestrator`. The constructor signature changes from `config: OrchestratorConfig` to `config: DebateConfig`. Return types change from `OrchestratorResult` to `DebateResult`. The `session.create()` call adds `"debate"` as the type parameter.

- [ ] **Step 5: Move and update tests**

Move `tests/convergence.test.ts` to `tests/debate/convergence.test.ts`. Update imports:

```typescript
// tests/debate/convergence.test.ts
// Change: import { detectConvergence, parseConvergenceTag, checkDiffStability } from "../src/convergence.js";
// To:
import { detectConvergence, parseConvergenceTag, checkDiffStability } from "../../src/debate/convergence.js";

// Change: import type { Message } from "../src/types.js";
// To:
import type { Message } from "../../src/core/types.js";
```

Move `tests/formatter.test.ts` to `tests/debate/formatter.test.ts`. Update imports similarly.

- [ ] **Step 6: Run moved tests**

Run: `npx vitest run tests/debate/`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/debate/ tests/debate/
git commit -m "feat: move debate engine (orchestrator, convergence, prompts, formatter) to src/debate/"
```

---

## Task 7: Create `src/collaborate/types.ts`

**Files:**
- Create: `src/collaborate/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// src/collaborate/types.ts

import type { AgentName, CodexConfig, Artifact } from "../core/types.js";

export interface CollaborateConfig {
  with: AgentName;
  workingDirectory: string;
  timeoutMs: number;
  outputFormat: "text" | "json";
  codex: CodexConfig;
  yolo?: boolean;
}

export interface CollaborateStartResult {
  sessionId: string;
  agent: AgentName;
  response: string;
  artifacts?: Artifact[];
}

export interface CollaborateSendResult {
  sessionId: string;
  response: string;
  artifacts?: Artifact[];
}

export interface CollaborateEndResult {
  sessionId: string;
  status: "closed";
  messageCount: number;
}

export interface CollaborateListItem {
  sessionId: string;
  agent: AgentName;
  status: string;
  createdAt: string;
  lastMessageAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/collaborate/types.ts
git commit -m "feat: add collaborate types"
```

---

## Task 8: Create `src/collaborate/prompts.ts`

**Files:**
- Create: `src/collaborate/prompts.ts`

- [ ] **Step 1: Create the prompts file**

```typescript
// src/collaborate/prompts.ts

import type { AgentName, Message } from "../core/types.js";

export function collaboratorSystemPrompt(callerAgent: AgentName): string {
  return `You are collaborating with ${callerAgent}. You are being consulted as a peer — not a subordinate.

Instructions:
- Provide your honest assessment. If you disagree with the caller's approach, say so clearly.
- Be specific: reference file paths, line numbers, code snippets when relevant.
- If asked to review code, evaluate correctness, completeness, and quality.
- If asked for design input, consider trade-offs and alternatives.
- If asked to validate, check assumptions and edge cases.
- Do not be deferential — you were consulted because a second perspective has value.
- Keep responses focused and actionable.`;
}

export function formatCollaboratePrompt(
  systemPrompt: string,
  messages: Message[],
  newMessage: string
): string {
  let prompt = systemPrompt + "\n\n";

  if (messages.length > 0) {
    prompt += "## Conversation So Far\n\n";
    for (const msg of messages) {
      const label = msg.role === "caller" ? "Caller" : "You";
      prompt += `### ${label} (turn ${msg.turn})\n\n${msg.content}\n\n`;
    }
  }

  prompt += `## New Message from Caller\n\n${newMessage}\n\n`;
  prompt += "## Your Response\n\n";
  return prompt;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/collaborate/prompts.ts
git commit -m "feat: add collaborate prompts"
```

---

## Task 9: Create `src/collaborate/manager.ts` with tests

The collaboration manager — the core new functionality.

**Files:**
- Create: `src/collaborate/manager.ts`
- Test: `tests/collaborate/manager.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/collaborate/manager.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { CollaborationManager } from "../../src/collaborate/manager.js";
import { SessionManager } from "../../src/core/session.js";
import type { AgentAdapter } from "../../src/core/adapters/agent-adapter.js";
import type { AgentResponse, ConversationContext } from "../../src/core/types.js";
import type { CollaborateConfig } from "../../src/collaborate/types.js";

function createMockAdapter(response: string): AgentAdapter {
  return {
    name: "codex",
    send: vi.fn().mockResolvedValue({
      content: response,
      artifacts: undefined,
      toolActivities: undefined,
      convergenceSignal: undefined,
    } satisfies AgentResponse),
  };
}

describe("CollaborationManager", () => {
  let tmpDir: string;
  let sessionManager: SessionManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "topg-collab-test-"));
    sessionManager = new SessionManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const baseConfig: CollaborateConfig = {
    with: "codex",
    workingDirectory: "/tmp",
    timeoutMs: 120000,
    outputFormat: "json",
    codex: {
      sandboxMode: "read-only",
      webSearchMode: "live",
      networkAccessEnabled: true,
      approvalPolicy: "never",
    },
  };

  describe("start", () => {
    it("should create a session and return the collaborator response", async () => {
      const adapter = createMockAdapter("I see a potential issue on line 42.");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);

      const result = await manager.start("Review my auth module");

      expect(result.sessionId).toBeTruthy();
      expect(result.agent).toBe("codex");
      expect(result.response).toBe("I see a potential issue on line 42.");
    });

    it("should persist the session as type collaborate", async () => {
      const adapter = createMockAdapter("Looks good.");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);

      const result = await manager.start("Check this");
      const loaded = sessionManager.load(result.sessionId);

      expect(loaded.meta.type).toBe("collaborate");
      expect(loaded.meta.agent).toBe("codex");
      expect(loaded.messages).toHaveLength(2); // caller msg + collaborator response
    });

    it("should send the prompt to the adapter", async () => {
      const adapter = createMockAdapter("Response");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);

      await manager.start("Review this code");

      expect(adapter.send).toHaveBeenCalledTimes(1);
      const sentPrompt = (adapter.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(sentPrompt).toContain("Review this code");
    });
  });

  describe("send", () => {
    it("should send a follow-up message and return response", async () => {
      const adapter = createMockAdapter("Initial review done.");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);
      const { sessionId } = await manager.start("Review this");

      // Update mock for the second call
      (adapter.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        content: "Re-reviewed. Looks clean now.",
      });

      const result = await manager.send(sessionId, "I fixed the issues. Re-review?");
      expect(result.response).toBe("Re-reviewed. Looks clean now.");
      expect(result.sessionId).toBe(sessionId);
    });

    it("should include conversation history in the prompt", async () => {
      const adapter = createMockAdapter("Found bugs.");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);
      const { sessionId } = await manager.start("Review");

      (adapter.send as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        content: "Clean.",
      });

      await manager.send(sessionId, "Fixed. Re-review?");

      const secondCall = (adapter.send as ReturnType<typeof vi.fn>).mock.calls[1];
      const sentPrompt = secondCall[0] as string;
      expect(sentPrompt).toContain("Found bugs.");
      expect(sentPrompt).toContain("Fixed. Re-review?");
    });

    it("should throw if session is not active", async () => {
      const adapter = createMockAdapter("Done.");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);
      const { sessionId } = await manager.start("Review");
      await manager.end(sessionId);

      await expect(manager.send(sessionId, "More?"))
        .rejects.toThrow("Session is not active");
    });

    it("should throw if session is not a collaborate session", async () => {
      // Create a debate session directly
      const debateSession = sessionManager.create("Debate", "debate", {});
      const adapter = createMockAdapter("Response");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);

      await expect(manager.send(debateSession.sessionId, "Hello"))
        .rejects.toThrow("not a collaborate session");
    });
  });

  describe("end", () => {
    it("should close the session and return message count", async () => {
      const adapter = createMockAdapter("Review done.");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);
      const { sessionId } = await manager.start("Review");

      const result = await manager.end(sessionId);
      expect(result.status).toBe("closed");
      expect(result.messageCount).toBe(2); // caller + collaborator from start
    });

    it("should set session status to closed", async () => {
      const adapter = createMockAdapter("Done.");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);
      const { sessionId } = await manager.start("Review");
      await manager.end(sessionId);

      const loaded = sessionManager.load(sessionId);
      expect(loaded.meta.status).toBe("closed");
    });
  });

  describe("list", () => {
    it("should only list collaborate sessions", async () => {
      const adapter = createMockAdapter("Response");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);
      await manager.start("Collab 1");
      sessionManager.create("Debate 1", "debate", {});

      const list = await manager.list();
      expect(list).toHaveLength(1);
      expect(list[0].agent).toBe("codex");
    });

    it("should filter to active only", async () => {
      const adapter = createMockAdapter("Response");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);
      const { sessionId: s1 } = await manager.start("Active");
      const { sessionId: s2 } = await manager.start("Will close");
      await manager.end(s2);

      const active = await manager.list(true);
      expect(active).toHaveLength(1);
      expect(active[0].sessionId).toBe(s1);
    });
  });

  describe("resolveSessionId", () => {
    it("should return --last as the most recent collaborate session", async () => {
      const adapter = createMockAdapter("Response");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);
      await manager.start("First");
      const { sessionId: latest } = await manager.start("Second");

      const resolved = manager.resolveSessionId("--last");
      expect(resolved).toBe(latest);
    });

    it("should pass through a normal session ID", () => {
      const adapter = createMockAdapter("Response");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);
      expect(manager.resolveSessionId("abc123")).toBe("abc123");
    });

    it("should throw if --last but no collaborate sessions exist", () => {
      const adapter = createMockAdapter("Response");
      const manager = new CollaborationManager(adapter, sessionManager, baseConfig);
      expect(() => manager.resolveSessionId("--last"))
        .toThrow("No collaboration sessions found");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/collaborate/manager.test.ts 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `src/collaborate/manager.ts`**

```typescript
// src/collaborate/manager.ts

import type { AgentAdapter } from "../core/adapters/agent-adapter.js";
import { SessionManager } from "../core/session.js";
import type { AgentName, Message } from "../core/types.js";
import type {
  CollaborateConfig,
  CollaborateStartResult,
  CollaborateSendResult,
  CollaborateEndResult,
  CollaborateListItem,
} from "./types.js";
import { collaboratorSystemPrompt, formatCollaboratePrompt } from "./prompts.js";

export class CollaborationManager {
  private adapter: AgentAdapter;
  private session: SessionManager;
  private config: CollaborateConfig;

  constructor(adapter: AgentAdapter, session: SessionManager, config: CollaborateConfig) {
    this.adapter = adapter;
    this.session = session;
    this.config = config;
  }

  async start(prompt: string): Promise<CollaborateStartResult> {
    const callerAgent: AgentName = this.config.with === "codex" ? "claude" : "codex";
    const meta = this.session.create(
      prompt,
      "collaborate",
      this.config as unknown as Record<string, unknown>,
      this.config.with
    );

    const systemPrompt = collaboratorSystemPrompt(callerAgent);
    const fullPrompt = formatCollaboratePrompt(systemPrompt, [], prompt);

    // Record caller message
    const callerMsg: Message = {
      role: "caller",
      agent: callerAgent,
      turn: 1,
      type: "request",
      content: prompt,
      timestamp: new Date().toISOString(),
    };
    this.session.appendMessage(meta.sessionId, callerMsg);

    // Send to collaborator
    const response = await this.adapter.send(fullPrompt, {
      sessionId: meta.sessionId,
      history: [callerMsg],
      workingDirectory: this.config.workingDirectory,
      systemPrompt,
    });

    // Record collaborator response
    const collabMsg: Message = {
      role: "collaborator",
      agent: this.config.with,
      turn: 1,
      type: "response",
      content: response.content,
      artifacts: response.artifacts,
      toolActivities: response.toolActivities,
      timestamp: new Date().toISOString(),
    };
    this.session.appendMessage(meta.sessionId, collabMsg);

    return {
      sessionId: meta.sessionId,
      agent: this.config.with,
      response: response.content,
      artifacts: response.artifacts,
    };
  }

  async send(sessionId: string, message: string): Promise<CollaborateSendResult> {
    const { meta, messages } = this.session.load(sessionId);

    if (meta.type !== "collaborate") {
      throw new Error(`Session ${sessionId} is not a collaborate session`);
    }
    if (meta.status !== "active") {
      throw new Error(`Session ${sessionId} is not active (status: ${meta.status})`);
    }

    const callerAgent: AgentName = this.config.with === "codex" ? "claude" : "codex";
    const turn = Math.max(...messages.map((m) => m.turn), 0) + 1;

    // Record caller message
    const callerMsg: Message = {
      role: "caller",
      agent: callerAgent,
      turn,
      type: "request",
      content: message,
      timestamp: new Date().toISOString(),
    };
    this.session.appendMessage(sessionId, callerMsg);

    const systemPrompt = collaboratorSystemPrompt(callerAgent);
    const fullPrompt = formatCollaboratePrompt(systemPrompt, [...messages, callerMsg], message);

    const response = await this.adapter.send(fullPrompt, {
      sessionId,
      history: [...messages, callerMsg],
      workingDirectory: this.config.workingDirectory,
      systemPrompt,
    });

    const collabMsg: Message = {
      role: "collaborator",
      agent: this.config.with,
      turn,
      type: "response",
      content: response.content,
      artifacts: response.artifacts,
      toolActivities: response.toolActivities,
      timestamp: new Date().toISOString(),
    };
    this.session.appendMessage(sessionId, collabMsg);

    return {
      sessionId,
      response: response.content,
      artifacts: response.artifacts,
    };
  }

  async end(sessionId: string): Promise<CollaborateEndResult> {
    const { meta, messages } = this.session.load(sessionId);
    this.session.updateStatus(sessionId, "closed");
    return {
      sessionId,
      status: "closed",
      messageCount: messages.length,
    };
  }

  async list(activeOnly?: boolean): Promise<CollaborateListItem[]> {
    const sessions = this.session.filterSessions({
      type: "collaborate",
      ...(activeOnly ? { statuses: ["active"] } : {}),
    });

    return sessions.map((s) => ({
      sessionId: s.sessionId,
      agent: s.agent!,
      status: s.status,
      createdAt: s.createdAt,
      lastMessageAt: s.updatedAt,
    }));
  }

  resolveSessionId(sessionIdOrLast: string): string {
    if (sessionIdOrLast === "--last") {
      const sessions = this.session.filterSessions({ type: "collaborate" });
      if (sessions.length === 0) {
        throw new Error("No collaboration sessions found");
      }
      return sessions[0].sessionId; // Already sorted by updatedAt desc
    }
    return sessionIdOrLast;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/collaborate/manager.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/collaborate/manager.ts tests/collaborate/manager.test.ts
git commit -m "feat: add collaboration manager with session lifecycle"
```

---

## Task 10: Create `src/index.ts` — new CLI entry point

Replace the current monolithic CLI with three subcommands: `debate`, `collaborate`, `session`.

**Files:**
- Create: `src/index.ts` (overwrite current)
- Reference: Current `src/index.ts` for debate/session logic patterns

- [ ] **Step 1: Write the new CLI entry point**

```typescript
#!/usr/bin/env node

// src/index.ts

import { Command } from "commander";
import { Orchestrator } from "./debate/orchestrator.js";
import { ClaudeAdapter } from "./core/adapters/claude-adapter.js";
import { CodexAdapter } from "./core/adapters/codex-adapter.js";
import { SessionManager } from "./core/session.js";
import { CollaborationManager } from "./collaborate/manager.js";
import { askUser, parseDuration } from "./core/utils.js";
import type { AgentName, CodexConfig } from "./core/types.js";
import type { DebateConfig } from "./debate/types.js";
import type { CollaborateConfig } from "./collaborate/types.js";

const program = new Command();

program
  .name("topg")
  .description("Inter-agent collaboration between Claude Code and OpenAI Codex")
  .version("2.0.0");

// ─── topg debate ───────────────────────────────────────────────────────────

const debate = program
  .command("debate [prompt]")
  .description("Dispatch a turn-based debate between Claude and Codex")
  .option("--start-with <agent>", "Which agent goes first (claude or codex)", "claude")
  .option("--cwd <path>", "Working directory for agents", process.cwd())
  .option("--guardrail <rounds>", "Soft escalation after N rounds", "5")
  .option("--timeout <seconds>", "Timeout per agent turn in seconds", "900")
  .option("--output <format>", "Output format (text or json)", "text")
  .option("--resume <sessionId>", "Resume a paused debate with guidance")
  .option("--codex-sandbox <mode>", "Codex sandbox mode", "workspace-write")
  .option("--codex-web-search <mode>", "Codex web search mode", "live")
  .option("--codex-network", "Enable network access for Codex", true)
  .option("--no-codex-network", "Disable network access for Codex")
  .option("--codex-model <model>", "Override model for Codex agent")
  .option("--codex-reasoning <effort>", "Codex reasoning effort")
  .option("--yolo", "Skip all permission checks")
  .action(async (prompt: string | undefined, opts) => {
    if (!prompt && !opts.resume) {
      debate.help();
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error("Error: OPENAI_API_KEY is required for Codex.");
      process.exit(1);
    }

    const codexCfg: CodexConfig = {
      sandboxMode: opts.codexSandbox as CodexConfig["sandboxMode"],
      webSearchMode: opts.codexWebSearch as CodexConfig["webSearchMode"],
      networkAccessEnabled: !!opts.codexNetwork,
      approvalPolicy: "never",
      model: opts.codexModel,
      modelReasoningEffort: opts.codexReasoning as CodexConfig["modelReasoningEffort"],
    };

    const yolo = !!opts.yolo;
    const config: DebateConfig = {
      startWith: opts.startWith as AgentName,
      workingDirectory: opts.cwd,
      guardrailRounds: parseInt(opts.guardrail, 10),
      timeoutMs: parseInt(opts.timeout, 10) * 1000,
      outputFormat: opts.output as "text" | "json",
      codex: codexCfg,
      yolo,
    };

    if (yolo) {
      console.error("WARNING: --yolo mode enabled. All permission checks are disabled.");
    }

    const claude = new ClaudeAdapter(config.timeoutMs, yolo);
    const codex = new CodexAdapter(config.timeoutMs, config.codex, yolo);
    const session = new SessionManager();

    if (opts.resume) {
      try {
        const loaded = session.load(opts.resume as string);
        if (loaded.meta.config && typeof loaded.meta.config === "object" && "codex" in loaded.meta.config) {
          codex.updateConfig(loaded.meta.config.codex as Partial<CodexConfig>);
        }
        if (yolo) {
          codex.updateConfig({
            sandboxMode: "danger-full-access",
            approvalPolicy: "never",
            networkAccessEnabled: true,
          });
        }
      } catch (err) {
        console.error(`Failed to load session: ${(err as Error).message}`);
        process.exit(1);
      }
    }

    const orchestrator = new Orchestrator(claude, codex, session, config, {
      onTurnStart: (turn, agent, role) => {
        const label = agent.charAt(0).toUpperCase() + agent.slice(1);
        console.error(`[Turn ${turn}] ${label} (${role}): responding...`);
      },
    });

    try {
      let result;
      if (opts.resume && prompt) {
        console.error(`Resuming session: ${opts.resume}`);
        result = await orchestrator.resume(opts.resume as string, prompt);
      } else {
        console.error(`Starting debate (${config.startWith} goes first)...`);
        result = await orchestrator.run(prompt!);
        console.error(`Session ID: ${result.sessionId}`);
        console.error(`Resume with: topg debate --resume ${result.sessionId} "your guidance"\n`);
      }

      while (true) {
        if (config.outputFormat === "json") {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.summary);
        }

        if (result.type === "consensus") break;

        console.error(`\nResume later with: topg debate --resume ${result.sessionId} "your guidance"`);
        const guidance = await askUser("\nYour guidance (or 'q' to quit): ");
        if (!guidance || guidance.toLowerCase() === "q") break;

        console.error(`\nResuming with your guidance...\n`);
        result = await orchestrator.continueWithGuidance(result, guidance, result.sessionId);
      }
    } catch (err) {
      console.error("Debate failed:", (err as Error).message);
      process.exit(1);
    }
  });

// ─── topg collaborate ──────────────────────────────────────────────────────

const collaborate = program.command("collaborate").description("Session-based collaboration with another agent");

collaborate
  .command("start <prompt>")
  .description("Start a new collaboration session")
  .requiredOption("--with <agent>", "Agent to collaborate with (claude or codex)")
  .option("--cwd <path>", "Working directory", process.cwd())
  .option("--output <format>", "Output format (text or json)", "json")
  .option("--timeout <seconds>", "Timeout per turn in seconds", "900")
  .option("--codex-sandbox <mode>", "Codex sandbox mode", "read-only")
  .option("--codex-web-search <mode>", "Codex web search mode", "live")
  .option("--codex-reasoning <effort>", "Codex reasoning effort")
  .option("--yolo", "Skip all permission checks")
  .action(async (prompt: string, opts) => {
    if (!process.env.OPENAI_API_KEY && opts.with === "codex") {
      console.error("Error: OPENAI_API_KEY is required for Codex.");
      process.exit(1);
    }

    const yolo = !!opts.yolo;
    const codexCfg: CodexConfig = {
      sandboxMode: opts.codexSandbox as CodexConfig["sandboxMode"],
      webSearchMode: opts.codexWebSearch as CodexConfig["webSearchMode"],
      networkAccessEnabled: true,
      approvalPolicy: "never",
      modelReasoningEffort: opts.codexReasoning as CodexConfig["modelReasoningEffort"],
    };

    const config: CollaborateConfig = {
      with: opts.with as AgentName,
      workingDirectory: opts.cwd,
      timeoutMs: parseInt(opts.timeout, 10) * 1000,
      outputFormat: opts.output as "text" | "json",
      codex: codexCfg,
      yolo,
    };

    const adapter = opts.with === "codex"
      ? new CodexAdapter(config.timeoutMs, config.codex, yolo)
      : new ClaudeAdapter(config.timeoutMs, yolo);
    const session = new SessionManager();
    const manager = new CollaborationManager(adapter, session, config);

    try {
      const result = await manager.start(prompt);
      if (config.outputFormat === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Session: ${result.sessionId}\nAgent: ${result.agent}\n\n${result.response}`);
      }
    } catch (err) {
      console.error("Collaboration start failed:", (err as Error).message);
      process.exit(1);
    }
  });

collaborate
  .command("send <sessionIdOrLast> <message>")
  .description("Send a follow-up message to an active collaboration session")
  .option("--output <format>", "Output format (text or json)", "json")
  .action(async (sessionIdOrLast: string, message: string, opts) => {
    const session = new SessionManager();
    // We need to load the session to reconstruct the config and adapter
    // Use a temporary manager just for resolveSessionId, then rebuild
    const tempConfig: CollaborateConfig = {
      with: "codex", // placeholder, will be overridden
      workingDirectory: process.cwd(),
      timeoutMs: 900000,
      outputFormat: opts.output as "text" | "json",
      codex: { sandboxMode: "read-only", webSearchMode: "live", networkAccessEnabled: true, approvalPolicy: "never" },
    };

    // Resolve --last
    const resolvedId = sessionIdOrLast === "--last"
      ? session.filterSessions({ type: "collaborate" })?.[0]?.sessionId
      : sessionIdOrLast;

    if (!resolvedId) {
      console.error("Error: No collaboration sessions found.");
      process.exit(1);
    }

    // Load session to get the agent and config
    const { meta } = session.load(resolvedId);
    if (meta.type !== "collaborate") {
      console.error(`Error: Session ${resolvedId} is not a collaborate session.`);
      process.exit(1);
    }

    const agentName = meta.agent as AgentName;
    const savedConfig = meta.config as unknown as CollaborateConfig;
    const yolo = savedConfig.yolo ?? false;

    const config: CollaborateConfig = {
      with: agentName,
      workingDirectory: savedConfig.workingDirectory ?? process.cwd(),
      timeoutMs: savedConfig.timeoutMs ?? 900000,
      outputFormat: opts.output as "text" | "json",
      codex: savedConfig.codex ?? tempConfig.codex,
      yolo,
    };

    const adapter = agentName === "codex"
      ? new CodexAdapter(config.timeoutMs, config.codex, yolo)
      : new ClaudeAdapter(config.timeoutMs, yolo);
    const manager = new CollaborationManager(adapter, session, config);

    try {
      const result = await manager.send(resolvedId, message);
      if (config.outputFormat === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.response);
      }
    } catch (err) {
      console.error("Collaboration send failed:", (err as Error).message);
      process.exit(1);
    }
  });

collaborate
  .command("end <sessionIdOrLast>")
  .description("Close a collaboration session")
  .option("--output <format>", "Output format (text or json)", "json")
  .action(async (sessionIdOrLast: string, opts) => {
    const session = new SessionManager();

    const resolvedId = sessionIdOrLast === "--last"
      ? session.filterSessions({ type: "collaborate" })?.[0]?.sessionId
      : sessionIdOrLast;

    if (!resolvedId) {
      console.error("Error: No collaboration sessions found.");
      process.exit(1);
    }

    const { meta } = session.load(resolvedId);
    const config: CollaborateConfig = {
      with: (meta.agent ?? "codex") as AgentName,
      workingDirectory: process.cwd(),
      timeoutMs: 900000,
      outputFormat: opts.output as "text" | "json",
      codex: { sandboxMode: "read-only", webSearchMode: "live", networkAccessEnabled: true, approvalPolicy: "never" },
    };

    // Adapter is not used for end, but CollaborationManager requires one
    const adapter = config.with === "codex"
      ? new CodexAdapter(config.timeoutMs, config.codex, false)
      : new ClaudeAdapter(config.timeoutMs, false);
    const manager = new CollaborationManager(adapter, session, config);

    try {
      const result = await manager.end(resolvedId);
      if (config.outputFormat === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Session ${result.sessionId} closed. ${result.messageCount} messages.`);
      }
    } catch (err) {
      console.error("Collaboration end failed:", (err as Error).message);
      process.exit(1);
    }
  });

collaborate
  .command("list")
  .description("List collaboration sessions")
  .option("--active", "Only show active sessions")
  .option("--output <format>", "Output format (text or json)", "json")
  .action(async (opts) => {
    const session = new SessionManager();
    const config: CollaborateConfig = {
      with: "codex",
      workingDirectory: process.cwd(),
      timeoutMs: 900000,
      outputFormat: opts.output as "text" | "json",
      codex: { sandboxMode: "read-only", webSearchMode: "live", networkAccessEnabled: true, approvalPolicy: "never" },
    };

    const adapter = new CodexAdapter(config.timeoutMs, config.codex, false);
    const manager = new CollaborationManager(adapter, session, config);

    const list = await manager.list(!!opts.active);

    if (config.outputFormat === "json") {
      console.log(JSON.stringify({ sessions: list }, null, 2));
    } else {
      if (list.length === 0) {
        console.log("No collaboration sessions found.");
      } else {
        for (const s of list) {
          console.log(`${s.sessionId}  ${s.agent}  ${s.status}  ${s.lastMessageAt}`);
        }
      }
    }
  });

// ─── topg session ──────────────────────────────────────────────────────────

const sessionCmd = program.command("session").description("Manage sessions (debate and collaborate)");

sessionCmd
  .command("delete <sessionId>")
  .description("Delete a single session")
  .action(async (sessionId: string) => {
    const session = new SessionManager();
    try {
      const data = session.load(sessionId);
      const snippet = data.meta.prompt.length > 50
        ? data.meta.prompt.slice(0, 50) + "..."
        : data.meta.prompt;
      session.deleteSession(sessionId);
      console.error(`Deleted session ${sessionId} ("${snippet}")`);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

sessionCmd
  .command("clear")
  .description("Bulk-delete sessions")
  .option("--all", "Delete all sessions")
  .option("--completed", "Delete completed sessions")
  .option("--escalated", "Delete escalated sessions")
  .option("--older-than <duration>", "Only sessions not updated within duration")
  .option("--force", "Skip confirmation prompt")
  .action(async (opts) => {
    if (!opts.all && !opts.completed && !opts.escalated && !opts.olderThan) {
      console.error("Error: At least one filter required (--all, --completed, --escalated, --older-than).");
      process.exit(1);
    }
    if (opts.all && (opts.completed || opts.escalated || opts.olderThan)) {
      console.error("Error: --all cannot be combined with other filters.");
      process.exit(1);
    }

    const session = new SessionManager();
    let sessions;
    if (opts.all) {
      sessions = session.listSessions();
    } else {
      const statuses: Array<"completed" | "escalated"> = [];
      if (opts.completed) statuses.push("completed");
      if (opts.escalated) statuses.push("escalated");
      let olderThan: Date | undefined;
      if (opts.olderThan) {
        olderThan = new Date(Date.now() - parseDuration(opts.olderThan));
      }
      sessions = session.filterSessions({ statuses: statuses.length > 0 ? statuses : undefined, olderThan });
    }

    if (sessions.length === 0) {
      console.error("No sessions match the given filters.");
      return;
    }

    if (!opts.force) {
      console.error(`About to delete ${sessions.length} session(s).`);
      const answer = await askUser("Continue? (y/N) ");
      if (answer.toLowerCase() !== "y") {
        console.error("Aborted.");
        return;
      }
    }

    for (const s of sessions) {
      session.deleteSession(s.sessionId);
    }
    console.error(`Deleted ${sessions.length} session(s).`);
  });

sessionCmd
  .command("list")
  .description("List all sessions")
  .option("--output <format>", "Output format (text or json)", "text")
  .action(async (opts) => {
    const session = new SessionManager();
    const sessions = session.listSessions();
    if (opts.output === "json") {
      console.log(JSON.stringify({ sessions }, null, 2));
    } else {
      if (sessions.length === 0) {
        console.log("No sessions.");
      } else {
        for (const s of sessions) {
          const snippet = s.prompt.length > 40 ? s.prompt.slice(0, 40) + "..." : s.prompt;
          console.log(`${s.sessionId}  ${s.type}  ${s.status}  "${snippet}"`);
        }
      }
    }
  });

program.parse();
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep "src/index.ts" | head -5`
Expected: No errors from `src/index.ts` (old files may still have errors — those will be cleaned up in the next task).

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: new CLI entry point with debate, collaborate, and session subcommands"
```

---

## Task 11: Delete old files and clean up

Remove all obsolete files and directories.

**Files to delete:**
- `src/server.ts`, `src/web/` (dashboard)
- `src/repl.ts` (REPL)
- `src/evals/` (eval framework)
- `src/types.ts`, `src/utils.ts`, `src/session.ts` (replaced by core)
- `src/convergence.ts`, `src/prompts.ts`, `src/formatter.ts`, `src/orchestrator.ts` (replaced by debate)
- `src/adapters/` (replaced by core/adapters)
- `skill/SKILL.md`, `skill/config-reference.md`, `skill/session-management.md`, `skill/install.sh` (old skill)
- `tests/server.test.ts`, `tests/server-debate.test.ts`, `tests/server-ws.test.ts` (dashboard tests)
- `tests/repl.test.ts` (REPL test)
- `tests/evals/` (eval tests)
- `tests/integration/server-full.test.ts` (dashboard integration)
- `tests/session.test.ts`, `tests/convergence.test.ts`, `tests/formatter.test.ts`, `tests/prompts.test.ts`, `tests/utils.test.ts`, `tests/types.test.ts` (replaced by new locations)
- `tests/orchestrator.test.ts`, `tests/orchestrator-callbacks.test.ts` (will be re-created later if needed)
- `tests/adapters/` (adapter tests reference old paths)
- `tests/integration/full-loop.test.ts` (references old imports)

- [ ] **Step 1: Delete old source files**

```bash
rm -f src/server.ts src/repl.ts src/types.ts src/utils.ts src/session.ts src/convergence.ts src/prompts.ts src/formatter.ts src/orchestrator.ts
rm -rf src/web/ src/evals/ src/adapters/
```

- [ ] **Step 2: Delete old skill files**

```bash
rm -f skill/SKILL.md skill/config-reference.md skill/session-management.md skill/install.sh
```

- [ ] **Step 3: Delete old test files**

```bash
rm -f tests/server.test.ts tests/server-debate.test.ts tests/server-ws.test.ts tests/repl.test.ts
rm -f tests/session.test.ts tests/convergence.test.ts tests/formatter.test.ts tests/prompts.test.ts tests/utils.test.ts tests/types.test.ts
rm -f tests/orchestrator.test.ts tests/orchestrator-callbacks.test.ts
rm -rf tests/evals/ tests/adapters/ tests/integration/
```

- [ ] **Step 4: Remove `ws` and `@modelcontextprotocol/sdk` from dependencies (no longer needed)**

Update `package.json`: remove `ws` from dependencies and `@types/ws` + `@modelcontextprotocol/sdk` from devDependencies.

```bash
npm uninstall ws @types/ws @modelcontextprotocol/sdk
```

- [ ] **Step 5: Update package.json version to 2.0.0**

In `package.json`, change `"version": "1.0.0"` to `"version": "2.0.0"`.

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: Clean compilation with no errors.

Run: `npx vitest run`
Expected: All remaining tests pass (tests/core/session.test.ts, tests/debate/convergence.test.ts, tests/debate/formatter.test.ts, tests/collaborate/manager.test.ts).

- [ ] **Step 7: Verify CLI works**

Run: `node dist/index.js --help`
Expected: Shows three subcommands: debate, collaborate, session.

Run: `node dist/index.js debate --help`
Expected: Shows debate flags.

Run: `node dist/index.js collaborate --help`
Expected: Shows collaborate subcommands: start, send, end, list.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove dashboard, REPL, evals; clean up old files"
```

---

## Task 12: Write `/debate` skill

**Files:**
- Create: `skill/debate/SKILL.md`

- [ ] **Step 1: Create the skill file**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add skill/debate/SKILL.md
git commit -m "feat: add /debate skill"
```

---

## Task 13: Write `/collaborate` skill and patterns

**Files:**
- Create: `skill/collaborate/SKILL.md`
- Create: `skill/collaborate/patterns.md`

- [ ] **Step 1: Create the collaborate skill**

```markdown
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
```

- [ ] **Step 2: Create the patterns file**

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add skill/collaborate/SKILL.md skill/collaborate/patterns.md
git commit -m "feat: add /collaborate skill with pattern recipes"
```

---

## Task 14: Final build, test, and verify

**Files:**
- Modify: `package.json` (version bump already done in Task 11)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean compilation, no errors.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: CLI smoke test**

Run: `node dist/index.js --help`
Expected: Shows `topg` with debate, collaborate, session subcommands.

Run: `node dist/index.js debate --help`
Expected: Shows debate flags including `--resume`, `--yolo`, `--guardrail`.

Run: `node dist/index.js collaborate start --help`
Expected: Shows `--with`, `--cwd`, `--output`, `--yolo`.

Run: `node dist/index.js collaborate send --help`
Expected: Shows `<sessionIdOrLast>` and `<message>` args.

Run: `node dist/index.js session list`
Expected: "No sessions." or lists existing sessions.

- [ ] **Step 4: Commit final state**

```bash
git add -A
git commit -m "chore: final build verification for debate + collaborate redesign"
```
