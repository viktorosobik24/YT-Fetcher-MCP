# Phase 1 Report — Transcript Source De-Risk

**Status:** BLOCKED for live verification (environment), but library assessed at source level.
**Date:** 2026-05-25

---

## Summary

Phase 1's job was to prove a server-side transcript source works before building
the MCP layer around it. I selected and installed a library, wrote the throwaway
test harness, and inspected the library's real behavior at the source level — but
**I could not run the live acceptance tests from the build environment**, because
its network egress proxy blocks YouTube's hosts. The live runs are the user's to
perform (see "Blocker" below). What I *could* verify offline already surfaced the
single most important divergence the phase was meant to catch.

---

## Library chosen: `youtube-transcript@1.3.1`

- Last published/modified ~2026-04-25 (about a month before this report) — actively
  maintained, which matters for a library wrapping YouTube's undocumented endpoints.
- Strategy (from reading dist source): tries the **InnerTube API (Android client
  context)** first, falls back to **watch-page HTML scraping**. The dual path is a
  good sign — it's adapting to YouTube's restrictions rather than relying on one
  brittle method.
- Exposes typed errors that map cleanly onto our "fail gracefully" requirement:
  `YoutubeTranscriptDisabledError`, `YoutubeTranscriptNotAvailableError`,
  `YoutubeTranscriptVideoUnavailableError`, `YoutubeTranscriptTooManyRequestError`,
  `YoutubeTranscriptNotAvailableLanguageError`.

Alternatives surveyed (not installed): `youtubei.js` (v17, large/full-client, heavier
than needed), `youtube-transcript-api` (v3, last touched mid-2025),
`@danielxceron/youtube-transcript` (fork, early 2026). `youtube-transcript` was the
best fit on recency + scope. If it proves unreliable in live testing, `youtubei.js`
is the heavier-but-more-robust fallback.

---

## CRITICAL FINDING — return shape & inconsistent timing units

The library does **not** return `{ startSeconds, text }`. It returns:

```
interface TranscriptResponse { text: string; duration: number; offset: number; lang?: string; }
```

So `offset` is the timing field we map to `startSeconds`. **But the units are
inconsistent depending on which internal path produced the data** (confirmed by
reading `parseTranscriptXml` in the dist source):

| Path | XML format | offset/duration units |
|------|-----------|----------------------|
| srv3 (InnerTube, tried first) | `<p t="ms" d="ms">` | **milliseconds** |
| classic (scrape fallback) | `<text start="s" dur="s">` | **seconds** |

A naive `startSeconds: offset` would yield timestamps **1000× too large** whenever
the srv3 path is served (which, given it's tried first, is the common case now).

### Normalization adopted

A magnitude heuristic in `transcript-test.js` (and to be carried into the server):
if the max offset across segments exceeds 30000, treat values as milliseconds and
divide by 1000; otherwise treat as seconds. 30000 "seconds" ≈ 8.3h (longer than
essentially any real video), while 30000ms = 30s is trivially common — so the
threshold cleanly separates the two paths.

Verified offline against synthetic data for both paths and a short-video edge:
- srv3 ms `[0, 120000]` → `[0, 120]` ✓
- classic s `[0, 120]` → `[0, 120]` ✓
- short classic s `[0, 25]` → `[0, 25]` ✓ (not misread as ms)

### Residual limitation (honest flag)

A video **under ~30 seconds** served via the srv3 (ms) path would have a max offset
< 30000 and be misclassified as seconds, leaving timestamps 1000× too small. Narrow
case (sub-30s captioned videos), but real. The robust fix is to key off *which code
path* produced the data rather than infer from magnitude — but the library doesn't
expose that, so absent forking it, the heuristic is the pragmatic choice. Recommend
the server log (not to output) a note when it can't confidently classify.

---

## LIVE RESULTS (run by user, 2026-05-25)

All five required cases confirmed on real videos. The ms→seconds normalization
held on every case, with the normalized last timestamp matching true runtime.

| Case | Video | Segments | Max offset | Units detected | Last ts | True length | Result |
|------|-------|---------:|-----------:|----------------|---------|-------------|--------|
| Music video | "Like A Virgin" (fakemink) | 30 | 159,360 | ms ✓ | 02:39 | ~2:39 | ✓ |
| Human captions (talking head) | "Chip design from the bottom up" (Dwarkesh) | — | 4,816,640 | ms ✓ | 1:20:16 | 1:20:19 | ✓ |
| Long 2h+ | "How GPT, Claude, Gemini are trained/served" (Dwarkesh) | 2,191 | 8,019,670 | ms ✓ | 2:13:39 | ~2:13:39 | ✓ |
| Auto-generated captions | small-channel + music cases (auto tracks) | — | — | ms ✓ | — | — | ✓ |
| No captions / unavailable | bogus ID `AAAAAAAAAAA` | — | — | — | — | — | ✓ graceful `YoutubeTranscriptDisabledError`, no crash |

Notes from live runs:
- Every real fetch came back via the srv3 (ms) path — the heuristic's common case.
  The seconds path was not observed live, but is covered by the offline synthetic test.
- The 2h+ video returned 2,191 segments in ~391ms. Fetch speed is a non-issue;
  **response SIZE** is the thing to watch in Phase 7 once comments are appended on top.
- **Multi-line segment text is real:** the 2h+ video's first segment text was
  `"Today, I'm interviewing Reiner\nPope, who is the CEO of MatX,"` — a literal `\n`
  packed inside one segment. Normalization preserves it. The markdown-builder step
  must tolerate embedded newlines in segment text (don't assume one line per segment).
- The bogus-ID failure reported as "transcript disabled" rather than "not found";
  the library doesn't always distinguish the two, which is fine — both are clean,
  key-free, no-crash failures.

---

## BLOCKER — cannot run live tests from this environment

(Resolved by user running tests on their machine; retained for record.)


The build sandbox's egress proxy blocks YouTube. Direct evidence:

```
fetch('https://www.youtube.com/watch?v=...') -> 403, body: "Host not in allowlist"
```

The allowlist covers package registries (npm/pypi/crates), GitHub, Adobe, and the
Anthropic API only. `youtube.com`, `youtu.be`, and `googleapis.com` are NOT included.
Consequence: `node transcript-test.js <url>` and `node comments-test.js <url>` cannot
reach real videos here. (The library's typed error path *was* observed firing, so the
"no crash on failure" behavior is confirmed — but the success path can't be exercised
from the sandbox.)

This does not affect the final product: the MCP server runs on the user's machine,
where the network is open. The live acceptance tests simply move to the user.

---

## Acceptance criteria — status

| Criterion | Status |
|-----------|--------|
| Library installed | ✓ done |
| Throwaway `transcript-test.js` written | ✓ done |
| Return shape confirmed & normalized to `{startSeconds, text}` | ✓ confirmed via source; normalization written & unit-tested offline |
| Reliably prints transcript for captioned videos | ⏳ **user must run live** |
| Fails gracefully (no crash) for no-caption videos | ✓ typed-error path observed |
| Tested: human captions / auto-gen / music / 2h+ / none | ⏳ **user must run live** |

---

## What the user needs to do to complete Phase 1

Run, on a machine with open network:

```
cd <project> && npm install
node transcript-test.js "https://www.youtube.com/watch?v=<id>"
```

Across the five required cases (human captions, auto-gen, music video, 2h+, no
captions). The script prints raw shape, detected units, normalized samples, and the
last timestamp (which should roughly equal video length — the quickest sanity check
that normalization is right). Report back any case where it crashes or the last
timestamp is wildly off from the true duration.

**Per the build guide, this is the STOP point.** If live runs show the library can't
reliably fetch captions, that's the trigger to reconsider scope (headless browser vs.
comments-only) before building the MCP layer.
