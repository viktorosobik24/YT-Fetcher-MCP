import { extractVideoId } from './dist/url.js';

const ok = [
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://youtube.com/watch?v=dQw4w9WgXcQ&list=RDxyz&start_radio=1', 'dQw4w9WgXcQ'],
  ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://youtu.be/dQw4w9WgXcQ?t=42', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['music.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
];
const bad = ['', '   ', 'https://vimeo.com/12345', 'https://google.com', 'not a url', 'https://youtube.com/watch?v=tooshort', 'node'];

let pass = 0, fail = 0;
for (const [input, expected] of ok) {
  try {
    const got = extractVideoId(input);
    if (got === expected) { pass++; }
    else { fail++; console.log(`FAIL (wrong id): ${input} -> ${got}, expected ${expected}`); }
  } catch (e) { fail++; console.log(`FAIL (threw): ${input} -> ${e.message}`); }
}
for (const input of bad) {
  try { const got = extractVideoId(input); fail++; console.log(`FAIL (should have thrown): ${JSON.stringify(input)} -> ${got}`); }
  catch { pass++; }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
