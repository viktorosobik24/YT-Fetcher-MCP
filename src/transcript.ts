// Transcript fetching — wraps youtube-transcript and normalizes to our
// TranscriptSegment shape ({ startSeconds, text }).
//
// PHASE 1 FINDING (see reports/phase-1-transcript.md): the library's `offset`
// field is in MILLISECONDS on the srv3/InnerTube path (the common case) and in
// SECONDS on the classic scrape fallback. We normalize via a magnitude
// heuristic: if the max offset exceeds 30000, the values are milliseconds.
// 30000s = 8.3h (longer than essentially any video); 30000ms = 30s (trivial).
// Confirmed correct live on videos of 2:39, 1:20:19, and 2:13:39.

import { fetchTranscript } from 'youtube-transcript';
import type { TranscriptSegment } from './types.js';

const MS_THRESHOLD = 30000;

export class TranscriptUnavailableError extends Error {}

/**
 * Fetch and normalize the transcript for a video ID.
 * @throws TranscriptUnavailableError if no transcript exists / is disabled.
 */
export async function fetchTranscriptSegments(
  videoId: string
): Promise<TranscriptSegment[]> {
  let raw: Array<{ text?: string; offset?: number }>;
  try {
    raw = await fetchTranscript(videoId);
  } catch (err) {
    // youtube-transcript throws typed errors for disabled / unavailable /
    // no-caption cases. Collapse them all into one clean signal; the message
    // never contains an API key (the transcript fetch is keyless anyway).
    const msg = err instanceof Error ? err.message : String(err);
    throw new TranscriptUnavailableError(msg);
  }

  if (!raw || raw.length === 0) return [];

  const maxOffset = Math.max(...raw.map((r) => r.offset ?? 0));
  const looksLikeMs = maxOffset > MS_THRESHOLD;

  return raw.map((r) => ({
    startSeconds: looksLikeMs ? (r.offset ?? 0) / 1000 : r.offset ?? 0,
    text: r.text ?? '',
  }));
}
