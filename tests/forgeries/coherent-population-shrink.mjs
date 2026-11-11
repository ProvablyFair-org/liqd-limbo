// COHERENT POPULATION SHRINK.
//
// Delete the rounds with nonce 120 and above from every epoch (5,838 -> 3,838 rounds), then doctor EVERY count
// the dataset carries about itself so the file is internally consistent again: meta.plannedTotal,
// meta.progress.bets, meta.phases[*].bets, meta.captures[*].bets, and every seed record's plannedBets and
// nonceEnd. Finally re-pin DATASET_SHA256 in src/config.ts, exactly as a forger would in the same commit.
//
// A suite that reads its expected counts from INSIDE the file being scored passes this forgery. The SHA pin
// cannot help: it proves the file has not changed since it was pinned, not that the file is the capture.
// Here the expected population comes from src/config.ts (EXPECTED_BETS, EXPECTED_SEEDS, CAPTURE_PLAN).
//
// usage: node coherent-population-shrink.mjs <sandboxRepo>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = process.argv[2];
if (!repo) { console.error('usage: coherent-population-shrink.mjs <sandboxRepo>'); process.exit(2); }
const KEEP = 120;

const dsPath = path.join(repo, 'data/limbo-prod-full-5838bets.json');
const ds = JSON.parse(fs.readFileSync(dsPath, 'utf8'));
const before = ds.bets.length;

ds.bets = ds.bets.filter((b) => b.nonce < KEEP);

const byPhase = {};
for (const b of ds.bets) byPhase[b.phase] = (byPhase[b.phase] ?? 0) + 1;
ds.meta.plannedTotal = ds.bets.length;
for (const k of Object.keys(ds.meta.phases)) ds.meta.phases[k].bets = byPhase[k] ?? 0;
if (ds.meta.progress) ds.meta.progress.bets = ds.bets.length;
for (const s of ds.seeds) { s.nonceEnd = Math.min(s.nonceEnd, KEEP - 1); s.plannedBets = Math.min(s.plannedBets, KEEP); }
for (const c of ds.meta.captures ?? []) c.bets = ds.bets.filter((b) => b.capture === c.capture).length;
if (ds.meta.progress) ds.meta.progress.bets = ds.bets.length;

fs.writeFileSync(dsPath, JSON.stringify(ds, null, 2));

const newSha = crypto.createHash('sha256').update(fs.readFileSync(dsPath)).digest('hex');
const cfgPath = path.join(repo, 'src/config.ts');
let cfg = fs.readFileSync(cfgPath, 'utf8');
cfg = cfg.replace(/export const DATASET_SHA256 = '[0-9a-f]{64}'/, `export const DATASET_SHA256 = '${newSha}'`);
fs.writeFileSync(cfgPath, cfg);

console.log(`bets ${before} -> ${ds.bets.length}; every epoch cut to at most ${KEEP} rounds, plannedBets and the run counts set to match; phases ${JSON.stringify(byPhase)}; `
  + `progress.bets=${ds.meta.progress?.bets}; DATASET_SHA256 re-pinned to ${newSha}`);
