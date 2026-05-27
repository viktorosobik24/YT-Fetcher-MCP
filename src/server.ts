#!/usr/bin/env node
// YT Fetcher MCP server.
// Exposes ONE tool — fetch_youtube_source — over stdio. Local only.
//
// SECURITY: the YouTube Data API key is read from process.env.YOUTUBE_API_KEY
// only. It is never logged, never written to output, and stripped from any
// error text before it leaves the process (see stripKey / comments.ts).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { extractVideoId, stripKey } from './url.js';
import {
  fetchTranscriptSegments,
  TranscriptUnavailableError,
} from './transcript.js';
import {
  fetchAllComments,
  fetchVideoMetadata,
  CommentsDisabledError,
} from './comments.js';
import { buildMarkdown } from './markdown-builder.js';
import type { ExtractionResult, TranscriptSegment, YouTubeComment, VideoMetadata } from './types.js';

const server = new McpServer({
  name: 'yt-fetcher',
  version: '1.0.0',
});

server.registerTool(
  'fetch_youtube_source',
  {
    title: 'Fetch YouTube transcript & comments',
    description:
      'Fetches the transcript and top-level comments (with replies) for a ' +
      'given YouTube video URL. Use this whenever the user provides a YouTube ' +
      'URL and wants its transcript, comments, or both. Accepts watch?v=, ' +
      'youtu.be/, and /shorts/ URLs, or a bare 11-character video ID.',
    inputSchema: {
      url: z
        .string()
        .describe('A YouTube video URL or bare 11-character video ID.'),
    },
  },
  async ({ url }) => {
    const apiKey = process.env.YOUTUBE_API_KEY;

    // 1. Parse the URL (Phase 3). A parse failure is a hard error — there is
    //    nothing to fetch without an ID.
    let videoId: string;
    try {
      videoId = extractVideoId(url);
    } catch (err) {
      return errorResult(
        err instanceof Error ? err.message : 'Invalid YouTube URL.'
      );
    }

    if (!apiKey) {
      return errorResult(
        'YOUTUBE_API_KEY is not set in the server environment. ' +
          'Comments and metadata cannot be fetched. (Set it in the MCP config env block.)'
      );
    }

    const warnings: string[] = [];

    // 2. Fetch all three sources concurrently. Each can fail independently;
    //    we keep whatever succeeds and note what didn't (partial-failure
    //    behavior, matching the extension).
    const [metaR, transcriptR, commentsR] = await Promise.allSettled([
      fetchVideoMetadata(videoId, apiKey),
      fetchTranscriptSegments(videoId),
      fetchAllComments(videoId, apiKey),
    ]);

    // Metadata: fall back to a skeleton if it failed.
    let metadata: VideoMetadata;
    if (metaR.status === 'fulfilled') {
      metadata = metaR.value;
    } else {
      metadata = {
        videoId,
        title: '',
        channelName: '',
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
      warnings.push('Video metadata could not be fetched.');
    }

    // Transcript: empty array + warning if unavailable. The builder renders a
    // clean "Transcript not available" line for an empty array.
    let transcript: TranscriptSegment[] = [];
    if (transcriptR.status === 'fulfilled') {
      transcript = transcriptR.value;
      if (transcript.length === 0) {
        warnings.push('Transcript is empty for this video.');
      }
    } else {
      const reason =
        transcriptR.reason instanceof TranscriptUnavailableError
          ? 'Transcript unavailable (no captions or captions disabled).'
          : 'Transcript fetch failed.';
      warnings.push(reason);
    }

    // Comments: empty array + warning if disabled/failed.
    let comments: YouTubeComment[] = [];
    if (commentsR.status === 'fulfilled') {
      comments = commentsR.value;
    } else if (commentsR.reason instanceof CommentsDisabledError) {
      warnings.push('Comments are disabled on this video.');
    } else {
      const msg =
        commentsR.reason instanceof Error
          ? stripKey(commentsR.reason.message, apiKey)
          : 'Comments fetch failed.';
      warnings.push(`Comments could not be fetched: ${msg}`);
    }

    // 3. If BOTH transcript and comments failed, that's effectively a dead
    //    fetch — surface it as an error rather than an empty document.
    if (transcript.length === 0 && comments.length === 0) {
      return errorResult(
        `Nothing could be fetched for this video.\n` + warnings.map((w) => `- ${w}`).join('\n')
      );
    }

    // 4. Assemble and render.
    const result: ExtractionResult = {
      metadata,
      transcript,
      comments,
      exportedAt: new Date(),
      warnings,
    };

    const markdown = buildMarkdown(result);
    return { content: [{ type: 'text' as const, text: markdown }] };
  }
);

function errorResult(message: string) {
  return {
    content: [{ type: 'text' as const, text: `Error: ${message}` }],
    isError: true,
  };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — never stdout (stdout is the JSON-RPC channel).
  console.error('yt-fetcher MCP server running on stdio');
}

main().catch((err) => {
  console.error('Fatal error starting yt-fetcher server:', err);
  process.exit(1);
});
