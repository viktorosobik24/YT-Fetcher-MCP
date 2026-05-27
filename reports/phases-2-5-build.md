# Phases 2–5 Report — Comments port, URL parsing, MCP server & tool

**Status:** Built and verified to the limit of the offline environment. Live
YouTube calls (transcript/comment success paths) remain the user's to run.
**Date:** 2026-05-25

---

## Phase 2 — Comments (port headless)

`src/comments.ts` is a faithful port of the extension's `lib/youtube-comments.ts`.

Kept verbatim: top-level pagination, the >5-replies `comments.list` quirk
(`fetchAllReplies`), reply-fetch failure tolerance (`break`, don't blow up the
export), and `stripHtml`.

Adapted per the build guide:
- `onProgress` callback dropped.
- API key passed in by the caller; the server reads it from
  `process.env.YOUTUBE_API_KEY`.
- Error bodies are run through `stripKey()` before being thrown, so the key
  can never leak via an error surfaced from a failing request URL.
- Comments-disabled is detected (403 + `commentsDisabled` reason) and raised as
  a typed `CommentsDisabledError` so the server can turn it into a clean warning
  rather than a hard failure.

Also added `fetchVideoMetadata()` (videos.list, 1 quota unit) to populate the
markdown header — this replaces the extension's DOM scrape, which can't run
headless. ISO-8601 duration (`PT1H20M19S`) is parsed to seconds.

**Offline-testable:** compiles under strict TS. **Needs live run:** the
`comments-test.js` standalone script (delivered earlier) against a normal video,
a comments-disabled video, and a threaded-reply video.

## Phase 3 — URL parsing

`src/url.ts` → `extractVideoId()`. Handles watch?v=, youtu.be/, /shorts/,
/embed/, /live/, /v/, m. and music. subdomains, scheme-less pastes, and bare
11-char IDs. Decision: **/shorts/ is supported** (same 11-char ID space — no
reason to reject). Throws clear, key-free errors for non-YouTube hosts and
garbage.

**Verified offline:** `url-test.js` — 17/17 cases pass, including all supported
formats and 7 garbage inputs (empty, whitespace, vimeo, google, non-URL, an
11-char-but-invalid id, and the bare string `node` that broke an earlier manual
test via a copy-paste typo). All garbage throws; no false positives.

## Phase 4 — MCP server scaffold

`src/server.ts`. SDK verified by inspecting the **installed** package rather than
trusting docs/blogs (some search hits showed a `@modelcontextprotocol/server`
split that the installed v1.29.0 does NOT use). Real import paths:
`@modelcontextprotocol/sdk/server/mcp.js` and `.../server/stdio.js`.
`registerTool(name, {description, inputSchema}, cb)` with `inputSchema` as a zod
raw shape. Startup log goes to **stderr** (stdout is the JSON-RPC channel).

**Verified offline:** sending an `initialize` + `tools/list` handshake over stdio
returns a valid response; server reports `serverInfo: yt-fetcher 1.0.0` and
starts without error.

## Phase 5 — Single tool

ONE tool: `fetch_youtube_source`. Zod input: a single `url` string. Description
is explicit and action-oriented (the build guide's #1-importance item — it's how
Claude decides to call it).

Handler flow:
1. `extractVideoId(url)` — parse failure is a hard error (nothing to fetch).
2. Missing `YOUTUBE_API_KEY` → clean error result.
3. Metadata, transcript, comments fetched concurrently via `Promise.allSettled`
   so **one source failing doesn't sink the others** (partial-failure behavior,
   matching the extension).
4. Each failure becomes a `warning` in the output, not a thrown error. Transcript
   unavailable / comments disabled are handled distinctly.
5. **If BOTH transcript and comments fail**, the call returns an error result
   rather than an empty document.
6. Output assembled into `ExtractionResult` and rendered with the **reused
   `markdown-builder.ts`** (ported verbatim, only the import path changed) plus
   real metadata in the header.

**Verified offline (via real MCP `tools/call`):** `tools/list` shows exactly one
tool; a non-YouTube URL returns `{ isError: true, content: [Error: ...] }` with
no key and no crash.

---

## Carried-forward findings (from Phase 1, still open)

- **Response size:** a 2h video returned 2,191 transcript segments. With a full
  comment set appended, total output may be large — watch for client-side
  truncation in Phase 7. Not yet addressed (no truncation/cap added; flagged for
  the user to decide whether to limit).
- **Embedded newlines:** segment text can contain literal `\n`. The markdown
  builder tolerates this (it joins/escapes via its own logic); confirm rendering
  looks right on a real multi-line-segment video during Phase 7.

## What still needs a live run (Phases 6–7)

- Wire into Claude Desktop config (ABSOLUTE path to `dist/server.js`;
  `YOUTUBE_API_KEY` in the per-server `env` block; rebuild + restart after edits).
- Paste a real URL; confirm Claude calls the tool and gets assembled output.
- Stress: comments disabled, no captions, 2h+ (response size!), malformed URL.

## Build / run

```
npm install
npm run build          # tsc -> dist/
YOUTUBE_API_KEY=... npm start    # or: npm run dev (tsx, no build step)
```
