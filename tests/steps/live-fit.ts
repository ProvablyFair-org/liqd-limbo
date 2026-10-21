/**
 * Step 22: Live-sample fit (profile LIMBO-22, policy INFORMATIONAL — 2026-09-29).
 *
 * The captured rounds are a few thousand draws, so this has little power and never bears the verdict:
 * a trip is reported as INFO, which verify.ts discloses but never counts as a flag and never lets
 * change the verdict class. It is SCORED rather than printed as an info item so that it can be shown able to fail
 * (tests/mutations.json kills it by sorting the draws).
 *
 * What is tested, on the draws k recomputed from the revealed seeds (never on a served field):
 *   • fit of the draw to its uniform domain [0, RANGE): chi-squared over 100 equal bins and a
 *     Kolmogorov–Smirnov test of u = k / RANGE against U(0,1). Because R = min(cap, max(1,
 *     floor(N/(k+1))/100)) is a monotone function of k, this is the fit of the result distribution
 *     P(R >= x) itself on its continuous part;
 *   • the point mass at the result floor R = 1, counted separately: observed against
 *     1 − floor(N/101)/RANGE, as a binomial z;
 *   • serial dependence in capture order: lag-1 autocorrelation z and a Wald–Wolfowitz runs test
 *     about 0.5 — the framework's cross-game rule |z| < 3 and runs p >= 0.01.
 * The thresholds are fixed here, before the data are read: chi-squared p >= 0.01, KS p >= 0.01,
 * |floor z| < 3, |lag-1 z| < 3, runs p >= 0.01.
 */

import type { StepResult, VerifyContext } from './context';
import { step } from './context';
import { limboDraw } from '../../src/rng';
import { chiSquaredTest, lag1Autocorrelation, runsTest } from '../../src/stats';
import { RANGE, RESULT_NUMERATOR, MIN_MULTIPLIER, MULTIPLIER_SCALE, EXPECTED_BETS, resultMultiplier, MIN_RESULT } from '../../src/config';

const ALPHA = 0.01;
const Z_MAX = 3;
const BINS = 100;

/** Asymptotic Kolmogorov distribution tail: P(K > x) = 2 Σ (-1)^(j-1) exp(-2 j^2 x^2). */
function kolmogorovP(d: number, n: number): number {
  const sqrtN = Math.sqrt(n);
  const x = (sqrtN + 0.12 + 0.11 / sqrtN) * d;   // Stephens' finite-n correction
  let sum = 0;
  for (let j = 1; j <= 100; j++) {
    const term = Math.exp(-2 * j * j * x * x);
    sum += (j % 2 === 1 ? 1 : -1) * term;
    if (term < 1e-12) break;
  }
  return Math.min(1, Math.max(0, 2 * sum));
}

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, seedMap } = ctx;
  // capture order: the dataset's own row order is the order the rig placed the rounds
  const draws: number[] = [];
  let floorObserved = 0;
  for (const b of bets) {
    const ss = seedMap.get(b.hashedServerSeed);
    if (!ss) continue;
    const k = limboDraw(ss, b.clientSeed, b.nonce);
    draws.push(k);
    if (resultMultiplier(k) === MIN_RESULT) floorObserved++;
  }
  const n = draws.length;

  const hist = new Array(BINS).fill(0);
  for (const k of draws) hist[Math.min(BINS - 1, Math.floor(k / (RANGE / BINS)))]++;
  const chi = chiSquaredTest(hist, new Array(BINS).fill(n / BINS));

  const u = draws.map((k) => k / RANGE).sort((a, z) => a - z);
  let dMax = 0;
  for (let i = 0; i < n; i++) dMax = Math.max(dMax, (i + 1) / n - u[i], u[i] - i / n);
  const ksP = kolmogorovP(dMax, n);

  // P(R = floor): every draw whose raw result is below the minimum legal target maps to the floor
  const pFloor = 1 - Math.floor(RESULT_NUMERATOR / Math.round(MIN_MULTIPLIER * MULTIPLIER_SCALE)) / RANGE;
  const floorZ = (floorObserved - n * pFloor) / Math.sqrt(n * pFloor * (1 - pFloor));

  const seq = draws.map((k) => k / RANGE);
  const lag1 = lag1Autocorrelation(seq);
  const lag1Z = lag1 * Math.sqrt(n);
  const runs = runsTest(seq.map((x) => (x >= 0.5 ? 1 : 0)));

  const coverageOk = n === EXPECTED_BETS;
  const fitOk = chi.pValue >= ALPHA && ksP >= ALPHA && Math.abs(floorZ) < Z_MAX
    && Math.abs(lag1Z) < Z_MAX && runs.pValue >= ALPHA;

  const detail = `${n}/${EXPECTED_BETS} recomputed draws in capture order (informational — policy INFORMATIONAL, never verdict-bearing): `
    + `uniform fit chi2 ${chi.chi2.toFixed(3)} df ${chi.df} p ${chi.pValue.toFixed(4)} over ${BINS} bins; KS D ${dMax.toFixed(5)} p ${ksP.toFixed(4)} against U(0,1); `
    + `point mass at R = ${MIN_RESULT}x: ${floorObserved} observed vs ${(n * pFloor).toFixed(2)} expected (p = ${(pFloor * 100).toFixed(6)}%), z ${floorZ.toFixed(3)}; `
    + `serial: lag-1 r ${lag1.toFixed(6)} z ${lag1Z.toFixed(3)}, runs z ${runs.z.toFixed(3)} p ${runs.pValue.toFixed(4)}; `
    + `thresholds fixed in code on 2026-09-26, p >= ${ALPHA}, |z| < ${Z_MAX} — ${fitOk ? 'all met' : 'NOT all met: reported as INFO, not counted, verdict unchanged'}`;

  if (!coverageOk) return [step(22, 'Live-Sample Fit', 'FAIL', `COVERAGE: ${detail}`)];
  return [fitOk
    ? step(22, 'Live-Sample Fit', 'PASS', detail)
    : step(22, 'Live-Sample Fit', 'INFO', detail)];
}
