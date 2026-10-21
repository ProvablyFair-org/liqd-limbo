/**
 * `npm run pass2:emit` — rewrite ONLY the `pass2` block of outputs/simulation-results.json with the
 * deterministic producer (src/pass2.ts), using the same serialiser as src/simulate.ts
 * (JSON.stringify(…, null, 2), no trailing newline). It was written while the Pass-1 half was still
 * fresh-seeded, so the Pass-2 rebuild could land without moving a Pass-1 figure; since 2026-09-26 the Pass-1
 * half is drawn from SIM_MASTER_SEED and `npm run simulate` reproduces the whole artifact. `--run` writes to outputs/run/ instead (the reproduction check). Re-pin SIMULATION_SHA256
 * in src/config.ts after an emit to the artifact of record.
 */
import * as fs from 'fs';
import * as path from 'path';
import { loadDataset } from './loader';
import { pass2Screen } from './pass2';
import { DATA_PATH, DATASET_SHA256 } from './config';

const root = path.join(__dirname, '..');
const src = path.join(root, 'outputs', 'simulation-results.json');
const out = process.argv.includes('--run') ? path.join(root, 'outputs', 'run', 'simulation-results.json') : src;
const art = JSON.parse(fs.readFileSync(src, 'utf8'));
const ds = loadDataset(path.join(root, DATA_PATH), DATASET_SHA256);
art.pass2 = { available: true, ...pass2Screen(ds.seeds, ds.bets) };
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(art, null, 2));
console.log(`pass2 written to ${path.relative(root, out)}: Z ${art.pass2.servedReturn.rankSumZ}, early/late ${art.pass2.earlyLateScreen.flags} flags vs ${art.pass2.earlyLateScreen.expected}, P ${art.pass2.earlyLateScreen.binomialP}`);
