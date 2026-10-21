/**
 * LIQD Limbo — Monte-Carlo simulation (Pass 1 + Pass 2).
 *
 * The limbo outcome is a SINGLE bias-free draw k ∈ [0, 1e8) at cursor 0 (src/rng.ts limboDraw),
 * mapped to a RESULT multiplier R = min(1e6, floor(9.9e9/(k+1))/100). A bet at target m wins iff
 * R ≥ m and pays stake·m. The RNG null is simply "k is uniform on [0,1e8) and serially
 * independent", a proper single-outcome multinomial, so standard chi² (df = bins−1) applies.
 *
 * Pass 1 — seeds from the recorded SIM_MASTER_SEED (sha256(SIM_MASTER_SEED|stream|n); crypto.randomBytes
 *   until 2026-09-26, when the artifact was regenerated from the recorded seed — every Pass-1 figure moved):
 *   1. Draw uniformity (scored): histogram of k pooled into 100 equal bins over N draws; chi² vs
 *      N/100, df = 99. Expected counts use a UNIFORM null (N/100), never any operator table.
 *   2. Serial independence (scored): lag-1 autocorrelation + runs test on the u = k/1e8 sequence
 *      (runs about the 0.5 midpoint).
 *   3. RTP convergence (informational + chart): a fixed strategy (target 2.00×) simulated to N
 *      bets; running RTP → theoreticalRTP with a Standard-Error band SE = σ/√n.
 *   4. Effective-edge table (scored): for representative targets across the legal range, the
 *      simulated return converges to theoreticalRTP(m) = 1 − effectiveEdge(m); the max
 *      |simRTP − theoRTP| must fall inside a 5·SE + buffer tolerance.
 *
 * Pass 2 — casino seeds from the captured dataset's revealed serverSeeds (src/pass2.ts, deterministic
 *   since 2026-09-26): every seed x 10,000 nonces, the served-target return of the captured window ranked
 *   against the other 199 windows (exact permutation null), plus the early/late chi-squared screen
 *   recounted against its EXACT multinomial null. Gated on the dataset (available:false until then).
 *
 * Output: outputs/simulation-results.json, outputs/rtp-convergence.html
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';

import { limboDraw, generateProvablyFairNumber } from './rng';
import { chiSquaredTest, lag1Autocorrelation, runsTest, inverseCriticalZ, binomialTailP } from './stats';
import {
  RANGE, CURSOR, HOUSE_EDGE, RESULT_NUMERATOR, MAX_MULTIPLIER, MULTIPLIER_SCALE,
  SIM_UNIFORMITY_DRAWS, SIM_SERIAL_DRAWS, SIM_EDGE_BETS, SIM_MASTER_SEED,
  resultMultiplier, winChance, theoreticalRTP, effectiveEdge, limboWin, DATA_PATH, DATASET_SHA256 } from './config';
import { loadDataset } from './loader';
import { pass2Screen } from './pass2';

// `--run` writes the regeneration to outputs/run/ (test:full) instead of over the pinned artifacts of
// record. Since 2026-09-26 every seed comes from SIM_MASTER_SEED and Pass 2 is deterministic (src/pass2.ts),
// so a regeneration must equal the committed copy byte for byte (`npm run simulate:check`). Without `--run`
// it rewrites the committed artifacts, which then have to be re-pinned in src/config.ts.
const OUT = path.join(__dirname, '../outputs', process.argv.includes('--run') ? 'run' : '');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const P1_DRAWS = SIM_UNIFORMITY_DRAWS;   // Pass-1 uniformity draw sample (2,000,000)
const SERIAL_DRAWS = SIM_SERIAL_DRAWS;   // serial (lag-1 / runs) analysed on the first 200,000
const RTP_BETS = 20_000_000;             // RTP convergence depth
const EDGE_BETS = SIM_EDGE_BETS;         // per-target effective-edge sim depth (2,000,000)
const ALPHA = 0.01;
// Pinned dataset hash — set once the capture exists so Pass 2 loads through the SHA-256-guarded
// loader (a tampered dataset then aborts the simulation rather than being scored). Empty until capture.
// Both of these were placeholders written before the capture existed, and both were silently
// wrong once it did: the filename never matched the frozen dataset, and the hash was empty, so
// `loadDataset` was called with no pin. The combination meant `pass2()` hit its `existsSync` guard
// and returned `available: false` — Pass 2 simply did not run, and said so only in a field nobody
// was reading yet. A capture-gated branch that silently reports "not available" is indistinguishable
// from one that ran and found nothing.
//
// Read both from src/config.ts so there is ONE dataset path and ONE pin in this repo. A second copy
// is how a producer keeps emitting against the old file while the verifier reads the new one.
const DATASET_PATH = path.join(__dirname, '..', DATA_PATH);
const EXPECTED_DATASET_HASH = DATASET_SHA256;

// A named, replayable seed stream: the n-th call returns sha256(SIM_MASTER_SEED|stream|n) cut to 32 hex chars
// (operator format). Each call site below draws from its own stream in the order the fresh-randomness
// producer drew, so the experiment's structure is unchanged — only its source of seeds is now recorded.
function seedStream(stream: string): () => string {
  let n = 0;
  return () => createHash('sha256').update(`${SIM_MASTER_SEED}|${stream}|${n++}`).digest('hex').slice(0, 32);
}

// A fast single draw from a seed stream — one HMAC per draw, cursor 0.
function drawFrom(serverSeed: string, clientSeed: string, nonce: number): number {
  return generateProvablyFairNumber(serverSeed, clientSeed, nonce, CURSOR, RANGE);
}
// Result multiplier from a draw stream, through THE one implementation of the formula (src/config.ts
// resultMultiplier, with the 1.00 floor). Until 2026-10-02 this was a second copy without the floor —
// the defect class the report says was removed by keeping one implementation. `npm run simulate:check`
// reproduces the committed artifacts byte for byte either way: no figure this producer emits moved.
function resultFrom(serverSeed: string, clientSeed: string, nonce: number): number {
  return resultMultiplier(drawFrom(serverSeed, clientSeed, nonce));
}

// ───────────────────────── Pass 1 ─────────────────────────
function pass1() {
  // (1) Draw uniformity over 100 equal bins of the [0,1e8) domain.
  const BINS = 100, per = RANGE / BINS;
  const hist = new Array(BINS).fill(0);
  const uSeq: number[] = [];
  const runsSeq: number[] = [];
  const uniSeed = seedStream('uniformity');
  let ss = uniSeed(); const cs = uniSeed();
  for (let i = 0; i < P1_DRAWS; i++) {
    if (i % 50 === 0) ss = uniSeed();                // rotate seed like real epochs
    const k = drawFrom(ss, cs, i % 50);
    hist[Math.min(BINS - 1, Math.floor(k / per))]++;
    if (i < SERIAL_DRAWS) { const u = k / RANGE; uSeq.push(u); runsSeq.push(u >= 0.5 ? 1 : 0); }
  }
  const expected = new Array(BINS).fill(P1_DRAWS / BINS);
  const uni = chiSquaredTest(hist, expected);

  // (2) Serial independence on the u = k/1e8 sequence.
  const lag1 = lag1Autocorrelation(uSeq);
  const zcrit = inverseCriticalZ(ALPHA);
  const lag1Z = lag1 * Math.sqrt(uSeq.length);
  const runs = runsTest(runsSeq);

  // (3) RTP convergence for a fixed strategy (target 2.00×).
  const target = 2.00;
  const points: { n: number; rtp: number; se: number }[] = [];
  let wins = 0, staked = 0, won = 0;
  const rtpSeed = seedStream('rtp-convergence');
  let cs2 = rtpSeed(), ss2 = rtpSeed();
  const marks = new Set([1e3, 1e4, 1e5, 1e6, 5e6, 1e7, RTP_BETS].map(Number));
  for (let i = 1; i <= RTP_BETS; i++) {
    if (i % 50 === 1) ss2 = rtpSeed();
    const R = resultFrom(ss2, cs2, i % 50);
    staked += 1; if (limboWin(R, target)) { won += target; wins++; }
    if (marks.has(i)) {
      const rtp = won / staked;
      const p = wins / i, varr = p * (target - rtp) ** 2 + (1 - p) * (0 - rtp) ** 2;
      points.push({ n: i, rtp, se: Math.sqrt(varr / i) });
    }
  }
  const finalRtp = won / staked;

  // (4) Effective-edge table across the legal target range.
  const edgeTargets: { label: string; m: number }[] = [
    { label: 'target 1.10× (90.00%)', m: 1.10 },
    { label: 'target 1.50× (66.00%)', m: 1.50 },
    { label: 'target 2.00× (49.50%)', m: 2.00 },
    { label: 'target 5.00× (19.80%)', m: 5.00 },
    { label: 'target 10.00× (9.90%)', m: 10.00 },
    { label: 'target 20.14× (4.91%)', m: 20.14 },
    { label: 'target 100.00× (0.99%)', m: 100.00 },
    { label: 'target 1000.00× (0.099%)', m: 1000.00 },
  ];
  const edgeRows = edgeTargets.map(({ label, m }) => {
    let st = 0, wn = 0, wi = 0;
    const edgeSeed = seedStream(`edge:${m}`);
    let s = edgeSeed(), c = edgeSeed();
    for (let i = 0; i < EDGE_BETS; i++) {
      if (i % 50 === 0) s = edgeSeed();
      const R = resultFrom(s, c, i % 50);
      st += 1; if (limboWin(R, m)) { wn += m; wi++; }
    }
    const simRtp = wn / st, theo = theoreticalRTP(m);
    const pr = winChance(m);
    const se = Math.sqrt(pr * (m - simRtp) ** 2 + (1 - pr) * simRtp ** 2) / Math.sqrt(EDGE_BETS);
    return {
      label, target: m, winChancePct: +(pr * 100).toFixed(4),
      theoreticalRTP: +theo.toFixed(6), theoreticalEdgePct: +((1 - theo) * 100).toFixed(4),
      simulatedRTP: +simRtp.toFixed(6), deltaSE: +(Math.abs(simRtp - theo) / se).toFixed(2), tolSE: 5,
      // n + se stored so the verify step can RECOMPUTE the within-tolerance predicate from the
      // statistics rather than trusting this row's own `withinTol` boolean.
      n: EDGE_BETS, se: +se.toExponential(6),
      withinTol: Math.abs(simRtp - theo) <= 5 * se + 1e-4,
    };
  });

  return {
    masterSeed: SIM_MASTER_SEED,
    draws: P1_DRAWS,
    uniformity: { bins: BINS, chi2: +uni.chi2.toFixed(3), df: uni.df, pValue: +uni.pValue.toFixed(4), pass: uni.pValue >= ALPHA },
    serial: {
      lag1, lag1Z: +lag1Z.toFixed(3), zCritical: +zcrit.toFixed(3),
      runsZ: +runs.z.toFixed(3), runsP: +runs.pValue.toFixed(4),
      pass: Math.abs(lag1Z) < zcrit && runs.pValue >= ALPHA,
    },
    rtpConvergence: { strategy: 'target 2.00×', multiplier: 2.00, theoreticalRTP: +theoreticalRTP(2.00).toFixed(6), finalRTP: +finalRtp.toFixed(6), points },
    effectiveEdge: edgeRows,
  };
}

// ───────────────────────── Pass 2 ─────────────────────────
// Deterministic since 2026-09-26: src/pass2.ts, the same function Step 24 re-derives from.
function pass2() {
  if (!fs.existsSync(DATASET_PATH)) return { available: false as const };
  const ds = loadDataset(DATASET_PATH, EXPECTED_DATASET_HASH || undefined);   // SHA-256-guarded
  return { available: true as const, ...pass2Screen(ds.seeds, ds.bets) };
}

// ───────────────────────── Chart ─────────────────────────
function writeChart(rtp: { points: { n: number; rtp: number; se: number }[]; theoreticalRTP: number }) {
  const pts = rtp.points;
  const W = 900, H = 420, ml = 70, mr = 30, mt = 30, mb = 50;
  const iw = W - ml - mr, ih = H - mt - mb;
  const xs = pts.map(p => Math.log10(p.n));
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = 0.95, ymax = 1.05;
  const X = (n: number) => ml + (Math.log10(n) - xmin) / (xmax - xmin) * iw;
  const Y = (v: number) => mt + (ymax - v) / (ymax - ymin) * ih;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.n).toFixed(1)},${Y(p.rtp).toFixed(1)}`).join(' ');
  const bandTop = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.n).toFixed(1)},${Y(Math.min(ymax, p.rtp + 5 * p.se)).toFixed(1)}`).join(' ');
  const bandBot = pts.slice().reverse().map((p) => `L${X(p.n).toFixed(1)},${Y(Math.max(ymin, p.rtp - 5 * p.se)).toFixed(1)}`).join(' ');
  const theoY = Y(rtp.theoreticalRTP);
  const xticks = pts.map(p => `<text x="${X(p.n).toFixed(1)}" y="${H - mb + 18}" font-size="11" text-anchor="middle" fill="#666">${p.n >= 1e6 ? p.n / 1e6 + 'M' : p.n >= 1e3 ? p.n / 1e3 + 'k' : p.n}</text>`).join('');
  const yticks = [0.95, 0.97, 0.99, 1.01, 1.03, 1.05].map(v => `<line x1="${ml}" y1="${Y(v).toFixed(1)}" x2="${W - mr}" y2="${Y(v).toFixed(1)}" stroke="#eee"/><text x="${ml - 8}" y="${(Y(v) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#666">${(v * 100).toFixed(0)}%</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui,sans-serif">
<rect width="${W}" height="${H}" fill="#fff"/>${yticks}${xticks}
<path d="${bandTop} ${bandBot} Z" fill="#3b82f6" opacity="0.12"/>
<line x1="${ml}" y1="${theoY.toFixed(1)}" x2="${W - mr}" y2="${theoY.toFixed(1)}" stroke="#16a34a" stroke-dasharray="5,4" stroke-width="1.5"/>
<text x="${W - mr}" y="${(theoY - 6).toFixed(1)}" font-size="11" text-anchor="end" fill="#16a34a">theoretical RTP ${(rtp.theoreticalRTP * 100).toFixed(2)}%</text>
<path d="${line}" fill="none" stroke="#1e3a8a" stroke-width="2"/>
<text x="${ml}" y="18" font-size="13" font-weight="600" fill="#111">Limbo RTP convergence — target 2.00×, ±5·SE band (SE = σ/√n)</text>
<text x="${(ml + iw / 2).toFixed(0)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#666">bets (log scale)</text>
</svg>`;
  fs.writeFileSync(path.join(OUT, 'rtp-convergence.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Limbo RTP convergence</title></head><body style="margin:24px;font-family:system-ui">${svg}</body></html>`);
}

// ───────────────────────── main ─────────────────────────
console.log('\n── LIQD Limbo simulation ──');
const p1 = pass1();
console.log(`  Pass 1 draw uniformity : chi2=${p1.uniformity.chi2} df=${p1.uniformity.df} p=${p1.uniformity.pValue} ${p1.uniformity.pass ? '✓' : '✗'}`);
console.log(`  Pass 1 serial          : lag1Z=${p1.serial.lag1Z} runsP=${p1.serial.runsP} ${p1.serial.pass ? '✓' : '✗'}`);
console.log(`  Pass 1 RTP (target 2×) : sim ${(p1.rtpConvergence.finalRTP * 100).toFixed(3)}%  theo ${(p1.rtpConvergence.theoreticalRTP * 100).toFixed(3)}%`);
console.log(`  Pass 1 effective-edge  : ${p1.effectiveEdge.filter(r => r.withinTol).length}/${p1.effectiveEdge.length} targets within 5·SE`);
const p2 = pass2();
if (p2.available) console.log(`  Pass 2 casino seeds    : ${p2.seedsTested} seeds x ${p2.noncesPerSeed} nonces, served-target rank-sum Z ${p2.servedReturn.rankSumZ} (rule Z < ${p2.servedReturn.zCritical.toFixed(3)}); early/late screen ${p2.earlyLateScreen.flags} flags vs ${p2.earlyLateScreen.expected} expected, binomial P ${p2.earlyLateScreen.binomialP}`);
else console.log('  Pass 2 casino seeds    : dataset not present — deferred to capture');
writeChart(p1.rtpConvergence);

// No run metadata (no generatedAt): a pinned artifact of record must not carry the time it was made
// (profile LIMBO-27). The committed copy had its generatedAt removed 2026-09-26 by this same
// JSON.stringify(…, null, 2) call, 0 values changed, and was re-pinned in src/config.ts.
fs.writeFileSync(path.join(OUT, 'simulation-results.json'), JSON.stringify({
  model: { range: RANGE, cursor: CURSOR, resultNumerator: RESULT_NUMERATOR, maxMultiplier: MAX_MULTIPLIER, houseEdge: HOUSE_EDGE },
  pass1: p1, pass2: p2,
}, null, 2));
console.log(`  Output: ${path.relative(path.join(__dirname, '..'), OUT) || '.'}/simulation-results.json, rtp-convergence.html\n`);

// Reproduction check (profile LIMBO-28): a `--run` regeneration is compared with the committed artifacts of
// record byte for byte — every seed is derived from SIM_MASTER_SEED and Pass 2 is deterministic, so any
// difference is a different result. The verdict and the runtime go to outputs/run/simulation-diff.json.
if (process.argv.includes('--run')) {
  const committedDir = path.join(__dirname, '..', 'outputs');
  const files = ['simulation-results.json', 'rtp-convergence.html'];
  const result = files.map((f) => {
    const committed = path.join(committedDir, f);
    const same = fs.existsSync(committed) && fs.readFileSync(committed, 'utf8') === fs.readFileSync(path.join(OUT, f), 'utf8');
    return { file: `outputs/${f}`, reproducedByteForByte: same };
  });
  const ok = result.every((r) => r.reproducedByteForByte);
  fs.writeFileSync(path.join(OUT, 'simulation-diff.json'), JSON.stringify({
    runtime: process.versions.node, masterSeed: SIM_MASTER_SEED, reproducedByteForByte: ok, files: result,
    note: 'every Pass-1 seed is sha256(SIM_MASTER_SEED|stream|n) and Pass 2 is deterministic, so the regeneration must equal the committed artifacts byte for byte',
  }, null, 2));
  console.log(`  simulate: regeneration vs committed artifacts: ${ok ? 'BYTE-IDENTICAL' : 'DIFFERS'} (${result.map((r) => `${r.file} ${r.reproducedByteForByte ? 'same' : 'DIFFERS'}`).join(', ')})`);
  if (!ok) process.exit(1);
}
export {};
