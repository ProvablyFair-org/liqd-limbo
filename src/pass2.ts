/**
 * Simulation Pass 2 — the cherry-pick screen over the operator's own revealed seeds (profile LIMBO-21).
 *
 * REBUILT 2026-09-26. The screen this replaces drew its null from 10,000 UNSEEDED bootstrap
 * replicates (crypto.randomBytes on every run) and compared the flag count with an ASSUMED rate
 * p0 = 0.05 x 0.95 = 0.0475. Both broke audit-rules RULE 22a/22b: the published count (11 flags,
 * P 0.0550) came out 9, 10 or 11 on re-runs, and one of the 11 (epoch 87) was a 7.1e-15 floating-point
 * wobble in a chi-squared that equals epoch 29's exactly. Everything below is DETERMINISTIC — there is
 * no random number anywhere in this file — so verify re-derives it bit for bit (Step 24).
 *
 * Two screens, both over every revealed seed, fixed in code on 2026-09-26 — 15 days after the capture and
 * after an earlier screen had run on the same data (no dated registration ships with the package):
 *
 *  A. SERVED-TARGET RETURN, 10,000 nonces per seed (the profile's statistic). For each epoch the 50
 *     targets the casino actually served at nonces 0..49 are replayed on nonces 0..PASS2_NONCES-1
 *     (nonce n bets the target served at nonce n mod 50, unit stake). The 10,000 nonces form 200
 *     disjoint windows of 50 that bet the same targets in the same order, so under "no cherry-pick" the
 *     captured window (window 0) is exchangeable with the other 199 and its rank among the 200 window
 *     returns — each standardised by the EXACT per-target mean and variance, p = floor(N/ci)/RANGE — is
 *     uniform: an exact permutation null, no bootstrap and no assumed rate. Rank sums over epochs give Z;
 *     the one-sided rule is "cherry-pick indicated at Z < PASS2_Z_CRIT" (captured windows
 *     systematically worse for the player). Window 0 must also reproduce every captured result exactly.
 *
 *  B. THE ORIGINAL EARLY/LATE UNIFORMITY SCREEN, RECOUNTED BY THE EXACT METHOD. Early = the 50 captured
 *     nonces 0..49, late = nonces 50..99; statistic = Pearson chi-squared of the 50 draws over 20
 *     equiprobable bins (RANGE/20 = 5,000,000 exactly). chi2 = 0.4·Q − 50 with Q = Σ h², so it is compared
 *     on the INTEGER Q and two mathematically equal scores always compare equal. Its null is computed
 *     EXACTLY: the multinomial(50; 20 x 1/20) distribution of Q by an integer (BigInt) dynamic programme
 *     over the bins, total 20^50. The flag rule is unchanged (early p < 0.05 and late p >= 0.05), the
 *     critical Q is the smallest with P(Q >= q) < 0.05, and the flag rate is p0 = a(1 − a) with a the
 *     attained size — computed, not assumed.
 */

import { generateProvablyFairNumber } from './rng';
import {
  RANGE, CURSOR, RESULT_NUMERATOR, targetToHundredths, resultMultiplier, limboWin,
  PASS2_NONCES, PASS2_WINDOW, PASS2_Z_CRIT, PASS2_SCREEN_ALPHA, PASS2_BINS,
} from './config';
import { binomialTailP, chiSquaredTest, twoSidedNormalP } from './stats';
import type { Seed, Bet } from './types';

/** Lower-tail normal probability, from the suite's own twoSidedNormalP (src/stats.ts). */
function normalCdf(z: number): number {
  const two = twoSidedNormalP(z);
  return z < 0 ? two / 2 : 1 - two / 2;
}

/** Exact null of Q = Σ h_i² for `balls` draws into `bins` equiprobable bins: counts summing to bins^balls. */
export function exactQNull(balls: number, bins: number): { q: number[]; count: bigint[]; total: bigint } {
  const C: bigint[][] = [];
  for (let n = 0; n <= balls; n++) { C[n] = []; for (let k = 0; k <= n; k++) C[n][k] = k === 0 || k === n ? 1n : C[n - 1][k - 1] + C[n - 1][k]; }
  let f = new Map<number, Map<number, bigint>>([[0, new Map([[0, 1n]])]]);
  for (let i = 0; i < bins; i++) {
    const g = new Map<number, Map<number, bigint>>();
    for (const [n, byQ] of f) for (const [q, v] of byQ) for (let h = 0; n + h <= balls; h++) {
      const m = g.get(n + h) ?? new Map<number, bigint>();
      m.set(q + h * h, (m.get(q + h * h) ?? 0n) + v * C[n + h][h]);
      g.set(n + h, m);
    }
    f = g;
  }
  const byQ = f.get(balls)!;
  const q = [...byQ.keys()].sort((a, b) => a - b);
  const count = q.map((x) => byQ.get(x)!);
  return { q, count, total: BigInt(bins) ** BigInt(balls) };
}

/** Ratio of two BigInts as a double, exact to ~1e-15. */
const ratio = (a: bigint, b: bigint): number => Number((a * 10n ** 18n) / b) / 1e18;

export function pass2Screen(seeds: Seed[], bets: Bet[]) {
  // ── A. served-target return over PASS2_NONCES nonces per revealed seed ─────────────────────────────
  const byEpoch = new Map<number, Bet[]>();
  for (const b of bets) (byEpoch.get(b.epoch) ?? byEpoch.set(b.epoch, []).get(b.epoch)!).push(b);
  const WINDOWS = PASS2_NONCES / PASS2_WINDOW;
  let epochs = 0, noncesTotal = 0, replayMismatches = 0, rankSum = 0, rankVar = 0, below = 0, above = 0;
  let capturedReturn = 0, capturedExpected = 0;
  const perSeed: { epoch: number; capturedRank: number; earlyQ: number; lateQ: number; flag: boolean }[] = [];

  // ── B. exact null for the early/late chi-squared screen ────────────────────────────────────────────
  const nul = exactQNull(PASS2_WINDOW, PASS2_BINS);
  const alphaNum = BigInt(Math.round(PASS2_SCREEN_ALPHA * 1e6)), alphaDen = 1_000_000n;
  let tail = 0n; const tailGE = new Map<number, bigint>();
  for (let i = nul.q.length - 1; i >= 0; i--) { tail += nul.count[i]; tailGE.set(nul.q[i], tail); }
  // smallest attainable q with P(Q >= q) < alpha, decided in integers: tail·alphaDen < alphaNum·total
  const criticalQ = nul.q.find((q) => tailGE.get(q)! * alphaDen < alphaNum * nul.total)!;
  const size = ratio(tailGE.get(criticalQ)!, nul.total);
  const p0 = size * (1 - size);
  const per = RANGE / PASS2_BINS;
  const qOf = (draws: number[]) => { const h = new Array(PASS2_BINS).fill(0); for (const d of draws) h[Math.floor(d / per)]++; return h.reduce((s, x) => s + x * x, 0); };
  const flaggedEpochs: number[] = [];

  for (const s of seeds) {
    if (!s.serverSeed) continue;
    const group = (byEpoch.get(s.epoch) ?? []).slice().sort((x, y) => x.nonce - y.nonce);
    if (group.length !== PASS2_WINDOW) continue;   // counted by the caller against EXPECTED_SEEDS
    epochs++;
    const served = group.map((b) => targetToHundredths(Number(b.params.target)));
    const targets = group.map((b) => Number(b.params.target));
    const cr = served.map((ci) => Math.floor(RESULT_NUMERATOR / ci));   // exact winning draws per target (floor(N/ci))
    let mu = 0, v = 0;
    for (let j = 0; j < PASS2_WINDOW; j++) { const p = cr[j] / RANGE, T = served[j] / 100; mu += T * p; v += T * T * p * (1 - p); }
    const S: number[] = [];
    const early: number[] = [], late: number[] = [];
    for (let w = 0; w < WINDOWS; w++) {
      let ret = 0;
      for (let j = 0; j < PASS2_WINDOW; j++) {
        const n = w * PASS2_WINDOW + j;
        const k = generateProvablyFairNumber(s.serverSeed, s.clientSeed, n, CURSOR, RANGE);
        noncesTotal++;
        const R = resultMultiplier(k);
        if (w === 0) { early.push(k); if (R !== Number(group[j].result) || group[j].nonce !== n) replayMismatches++; }
        if (w === 1) late.push(k);
        if (limboWin(R, targets[j])) ret += served[j] / 100;
      }
      S.push((ret - mu) / Math.sqrt(v));
      if (w === 0) { capturedReturn += ret; capturedExpected += mu; }
    }
    const x0 = S[0];
    const rank0 = S.filter((y) => y < x0).length + (S.filter((y) => y === x0).length + 1) / 2;
    const meanR = (WINDOWS + 1) / 2;
    rankSum += rank0 - meanR;
    // exact permutation variance of window 0's mid-rank among the 200
    const ranks = S.map((x) => S.filter((y) => y < x).length + (S.filter((y) => y === x).length + 1) / 2);
    rankVar += ranks.reduce((a, r) => a + (r - meanR) ** 2, 0) / WINDOWS;
    if (rank0 < meanR) below++; else if (rank0 > meanR) above++;

    const earlyQ = qOf(early), lateQ = qOf(late);
    const flag = earlyQ >= criticalQ && lateQ < criticalQ;
    if (flag) flaggedEpochs.push(s.epoch);
    perSeed.push({ epoch: s.epoch, capturedRank: rank0, earlyQ, lateQ, flag });
  }
  const Z = rankSum / Math.sqrt(rankVar);
  const oneSidedP = normalCdf(Z);
  // detection power: the fraction of epochs whose captured window sits in its worst decile (mean rank
  // shift ~ -0.45·WINDOWS) that the rule detects with >= 50 % probability
  const powerFraction = (-PASS2_Z_CRIT) * Math.sqrt(rankVar) / (0.45 * WINDOWS * epochs);

  // pooled uniformity of every recomputed captured draw (unchanged whole-dataset control)
  const seedOf = new Map(seeds.map((s) => [s.hashedServerSeed, s]));
  const hist = new Array(100).fill(0); let pooledN = 0;
  for (const b of bets) {
    const s = seedOf.get(b.hashedServerSeed);
    if (s && s.serverSeed) { hist[Math.min(99, Math.floor(generateProvablyFairNumber(s.serverSeed, b.clientSeed, b.nonce, CURSOR, RANGE) / (RANGE / 100)))]++; pooledN++; }
  }
  const pooled = chiSquaredTest(hist, new Array(100).fill(pooledN / 100));

  const flags = flaggedEpochs.length;
  const binomialP = binomialTailP(epochs, flags, p0);
  return {
    method: 'deterministic: exact permutation null (served-target return) + exact multinomial null (early/late chi-squared); no random number is drawn',
    seedsTested: epochs,
    noncesPerSeed: PASS2_NONCES,
    noncesTotal,
    windowSize: PASS2_WINDOW,
    windows: WINDOWS,
    servedReturn: {
      replayMismatches,
      rankSumZ: +Z.toFixed(4),
      oneSidedP: +oneSidedP.toFixed(4),
      zCritical: PASS2_Z_CRIT,
      capturedBelowMedian: below,
      capturedAboveMedian: above,
      capturedReturn: +capturedReturn.toFixed(2),
      capturedExpected: +capturedExpected.toFixed(4),
      powerFraction: +powerFraction.toFixed(4),
      cherryPickIndicated: Z < PASS2_Z_CRIT,
    },
    earlyLateScreen: {
      bins: PASS2_BINS,
      drawsPerWindow: PASS2_WINDOW,
      nullAttainableValues: nul.q.length,
      criticalQ,
      criticalChi2: +(0.4 * criticalQ - 50).toFixed(1),
      size: +size.toFixed(6),
      p0: +p0.toFixed(6),
      flags,
      expected: +(epochs * p0).toFixed(4),
      binomialP: +binomialP.toFixed(4),
      consistent: binomialP >= PASS2_SCREEN_ALPHA,
      flaggedEpochs,
    },
    pooledRealDrawUniformity: { n: pooledN, chi2: +pooled.chi2.toFixed(3), df: pooled.df, pValue: +pooled.pValue.toFixed(4), pass: pooled.pValue >= 0.01 },
    perSeed,
  };
}
