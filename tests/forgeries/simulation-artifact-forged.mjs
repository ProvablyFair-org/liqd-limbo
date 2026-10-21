// SIMULATION ARTIFACT FORGED, AND RE-PINNED — a DECLARED SURVIVOR, not a kill.
//
// Rewrite `outputs/simulation-results.json` into an artifact no honest run could produce — a
// uniformity chi-squared of exactly 0 at 2,000,000 draws (p = 1.0, a perfect histogram), a serial
// correlation of exactly 0, and an effective-edge band whose simulated RTP is 1.05, i.e. a five
// percent PLAYER edge — leave every `pass` flag true, and re-pin SIMULATION_SHA256 in the same edit
// exactly as a fabricating auditor would.
//
// `npm run verify` still returns every scored step PASS — PROVABLY FAIR — Full Pass — and `npx mocha` still passes.
// That is the declared outcome, and the reason is structural rather than an oversight: no scored step
// re-derives a Pass-1 or Pass-2 statistic. tests/verify.ts says why in its header — "a Monte-Carlo
// artifact scored by the same process that generates it is not evidence" — and the RTP result of this
// audit is the closed-form edge identity of Step 16, anchored by the full-grid tally of Step 15 and
// tied to the operator by Step 5's reproduction of all 6,700 settled results. Not one of those
// depends on the simulation.
//
// WHAT STEP 19 DOES AND DOES NOT STOP (changed 2026-09-11). Step 19 now recomputes SIMULATION_SHA256
// and SIMULATION_HTML_SHA256, fails on an absent, unreadable or degenerate artifact, and binds the
// artifact's recorded sample depths to the SIM_* constants — the four executed counterexamples are in
// tests/structural-forgeries.json. None of that reaches THIS forgery, because this forgery re-pins in
// the same edit and preserves every declared depth, which is exactly what a fabricating auditor would
// do. So the pins enforce that the shipped bytes are the bytes the audit read; they do not establish
// that the statistics were measured. Any prose that says the simulation FIGURES are "verified" is
// claiming more than this repo executes.
//
// usage: node simulation-artifact-forged.mjs <sandboxRepo>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = process.argv[2];
if (!repo) { console.error('usage: simulation-artifact-forged.mjs <sandboxRepo>'); process.exit(2); }

const simPath = path.join(repo, 'outputs/simulation-results.json');
const sim = JSON.parse(fs.readFileSync(simPath, 'utf8'));

sim.pass1.uniformity.chi2 = 0;
sim.pass1.uniformity.pValue = 1;
sim.pass1.serial.lag1 = 0;
sim.pass1.serial.lag1Z = 0;
sim.pass1.serial.runsZ = 0;
sim.pass1.rtpConvergence.finalRTP = 1.05;
for (const p of sim.pass1.rtpConvergence.points) p.rtp = 1.05;
if (Array.isArray(sim.pass1.effectiveEdge) && sim.pass1.effectiveEdge.length) {
  sim.pass1.effectiveEdge[0].simulatedRTP = 1.05;
  sim.pass1.effectiveEdge[0].deltaSE = 0;
}

fs.writeFileSync(simPath, JSON.stringify(sim, null, 2));

const newSha = crypto.createHash('sha256').update(fs.readFileSync(simPath)).digest('hex');
const cfgPath = path.join(repo, 'src/config.ts');
let cfg = fs.readFileSync(cfgPath, 'utf8');
cfg = cfg.replace(/export const SIMULATION_SHA256 = '[0-9a-f]{64}'/, `export const SIMULATION_SHA256 = '${newSha}'`);
fs.writeFileSync(cfgPath, cfg);

console.log(`pass1 forged: uniformity chi2 = 0 (p = 1.0), lag1 = 0, runsZ = 0, every convergence point and the `
  + `first effective-edge band at RTP 1.05 (a 5% PLAYER edge), all pass flags left true; `
  + `SIMULATION_SHA256 re-pinned to ${newSha}`);
