/**
 * VALUE DOMAINS for every numeric leaf of the pinned JSON artifacts of record (profile LIMBO-27).
 *
 * Ported in spirit from the sibling liqd dice/plinko `src/domains.ts`. A hash pin proves the bytes are
 * the bytes this audit read; it says nothing about whether a number inside could be physically true.
 * Each leaf path (array indices collapsed to `[]`) is given the set of values the game and the
 * experiment can produce — PHYSICAL POSSIBILITY, not plausibility: a p-value outside [0, 1], a
 * negative count, a win count above its rounds or a model constant that differs from src/config.ts is
 * impossible, while a p-value of 0.99 is merely surprising and stays legal (G-VALID). A numeric leaf
 * with no declared domain is itself a failure, so a field added to an artifact cannot go unexamined.
 * Bounds come from src/config.ts, never from the artifact being checked.
 */

import {
  RANGE, CURSOR, RESULT_NUMERATOR, MAX_MULTIPLIER, MULTIPLIER_SCALE, HOUSE_EDGE, MIN_MULTIPLIER,
  SIM_UNIFORMITY_DRAWS, SIM_EDGE_BETS, PASS1_BINS, PASS1_EPOCH, PASS1_UNIFORMITY_DRAWS, PASS1_ROUNDS_PER_TARGET,
  PASS1_PREFIX_DRAWS, PASS1_PREFIX_ROUNDS, EXPECTED_SEEDS, EXPECTED_BETS, isTargetLegal,
  PASS2_NONCES, PASS2_WINDOW, PASS2_Z_CRIT, PASS2_BINS,
} from './config';

type Pred = (v: number) => boolean;
const int = (lo: number, hi: number): Pred => (v) => Number.isInteger(v) && v >= lo && v <= hi;
const real = (lo: number, hi: number): Pred => (v) => Number.isFinite(v) && v >= lo && v <= hi;
const eq = (x: number): Pred => (v) => v === x;
const prob = real(0, 1);
const finite: Pred = (v) => Number.isFinite(v);
const target: Pred = (v) => isTargetLegal(v);
/** An RTP from n rounds at target <= MAX_MULTIPLIER lies in [0, MAX_MULTIPLIER]. */
const rtp = real(0, MAX_MULTIPLIER);

const MODEL: Record<string, Pred> = {
  'model.range': eq(RANGE), 'model.cursor': eq(CURSOR), 'model.resultNumerator': eq(RESULT_NUMERATOR),
  'model.maxMultiplier': eq(MAX_MULTIPLIER), 'model.houseEdge': eq(HOUSE_EDGE), 'model.scale': eq(MULTIPLIER_SCALE),
};

export const DOMAINS: Record<string, Record<string, Pred>> = {
  'outputs/simulation-results.json': {
    ...MODEL,
    'pass1.draws': eq(SIM_UNIFORMITY_DRAWS),
    'pass1.uniformity.bins': int(2, RANGE), 'pass1.uniformity.chi2': real(0, Infinity),
    'pass1.uniformity.df': int(1, RANGE), 'pass1.uniformity.pValue': prob,
    'pass1.serial.lag1': real(-1, 1), 'pass1.serial.lag1Z': finite, 'pass1.serial.zCritical': real(0, 10),
    'pass1.serial.runsZ': finite, 'pass1.serial.runsP': prob,
    'pass1.rtpConvergence.multiplier': target, 'pass1.rtpConvergence.theoreticalRTP': real(0, 1),
    'pass1.rtpConvergence.finalRTP': rtp,
    'pass1.rtpConvergence.points[].n': int(1, Number.MAX_SAFE_INTEGER), 'pass1.rtpConvergence.points[].rtp': rtp,
    'pass1.rtpConvergence.points[].se': real(0, MAX_MULTIPLIER),
    'pass1.effectiveEdge[].target': target, 'pass1.effectiveEdge[].winChancePct': real(0, 100),
    'pass1.effectiveEdge[].theoreticalRTP': real(0, 1), 'pass1.effectiveEdge[].theoreticalEdgePct': real(0, 100),
    'pass1.effectiveEdge[].simulatedRTP': rtp, 'pass1.effectiveEdge[].deltaSE': real(0, Infinity),
    'pass1.effectiveEdge[].tolSE': real(0, Infinity), 'pass1.effectiveEdge[].n': eq(SIM_EDGE_BETS),
    'pass1.effectiveEdge[].se': real(0, MAX_MULTIPLIER),
    'pass2.seedsTested': int(0, EXPECTED_SEEDS), 'pass2.noncesPerSeed': eq(PASS2_NONCES),
    'pass2.noncesTotal': int(0, EXPECTED_SEEDS * PASS2_NONCES), 'pass2.windowSize': eq(PASS2_WINDOW),
    'pass2.windows': eq(PASS2_NONCES / PASS2_WINDOW),
    'pass2.servedReturn.replayMismatches': int(0, EXPECTED_BETS), 'pass2.servedReturn.rankSumZ': finite,
    'pass2.servedReturn.oneSidedP': prob, 'pass2.servedReturn.zCritical': eq(PASS2_Z_CRIT),
    'pass2.servedReturn.capturedBelowMedian': int(0, EXPECTED_SEEDS), 'pass2.servedReturn.capturedAboveMedian': int(0, EXPECTED_SEEDS),
    'pass2.servedReturn.capturedReturn': real(0, EXPECTED_BETS * MAX_MULTIPLIER),
    'pass2.servedReturn.capturedExpected': real(0, EXPECTED_BETS * MAX_MULTIPLIER),
    'pass2.servedReturn.powerFraction': real(0, Infinity),
    'pass2.earlyLateScreen.bins': eq(PASS2_BINS), 'pass2.earlyLateScreen.drawsPerWindow': eq(PASS2_WINDOW),
    'pass2.earlyLateScreen.nullAttainableValues': int(1, PASS2_WINDOW * PASS2_WINDOW),
    'pass2.earlyLateScreen.criticalQ': int(PASS2_WINDOW, PASS2_WINDOW * PASS2_WINDOW),
    'pass2.earlyLateScreen.criticalChi2': real(0, Infinity), 'pass2.earlyLateScreen.size': prob,
    'pass2.earlyLateScreen.p0': real(0, 0.25), 'pass2.earlyLateScreen.flags': int(0, EXPECTED_SEEDS),
    'pass2.earlyLateScreen.expected': real(0, EXPECTED_SEEDS), 'pass2.earlyLateScreen.binomialP': prob,
    'pass2.earlyLateScreen.flaggedEpochs[]': int(0, EXPECTED_SEEDS - 1),
    'pass2.pooledRealDrawUniformity.n': int(0, EXPECTED_BETS), 'pass2.pooledRealDrawUniformity.chi2': real(0, Infinity),
    'pass2.pooledRealDrawUniformity.df': int(1, RANGE), 'pass2.pooledRealDrawUniformity.pValue': prob,
    'pass2.perSeed[].epoch': int(0, EXPECTED_SEEDS - 1), 'pass2.perSeed[].capturedRank': real(1, PASS2_NONCES / PASS2_WINDOW),
    'pass2.perSeed[].earlyQ': int(PASS2_WINDOW, PASS2_WINDOW * PASS2_WINDOW), 'pass2.perSeed[].lateQ': int(PASS2_WINDOW, PASS2_WINDOW * PASS2_WINDOW),
  },
  'outputs/pass1-grid.json': {
    ...MODEL,
    'epoch': eq(PASS1_EPOCH),
    'uniformity.bins': eq(PASS1_BINS), 'uniformity.n': eq(PASS1_UNIFORMITY_DRAWS),
    'uniformity.hist[]': int(0, PASS1_UNIFORMITY_DRAWS), 'uniformity.above': int(0, PASS1_UNIFORMITY_DRAWS),
    'uniformity.runs': int(1, PASS1_UNIFORMITY_DRAWS),
    'uniformity.sumB': int(0, (PASS1_BINS - 1) * PASS1_UNIFORMITY_DRAWS),
    'uniformity.sumB2': int(0, (PASS1_BINS - 1) ** 2 * PASS1_UNIFORMITY_DRAWS),
    'uniformity.sumLag': int(0, (PASS1_BINS - 1) ** 2 * PASS1_UNIFORMITY_DRAWS),
    'uniformityPrefix.bins': eq(PASS1_BINS), 'uniformityPrefix.n': eq(PASS1_PREFIX_DRAWS),
    'uniformityPrefix.hist[]': int(0, PASS1_PREFIX_DRAWS), 'uniformityPrefix.above': int(0, PASS1_PREFIX_DRAWS),
    'uniformityPrefix.runs': int(1, PASS1_PREFIX_DRAWS),
    'uniformityPrefix.sumB': int(0, (PASS1_BINS - 1) * PASS1_PREFIX_DRAWS),
    'uniformityPrefix.sumB2': int(0, (PASS1_BINS - 1) ** 2 * PASS1_PREFIX_DRAWS),
    'uniformityPrefix.sumLag': int(0, (PASS1_BINS - 1) ** 2 * PASS1_PREFIX_DRAWS),
    'targets[].target': (v) => target(v) && v >= MIN_MULTIPLIER, 'targets[].ci': int(Math.round(MIN_MULTIPLIER * MULTIPLIER_SCALE), MAX_MULTIPLIER * MULTIPLIER_SCALE),
    'targets[].rounds': eq(PASS1_ROUNDS_PER_TARGET), 'targets[].wins': int(0, PASS1_ROUNDS_PER_TARGET),
    'targets[].prefixRounds': eq(PASS1_PREFIX_ROUNDS), 'targets[].prefixWins': int(0, PASS1_PREFIX_ROUNDS),
  },
};

/** Every numeric leaf of `doc` checked against DOMAINS[artifact]; returns the violations (empty = clean). */
export function checkDomains(artifact: string, doc: unknown): { leaves: number; violations: string[] } {
  const table = DOMAINS[artifact];
  const violations: string[] = [];
  let leaves = 0;
  if (!table) return { leaves, violations: [`${artifact} has no domain table`] };
  const walk = (o: unknown, p: string): void => {
    if (Array.isArray(o)) { for (const v of o) walk(v, `${p}[]`); return; }
    if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k); return; }
    if (typeof o !== 'number') return;
    leaves++;
    const pred = table[p];
    if (!pred) violations.push(`${artifact} ${p} has no declared value domain (add one in src/domains.ts)`);
    else if (!pred(o)) violations.push(`${artifact} ${p} = ${o} is outside its domain`);
  };
  walk(doc, '');
  return { leaves, violations };
}
