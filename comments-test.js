// THROWAWAY Phase 2 test — not part of the MCP server.
// Usage: YOUTUBE_API_KEY=... node comments-test.js <youtube-url-or-id>
//
// This is a faithful port of the extension's lib/youtube-comments.ts with the
// Phase 2 adaptations applied:
//   - onProgress callback dropped (no UI)
//   - API key read from process.env.YOUTUBE_API_KEY (not a passed arg)
//   - pagination, the >5-replies comments.list quirk, and stripHtml kept verbatim
//
// Written in JS so it runs with no TS toolchain. The real server will use the
// TS version.

const API_BASE = 'https://www.googleapis.com/youtube/v3';

// --- crude video-id extraction, just enough for the test ---
// (Phase 3 builds the robust version.)
function quickExtractId(input) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  try {
    const u = new URL(input);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1, 12);
    const v = u.searchParams.get('v');
    if (v) return v;
    const m = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
  } catch {}
  return null;
}

async function fetchAllComments(videoId, apiKey, includeReplies = true) {
  const all = [];
  let pageToken;
  do {
    const url = new URL(`${API_BASE}/commentThreads`);
    url.searchParams.set('part', 'snippet,replies');
    url.searchParams.set('videoId', videoId);
    url.searchParams.set('maxResults', '100');
    url.searchParams.set('order', 'relevance');
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) {
      const body = await res.text();
      // NOTE: in the real server this error must be key-stripped before surfacing.
      throw new Error(`YouTube API ${res.status}: ${stripKeyFromText(body, apiKey)}`);
    }
    const data = await res.json();

    for (const item of data.items ?? []) {
      const top = item.snippet?.topLevelComment?.snippet;
      if (!top) continue;
      const comment = {
        id: item.snippet.topLevelComment.id,
        authorDisplayName: top.authorDisplayName ?? '',
        text: stripHtml(top.textDisplay ?? ''),
        likeCount: top.likeCount ?? 0,
        publishedAt: top.publishedAt ?? '',
        replies: [],
      };
      if (includeReplies) {
        const totalReplyCount = item.snippet.totalReplyCount ?? 0;
        const inlineReplies = item.replies?.comments ?? [];
        if (totalReplyCount > 0 && inlineReplies.length < totalReplyCount) {
          comment.replies = await fetchAllReplies(comment.id, apiKey);
        } else {
          comment.replies = inlineReplies.map(mapReply);
        }
      }
      all.push(comment);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

async function fetchAllReplies(parentId, apiKey) {
  const all = [];
  let pageToken;
  do {
    const url = new URL(`${API_BASE}/comments`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('parentId', parentId);
    url.searchParams.set('maxResults', '100');
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url.toString());
    if (!res.ok) break; // tolerate reply-fetch failures
    const data = await res.json();
    for (const item of data.items ?? []) all.push(mapReply(item));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

function mapReply(item) {
  const s = item.snippet ?? {};
  return {
    id: item.id,
    authorDisplayName: s.authorDisplayName ?? '',
    text: stripHtml(s.textDisplay ?? ''),
    likeCount: s.likeCount ?? 0,
    publishedAt: s.publishedAt ?? '',
  };
}

function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// Defensive: never let the key leak into surfaced error text.
function stripKeyFromText(text, key) {
  if (!key) return text;
  return text.split(key).join('[REDACTED_KEY]');
}

async function main() {
  const input = process.argv[2];
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!input) {
    console.error('Usage: YOUTUBE_API_KEY=... node comments-test.js <youtube-url-or-id>');
    process.exit(1);
  }
  if (!apiKey) {
    console.error('Missing YOUTUBE_API_KEY in environment.');
    process.exit(1);
  }
  const videoId = quickExtractId(input);
  if (!videoId) {
    console.error(`Could not extract a video ID from: ${input}`);
    process.exit(1);
  }

  console.log(`\n=== Fetching comments for videoId: ${videoId} ===`);
  const t0 = Date.now();
  let comments;
  try {
    comments = await fetchAllComments(videoId, apiKey);
  } catch (err) {
    // Surface the (key-stripped) error the way the server eventually will.
    console.log(`FAILED: ${err.message}`);
    console.log('--> graceful-failure path (e.g. comments disabled => 403). No crash.');
    process.exit(0);
  }
  const ms = Date.now() - t0;

  const replyCount = comments.reduce((a, c) => a + c.replies.length, 0);
  console.log(`Fetched ${comments.length} top-level comments + ${replyCount} replies in ${ms}ms`);

  console.log('\n--- Sample (first 3 threads) ---');
  for (const c of comments.slice(0, 3)) {
    console.log(`\n@${c.authorDisplayName} (${c.likeCount} likes): ${c.text.slice(0, 100)}`);
    for (const r of c.replies.slice(0, 2)) {
      console.log(`   ↳ @${r.authorDisplayName}: ${r.text.slice(0, 80)}`);
    }
    if (c.replies.length > 2) console.log(`   …and ${c.replies.length - 2} more replies`);
  }

  // Find a thread with >5 replies to confirm the comments.list quirk path fired.
  const big = comments.find((c) => c.replies.length > 5);
  if (big) {
    console.log(`\n[quirk check] Thread by @${big.authorDisplayName} has ${big.replies.length} replies — confirms the comments.list pagination path works.`);
  } else {
    console.log('\n[quirk check] No thread with >5 replies in this video; pick a more discussed video to exercise that path.');
  }
}

main();
