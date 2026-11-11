#!/usr/bin/env node
// Makes the shipped copies of the three exports (capture/captures/) from the exports as the runner wrote them.
//
//   node capture/redact-export.mjs <directory holding the three original .ndjson exports>
//
// Two things change, both on the export's first line (the runner's `meta` event), which no reply's SHA-256 covers:
//   1. meta.userAgent (the browser's user-agent string) is removed;
//   2. in a plan note, a person's name written as "profile minimum (<name> <day> Nov)" becomes
//      "profile minimum (the auditor, <day> Nov)" (runs 2 and 3, one note each).
// Every other line is copied byte for byte, so every reply body and its recorded byte length and SHA-256 are untouched.
// The meta line is re-serialised with JSON.stringify, the runner's own serialiser; the script first checks that
// JSON.stringify(JSON.parse(line)) reproduces the original line exactly, so only the two edits can differ.
// Cloudflare request ids (cf-ray) are not in the exports: the runner records no reply header other than Date and the
// content type. No network.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
if (!SRC) { console.error('usage: node capture/redact-export.mjs <directory with the original exports>'); process.exit(2); }
const ORIGINALS = [
  ['liqd-limbo-prod-capture-2026-11-07T16-28-43-825Z.ndjson', '4e29b73dd91c585a9fb60e680038880169b2dc2504bbbaa451fb300a77000754'],
  ['liqd-limbo-prod-capture-2026-11-10T04-11-27-073Z.ndjson', '9fe56a69dad19e938f23cd0e4875c5478dcbd43d9a8051d4fe7c9735c8eb6393'],
  ['liqd-limbo-prod-capture-2026-11-10T10-47-42-943Z.ndjson', 'cd5d8acd26234e7d15f4a8d80dbb35d6c6b2d5b7c6b121bc6d7c33defa339080'],
];
const NOTE_RE = /^profile minimum \(([A-Z][a-z]+) (\d{1,2} Nov)\)/;
const OUT = path.join(HERE, 'captures');
fs.mkdirSync(OUT, { recursive: true });
for (const [file, sha] of ORIGINALS) {
  const buf = fs.readFileSync(path.join(SRC, file));
  const h = createHash('sha256').update(buf).digest('hex');
  if (h !== sha) { console.error(`${file}: sha256 ${h}, expected ${sha}`); process.exit(1); }
  const lines = buf.toString('utf8').split('\n');
  const i = lines.findIndex((l) => l.includes('"t":"meta"'));
  const ev = JSON.parse(lines[i]);
  if (JSON.stringify(ev) !== lines[i]) { console.error(`${file}: the meta line does not round-trip through JSON.stringify`); process.exit(1); }
  let ua = 0, notes = 0;
  if ('userAgent' in ev.meta) { delete ev.meta.userAgent; ua++; }
  for (const p of ev.meta.phases ?? []) if (typeof p.note === 'string' && NOTE_RE.test(p.note)) { p.note = p.note.replace(NOTE_RE, 'profile minimum (the auditor, $2)'); notes++; }
  lines[i] = JSON.stringify(ev);
  const out = Buffer.from(lines.join('\n'), 'utf8');
  fs.writeFileSync(path.join(OUT, file), out);
  console.log(`${file}: line ${i + 1} edited (userAgent removed: ${ua}, plan notes: ${notes}); ${lines.length} lines; sha256 ${createHash('sha256').update(out).digest('hex')} (${out.length} bytes)`);
}
