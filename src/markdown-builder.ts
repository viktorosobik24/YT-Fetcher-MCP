import type {
  ExtractionResult,
  TranscriptSegment,
  YouTubeComment,
  YouTubeReply,
  VideoMetadata,
} from './types.js';

/**
 * Assemble the final markdown document.
 *
 * Output is designed to be LLM-readable as well as human-readable.
 * The frontmatter block at the top gives any downstream LLM immediate
 * context about what it's looking at.
 */
export function buildMarkdown(result: ExtractionResult): string {
  const { metadata, transcript, comments, exportedAt, warnings } = result;

  const parts: string[] = [];

  // --- Header ---
  parts.push(`# ${metadata.title}`);
  parts.push('');
  parts.push(`**Channel:** ${metadata.channelName}`);
  parts.push(`**URL:** ${metadata.url}`);
  if (metadata.publishedAt) {
    parts.push(`**Published:** ${formatDate(metadata.publishedAt)}`);
  }
  if (metadata.durationSeconds) {
    parts.push(`**Duration:** ${formatDuration(metadata.durationSeconds)}`);
  }
  if (metadata.viewCount !== undefined) {
    parts.push(`**Views:** ${metadata.viewCount.toLocaleString()}`);
  }
  parts.push(`**Exported:** ${formatExportTimestamp(exportedAt)}`);
  parts.push('');
  parts.push('---');
  parts.push('');

  // --- Transcript section ---
  parts.push('## Transcript');
  parts.push('');
  if (transcript.length === 0) {
    parts.push('*Transcript not available for this video.*');
  } else {
    for (const seg of transcript) {
      parts.push(`[${formatTimestamp(seg.startSeconds)}] ${seg.text}`);
    }
  }
  parts.push('');
  parts.push('---');
  parts.push('');

  // --- Comments section ---
  parts.push('## Comments');
  parts.push('');
  if (comments.length === 0) {
    parts.push('*No comments fetched (comments may be disabled).*');
  } else {
    for (const comment of comments) {
      parts.push(renderComment(comment));
      parts.push('');
    }
  }

  // --- Footer ---
  parts.push('---');
  parts.push('');
  const replyCount = comments.reduce((acc, c) => acc + c.replies.length, 0);
  if (result.repliesExcluded) {
    parts.push(
      `*Exported ${comments.length} top-level comments. Replies excluded by user preference.*`
    );
  } else {
    parts.push(
      `*Exported ${comments.length} top-level comments and ${replyCount} replies. ` +
      `YouTube may not expose all comments via API.*`
    );
  }

  if (warnings.length > 0) {
    parts.push('');
    parts.push('**Warnings during export:**');
    for (const w of warnings) parts.push(`- ${w}`);
  }

  return parts.join('\n');
}

function cleanHandle(name: string): string {
  return name.startsWith('@') ? name : `@${name}`;
}

function renderComment(c: YouTubeComment): string {
  const lines: string[] = [];
  lines.push(
    `### ${cleanHandle(c.authorDisplayName)} · ${formatLikes(c.likeCount)} · ${formatRelative(c.publishedAt)}`
  );
  lines.push('');
  lines.push(c.text);

  for (const reply of c.replies) {
    lines.push('');
    lines.push(renderReply(reply));
  }

  return lines.join('\n');
}

function renderReply(r: YouTubeReply): string {
  const header = `> **${cleanHandle(r.authorDisplayName)}** · ${formatLikes(r.likeCount)} · ${formatRelative(r.publishedAt)}`;
  // Indent reply body as a quote block, preserving line breaks
  const body = r.text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `${header}\n>\n${body}`;
}

// --- Formatters ---

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 && h === 0) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function formatExportTimestamp(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function formatLikes(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K likes`;
  return `${n} likes`;
}

function formatRelative(iso: string): string {
  if (!iso) return 'unknown';
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffSec = (now - then) / 1000;
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
    if (diffSec < 31536000) return `${Math.floor(diffSec / 2592000)}mo ago`;
    return `${Math.floor(diffSec / 31536000)}y ago`;
  } catch {
    return iso;
  }
}
