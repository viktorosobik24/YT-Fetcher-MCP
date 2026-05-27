// Domain types for the YT Fetcher MCP server.
// Ported from the YT Extractor's types (index.ts), trimmed to what this
// headless tool actually uses. The browser-messaging types are dropped;
// the ExtractionResult / VideoMetadata / *Comment / TranscriptSegment shapes
// are kept verbatim so the reused markdown-builder consumes them unchanged.

export interface VideoMetadata {
  videoId: string;
  title: string;
  channelName: string;
  url: string;
  publishedAt?: string; // ISO
  durationSeconds?: number;
  viewCount?: number;
}

export interface TranscriptSegment {
  startSeconds: number;
  text: string;
}

export interface YouTubeComment {
  id: string;
  authorDisplayName: string;
  text: string; // HTML-stripped plain text
  likeCount: number;
  publishedAt: string; // ISO
  replies: YouTubeReply[];
}

export interface YouTubeReply {
  id: string;
  authorDisplayName: string;
  text: string;
  likeCount: number;
  publishedAt: string;
}

export interface ExtractionResult {
  metadata: VideoMetadata;
  transcript: TranscriptSegment[];
  comments: YouTubeComment[];
  exportedAt: Date;
  warnings: string[];
  repliesExcluded?: boolean;
}
