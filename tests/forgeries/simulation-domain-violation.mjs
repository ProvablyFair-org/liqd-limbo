// LEGACY SIMULATION ARTIFACT given a physically impossible value (a p-value of 1.7) and RE-PINNED.
// Step 19 checks every numeric leaf of every pinned JSON artifact against src/domains.ts, so this
// must FAIL even though SIMULATION_SHA256 is moved in the same edit.
// usage: node simulation-domain-violation.mjs <sandboxRepo>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = process.argv[2];
if (!repo) { console.error('usage: simulation-domain-violation.mjs <sandboxRepo>'); process.exit(2); }
const p = path.join(repo, 'outputs/simulation-results.json');
const sim = JSON.parse(fs.readFileSync(p, 'utf8'));
sim.pass1.uniformity.pValue = 1.7;
const body = JSON.stringify(sim, null, 2);
fs.writeFileSync(p, body);
const sha = crypto.createHash('sha256').update(body).digest('hex');
const cfgPath = path.join(repo, 'src/config.ts');
fs.writeFileSync(cfgPath, fs.readFileSync(cfgPath, 'utf8').replace(/export const SIMULATION_SHA256 = '[0-9a-f]{64}'/, `export const SIMULATION_SHA256 = '${sha}'`));
console.log(`pass1.uniformity.pValue = 1.7; SIMULATION_SHA256 re-pinned to ${sha}`);
