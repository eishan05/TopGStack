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

  it("should support closed status for collaborate sessions", () => {
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
    expect(new Date(sessions[0].updatedAt).getTime())
      .toBeGreaterThanOrEqual(new Date(sessions[1].updatedAt).getTime());
  });
});
