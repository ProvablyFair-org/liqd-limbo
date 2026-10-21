// A CAPTURE-RETRY NONCE GAP, declared — Step 4 must DISCLOSE it as a FLAG with origin = capture,
// never pass it silently and never fail the operator for it (profile LIMBO-04).
// The round at epoch 5 nonce 25 is removed, DECLARED_CAPTURE_GAPS names it, and the dataset is
// re-pinned; the population constants are left alone, so Step 12 also fails (the audited population
// is 6,700) — the entry names Step 4, whose [FLAG] line is what is under test.
// usage: node declared-capture-gap.mjs <sandboxRepo>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = process.argv[2];
if (!repo) { console.error('usage: declared-capture-gap.mjs <sandboxRepo>'); process.exit(2); }
const dp = path.join(repo, 'data/limbo-master-6700bets.json');
const raw = fs.readFileSync(dp, 'utf8');
const d = JSON.parse(raw);
d.bets = d.bets.filter((b) => !(b.epoch === 5 && b.nonce === 25));
const out = JSON.stringify(d, null, raw.startsWith('{\n  ') ? 2 : undefined);
fs.writeFileSync(dp, out);
const sha = crypto.createHash('sha256').update(out).digest('hex');
const cfgPath = path.join(repo, 'src/config.ts');
let cfg = fs.readFileSync(cfgPath, 'utf8');
cfg = cfg.replace(/export const DATASET_SHA256 = '[0-9a-f]{64}'/, `export const DATASET_SHA256 = '${sha}'`);
cfg = cfg.replace('export const DECLARED_CAPTURE_GAPS: ReadonlyArray<{ epoch: number; nonce: number }> = [];',
  'export const DECLARED_CAPTURE_GAPS: ReadonlyArray<{ epoch: number; nonce: number }> = [{ epoch: 5, nonce: 25 }];');
fs.writeFileSync(cfgPath, cfg);
console.log(`round epoch 5 nonce 25 removed and declared as a capture retry; DATASET_SHA256 re-pinned to ${sha}`);
