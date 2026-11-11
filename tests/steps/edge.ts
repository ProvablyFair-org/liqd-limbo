/**
 * Steps 16–17: The effective-edge curve, and the target bounds as evidenced on production.
 *
 * Step 16 is the RTP finding: the house edge is not an advertised label, it is a closed-form
 * consequence of how a target is priced, and it is >= 1.00% on every target with no target anywhere
 * that is player-favourable. It establishes that BY ENUMERATION, not on the targets the capture used:
 *   - over the AUDITED RANGE, every 2-dp target from 1.01x to PROD_TOP_TARGET (10,000x, the highest
 *     target settled on production): 999,900 targets. This is the range the FLAG (profile LIMBO-19) and
 *     the RTP-CLAIM rule are judged on;
 *   - over the FORMULA GRID, every 2-dp value from 1.01x to the 1,000,000x result cap: 99,999,900 values.
 *     Printed as arithmetic about the formula. It is NOT a statement that those targets can be played:
 *     whether production accepts a target above 10,000x is not established (Step 17).
 * A target on the audited range whose edge differs from the 1.00% claim by MORE than the RTP-CLAIM band
 * is a FLAG (origin operator); inside the band the curve is printed in full and not flagged.
 *
 * Step 17 states the target bounds strictly from what production shows (profile LIMBO-14).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { StepResult, VerifyContext } from './context';
import { step, hundredths } from './context';
import {
  winChance, theoreticalRTP, effectiveEdge, targetToHundredths, isTargetLegal,
  HOUSE_EDGE, RESULT_NUMERATOR, RANGE, MULTIPLIER_SCALE,
  MIN_MULTIPLIER, MAX_MULTIPLIER, MAX_WIN_CHANCE_PERCENT, PROD_TOP_TARGET,
} from '../../src/config';
import { RTP_CLAIM } from '../../src/rtp-settings';
import { RTP_CLAIM_BAND } from '../../src/rtp-claim';

/**
 * ENUMERATION of the pricing curve. Writing `edge(ci) = 1 - floor(N/ci)*ci / (RANGE*SCALE)` out in integers,
 *     edge(ci) = (RANGE*SCALE - N + (N mod ci)) / (RANGE*SCALE)
 * so with `RANGE*SCALE - N = 1e8` the whole curve is one integer modulo per target and the
 * comparisons stay exact: `EDGE_DENOMINATOR` is 1e10 and every numerator is below 2^53.
 *
 * WHY ENUMERATE. `floor(N/ci) * ci <= N` is true by the definition of floor for every ci, so a check on
 * the captured targets can only confirm `edge >= 1.00%`; it cannot bound how far ABOVE 1% the edge goes.
 * The enumeration measures the real dispersion, so no chapter can describe the edge as flat.
 */
const EDGE_DENOMINATOR = RANGE * MULTIPLIER_SCALE;                 // 1e10
const EDGE_BASE_NUMERATOR = EDGE_DENOMINATOR - RESULT_NUMERATOR;   // 1e8  <=> exactly 1.00%
/** 1.01% expressed over EDGE_DENOMINATOR: 0.0101 * 1e10 = 101,000,000, an exact integer. */
const EDGE_101_NUMERATOR = 101_000_000;
/**
 * The sizes of the two populations, PINNED and not merely derived: `ci` runs over the integers
 * [101, 1,000,000] on the audited range (999,900) and [101, 100,000,000] on the formula grid
 * (99,999,900). Comparing a loop's count to its own bounds is circular and would still read "ok" if
 * MIN_MULTIPLIER, PROD_TOP_TARGET or MAX_MULTIPLIER silently moved; every report figure of the form
 * "N of 999,900" is scoped by these constants, so the step FAILS until they and the chapters are
 * updated together.
 */
const AUDITED_TARGET_COUNT = 999_900;
const FORMULA_GRID_COUNT = 99_999_900;

/**
 * The RTP-CLAIM rule's house-side threshold in this step's integer units: a target is beyond the band
 * on the house side iff floor(N/ci)·ci < (claim − band)·EDGE_DENOMINATOR, the same strict comparison
 * src/rtp-claim.ts makes in exact rationals. Derived from RTP_CLAIM.rtp (src/rtp-settings.ts) and
 * RTP_CLAIM_BAND (src/rtp-claim.ts), never re-typed. NaN when either is not exact in these units (or the
 * claim is not flat): every comparison against NaN is false, so the counts read 0, which is why Step 16
 * FAILs on a non-finite threshold instead of printing them (G-RANGE).
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
  /** The formula grid, 1.01x..MAX_MULTIPLIER: arithmetic about the formula, not a claim that the targets can be played. */
  total: number;
  /** floor-identity violations across the WHOLE formula grid — must be 0. */
  violations: number;
  worstNumerator: number;      worstCi: number;
  countAbove101: number;       firstAbove101Ci: number;     firstAbove101Numerator: number;
  countExactlyOnePercent: number;
  /** The smallest ci beyond the RTP-CLAIM band on the house side (0 if none). */
  firstBeyondBandCi: number;
  /** THE AUDITED RANGE — 1.01x to PROD_TOP_TARGET: the basis of the FLAG and of the RTP-CLAIM rule. */
  auditedTotal: number;        auditedExactlyOnePercent: number;
  worstAuditedNumerator: number;  worstAuditedCi: number;
  auditedBeyondBand: number;   auditedAbove101: number;
  /** Targets on the audited range that are the LARGEST sharing their win-chance value (the best-priced member of their group). */
  auditedLargestInGroup: number;
}

/**
 * NOTHING NON-DETERMINISTIC MAY LEAVE THIS FUNCTION. Every field it returns is printed into Step
 * 16's detail string, and `fieldDiff` (src/diff.ts, called in tests/verify.ts) compares that string
 * to the committed artifact, so a wall-clock duration in the report would make `npm run verify`
 * disagree with its own evidence on every run and exit 1.
 */
function enumerateGrid(): GridReport {
  const ciMin = targetToHundredths(MIN_MULTIPLIER);        // 101       -> 1.01x
  const ciMax = targetToHundredths(MAX_MULTIPLIER);        // 1e8       -> 1,000,000x (result cap)
  const ciTop = targetToHundredths(PROD_TOP_TARGET);       // 1e6       -> 10,000x (highest target settled on production)

  const r: GridReport = {
    total: 0, violations: 0, worstNumerator: -1, worstCi: 0,
    countAbove101: 0, firstAbove101Ci: 0, firstAbove101Numerator: 0, countExactlyOnePercent: 0, firstBeyondBandCi: 0,
    auditedTotal: 0, auditedExactlyOnePercent: 0, worstAuditedNumerator: -1, worstAuditedCi: 0,
    auditedBeyondBand: 0, auditedAbove101: 0, auditedLargestInGroup: 0,
  };

  for (let ci = ciMin; ci <= ciMax; ci++) {
    r.total++;
    const cr = Math.floor(RESULT_NUMERATOR / ci);
    // The exact-integer statement of "edge >= 1.00%", over the WHOLE grid and not a sample.
    if (cr * ci > RESULT_NUMERATOR) r.violations++;
    const rem = RESULT_NUMERATOR - cr * ci;               // N mod ci, without a second division
    const num = EDGE_BASE_NUMERATOR + rem;                // edge numerator over EDGE_DENOMINATOR
    if (num > r.worstNumerator) { r.worstNumerator = num; r.worstCi = ci; }
    const beyondBand = cr * ci < CLAIM_FLOOR_NUMERATOR;
    if (beyondBand && r.firstBeyondBandCi === 0) r.firstBeyondBandCi = ci;
    if (num > EDGE_101_NUMERATOR) {
      r.countAbove101++;
      if (r.firstAbove101Ci === 0) { r.firstAbove101Ci = ci; r.firstAbove101Numerator = num; }
    }
    if (rem === 0) r.countExactlyOnePercent++;
    if (ci <= ciTop) {
      r.auditedTotal++;
      if (rem === 0) r.auditedExactlyOnePercent++;
      if (num > r.worstAuditedNumerator) { r.worstAuditedNumerator = num; r.worstAuditedCi = ci; }
      if (beyondBand) r.auditedBeyondBand++;
      if (num > EDGE_101_NUMERATOR) r.auditedAbove101++;
      // ci is the largest target sharing its win chance iff the next target's cr is strictly lower. Since
      // RTP = cr * ci / 1e10 and cr is fixed within a group, the largest ci has the group's HIGHEST RTP:
      // every smaller member is strictly dominated (identical win chance, strictly lower payout).
      if (Math.floor(RESULT_NUMERATOR / (ci + 1)) < cr) r.auditedLargestInGroup++;
    }
  }
  return r;
}

/** The one enumeration per verifier run. Deterministic, so caching it changes no output. */
let gridCache: GridReport | null = null;
export function legalGrid(): GridReport {
  if (gridCache === null) gridCache = enumerateGrid();
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
  // asserted in EXACT INTEGERS, so no tolerance is needed. An edge above 1.00% on a captured target is
  // REAL, not rounding: it is (9.9e9 mod ci) over 1e10; the binary64 error there is ~1e-16.
  //
  // G-VALID: an edge landing on exactly 1.000000% is the NORMAL outcome whenever ci divides N
  // (target 2.00 is one of them). Exactness here is the arithmetic working, not a red flag.
  //
  // G-RANGE: a NON-FINITE value from OUR OWN reference formula must HARD-FAIL, and it is counted
  // explicitly. Every comparison against NaN is false, so an unguarded curve would read as clean.
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
  let maxCapturedEdgeNumerator = -1;
  let maxCapturedEdgeTarget = NaN;
  for (const m of distinctTargets) {
    const ci = targetToHundredths(m);
    const count = Math.floor(RESULT_NUMERATOR / ci);
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

  const exactExample = distinctTargets.find((m) => Math.floor(RESULT_NUMERATOR / targetToHundredths(m)) * targetToHundredths(m) === RESULT_NUMERATOR);
  // Exercise the ends as well: the minimum target, the top of the audited range and the result cap.
  const extremes = [MIN_MULTIPLIER, PROD_TOP_TARGET, MAX_MULTIPLIER];
  const extremesOk = extremes.every((m) => {
    const ci = targetToHundredths(m);
    return Math.floor(RESULT_NUMERATOR / ci) * ci <= RESULT_NUMERATOR
      && Number.isFinite(theoreticalRTP(m)) && Number.isFinite(effectiveEdge(m));
  });

  // Stake-weighted picture of the capture, recomputed from the raw rows.
  const stakeWeighted = bets.reduce((s, b) => s + Number(b.betAmount) * effectiveEdge(Number(b.params.target)), 0)
    / bets.reduce((s, b) => s + Number(b.betAmount), 0);
  const stakeWeightedOk = Number.isFinite(stakeWeighted);

  // Both halves, and both matter: each count must be what its window implies (no early exit, no
  // off-by-one in the loop) AND what this step's pinned population says.
  const gridTotalOk = grid.total === targetToHundredths(MAX_MULTIPLIER) - targetToHundredths(MIN_MULTIPLIER) + 1 && grid.total === FORMULA_GRID_COUNT;
  const auditedTotalOk = grid.auditedTotal === targetToHundredths(PROD_TOP_TARGET) - targetToHundredths(MIN_MULTIPLIER) + 1 && grid.auditedTotal === AUDITED_TARGET_COUNT;
  // every target the capture played is inside the audited range, so the range is the one the data spans
  const playedInside = distinctTargets.every((m) => targetToHundredths(m) >= targetToHundredths(MIN_MULTIPLIER) && targetToHundredths(m) <= targetToHundredths(PROD_TOP_TARGET))
    && Math.min(...distinctTargets) === MIN_MULTIPLIER && Math.max(...distinctTargets) === PROD_TOP_TARGET;

  const auditedOffClaim = grid.auditedTotal - grid.auditedExactlyOnePercent;
  const s16ok = edgeViolations === 0 && favourable === 0 && nonFinite === 0 && extremesOk && stakeWeightedOk
    && edgeChecked === distinctTargets.length && edgeChecked > 0
    && grid.violations === 0 && gridTotalOk && auditedTotalOk && playedInside && Number.isFinite(CLAIM_FLOOR_NUMERATOR);
  const bandPp = (decimalOver(RTP_CLAIM_BAND, EDGE_DENOMINATOR) / EDGE_DENOMINATOR * 100).toFixed(1);
  const auditedGapPp = ((grid.worstAuditedNumerator - EDGE_BASE_NUMERATOR) / EDGE_DENOMINATOR * 100).toFixed(6);
  const s16 = step(16, 'Effective-Edge Curve',
    !s16ok ? 'FAIL' : grid.auditedBeyondBand > 0 ? 'FLAG' : 'PASS',
    `${s16ok
      ? `PROFILE LIMBO-19, judged against the RTP-CLAIM band (${bandPp} pp from the ${(HOUSE_EDGE * 100).toFixed(2)}% edge claim) on the AUDITED RANGE, every 2-dp target from ${MIN_MULTIPLIER}x to ${PROD_TOP_TARGET}x (the lowest and the highest target settled on production): `
        + `${grid.auditedBeyondBand} of the ${grid.auditedTotal} targets sit more than the band from the claim (${grid.auditedBeyondBand > 0 ? 'FLAG, origin operator' : 'no FLAG'}); `
        + `${grid.auditedBeyondBand > 0 ? '' : 'inside the band '}the derived edge differs from the ${(HOUSE_EDGE * 100).toFixed(2)}% claim at ${auditedOffClaim} of the ${grid.auditedTotal} targets, always on the house side, by at most ${auditedGapPp} pp (${gridPct(grid.worstAuditedNumerator)}% at ${ciToTarget(grid.worstAuditedCi)}x)${grid.auditedBeyondBand > 0 ? '' : ' — printed, not flagged'}; `
        + `${grid.auditedExactlyOnePercent} are priced at exactly ${(HOUSE_EDGE * 100).toFixed(2)}% and ${grid.auditedAbove101} carry an edge above 1.01%. `
      : ''}EXHAUSTIVE: house edge >= ${(HOUSE_EDGE * 100).toFixed(2)}% asserted in EXACT INTEGERS `
    + `(floor(${RESULT_NUMERATOR}/ci(m)) x ci(m) <= ${RESULT_NUMERATOR}, no tolerance) at every one of the ${grid.total} 2-dp values `
    + `in [${MIN_MULTIPLIER}x, ${MAX_MULTIPLIER}x], the formula's whole grid up to the result cap — ${grid.violations} violations `
    + `(${gridTotalOk && auditedTotalOk ? `both population sizes are what their windows imply and what this step pins, ${AUDITED_TARGET_COUNT} and ${FORMULA_GRID_COUNT}` : 'POPULATION SIZE DISAGREES'}). `
    + `THE EDGE IS NOT FLAT ABOVE 1.00%: edge(ci) = (${EDGE_DENOMINATOR} - ${RESULT_NUMERATOR} + (${RESULT_NUMERATOR} mod ci)) / ${EDGE_DENOMINATOR}, `
    + `so the excess over 1% is driven by (N mod ci) and grows with ci. `
    + `Mechanically it is a same-odds/different-payout effect: targets sharing one value of floor(N/ci) share an IDENTICAL win chance but are each paid their own multiplier, so within a group RTP = cr x ci / ${EDGE_DENOMINATOR} rises with ci and only the LARGEST member is priced as well as those odds allow; ${grid.auditedLargestInGroup} of the ${grid.auditedTotal} audited targets (${(grid.auditedLargestInGroup / grid.auditedTotal * 100).toFixed(3)}%) are the best-priced member of their group (best-priced does not mean priced at 99.00%). `
    + `ABOVE THE AUDITED RANGE, arithmetic about the formula only (whether production accepts a target above ${PROD_TOP_TARGET}x is not established, Step 17): the first value whose edge exceeds 1.01% is ${ciToTarget(grid.firstAbove101Ci)}x (${gridPct(grid.firstAbove101Numerator)}%); `
    + `the first value beyond the RTP-CLAIM band is ${ciToTarget(grid.firstBeyondBandCi)}x (RTP ${ciRtpPct(grid.firstBeyondBandCi)}%); over the whole grid the worst edge is ${gridPct(grid.worstNumerator)}% at ${ciToTarget(grid.worstCi)}x, ${grid.countAbove101} of ${grid.total} values carry an edge above 1.01% and ${grid.countExactlyOnePercent} are exactly ${(HOUSE_EDGE * 100).toFixed(2)}%. `
    + `CAPTURED-TARGET SUB-MEASUREMENT, reported separately and NOT to be read as the curve: across the ${edgeChecked} distinct targets the production capture played, spanning ${Math.min(...distinctTargets)}x..${Math.max(...distinctTargets)}x (${playedInside ? 'the ends of the audited range' : 'NOT the audited range'}), `
    + `${edgeViolations} violations`
    + (firstEdgeFail ? ` (e.g. ${firstEdgeFail})` : '')
    + `, ${favourable} player-favourable targets; `
    + `${nonFinite} targets at which OUR OWN reference formula returned a non-finite value (${nonFinite === 0 ? 'none' : 'CORRUPT VERIFIER'}), counted explicitly because every comparison against NaN is false; `
    + `captured edge spans ${(minEdge * 100).toFixed(6)}% (at ${minEdgeTarget}x) to ${(maxEdge * 100).toFixed(6)}% (at ${maxEdgeTarget}x), stake-weighted mean across the capture ${(stakeWeighted * 100).toFixed(6)}%; `
    + `${exactlyOnePercent} of the ${edgeChecked} captured targets price to EXACTLY ${(HOUSE_EDGE * 100).toFixed(2)}% (${exactExample === undefined ? 'none' : `e.g. target ${exactExample.toFixed(2)} -> win chance ${(winChance(exactExample) * 100).toFixed(4)}%, RTP ${(theoreticalRTP(exactExample) * 100).toFixed(4)}%`}); `
    + `the flooring can only LOWER the payout, never raise it, which is why 1.00% is a provable floor and why the dispersion above it runs one way only; `
    + `the ends also satisfy the identity (${extremes.join('x, ')}x: ${extremesOk ? 'ok' : 'FAIL'}), max win chance ${MAX_WIN_CHANCE_PERCENT.toFixed(6)}% at the ${MIN_MULTIPLIER}x minimum target; `
    + `the largest edge on the captured targets is ${(maxCapturedEdgeNumerator / EDGE_DENOMINATOR * 100).toFixed(8)}% at ${maxCapturedEdgeTarget}x, a real difference from ${(HOUSE_EDGE * 100).toFixed(2)}% and not a rounding effect`,
    'operator',
  );

  // ── Step 17: Target bounds and maximum payout, as evidenced on production (profile LIMBO-14) ───
  // Stated strictly from what production shows:
  //   (a) every target played is a 2-dp value in [MIN_MULTIPLIER, PROD_TOP_TARGET];
  //   (b) the casino accepted and settled bets at exactly PROD_TOP_TARGET, and no production round was placed above it;
  //   (c) whether a bet above PROD_TOP_TARGET is accepted is NOT established: this audit holds no refused bet.
  //       The one record on the question is evidence/E03 (the production verifier answered HTTP 400 to one request
  //       with target 100000 on 2026-11-03): read here and required to say exactly that, so the prose cannot
  //       drift from the file;
  //   (d) the game page's own text (liqd.com/originals/limbo, read logged out 2026-10-01) uses 10,000x as its top example;
  //   (e) a maximum payout or exposure limit is UNDECLARED: no bet was refused in the three runs; the largest
  //       potential payout the casino accepted is measured and printed as a measured maximum, not a limit.
  // The result cap (1,000,000x) is a property of the RESULT, witnessed by the production verifier (Step 25).
  const targetsOk = bets.every((b) => isTargetLegal(Number(b.params.target)) && hundredths(Number(b.params.target)) <= hundredths(PROD_TOP_TARGET));
  const atTop = bets.filter((b) => hundredths(Number(b.params.target)) === hundredths(PROD_TOP_TARGET));
  const aboveTop = bets.filter((b) => hundredths(Number(b.params.target)) > hundredths(PROD_TOP_TARGET)).length;
  const atTopWins = atTop.filter((b) => b.win).length;
  const expectedTopWins = atTop.length * winChance(PROD_TOP_TARGET);
  const maxPotential = Math.max(...bets.map((b) => hundredths(Number(b.betAmount)) * hundredths(Number(b.params.target)) / 1e4));
  let e03 = 'evidence/E03-prod-verifier-target-100000.json UNREADABLE';
  let e03Ok = false;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(ctx.evidenceDir, 'E03-prod-verifier-target-100000.json'), 'utf8')) as {
      host?: string; date?: string; request?: { path?: string; body?: { params?: { target?: number } } }; reply?: { httpStatus?: number; bodyRetained?: boolean } };
    const t = j.request?.body?.params?.target;
    e03Ok = j.host === 'liqd.com' && j.request?.path === '/api/v1/originals/limbo/verify' && t === 100_000 && j.reply?.httpStatus === 400
      && j.reply?.bodyRetained === false && typeof t === 'number' && t > PROD_TOP_TARGET;
    e03 = `evidence/E03 (${j.date}): one logged-out request to the production VERIFIER with target ${t} was answered HTTP ${j.reply?.httpStatus}, a validation error on the target; the reply body was not retained (${e03Ok ? 'the record says exactly this' : 'THE RECORD DISAGREES'})`;
  } catch { e03Ok = false; }
  let pageTop = false;
  try {
    const labels = fs.readFileSync(path.join(ctx.evidenceDir, 'rtp-page-labels-2026-10-01.json'), 'utf8');
    pageTop = labels.includes('10,000x lands 0.0099% of the time');
  } catch { pageTop = false; }

  const s17 = step(17, 'Target Bounds & Maximum Payout (as evidenced on production)',
    targetsOk && atTop.length > 0 && aboveTop === 0 && e03Ok && pageTop ? 'PASS' : 'FAIL',
    `PROFILE LIMBO-14. Every one of the ${bets.length} targets played is a 2-dp value in [${MIN_MULTIPLIER}, ${PROD_TOP_TARGET}] (${targetsOk}). `
    + `HIGHEST TARGET: the casino accepted and settled ${atTop.length} rounds at exactly ${PROD_TOP_TARGET}x (${atTopWins} won; ${expectedTopWins.toFixed(4)} wins expected at a ${(winChance(PROD_TOP_TARGET) * 100).toFixed(4)}% win chance); ${aboveTop} production rounds were placed above it. `
    + `ABOVE ${PROD_TOP_TARGET}x: NOT ESTABLISHED. This audit holds no refused bet, so whether liqd.com accepts a bet on a target above ${PROD_TOP_TARGET}x is not known from it. ${e03}. That is a verifier reply to one request, not a refused bet. `
    + `The game page's own text uses ${PROD_TOP_TARGET}x as its top example ("10,000x lands 0.0099% of the time", liqd.com/originals/limbo read logged out 2026-10-01, evidence/rtp-page-labels-2026-10-01.json: ${pageTop}); this package holds no text that tells players of a higher target. `
    + `RESULT CAP: ${MAX_MULTIPLIER}x, a property of the result and not of the target; no settled round reached it; its witness is the production verifier probe set of Step 25. `
    + `MAXIMUM PAYOUT / EXPOSURE: UNDECLARED. No bet was refused in the three runs; the largest potential payout (stake x target) the casino accepted is ${maxPotential} ${ctx.meta.currency}, a measured maximum and not a limit. `
    + `The pricing does not change at the top of the range: edge ${(effectiveEdge(PROD_TOP_TARGET) * 100).toFixed(6)}% at ${PROD_TOP_TARGET}x`,
  );

  return [s16, s17];
}
