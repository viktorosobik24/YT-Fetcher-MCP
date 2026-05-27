# YT Fetcher MCP

A local [Model Context Protocol](https://modelcontextprotocol.io) server that
exposes a single tool, `fetch_youtube_source`, to Claude Desktop (or any MCP
client). Given a YouTube URL, it returns the video's **transcript** and
**top-level comments (with replies)** as a single markdown document — designed to
be both human-readable and easy for an LLM to analyze.

## What it does

- Fetches the transcript via the [`youtube-transcript`](https://www.npmjs.com/package/youtube-transcript)
  library (no API key needed for this part).
- Fetches comments + video metadata via the **YouTube Data API v3** (key required).
- Assembles everything into a structured markdown document: a metadata header, a
  timestamped transcript, and threaded comments.
- Handles partial failure gracefully — if the transcript is unavailable or comments
  are disabled, it returns whatever succeeded with a note about what didn't.

## Requirements

- Node.js 18 or newer
- A YouTube Data API v3 key (for comments + metadata — see below)

## Setup

### 1. Install and build

```bash
npm install
npm run build
```

This compiles `src/` into `dist/`. Confirm `dist/server.js` exists afterward.

### 2. Get a YouTube Data API v3 key

The transcript works without a key, but comments and the metadata header require one.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or select an existing one).
3. Under **APIs & Services → Library**, search for **YouTube Data API v3** and
   enable it.
4. Under **APIs & Services → Credentials**, click **Create Credentials → API key**.
5. Copy the key. (Restricting it to the YouTube Data API is recommended.)

The free tier provides 10,000 quota units/day, which is ample for personal use.

### 3. Add the server to Claude Desktop

Open Claude Desktop → **Settings → Developer → Edit Config**. Add a `yt-fetcher`
entry under `mcpServers`, using an **absolute path** to the built `dist/server.js`:

```json
{
  "mcpServers": {
    "yt-fetcher": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/yt-fetcher-mcp/dist/server.js"],
      "env": {
        "YOUTUBE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Two common gotchas:
- The path **must be absolute** — Claude spawns the server as a subprocess and does
  not inherit your working directory.
- **Rebuild (`npm run build`) and fully restart Claude Desktop after any change** —
  stale `dist/` output makes edits look like no-ops.

### 4. Verify

Fully quit and reopen Claude Desktop. In a new chat, ask "Do you have a YouTube tool
available?" — Claude should confirm it sees `fetch_youtube_source`. Then paste a
YouTube URL and ask for its transcript and comments.

## Usage

The tool accepts a single `url` argument. Supported formats:
`youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/shorts/ID`, `/embed/`,
`/live/`, and bare 11-character video IDs. Extra params like `&list=` are ignored.

## Caveats & limitations

- **Transcript reliability:** the `youtube-transcript` library wraps YouTube's
  undocumented timed-text endpoints, which YouTube can change or restrict without
  notice. Transcript fetching may break and require a library update.
- **Comment coverage:** the YouTube Data API does not expose every comment, so
  comment sets are representative, not exhaustive.
- **Response size:** very long videos produce large outputs (a 2-hour video can be
  2,000+ transcript segments). Some clients may truncate.
- This is a personal/educational tool. Review YouTube's Terms of Service and API
  terms before any commercial or large-scale use.

## Project structure

```
src/
  server.ts            # MCP server + the single fetch_youtube_source tool
  url.ts               # video ID extraction from arbitrary URLs
  transcript.ts        # transcript fetch + ms/seconds normalization
  comments.ts          # comment + metadata fetch (YouTube Data API)
  markdown-builder.ts  # assembles the final markdown document
  types.ts             # shared domain types
```
###

I have attached a instructions.md file that can be pasted into a Claude project to produce a structured report for an inputted youtube url.

## License

MIT (or your choice — add a LICENSE file).
