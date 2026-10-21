/**
 * Steps 16–17: The effective-edge curve, and the client-code maximum target that could not be played.
 *
 * Step 16 is the RTP finding: the house edge is not an advertised label, it is a closed-form
 * consequence of how the operator prices a target, and it is >= 1.00% on every legal target with no
 * target anywhere in the legal range that is player-favourable. Since 2026-09-23 it establishes that
 * BY ENUMERATION over all 99,999,900 legal 2-dp targets rather than over the 1,104 the capture used,
 * and it reports the real dispersion above the 1% floor — which is NOT flat, and which the
 * captured-target span alone made look flat. See `enumerateLegalGrid` below for why that matters.
 * Since 2026-10-02 its FLAG follows the RTP-CLAIM band (profile LIMBO-19): only a target more than the
 * band from the claim is flagged; inside the band the curve is printed in full.
 *
 * Step 17 reproduces the 2026-09-11 evidence that the 1,000,000x maximum target in LIQD's client code
 * (read 2026-09-07, not retained) could not be played at any legal stake, and reports it as a NOTE: the
 * audit judges the build measured on 2026-09-26, and the player-facing text this package holds
 * (evidence/rtp-page-labels-2026-10-01.json) uses 10,000x as its top example, so nothing here shows
 * players are told 1,000,000x (profile LIMBO-14).
 */

import type { StepResult, VerifyContext } from './context';
import { step, hundredths } from './context';
import {
  winChance, theoreticalRTP, effectiveEdge, targetToHundredths,
  HOUSE_EDGE, RESULT_NUMERATOR, RANGE, MULTIPLIER_SCALE,
  MIN_MULTIPLIER, MAX_MULTIPLIER, MAX_WIN_CHANCE_PERCENT,
  MIN_BET_USDC, MAX_EXPOSURE_USDC, MAX_PLAYABLE_TARGET, UI_MAX_TARGET, EXPECTED_PHASES,
  LIVE_TARGET_CEILING, LIVE_TARGET_CEILING_WITNESSED, CEILING_PROBE_REFUSED_TARGET,
  CAP_PROBE_JOURNAL, CAP_PROBE_TARGETS,
} from '../../src/config';
import { RTP_CLAIM } from '../../src/rtp-settings';
import { RTP_CLAIM_BAND } from '../../src/rtp-claim';

/**
 * FULL-GRID ENUMERATION of the pricing curve — added 2026-09-23, and the reason it was added is a
 * defect in this step's earlier form.
 *
 * WHAT WAS WRONG. The captured-target loop below asserts `floor(N/ci) * ci <= N`. That is TRUE BY
 * THE DEFINITION OF FLOOR for every ci, so it can only ever establish `edge >= 1.00%` — it cannot
 * bound how far ABOVE 1% the edge goes. The step then reported a min/max span over the 1,104
 * CAPTURED targets and the chapters read that span as a property of the game. It is not: every high
 * target the capture used (100x, 1,000x, 100,000x, 500,000x) happens to divide 9.9e9 evenly, so the
 * sampled curve read flat at 1.000000%–1.000041% while the real curve reaches 1.497487% on a target
 * a player can actually bet. A tautology over a sample licensed a claim of flatness.
 *
 * WHAT THIS DOES INSTEAD. It enumerates EVERY legal 2-dp target — all 99,999,900 of them — and
 * reports the dispersion. Writing `edge(ci) = 1 - floor(N/ci)*ci / (RANGE*SCALE)` out in integers,
 *     edge(ci) = (RANGE*SCALE - N + (N mod ci)) / (RANGE*SCALE)
 * so with `RANGE*SCALE - N = 1e8` the whole curve is one integer modulo per target and the
 * comparisons stay exact — `EDGE_DENOMINATOR` is 1e10 and every numerator is below 2^53. A single
 * pass is ~1.0–1.3s, measured, which is why it is affordable inside the verifier rather than being
 * a one-off script whose output nobody can re-run.
 *
 * WHY IT IS AN ASSERTION AND NOT A NOTE. The `>= 1.00%` floor is now checked EXHAUSTIVELY rather
 * than on the 1,104 targets the capture happened to use. That turns the step's central claim from a
 * sample into a proof by enumeration. The floor genuinely holds everywhere, so nothing here FAILs on
 * the dispersion. Since 2026-10-02 (profile LIMBO-19 follows the RTP-CLAIM band): a target on the
 * current build's range whose edge differs from the 1.00% claim by MORE than the RTP-CLAIM band makes
 * the step a FLAG (origin operator); inside the band the curve is printed in full — how many targets
 * are off 1.00%, by how much at most and where — and not flagged. Until 2026-10-02 any difference at
 * all was a FLAG, which flagged 999,618 of the 999,900 playable targets while the RTP-CLAIM rule in the
 * same run said the claim holds on every one of them. Either way the real spread is printed, so no
 * chapter can describe the edge as flat.
 */
const EDGE_DENOMINATOR = RANGE * MULTIPLIER_SCALE;                 // 1e10
const EDGE_BASE_NUMERATOR = EDGE_DENOMINATOR - RESULT_NUMERATOR;   // 1e8  <=> exactly 1.00%
/** 1.01% expressed over EDGE_DENOMINATOR: 0.0101 * 1e10 = 101,000,000, an exact integer. */
const EDGE_101_NUMERATOR = 101_000_000;
/**
 * The size of the legal grid, PINNED rather than merely derived. `ci` runs over the integers
 * [round(100 * 1.01), round(100 * 1e6)] = [101, 100000000], so the population is 99,999,900.
 *
 * Why pin a number the loop bounds already imply: comparing the loop's own count to its own bounds is
 * circular and would still read "ok" if MIN_MULTIPLIER or MAX_MULTIPLIER silently moved, quietly
 * changing the population every dispersion figure below is quantified over. Every report figure of the
 * form "N of 99,999,900" is scoped by this constant, so the constant is the thing that has to be
 * asserted. If a legal-window constant legitimately changes, this number must be recomputed and the
 * chapters requoted in the same edit — the step FAILS until that happens, which is the point.
 */
const LEGAL_TARGET_COUNT = 99_999_900;

/**
 * The RTP-CLAIM rule's house-side threshold in this step's integer units: a target is beyond the band
 * on the house side iff floor(N/ci)·ci < (claim − band)·EDGE_DENOMINATOR, the same strict comparison
 * src/rtp-claim.ts makes in exact rationals. Derived from RTP_CLAIM.rtp (src/rtp-settings.ts) and
 * RTP_CLAIM_BAND (src/rtp-claim.ts), never re-typed. NaN when either is not exact in these units (or the
 * claim is not flat): every comparison against NaN is false, so the counts read 0 — which is why Step 16
 * FAILs on a non-finite threshold instead of printing them (G-RANGE). It never throws: a throw here would
 * abort the whole verifier at import time and hide which step a broken constant breaks.
 */
function decimalOver(s: string, scale: number): number {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m || !Number.isSafeInteger(scale)) return NaN;
  const frac = m[2] ?? '';
  const den = 10n ** BigInt(frac.length), num = BigInt(m[1] + frac) * BigInt(scale);
  return num % den === 0n ? Number(num / den) : NaN;
}
const CLAIM_FLOOR_NUMERATOR = RTP_CLAIM.kind === 'flat'
  ? decimalOver(RTP_CLAIM.rtp, EDGE_DENOMINATOR) - decimalOver(RTP_CLAIM_BAND, EDGE_DENOMINATOR)
  : NaN;

interface GridReport {
  total: number;
  /** floor-identity violations across the WHOLE legal grid — must be 0. */
  violations: number;
  worstNumerator: number;      worstCi: number;
  worstPlayableNumerator: number;   worstPlayableCi: number;
  worstUiNumerator: number;    worstUiCi: number;
  /**
   * THE CURRENT BUILD'S RANGE — 1.01x to LIVE_TARGET_CEILING (10,000x, witnessed 2026-09-26, Step 25):
   * the basis the step's FLAG and the RTP-CLAIM rule are judged on.
   */
  liveTotal: number;           liveExactlyOnePercent: number;
  worstLiveNumerator: number;  worstLiveCi: number;
  liveBeyondBand: number;
  /** THE 2026-09-11 RANGE — 1.01x to MAX_PLAYABLE_TARGET (500,000x): disclosed, not scored. */
  playableTotal: number;       playableBeyondBand: number;
  /** The smallest legal ci beyond the RTP-CLAIM band on the house side (0 if none) — 100,101.12x. Step 25 quotes it. */
  firstBeyondBandCi: number;
  firstAbove101Ci: number;     firstAbove101Numerator: number;
  countAbove101: number;
  countExactlyOnePercent: number;
  /**
   * Targets that are the LARGEST sharing their win-chance value, i.e. the BEST-PRICED member of their
   * group. NOT "the ones priced at exactly 99.00%" — that was checked on 2026-09-23 and is false: of
   * 193,947 group maxima with ci in [101, 2,000,101], only 305 land on an exact 1.00% edge. Being the
   * largest in the group buys the highest RTP available at those odds, not a 99.00% one.
   */
  largestInWinChanceGroup: number;
}

/**
 * NOTHING NON-DETERMINISTIC MAY LEAVE THIS FUNCTION. Every field it returns is printed into Step
 * 16's detail string, and `fieldDiff` (src/diff.ts, called in tests/verify.ts) compares that string
 * to the committed artifact byte-for-byte — so a wall-clock duration in the report would make
 * `npm run verify` disagree with its own evidence on every run and exit 1. The pass takes ~0.6-1.3s
 * on the machines this was measured on; that belongs in this comment and not in the output.
 */
function enumerateLegalGrid(): GridReport {
  const ciMin = targetToHundredths(MIN_MULTIPLIER);        // 101       -> 1.01x
  const ciMax = targetToHundredths(MAX_MULTIPLIER);        // 1e8       -> 1,000,000x
  const ciPlayable = targetToHundredths(MAX_PLAYABLE_TARGET);  // 5e7   -> 500,000x
  const ciUi = targetToHundredths(UI_MAX_TARGET);          // 1e6       -> 10,000x
  const ciLive = targetToHundredths(LIVE_TARGET_CEILING);  // 1e6       -> 10,000x (live API, 2026-09-26)

  const r: GridReport = {
    total: 0, violations: 0,
    worstNumerator: -1, worstCi: 0,
    worstPlayableNumerator: -1, worstPlayableCi: 0,
    worstUiNumerator: -1, worstUiCi: 0,
    liveTotal: 0, liveExactlyOnePercent: 0, worstLiveNumerator: -1, worstLiveCi: 0, liveBeyondBand: 0,
    playableTotal: 0, playableBeyondBand: 0, firstBeyondBandCi: 0,
    firstAbove101Ci: 0, firstAbove101Numerator: 0,
    countAbove101: 0, countExactlyOnePercent: 0,
    largestInWinChanceGroup: 0,
  };

  for (let ci = ciMin; ci <= ciMax; ci++) {
    r.total++;
    const cr = Math.floor(RESULT_NUMERATOR / ci);
    // The exact-integer statement of "edge >= 1.00%", now over the WHOLE grid and not a sample.
    if (cr * ci > RESULT_NUMERATOR) r.violations++;
    const rem = RESULT_NUMERATOR - cr * ci;               // N mod ci, without a second division
    const num = EDGE_BASE_NUMERATOR + rem;                // edge numerator over EDGE_DENOMINATOR
    if (num > r.worstNumerator) { r.worstNumerator = num; r.worstCi = ci; }
    if (ci <= ciPlayable && num > r.worstPlayableNumerator) { r.worstPlayableNumerator = num; r.worstPlayableCi = ci; }
    if (ci <= ciUi && num > r.worstUiNumerator) { r.worstUiNumerator = num; r.worstUiCi = ci; }
    const beyondBand = cr * ci < CLAIM_FLOOR_NUMERATOR;
    if (beyondBand && r.firstBeyondBandCi === 0) r.firstBeyondBandCi = ci;
    if (ci <= ciLive) {
      r.liveTotal++;
      if (rem === 0) r.liveExactlyOnePercent++;
      if (num > r.worstLiveNumerator) { r.worstLiveNumerator = num; r.worstLiveCi = ci; }
      if (beyondBand) r.liveBeyondBand++;
    }
    if (ci <= ciPlayable) { r.playableTotal++; if (beyondBand) r.playableBeyondBand++; }
    if (num > EDGE_101_NUMERATOR) {
      r.countAbove101++;
      if (r.firstAbove101Ci === 0) { r.firstAbove101Ci = ci; r.firstAbove101Numerator = num; }
    }
    if (rem === 0) r.countExactlyOnePercent++;
    // ci is the largest target sharing its win chance iff the next target's cr is strictly lower. Since
    // RTP = cr * ci / 1e10 and cr is fixed within a group, the largest ci has the group's HIGHEST RTP —
    // every smaller member is strictly dominated: identical win chance, strictly lower payout.
    if (Math.floor(RESULT_NUMERATOR / (ci + 1)) < cr) r.largestInWinChanceGroup++;
  }
  return r;
}

/**
 * The one enumeration of the legal grid per verifier run, shared by Step 16 and Step 25 (which quotes
 * the first target beyond the RTP-CLAIM band). Deterministic, so caching it changes no output.
 */
let gridCache: GridReport | null = null;
export function legalGrid(): GridReport {
  if (gridCache === null) gridCache = enumerateLegalGrid();
  return gridCache;
}

/** An edge numerator over EDGE_DENOMINATOR, rendered as a percentage at 6 dp. */
const gridPct = (numerator: number) => (numerator / EDGE_DENOMINATOR * 100).toFixed(6);
/** A ci back to its 2-dp target. */
export const ciToTarget = (ci: number) => (ci / MULTIPLIER_SCALE).toFixed(2);
/** The exact RTP of a ci, as a percentage at 6 dp: floor(N/ci)·ci / EDGE_DENOMINATOR. */
export const ciRtpPct = (ci: number) => (Math.floor(RESULT_NUMERATOR / ci) * ci / EDGE_DENOMINATOR * 100).toFixed(6);

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, distinctTargets } = ctx;

  // ── Step 16: Effective-edge curve ───────────────────────────────────────────
  // RTP(m) = winChance(m) x m = floor(N/ci(m)) x ci(m) / (RANGE x SCALE), so
  //     edge(m) >= 1%  <=>  floor(N/ci) x ci <= N
  // which is true for every ci by the definition of floor. Asserted in EXACT INTEGERS per distinct
  // target — `floor(N/ci) * ci <= N` — rather than as `edge >= 0.01 - 1e-12`, so no tolerance is
  // needed. The edge above 1.00% on a captured target is REAL, not rounding: the largest, 1.00004134%
  // at 43.86x, is 9.9e9 mod 4386 = 4134 over 1e10; the binary64 error there is ~1e-16.
  //
  // READ `enumerateLegalGrid` ABOVE BEFORE READING THE LOOP BELOW. Because that identity is a
  // tautology, the loop below can only confirm the FLOOR; it says nothing about the dispersion
  // above it, and the min/max span it computes is a span over the 1,104 targets THIS CAPTURE USED.
  // The full-grid pass is what measures the real curve, and its figures are the ones any chapter
  // must quote when it describes the shape of the edge rather than its lower bound.
  //
  // Magnitudes: floor(N/ci) <= 9.8e7 and ci <= 5e7 in this capture, but their product is bounded by
  // N = 9.9e9, far inside the 2^53 exact-integer range, so the comparison is exact.
  //
  // G-VALID: an edge landing on exactly 1.000000% is the NORMAL outcome whenever ci divides N —
  // target 2.00 is one of them. Exactness here is the arithmetic working, not a red flag, and
  // nothing in this step treats it as one.
  //
  // G-RANGE — a NON-FINITE value from OUR OWN reference formula must HARD-FAIL, and it is counted
  // explicitly rather than left to the comparisons above. Every comparison against NaN is false, so
  // `e < -1e-12`, `e < minEdge` and `dep > maxFloatDeparture` all quietly skip a poisoned cell and the
  // curve reads as clean. That has been executed against this package: making `theoreticalRTP`
  // return NaN on its first call produced a Full Pass while the step printed a clean cell count.
  // A corrupt VERIFIER is a different fault class from a deviant cell and must not be able to
  // hide inside the same predicate.
  const grid = legalGrid();
  let edgeChecked = 0;
  let edgeViolations = 0;
  let favourable = 0;
  let nonFinite = 0;
  let firstEdgeFail = '';
  let minEdge = Infinity;
  let maxEdge = -Infinity;
  let minEdgeTarget = NaN;
  let maxEdgeTarget = NaN;
  let exactlyOnePercent = 0;
  // the largest captured edge in EXACT integers (numerator over EDGE_DENOMINATOR), printed at 8 dp
  let maxCapturedEdgeNumerator = -1;
  let maxCapturedEdgeTarget = NaN;
  for (const m of distinctTargets) {
    const ci = targetToHundredths(m);
    const count = Math.floor(RESULT_NUMERATOR / ci);
    // the exact-integer statement of "edge >= 1.00%"
    if (count * ci > RESULT_NUMERATOR) {
      edgeViolations++;
      if (!firstEdgeFail) firstEdgeFail = `target ${m}: floor(N/ci)*ci = ${count * ci} > N = ${RESULT_NUMERATOR}`;
    }
    if (count * ci === RESULT_NUMERATOR) exactlyOnePercent++;
    const capturedNum = EDGE_BASE_NUMERATOR + (RESULT_NUMERATOR - count * ci);
    if (capturedNum > maxCapturedEdgeNumerator) { maxCapturedEdgeNumerator = capturedNum; maxCapturedEdgeTarget = m; }
    const rtp = theoreticalRTP(m);
    const e = effectiveEdge(m);
    if (!Number.isFinite(rtp) || !Number.isFinite(e)) {
      nonFinite++;
      if (!firstEdgeFail) firstEdgeFail = `target ${m}x: the reference formula returned a NON-FINITE value (RTP ${rtp}, edge ${e}) — this is a corrupt verifier, not a deviant cell`;
      continue;
    }
    if (e < -1e-12) favourable++;
    if (e < minEdge) { minEdge = e; minEdgeTarget = m; }
    if (e > maxEdge) { maxEdge = e; maxEdgeTarget = m; }
    edgeChecked++;
  }

  // Exercise the two ends of the LEGAL range as well, not only the captured ones: the minimum legal
  // target (max win chance) and the client-code maximum (which Step 17 shows was unplayable on
  // 2026-09-11, but the pricing identity still has to hold there).
  const legalExtremes = [MIN_MULTIPLIER, MAX_PLAYABLE_TARGET, MAX_MULTIPLIER];
  const extremesOk = legalExtremes.every((m) => {
    const ci = targetToHundredths(m);
    return Math.floor(RESULT_NUMERATOR / ci) * ci <= RESULT_NUMERATOR
      && Number.isFinite(theoreticalRTP(m)) && Number.isFinite(effectiveEdge(m));
  });

  // Exposure-weighted picture of the capture, recomputed from the raw rows.
  const stakeWeighted = bets.reduce((s, b) => s + Number(b.betAmount) * effectiveEdge(Number(b.params.target)), 0)
    / bets.reduce((s, b) => s + Number(b.betAmount), 0);
  const stakeWeightedOk = Number.isFinite(stakeWeighted);

  // Both halves, and both matter: the count must be what the legal window implies (no early exit, no
  // off-by-one in the loop) AND what this step's pinned population says (no silent change to the legal
  // window under the figures below). See LEGAL_TARGET_COUNT.
  const gridWindowOk = grid.total === targetToHundredths(MAX_MULTIPLIER) - targetToHundredths(MIN_MULTIPLIER) + 1;
  const gridTotalOk = gridWindowOk && grid.total === LEGAL_TARGET_COUNT;

  // VERDICT TREATMENT (profile LIMBO-19, policy FLAG, reworded 2026-10-02 to follow the RTP-CLAIM band):
  // "a target whose derived edge differs from the claim by MORE than the RTP-CLAIM band is a FLAG with the
  // magnitude stated; inside the band the edge curve is printed in full (min/max/where/count off the
  // claim), not flagged". The claim is the operator's 1.00% edge; a legal target is OFF the claim exactly
  // when ci does not divide N (rem != 0), and BEYOND THE BAND when floor(N/ci)·ci < (claim − band)·1e10 —
  // the same strict comparison src/rtp-claim.ts makes. Origin is the operator: the dispersion is a
  // property of the operator's pricing formula, not of our capture. A FAIL condition above always wins
  // over the FLAG, and with the RTP-CLAIM rule enforced (tests/verify.ts) a target beyond the band on the
  // scored range is also a FAIL of this step through that rule.
  //
  // ONE BASIS: judged on the CURRENT BUILD's range, 1.01x to LIVE_TARGET_CEILING (the ceiling seen on the
  // live API on 2026-09-26 — one request above it, not settled; Step 25) — the same range the RTP-CLAIM rule is scored on. The 2026-09-11 range
  // (<= MAX_PLAYABLE_TARGET) and the whole declared grid are printed beside it as disclosed history and
  // reference; the exhaustive floor proof still runs over the whole declared grid. Whether targets above
  // the band edge are refused by the server is Step 25's FLAG (profile LIMBO-14), not this step's.
  const offClaim = grid.total - grid.countExactlyOnePercent;
  const liveOffClaim = grid.liveTotal - grid.liveExactlyOnePercent;
  const liveWindowOk = grid.liveTotal === targetToHundredths(LIVE_TARGET_CEILING) - targetToHundredths(MIN_MULTIPLIER) + 1;
  const playableWindowOk = grid.playableTotal === targetToHundredths(MAX_PLAYABLE_TARGET) - targetToHundredths(MIN_MULTIPLIER) + 1;
  const s16ok = edgeViolations === 0 && favourable === 0 && nonFinite === 0 && extremesOk && stakeWeightedOk
    && edgeChecked === distinctTargets.length && edgeChecked > 0
    && grid.violations === 0 && gridTotalOk && liveWindowOk && playableWindowOk && Number.isFinite(CLAIM_FLOOR_NUMERATOR);
  const rtpPct = (edgeNumerator: number) => ((EDGE_DENOMINATOR - edgeNumerator) / EDGE_DENOMINATOR * 100).toFixed(6);
  const bandPp = (decimalOver(RTP_CLAIM_BAND, EDGE_DENOMINATOR) / EDGE_DENOMINATOR * 100).toFixed(1);
  const liveGapPp = ((grid.worstLiveNumerator - EDGE_BASE_NUMERATOR) / EDGE_DENOMINATOR * 100).toFixed(6);
  const s16 = step(16, 'Effective-Edge Curve',
    !s16ok ? 'FAIL' : grid.liveBeyondBand > 0 ? 'FLAG' : 'PASS',
    `${s16ok
      ? `PROFILE LIMBO-19, judged against the RTP-CLAIM band (${bandPp} pp from the ${(HOUSE_EDGE * 100).toFixed(2)}% edge claim) on the current build's target range, ${MIN_MULTIPLIER}x to the ${LIVE_TARGET_CEILING}x ceiling seen on the live API on ${LIVE_TARGET_CEILING_WITNESSED} (one request above it probed, not settled — Step 25): `
        + `${grid.liveBeyondBand} of the ${grid.liveTotal} targets sit more than the band from the claim (${grid.liveBeyondBand > 0 ? 'FLAG, origin operator' : 'no FLAG'}); `
        + `${grid.liveBeyondBand > 0 ? '' : 'inside the band '}the derived edge differs from the ${(HOUSE_EDGE * 100).toFixed(2)}% claim at ${liveOffClaim} of the ${grid.liveTotal} targets, always on the house side, by at most ${liveGapPp} pp (${gridPct(grid.worstLiveNumerator)}% at ${ciToTarget(grid.worstLiveCi)}x)${grid.liveBeyondBand > 0 ? '' : ' — printed, not flagged'}. `
        + `The first legal target beyond the band is ${ciToTarget(grid.firstBeyondBandCi)}x (RTP ${ciRtpPct(grid.firstBeyondBandCi)}%). `
        + `NOT THE CURRENT BUILD, disclosed for reference: on the 2026-09-11 range (targets up to ${MAX_PLAYABLE_TARGET}x, the highest target the audited capture settled; ${grid.playableTotal} targets) `
        + `the worst edge is ${gridPct(grid.worstPlayableNumerator)}% at ${ciToTarget(grid.worstPlayableCi)}x and the RTP-CLAIM rule would FAIL: ${grid.playableBeyondBand} of the ${grid.playableTotal} targets sit more than ${bandPp} pp below the claim, worst RTP ${rtpPct(grid.worstPlayableNumerator)}% at ${ciToTarget(grid.worstPlayableCi)}x; `
        + `over the whole declared legal grid the edge differs from the claim at ${offClaim} of ${grid.total} targets, up to ${gridPct(grid.worstNumerator)}%. `
      : ''}EXHAUSTIVE over the legal grid: house edge >= ${(HOUSE_EDGE * 100).toFixed(2)}% asserted in EXACT INTEGERS `
    + `(floor(${RESULT_NUMERATOR}/ci(m)) x ci(m) <= ${RESULT_NUMERATOR}, no tolerance) at EVERY one of the ${grid.total} legal 2-dp targets `
    + `in [${MIN_MULTIPLIER}x, ${MAX_MULTIPLIER}x] — ${grid.violations} violations `
    + `(${gridTotalOk ? `the grid size is both what the legal window implies and the pinned population ${LEGAL_TARGET_COUNT}` : `GRID SIZE DISAGREES — window ${gridWindowOk ? 'ok' : 'MISMATCH'}, pinned population ${LEGAL_TARGET_COUNT}`}). `
    + `THE EDGE IS NOT FLAT ABOVE 1.00%, and this is the measurement that says so: edge(ci) = (${EDGE_DENOMINATOR} - ${RESULT_NUMERATOR} + (${RESULT_NUMERATOR} mod ci)) / ${EDGE_DENOMINATOR}, `
    + `so the excess over 1% is driven by (N mod ci) and grows with ci. Worst edge anywhere in the legal range ${gridPct(grid.worstNumerator)}% at ${ciToTarget(grid.worstCi)}x; `
    + `worst target playable on 2026-09-11 (<= ${MAX_PLAYABLE_TARGET}x, the $${MAX_EXPOSURE_USDC}/$${MIN_BET_USDC} exposure ceiling of Step 17; on ${LIVE_TARGET_CEILING_WITNESSED} the live API did not settle the one target probed above ${LIVE_TARGET_CEILING}x, Step 25) ${gridPct(grid.worstPlayableNumerator)}% at ${ciToTarget(grid.worstPlayableCi)}x; `
    + `worst at or below the operator's UI target cap of ${UI_MAX_TARGET}x ${gridPct(grid.worstUiNumerator)}% at ${ciToTarget(grid.worstUiCi)}x; `
    + `the FIRST target whose edge exceeds 1.01% is ${ciToTarget(grid.firstAbove101Ci)}x (${gridPct(grid.firstAbove101Numerator)}%), i.e. just above that UI cap; `
    + `${grid.countAbove101} of the ${grid.total} legal targets carry an edge above 1.01%, and only ${grid.countExactlyOnePercent} are priced at EXACTLY ${(HOUSE_EDGE * 100).toFixed(2)}% (those are the ci that divide ${RESULT_NUMERATOR} evenly); `
    + `mechanically it is a same-odds/different-payout effect — targets sharing one value of floor(N/ci) share an IDENTICAL win chance but are each paid their own multiplier, so within a group RTP = cr x ci / ${EDGE_DENOMINATOR} rises with ci and only the LARGEST member is priced as well as those odds allow; every smaller member is strictly dominated (same win chance, strictly lower payout). Just ${grid.largestInWinChanceGroup} of ${grid.total} targets (${(grid.largestInWinChanceGroup / grid.total * 100).toFixed(3)}%) are the best-priced member of their group. NOTE, because the obvious misreading is wrong: best-priced does NOT mean priced at 99.00% — only ${grid.countExactlyOnePercent} targets in the whole grid are, so a group maximum is usually still above a 1.00% edge. `
    + `CAPTURED-TARGET SUB-MEASUREMENT, reported separately and NOT to be read as the curve: across the ${edgeChecked} distinct targets this capture actually used, spanning ${Math.min(...distinctTargets)}x..${Math.max(...distinctTargets)}x, `
    + `${edgeViolations} violations`
    + (firstEdgeFail ? ` (e.g. ${firstEdgeFail})` : '')
    + `, ${favourable} player-favourable targets (${favourable === 0 ? 'none — not exploitable anywhere in the captured range' : 'EXPLOIT'}); `
    + `${nonFinite} targets at which OUR OWN reference formula returned a non-finite value (${nonFinite === 0 ? 'none — the curve above is a measurement of the pricing, not of a broken verifier' : 'CORRUPT VERIFIER'}), counted explicitly because every comparison against NaN is false and an unguarded curve would read as clean; `
    + `captured edge spans ${(minEdge * 100).toFixed(6)}% (at ${minEdgeTarget}x) to ${(maxEdge * 100).toFixed(6)}% (at ${maxEdgeTarget}x), stake-weighted mean across the capture ${(stakeWeighted * 100).toFixed(6)}% — `
    + `that narrow span is an ARTEFACT OF WHICH TARGETS THE CAPTURE USED (every high tranche it played divides ${RESULT_NUMERATOR} evenly), not a property of the game; `
    + `${exactlyOnePercent} of the ${edgeChecked} captured targets price to EXACTLY ${(HOUSE_EDGE * 100).toFixed(2)}% (e.g. target 2.00 -> win chance ${(winChance(2) * 100).toFixed(2)}%, RTP ${(theoreticalRTP(2) * 100).toFixed(4)}%) — that is the arithmetic working, not an anomaly; `
    + `the flooring can only LOWER the payout, never raise it, which is why 1.00% is a provable floor rather than a measured average, and why the dispersion above it runs one way only; `
    + `legal-range extremes also satisfy the identity (${legalExtremes.join('x, ')}x: ${extremesOk ? 'ok' : 'FAIL'}), max win chance ${MAX_WIN_CHANCE_PERCENT.toFixed(6)}% at the ${MIN_MULTIPLIER}x minimum target; `
    + `the comparison is done in integers, so no tolerance is needed; the largest edge on the captured targets is ${(maxCapturedEdgeNumerator / EDGE_DENOMINATOR * 100).toFixed(8)}% at ${maxCapturedEdgeTarget}x, a real difference from ${(HOUSE_EDGE * 100).toFixed(2)}% and not a rounding effect`,
    'operator',
  );

  // ── Step 17: Client-code maximum multiplier, 2026-09-11 state (a note, LIMBO-14) ───
  // On 2026-09-11 the operator's client constants set LIMBO_MAX_MULTIPLIER = 1,000,000x as the maximum
  // target (read 2026-09-07), and the server enforced a maximum EXPOSURE (potential payout) of $50,000
  // (witnessed, 3138) and a minimum stake (inferred from 3113, not probed) of $0.10. Those three numbers
  // were incompatible: the cheapest legal 1,000,000x bet stakes $0.10 and risks $100,000 of exposure,
  // which is double the ceiling.
  //
  // This is not a derivation from our own arithmetic alone — it is what the operator said. In
  // evidence/E15 a 1,000,000x bet at the $0.10 minimum was refused with errorCode 3138
  // (MaxExposureExceededError) and the operator's own `maxAllowedBetUsdc` for that target: $0.05.
  // That figure is BELOW the $0.10 minimum stake, so by those two numbers there is no legal stake at
  // 1,000,000x. E15 then holds a second refusal, errorCode 3113 (BetAmountIsNotInLimitError). E15
  // records $0.10 as the stake on BOTH: that the second request was the $0.05 retry follows from the
  // capture script (capture/capture-limbo.reference.mjs sends the retry at the named stake and writes
  // the original stake into the record), not from the record itself.
  //
  // Consequence for the audit, and the reason this is a scored step rather than a prose remark:
  // the capture's top tranche is 500,000x = $50,000 / $0.10, the largest target that could be played
  // on 2026-09-11. Recorded here so that 500,000x is never read as "the maximum multiplier" — it was
  // the maximum PLAYABLE one on that date.
  //
  // WHY "CLIENT CODE" AND NOT "ADVERTISED" (2026-10-02): the 1,000,000x figure comes from LIQD's client
  // code, read 2026-09-07 and not retained in this package. The only player-facing text the package
  // holds (evidence/rtp-page-labels-2026-10-01.json, liqd.com/originals/limbo read logged out) uses
  // 10,000x as its top example; nothing here shows players are told 1,000,000x. So this is a NOTE, never
  // a FLAG, unless such evidence is added.
  //
  // CURRENT BUILD (judged as measured 2026-09-26): the live API settled bets at 10,000x and did not
  // settle the one request above it (Step 25, evidence/E20), so the range this audit judges ends at
  // 10,000x and the 2026-09-11 state is disclosed history. On 2026-10-02 the cap re-probe (evidence/E21)
  // asked for four targets above it; whether they were refused is Step 25's judgement, not this step's,
  // so the text below names the requests and leaves the outcome to Step 25. The step still re-derives the 2026-09-11
  // evidence and FAILs if any of it stops holding.
  const advertisedMaxExposure = hundredths(MIN_BET_USDC) * hundredths(MAX_MULTIPLIER) / 1e4;
  const playableDerivation = MAX_EXPOSURE_USDC / MIN_BET_USDC;
  const derivationOk = playableDerivation === MAX_PLAYABLE_TARGET;
  const advertisedUnplayable = advertisedMaxExposure > MAX_EXPOSURE_USDC;
  const capturedMaxTarget = Math.max(...distinctTargets);
  // Widened to `number` deliberately: `as const` gives these literal types, and a literal-vs-literal
  // comparison is a compile-time tautology rather than the run-time assertion this step needs.
  const trancheTargets: number[] = [...EXPECTED_PHASES.B.targets];
  const topTranche: number = trancheTargets[trancheTargets.length - 1];
  const trancheIsPlayableMax = topTranche === MAX_PLAYABLE_TARGET;
  const trancheIsAdvertisedMax = trancheTargets.includes(MAX_MULTIPLIER);
  const planNamesPlayableMax = trancheIsPlayableMax && !trancheIsAdvertisedMax;
  const capturedAtPlayableMax = capturedMaxTarget === MAX_PLAYABLE_TARGET;
  const betsAtMax = bets.filter((b) => Number(b.params.target) === MAX_PLAYABLE_TARGET).length;
  const betsAtAdvertisedMax = bets.filter((b) => Number(b.params.target) === MAX_MULTIPLIER).length;
  // The edge does not change at the boundary — the finding is about reachability, not pricing.
  const edgeAtPlayableMax = effectiveEdge(MAX_PLAYABLE_TARGET);
  const edgeAtAdvertisedMax = effectiveEdge(MAX_MULTIPLIER);

  const auditedAboveLive = [...new Set(bets.map((b) => Number(b.params.target)).filter((t) => hundredths(t) > hundredths(LIVE_TARGET_CEILING)))].sort((a, z) => a - z);
  const s17 = step(17, 'Client-Code Maximum Multiplier (2026-09-11 state, note)',
    // VERDICT TREATMENT (profile LIMBO-14; rules.maxPayout R2): "an advertised maximum target that no
    // legal stake can play ... is disclosed". No player-facing 1,000,000x is evidenced in this package
    // (see above), so it is reported as a NOTE on the client-code maximum and the 2026-09-11 state, not
    // as a FLAG. Every assertion below still FAILs the step if the 2026-09-11 evidence stops reproducing.
    derivationOk && advertisedUnplayable && planNamesPlayableMax && capturedAtPlayableMax && betsAtAdvertisedMax === 0 ? 'PASS' : 'FAIL',
    `NOTE (profile LIMBO-14), not a flag: client-code maximum ${MAX_MULTIPLIER}x, read 2026-09-07, not retained in this package; the player-facing text this package holds (evidence/rtp-page-labels-2026-10-01.json, read 2026-10-01) shows ${UI_MAX_TARGET}x as its top example, and nothing in the package shows players are told ${MAX_MULTIPLIER}x. `
    + `CURRENT BUILD: on ${LIVE_TARGET_CEILING_WITNESSED} the live API settled bets at ${LIVE_TARGET_CEILING}x and did not settle the one request above it (${CEILING_PROBE_REFUSED_TARGET}x; Step 25, evidence/E20), `
    + `so the range this audit judges ends at ${LIVE_TARGET_CEILING}x. `
    + (CAP_PROBE_JOURNAL === null
      ? `That ceiling rests on that single probe; the targets the audited capture played above it (${auditedAboveLive.map((t) => `${t}x`).join(', ') || 'none'}) were not re-probed (Step 25 carries the flag). `
      : `That ceiling is also tested by the cap re-probe (evidence/E21, run 2026-10-02; Step 25 judges whether its requests at ${CAP_PROBE_TARGETS.map((t) => `${t}x`).join(', ')} were refused); `
        + `of the targets the audited capture played above the ceiling, ${auditedAboveLive.filter((t) => CAP_PROBE_TARGETS.includes(t)).map((t) => `${t}x`).join(', ') || 'none'} ${auditedAboveLive.filter((t) => CAP_PROBE_TARGETS.includes(t)).length === 1 ? 'is' : 'are'} among those requests and ${auditedAboveLive.filter((t) => !CAP_PROBE_TARGETS.includes(t)).map((t) => `${t}x`).join(', ') || 'none'} ${auditedAboveLive.filter((t) => !CAP_PROBE_TARGETS.includes(t)).length === 1 ? 'is' : 'are'} not. `)
    + `2026-09-11 STATE, reproduced from the evidence: the ${MAX_MULTIPLIER}x maximum target in LIQD's client code could not be played at any legal stake. `
    + `The cheapest legal bet at ${MAX_MULTIPLIER}x stakes the $${MIN_BET_USDC} minimum and creates $${advertisedMaxExposure} of exposure against the $${MAX_EXPOSURE_USDC} ceiling (${advertisedUnplayable ? 'over by ' + (advertisedMaxExposure - MAX_EXPOSURE_USDC) : 'NOT over — the finding does not hold'}); `
    + `evidence/E15 records that bet refused with errorCode 3138 and the casino's own maximum stake of $0.05 for that target (maxAllowedBetUsdc, below the $${MIN_BET_USDC} minimum stake), then a second refusal with errorCode 3113; E15 records $${MIN_BET_USDC} as the stake on both, and that the second request was the $0.05 retry follows from the capture script, not from the record; `
    + `maximum PLAYABLE target = $${MAX_EXPOSURE_USDC} / $${MIN_BET_USDC} = ${playableDerivation}x, which is MAX_PLAYABLE_TARGET ${MAX_PLAYABLE_TARGET}x in src/config.ts (${derivationOk ? 'derivation agrees' : 'DERIVATION DISAGREES'}); `
    + `the capture's top tranche is therefore ${topTranche}x and not ${MAX_MULTIPLIER}x (${planNamesPlayableMax ? 'the plan names the playable maximum' : 'PLAN DISAGREES'}), `
    + `${betsAtMax} bets were placed at ${MAX_PLAYABLE_TARGET}x and ${betsAtAdvertisedMax} at ${MAX_MULTIPLIER}x, and the highest target anywhere in the capture is ${capturedMaxTarget}x (${capturedAtPlayableMax ? 'the playable ceiling' : 'NOT the playable ceiling'}); `
    + `the pricing is unaffected — edge is ${(edgeAtPlayableMax * 100).toFixed(6)}% at ${MAX_PLAYABLE_TARGET}x and ${(edgeAtAdvertisedMax * 100).toFixed(6)}% at ${MAX_MULTIPLIER}x — so on 2026-09-11 the exposure ceiling was enforced and the client-code maximum could not be reached at the minimum stake. `
    + `SCOPE: the $${MAX_EXPOSURE_USDC} ceiling is DERIVED from a single witnessed refusal on qa.liqd.com in one currency; it is not established for other currencies, other targets or production. `
    + `DATED: the ${MAX_PLAYABLE_TARGET}x playable maximum is the 2026-09-11 state and is not claimed live`,
  );

  return [s16, s17];
}
