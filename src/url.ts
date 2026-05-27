// Phase 3 — URL parsing. The tool's front door: arbitrary pasted URLs in,
// a clean 11-char video ID out (or a clear error).
//
// YouTube video IDs are exactly 11 chars from [A-Za-z0-9_-].

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extract a YouTube video ID from a pasted URL or bare ID.
 *
 * Supported:
 *   - youtube.com/watch?v=ID           (and &list=, &t=, etc. — we take v)
 *   - youtu.be/ID
 *   - youtube.com/shorts/ID            (supported: same 11-char ID space)
 *   - youtube.com/embed/ID, /live/ID, /v/ID
 *   - m.youtube.com / music.youtube.com / www. variants
 *   - a bare 11-char ID
 *
 * @returns the 11-char video ID
 * @throws Error with a clear, key-free message if nothing parseable is found
 */
export function extractVideoId(input: string): string {
  const raw = (input ?? '').trim();
  if (!raw) {
    throw new Error('No URL or video ID provided.');
  }

  // Bare 11-char ID
  if (VIDEO_ID_RE.test(raw)) return raw;

  // Try to parse as a URL. Prepend a scheme if missing so URL() accepts
  // pastes like "youtube.com/watch?v=...".
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new Error(
      `Could not parse "${raw}" as a YouTube URL or video ID.`
    );
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  const isYouTubeHost =
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtu.be';

  if (!isYouTubeHost) {
    throw new Error(
      `"${url.hostname}" is not a recognized YouTube host. ` +
        `Provide a youtube.com or youtu.be URL.`
    );
  }

  // youtu.be/ID
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    if (VIDEO_ID_RE.test(id)) return id;
    throw new Error(`No valid video ID found in short URL "${raw}".`);
  }

  // youtube.com/watch?v=ID
  const v = url.searchParams.get('v');
  if (v && VIDEO_ID_RE.test(v)) return v;

  // Path-based forms: /shorts/ID, /embed/ID, /live/ID, /v/ID
  const pathMatch = url.pathname.match(
    /^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/
  );
  if (pathMatch) return pathMatch[1];

  throw new Error(
    `Could not find a video ID in "${raw}". ` +
      `Expected a watch?v=, youtu.be/, or /shorts/ URL.`
  );
}

/**
 * Defensive: strip an API key from any text before it is surfaced to the
 * caller (error messages, logs). The key can end up embedded in a failing
 * request URL; this guarantees it never leaves the process.
 */
export function stripKey(text: string, key: string | undefined): string {
  if (!key) return text;
  return text.split(key).join('[REDACTED_KEY]');
}
