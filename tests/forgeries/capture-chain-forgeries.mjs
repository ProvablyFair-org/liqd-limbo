// CAPTURE-CHAIN FORGERIES — one documented case per invocation. Each edits a shipped capture-chain file (the reply
// record, a runner build, the converter's input list) or the dataset, and RE-PINS what it edited in src/config.ts, as a
// forger would, so the pin is not what catches it and the declared step has to.
//
// ZERO FABRICATION. Every value edited below is read out of the shipped files first; a wrong value is derived from the
// real one (one cent, one second, one hex digit), never invented.
//
// usage: node capture-chain-forgeries.mjs <sandboxRepo> <case>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = process.argv[2];
const kase = process.argv[3];
if (!repo || !kase) { console.error('usage: capture-chain-forgeries.mjs <sandboxRepo> <case>'); process.exit(2); }
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const cfgPath = path.join(repo, 'src/config.ts');
let cfg = fs.readFileSync(cfgPath, 'utf8');
const repinFile = (rel) => {
  // the pin sits on the same line as the file name in src/config.ts
  const lines = cfg.split('\n'); const i = lines.findIndex((l) => l.includes(`'${rel}'`) && /sha256: '[0-9a-f]{64}'/.test(l));
  if (i < 0) { console.error(`case ${kase}: no pin for ${rel} in src/config.ts`); process.exit(2); }
  lines[i] = lines[i].replace(/sha256: '[0-9a-f]{64}'/, `sha256: '${sha(fs.readFileSync(path.join(repo, rel)))}'`);
  cfg = lines.join('\n');
};
const bendHex = (h) => ((parseInt(h[0], 16) + 1) % 16).toString(16) + h.slice(1);
const R1 = 'capture/replies/liqd-limbo-prod-replies-capture-1.jsonl';
const R3 = 'capture/replies/liqd-limbo-prod-replies-capture-3.jsonl';
const readRows = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l));
const writeRows = (rel, rows) => fs.writeFileSync(path.join(repo, rel), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const firstVerify = (rows) => { const r = rows.find((x) => x.t === 'verify'); if (!r) { console.error('no verify row'); process.exit(2); } return r; };

let note;
switch (kase) {
  // ── Step 19: a verifier reply in the record no longer the bytes the runner hashed ──────────────────────────────
  case 'verifier-reply-forged': {
    const rows = readRows(R1); const r = firstVerify(rows);
    const o = JSON.parse(r.body); const was = o.outcome.result; o.outcome.result = Math.round(was * 100 + 1) / 100;
    r.body = JSON.stringify(o);
    writeRows(R1, rows); repinFile(R1);
    note = `${R1}: verifier reply for bet ${r.betId}: result ${was} -> ${o.outcome.result}; recorded byte length and SHA-256 left as received`;
    break;
  }
  // ── Step 19: the same forged reply, with its recorded digest recomputed to match ──────────────────────────────
  case 'verifier-reply-forged-rehashed': {
    const rows = readRows(R1); const r = firstVerify(rows);
    const o = JSON.parse(r.body); const was = o.outcome.result; o.outcome.result = Math.round(was * 100 + 1) / 100;
    r.body = JSON.stringify(o); r.bodyBytes = Buffer.byteLength(r.body, 'utf8'); r.bodySha256 = sha(r.body);
    writeRows(R1, rows); repinFile(R1);
    note = `${R1}: verifier reply for bet ${r.betId}: result ${was} -> ${o.outcome.result}, and its recorded byte length and SHA-256 recomputed`;
    break;
  }
  // ── Step 19: the recorded digest of a place-bet reply in the reply record ──────────────────────────────────────
  case 'bet-reply-digest-forged': {
    const rows = readRows(R1); const r = rows.find((x) => x.t === 'bet');
    const was = r.bodySha256; r.bodySha256 = bendHex(was);
    writeRows(R1, rows); repinFile(R1);
    note = `${R1}: place-bet reply of bet ${r.betId}: recorded SHA-256 ${was.slice(0, 12)}... -> ${r.bodySha256.slice(0, 12)}... (the record no longer what the builder makes of the exports)`;
    break;
  }
  // ── Step 2: a client-seed submission dated after the epoch's first bet on LIQD's clock ────────────────────────
  case 'seed-reply-after-first-bet': {
    const rows = readRows(R1);
    const rot = rows.find((x) => x.t === 'rotate' && String(x.closes) === '0');            // opens run 1's epoch 1
    const bet = rows.find((x) => x.t === 'bet' && x.epoch === 1);
    const was = rot.date; rot.date = new Date(Date.parse(bet.date) + 1000).toUTCString();
    writeRows(R1, rows); repinFile(R1);
    note = `${R1}: the rotation reply opening epoch 1 dated ${was} -> ${rot.date}, one second after the epoch's first place-bet reply (${bet.date})`;
    break;
  }
  // ── Step 19: a runner build edited, so its source no longer reproduces its id ─────────────────────────────────
  case 'runner-source-edited': {
    const rel = 'capture/runner/limbo-prod-capture-runner-build-7e33ea9cd02d.js';
    const src = fs.readFileSync(path.join(repo, rel), 'utf8');
    const a = `const newSeed = () => 'audit' + hex(root.crypto.getRandomValues(new Uint8Array(6)));`;
    if (!src.includes(a)) { console.error('seed line not found'); process.exit(2); }
    fs.writeFileSync(path.join(repo, rel), src.replace(a, a.replace('new Uint8Array(6)', 'new Uint8Array(5)')));
    repinFile(rel);
    note = `${rel}: the client seed drawn from 5 bytes instead of 6; re-pinned`;
    break;
  }
  // ── Step 19: the converter's input list names an export the dataset does not ─────────────────────────────────
  case 'converter-input-edited': {
    const rel = 'capture/converter/inputs.limbo.json';
    const t = fs.readFileSync(path.join(repo, rel), 'utf8');
    const j = JSON.parse(t); const was = j[1].sha256;
    fs.writeFileSync(path.join(repo, rel), t.replace(was, bendHex(was)));
    repinFile(rel);
    note = `${rel}: run 2's export SHA-256 ${was.slice(0, 12)}... -> ${bendHex(was).slice(0, 12)}...; re-pinned`;
    break;
  }
  // ── Step 19: the dataset is not what the converter makes of the exports ──────────────────────────────────────
  case 'dataset-differs-from-converter': {
    const dsRel = 'data/limbo-prod-full-5838bets.json';
    const ds = JSON.parse(fs.readFileSync(path.join(repo, dsRel), 'utf8'));
    const b = ds.bets[0]; const was = b.localDraw;
    b.localDraw = was + 1;
    fs.writeFileSync(path.join(repo, dsRel), JSON.stringify(ds, null, 2));
    cfg = cfg.replace(/(export const DATASET_SHA256 = ')[0-9a-f]{64}(')/, `$1${sha(fs.readFileSync(path.join(repo, dsRel)))}$2`);
    note = `${dsRel}: bet ${b.id}'s converter-written localDraw ${was} -> ${b.localDraw} (a field every scored step ignores, L8); dataset re-pinned`;
    break;
  }
  // ── Step 19: a place-bet reply in a shipped export forged, recorded digest left as received ──────────────────
  case 'export-reply-forged': {
    const rel = 'capture/captures/liqd-limbo-prod-capture-2026-11-10T10-47-42-943Z.ndjson';
    const lines = fs.readFileSync(path.join(repo, rel), 'utf8').split('\n');
    const i = lines.findIndex((l) => l.includes('"t":"bet"') && l.includes('"result":"won"'));
    if (i < 0) { console.error('no winning bet line'); process.exit(2); }
    const ev = JSON.parse(lines[i]); const w = ev.rec.raw.round.wagers[0]; const was = w.winningAmount;
    w.winningAmount = (Number(was) + 0.01).toFixed(8);
    lines[i] = JSON.stringify(ev);
    fs.writeFileSync(path.join(repo, rel), lines.join('\n'));
    repinFile(rel);
    note = `${rel} line ${i + 1}: bet ${ev.rec.betId}'s reply winningAmount ${was} -> ${w.winningAmount}; recorded byte length and SHA-256 left as received; export re-pinned`;
    break;
  }
  // ── Step 19: an account identifier planted in a shipped evidence file ─────────────────────────────────────────
  case 'identifier-planted': {
    const rel = 'evidence/E03-prod-verifier-target-100000.json';
    const t = fs.readFileSync(path.join(repo, rel), 'utf8');
    const o = JSON.parse(t); o.email = `audit@${'provablyfair'}.org`;
    fs.writeFileSync(path.join(repo, rel), JSON.stringify(o, null, 2));
    note = `${rel}: an e-mail field added at the top level (the file is recorded, not pinned; Steps 15 and 17 read other fields)`;
    break;
  }
  default:
    console.error(`unknown case ${kase}`); process.exit(2);
}
fs.writeFileSync(cfgPath, cfg);
console.log(`forged (${kase}): ${note}`);
