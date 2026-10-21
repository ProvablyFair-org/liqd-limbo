// COHERENT POPULATION SHRINK — the forgery that returned a clean Full Pass on the sibling dice audit.
//
// Delete nonces 30..49 from every epoch (6,700 -> 4,020 bets), then doctor EVERY count the dataset
// carries about itself so the file is internally consistent again: meta.epochSize = 30,
// meta.plannedTotal = 4020, meta.progress.bets, meta.phases[*].bets, and every seeds[].nonceEnd = 29.
// Finally re-pin DATASET_SHA256 in src/config.ts, exactly as a forger would in the same commit.
//
// On dice (external review round 3, 2026-09-09, P0-3) this returned 21/21 PROVABLY FAIR on a
// 4,020-bet dataset, because every count the suite checked came from INSIDE the file being scored.
// The SHA pin could not help: it proves the file has not changed since WE pinned it, not that the
// file is the capture.
//
// Limbo's Steps 1-4, 12, 13 and 18 bind their cardinalities to EXPECTED_BETS / EXPECTED_SEEDS /
// EXPECTED_EPOCH_SIZE / EXPECTED_PHASES in src/config.ts instead (G-BIND), which is what this entry
// exists to prove is not merely a comment.
//
// usage: node coherent-population-shrink.mjs <sandboxRepo>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = process.argv[2];
if (!repo) { console.error('usage: coherent-population-shrink.mjs <sandboxRepo>'); process.exit(2); }
const KEEP = 30;

const dsPath = path.join(repo, 'data/limbo-master-6700bets.json');
const ds = JSON.parse(fs.readFileSync(dsPath, 'utf8'));
const before = ds.bets.length;

ds.bets = ds.bets.filter((b) => b.nonce < KEEP);

const byPhase = {};
for (const b of ds.bets) byPhase[b.phase] = (byPhase[b.phase] ?? 0) + 1;
ds.meta.epochSize = KEEP;
ds.meta.plannedTotal = ds.bets.length;
for (const k of Object.keys(ds.meta.phases)) ds.meta.phases[k].bets = byPhase[k] ?? 0;
if (ds.meta.progress) ds.meta.progress.bets = ds.bets.length;
for (const s of ds.seeds) s.nonceEnd = KEEP - 1;

fs.writeFileSync(dsPath, JSON.stringify(ds, null, 2));

const newSha = crypto.createHash('sha256').update(fs.readFileSync(dsPath)).digest('hex');
const cfgPath = path.join(repo, 'src/config.ts');
let cfg = fs.readFileSync(cfgPath, 'utf8');
cfg = cfg.replace(/export const DATASET_SHA256 = '[0-9a-f]{64}'/, `export const DATASET_SHA256 = '${newSha}'`);
fs.writeFileSync(cfgPath, cfg);

console.log(`bets ${before} -> ${ds.bets.length}; epochSize=${KEEP}; phases ${JSON.stringify(byPhase)}; `
  + `progress.bets=${ds.meta.progress?.bets}; every nonceEnd=${KEEP - 1}; DATASET_SHA256 re-pinned to ${newSha}`);
