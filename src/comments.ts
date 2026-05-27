// Comment fetching — ported from the YT Extractor's lib/youtube-comments.ts.
//
// PHASE 2 ADAPTATIONS (vs. the extension original):
//   - onProgress callback dropped (no UI to report to)
//   - API key passed in by the caller, which reads it from process.env
//   - error bodies are key-stripped before being thrown (security requirement)
// Everything else — pagination, the >5-replies comments.list quirk, stripHtml —
// is kept verbatim. These are not browser-dependent.

import type { YouTubeComment, YouTubeReply, VideoMetadata } from './types.js';
import { stripKey } from './url.js';

const API_BASE = 'https://www.googleapis.com/youtube/v3';

export class CommentsDisabledError extends Error {}

export async function fetchAllComments(
  videoId: string,
  apiKey: string,
  includeReplies = true
): Promise<YouTubeComment[]> {
  const all: YouTubeComment[] = [];
  let pageToken: string | undefined;

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
      // Comments disabled surfaces as 403 with a commentsDisabled reason.
      if (res.status === 403 && /commentsDisabled|disabled comments/i.test(body)) {
        throw new CommentsDisabledError('Comments are disabled on this video.');
      }
      // Strip the key from any surfaced error (it was in the request URL).
      throw new Error(`YouTube API ${res.status}: ${stripKey(body, apiKey)}`);
    }
    const data: any = await res.json();

    for (const item of data.items ?? []) {
      const top = item.snippet?.topLevelComment?.snippet;
      if (!top) continue;

      const comment: YouTubeComment = {
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

async function fetchAllReplies(
  parentId: string,
  apiKey: string
): Promise<YouTubeReply[]> {
  const all: YouTubeReply[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${API_BASE}/comments`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('parentId', parentId);
    url.searchParams.set('maxResults', '100');
    url.searchParams.set('key', apiKey);
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString());
    if (!res.ok) break; // tolerate reply-fetch failures; don't blow up whole export
    const data: any = await res.json();

    for (const item of data.items ?? []) {
      all.push(mapReply(item));
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return all;
}

function mapReply(item: any): YouTubeReply {
  const s = item.snippet ?? {};
  return {
    id: item.id,
    authorDisplayName: s.authorDisplayName ?? '',
    text: stripHtml(s.textDisplay ?? ''),
    likeCount: s.likeCount ?? 0,
    publishedAt: s.publishedAt ?? '',
  };
}

function stripHtml(html: string): string {
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

/**
 * Fetch video metadata via videos.list (1 quota unit). Used to populate the
 * markdown header. Replaces the extension's DOM scrape, which can't run here.
 * Returns a best-effort VideoMetadata; missing fields stay undefined.
 */
export async function fetchVideoMetadata(
  videoId: string,
  apiKey: string
): Promise<VideoMetadata> {
  const url = new URL(`${API_BASE}/videos`);
  url.searchParams.set('part', 'snippet,contentDetails,statistics');
  url.searchParams.set('id', videoId);
  url.searchParams.set('key', apiKey);

  const base: VideoMetadata = {
    videoId,
    title: '',
    channelName: '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${res.status}: ${stripKey(body, apiKey)}`);
  }
  const data: any = await res.json();
  const item = data.items?.[0];
  if (!item) return base; // video not found / removed — return skeleton

  const sn = item.snippet ?? {};
  const stats = item.statistics ?? {};
  return {
    ...base,
    title: sn.title ?? '',
    channelName: sn.channelTitle ?? '',
    publishedAt: sn.publishedAt,
    durationSeconds: parseIsoDuration(item.contentDetails?.duration),
    viewCount: stats.viewCount ? Number(stats.viewCount) : undefined,
  };
}

/** Parse an ISO 8601 duration (PT1H20M19S) to seconds. */
function parseIsoDuration(iso?: string): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const s = Number(m[3] ?? 0);
  return h * 3600 + min * 60 + s;
}
