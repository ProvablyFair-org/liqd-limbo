#!/usr/bin/env node
// Builds capture/replies/ from the three exports (capture/captures/): one JSON line per reply LIQD sent during the run.
//
//   node capture/build-reply-record.mjs <directory holding the three .ndjson exports> [<output directory>]
//
// An index of LIQD's replies, run by run, that Steps 2 and 19 read without parsing the runner's event stream: for every
// reply, LIQD's Date header, the HTTP status and the byte length and SHA-256 the runner recorded for the bytes as received;
// and the reply body for every kind except the place-bet replies, whose bodies are in the exports themselves:
//   pre      the seed pair active before the run           body kept (JSON.stringify of the stored reply, which is the bytes)
//   rotate   every seed rotation (reveal + new commitment)  body kept, plus the client seed the runner submitted
//   bet      every place-bet reply                          Date, status, byte length and SHA-256 (the body is in the export)
//   verify   every production verifier reply              request body and reply body kept (both as stored)
// The first line of each file names the export it was built from (file, sha256, bytes, lines, runner build).
// Nothing is recomputed or reformatted: every value is copied from the export. Output: JSON.stringify per line, "\n" after
// each line. Run twice, the output is byte-identical; Step 19 reruns it and requires the shipped record. No network.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2];
if (!SRC) { console.error('usage: node capture/build-reply-record.mjs <directory with the exports>'); process.exit(2); }
const inputs = JSON.parse(fs.readFileSync(path.join(HERE, 'converter/inputs.limbo.json'), 'utf8'));
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : path.join(HERE, 'replies');
fs.mkdirSync(OUT, { recursive: true });

inputs.forEach((j, i) => {
  const file = j.capture.split('/').pop();
  const bytes = fs.readFileSync(path.join(SRC, file));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== j.sha256) { console.error(`${file}: sha256 ${sha256}, expected ${j.sha256}`); process.exit(1); }
  const lines = bytes.toString('utf8').split('\n').filter((l) => l.trim() !== '');
  const ev = lines.map((l) => JSON.parse(l));
  const meta = ev.find((e) => e.t === 'meta').meta;
  const out = [JSON.stringify({ t: 'source', capture: i + 1, file, sha256, bytes: bytes.length, lines: lines.length, runner: meta.script,
    betBodies: 'in the export: the bet event of the same line' })];
  ev.forEach((e, k) => {
    const line = k + 1;
    if (e.t === 'pre') out.push(JSON.stringify({ line, t: 'pre', at: e.at, date: e.http.date, status: e.http.status, bodyBytes: e.http.bodyBytes, bodySha256: e.http.bodySha256, body: JSON.stringify(e.raw) }));
    else if (e.t === 'rotate') out.push(JSON.stringify({ line, t: 'rotate', at: e.at, closes: e.closes, submitted: e.submitted, date: e.http.date, status: e.http.status, bodyBytes: e.http.bodyBytes, bodySha256: e.http.bodySha256, body: JSON.stringify(e.raw) }));
    else if (e.t === 'bet') { const r = e.rec; out.push(JSON.stringify({ line, t: 'bet', at: r.at, epoch: r.epoch, seq: r.seq, nonce: r.nonce, betId: r.betId, date: r.http.date, status: r.http.status, bodyBytes: r.http.bodyBytes, bodySha256: r.http.bodySha256 })); }
    else if (e.t === 'verify') out.push(JSON.stringify({ line, t: 'verify', epoch: e.epoch, seq: e.seq, nonce: e.nonce, betId: e.betId, sentAt: e.sentAt, receivedAt: e.receivedAt, request: e.request, date: e.date, status: e.status, bodyBytes: e.bodyBytes, bodySha256: e.bodySha256, body: e.body }));
  });
  const name = `liqd-limbo-prod-replies-capture-${i + 1}.jsonl`;
  fs.writeFileSync(path.join(OUT, name), out.join('\n') + '\n');
  const h = createHash('sha256').update(fs.readFileSync(path.join(OUT, name))).digest('hex');
  if (!process.argv[3]) console.log(`${name}: ${out.length - 1} replies from ${file} (${lines.length} lines), sha256 ${h}`);
});
