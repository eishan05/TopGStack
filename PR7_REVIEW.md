# PR #7 Review: Stream model responses to dashboard in real-time

**Branch:** `feat/stream-responses` → `main`
**Commit:** `5742228` — feat: stream model responses to dashboard in real-time

## Summary

This PR adds real-time streaming of model responses from the Claude adapter through the orchestrator to the web dashboard via WebSocket. Instead of waiting for the full response before showing anything, users now see incremental text as Claude generates it. A blinking cursor CSS animation indicates an in-progress stream.

## Changes Overview

| File | What changed |
|---|---|
| `src/types.ts` | New `StreamChunkCallback` type |
| `src/adapters/agent-adapter.ts` | `send()` signature gains optional `onChunk` param |
| `src/adapters/claude-adapter.ts` | Switches to `stream-json` output format, parses NDJSON line-by-line, emits chunks |
| `src/adapters/codex-adapter.ts` | Emits entire response as one chunk (Codex SDK doesn't support streaming) |
| `src/orchestrator.ts` | New `ChunkCallback`, `chunkCb()` helper, threads callbacks through all `send()` calls |
| `src/server.ts` | Broadcasts `turn.chunk` WebSocket events |
| `src/web/public/app.js` | Handles `turn.chunk` — streaming DOM element, progressive content rendering |
| `src/web/public/styles.css` | Blinking cursor animation for `.streaming` messages |
| `tests/adapters/claude-adapter.test.ts` | Updated to use `stream-json` NDJSON format |

## Verdict: Approve with nits

The architecture is clean and well-structured. The streaming callback is threaded through every `send()` call path correctly (run, runWithHistory, resume, continueWithGuidance, runEscalation). Tests pass (131/131). The approach is sound — NDJSON parsing, progressive DOM updates, and proper cleanup on `turn.complete`.

---

## Issues Found

### P2 — `synthesize()` doesn't pass `onChunk`

`synthesize()` at line ~417 (new branch) calls `agents.initiator.send()` without a chunk callback. This means synthesis responses won't stream. This is probably intentional (synthesis is internal, not shown turn-by-turn), but it's worth being explicit about the decision since the synthesis can take non-trivial time and the user sees nothing during it.

**Suggestion:** Either pass `chunkCb` here too, or add a comment like `// No streaming for synthesis — result is post-processed before display`.

### P2 — `contentEl.innerHTML = parseContent(...)` is an XSS vector

In `handleTurnChunk` (app.js), the streaming content is set via `innerHTML` using `parseContent()`. If `parseContent()` does not sanitize HTML, a model response containing `<img onerror=...>` or `<script>` tags would execute in the browser. This is medium-severity because the content comes from a controlled model, but defense-in-depth matters.

**Suggestion:** Verify `parseContent()` sanitizes HTML, or use `textContent` for the streaming phase and only switch to `innerHTML` on `turn.complete` when the full message goes through `renderMessage()`.

### P3 — No backpressure / throttling on DOM updates

Every single `turn.chunk` event triggers a DOM update (`innerHTML` assignment + `scrollTop` update). Claude can emit chunks very rapidly (multiple per frame). This will cause excessive layout thrashing.

**Suggestion:** Throttle DOM updates with `requestAnimationFrame`:
```js
if (!state.streamingRAF) {
  state.streamingRAF = requestAnimationFrame(function() {
    // batch DOM update here
    state.streamingRAF = null;
  });
}
```

### P3 — `lineBuffer` not flushed on process close

In `claude-adapter.ts`, the NDJSON parser accumulates data into `lineBuffer`. If the process closes with a partial line remaining in the buffer (no trailing `\n`), that last line is silently dropped. The `result` event is typically the last line, so this could cause `resultContent` to remain `null` when it shouldn't.

**Suggestion:** After `proc.on("close", ...)` fires, process any remaining content in `lineBuffer`:
```ts
proc.on("close", (code) => {
  // Flush remaining buffer
  const remaining = lineBuffer.trim();
  if (remaining) {
    try {
      const event = JSON.parse(remaining);
      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
        fullContent += event.delta.text;
        onChunk?.(event.delta.text);
      } else if (event.type === "result") {
        resultContent = event.result ?? null;
      }
    } catch { /* ignore */ }
  }
  // ... rest of close handler
});
```

### P3 — Streaming state not cleaned up on session switch

If the user switches to a different session while a stream is in-progress, `state.streamingEl` persists pointing to a DOM element that may have been removed. The `handleTurnChunk` guard (`msg.sessionId !== state.currentSessionId`) prevents updates, but the stale `streamingEl` reference is never cleaned up until the next `turn.complete` for the *old* session arrives (which may never render since the user switched away).

**Suggestion:** Clear streaming state when the user selects a different session.

### Nit — Unnecessary trailing `undefined` args

In `orchestrator.ts`, several calls pass `undefined` explicitly as the signal argument just to reach the `onChunk` position:
```ts
this.agentA.send(prompt, ctx, undefined, this.chunkCb(...))
```
This is a code smell of positional-parameter overload. Not blocking, but consider an options object in a future refactor.

### Nit — Codex "one big chunk" is misleading for UX

The Codex adapter emits the entire completed response as a single chunk. From the dashboard's perspective, this means the streaming indicator will never appear for Codex turns — the typing indicator shows, then the full message appears instantly. This is fine functionally but could be confusing if users expect streaming for all agents.

**Suggestion:** Add a brief comment in the server or dashboard noting that Codex responses arrive as a single chunk.

## Tests

All 131 tests pass. The test update correctly validates the new `stream-json` NDJSON format with `content_block_delta` and `result` events. No new integration tests for the WebSocket `turn.chunk` event — acceptable for this scope but worth adding later.
