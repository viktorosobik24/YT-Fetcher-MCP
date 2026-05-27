// THROWAWAY Phase 1 test — not part of the MCP server.
// Usage: node transcript-test.js <youtube-url-or-id>
//
// Goal: prove youtube-transcript works server-side, inspect the raw return
// shape, and verify our seconds-normalization across the library's two
// internal XML paths (srv3 = ms, classic = seconds).

import { fetchTranscript } from 'youtube-transcript';

// Mirror of the normalization we'll bake into the real server.
// The library returns { text, offset, duration } but `offset`/`duration`
// are MILLISECONDS in the srv3 path and SECONDS in the classic path.
// Heuristic: if the largest offset implies a duration the video can't
// plausibly have in seconds (i.e. offsets look like ms), divide by 1000.
function normalizeToSeconds(raw) {
  if (raw.length === 0) return [];
  const maxOffset = Math.max(...raw.map((r) => r.offset ?? 0));
  // If max offset > 30000, it's almost certainly milliseconds:
  // 30000 "seconds" = 8.3 hours, longer than essentially any real video,
  // whereas 30000ms = 30s is trivially common. Threshold is generous.
  const looksLikeMs = maxOffset > 30000;
  return raw.map((r) => ({
    startSeconds: looksLikeMs ? (r.offset ?? 0) / 1000 : (r.offset ?? 0),
    text: r.text ?? '',
  }));
}

function fmtTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node transcript-test.js <youtube-url-or-id>');
    process.exit(1);
  }

  console.log(`\n=== Fetching transcript for: ${input} ===`);
  const t0 = Date.now();
  let raw;
  try {
    raw = await fetchTranscript(input);
  } catch (err) {
    console.log(`FAILED (${err?.constructor?.name ?? 'Error'}): ${err.message}`);
    console.log('--> This is the graceful-failure path. No crash.');
    process.exit(0);
  }
  const ms = Date.now() - t0;

  console.log(`Fetched ${raw.length} segments in ${ms}ms`);
  if (raw.length === 0) {
    console.log('Empty transcript array (no segments).');
    return;
  }

  // Raw shape inspection
  console.log('\n--- RAW first segment (library shape) ---');
  console.log(JSON.stringify(raw[0], null, 2));
  console.log('--- RAW last segment ---');
  console.log(JSON.stringify(raw[raw.length - 1], null, 2));

  const maxOffset = Math.max(...raw.map((r) => r.offset ?? 0));
  console.log(`\nmax offset value = ${maxOffset} (looks like ${maxOffset > 30000 ? 'MILLISECONDS' : 'seconds'})`);
  console.log(`lang reported = ${raw[0].lang ?? '(none)'}`);

  const norm = normalizeToSeconds(raw);
  console.log('\n--- NORMALIZED sample (first 5) ---');
  for (const seg of norm.slice(0, 5)) {
    console.log(`[${fmtTimestamp(seg.startSeconds)}] ${seg.text.slice(0, 70)}`);
  }
  console.log('--- NORMALIZED last segment ---');
  const lastNorm = norm[norm.length - 1];
  console.log(`[${fmtTimestamp(lastNorm.startSeconds)}] ${lastNorm.text.slice(0, 70)}`);
  console.log(`\n(last timestamp ${fmtTimestamp(lastNorm.startSeconds)} should roughly match the video's length)`);
}

main();
