// PASS-1 GRID FORGERIES, each RE-PINNED — Step 23 re-derives Pass 1 from outputs/pass1-grid.json.
//
// usage: node pass1-grid-forged.mjs <sandboxRepo> <mode>
//   prefix   — one target's stored prefix win count moved by 1: the rows no longer replay from the
//              recorded master seed (Step 23's prefix replay must fail)
//   wins     — target 2x loses 4,000 wins (~8.9 sd): the RTP-convergence band must fail
//   seed     — the recorded master seed rewritten: the artifact no longer names the seed it was drawn from
//   metadata — a generatedAt timestamp added: a pinned artifact must carry no run metadata
//   bins     — 500 counts moved between two histogram bins, totals kept: re-derivation still passes
//              (chi2 moves, p stays high), prefix untouched — killed only by the run-vs-committed-artifact
//              reproduction gate noticing the digest in Step 23's detail moved (byte identity), and
//              by `npm run pass1:check`, which replays all 12,000,000 draws. Declared as a marker kill.
// Every mode re-pins PASS1_GRID_SHA256 in the same edit, exactly as a fabricating auditor would.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [repo, mode] = process.argv.slice(2);
if (!repo || !mode) { console.error('usage: pass1-grid-forged.mjs <sandboxRepo> <mode>'); process.exit(2); }
const p = path.join(repo, 'outputs/pass1-grid.json');
const g = JSON.parse(fs.readFileSync(p, 'utf8'));
if (mode === 'prefix') g.targets[4].prefixWins += 1;
else if (mode === 'wins') g.targets[2].wins -= 4000;
else if (mode === 'seed') g.masterSeed = 'pf.org/liqd-limbo/pass1/FORGED';
else if (mode === 'metadata') g.generatedAt = '2026-09-26T00:00:00.000Z';
else if (mode === 'bins') { g.uniformity.hist[0] += 500; g.uniformity.hist[1] -= 500; }
else { console.error(`unknown mode ${mode}`); process.exit(2); }
const body = JSON.stringify(g, null, 2) + '\n';
fs.writeFileSync(p, body);
const sha = crypto.createHash('sha256').update(body).digest('hex');
const cfgPath = path.join(repo, 'src/config.ts');
fs.writeFileSync(cfgPath, fs.readFileSync(cfgPath, 'utf8').replace(/export const PASS1_GRID_SHA256 = '[0-9a-f]{64}'/, `export const PASS1_GRID_SHA256 = '${sha}'`));
console.log(`pass1-grid forged (${mode}); PASS1_GRID_SHA256 re-pinned to ${sha}`);
