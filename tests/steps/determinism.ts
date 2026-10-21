/**
 * Steps 5–7: Draw/result recomputation, the win rule, and recomputation determinism.
 *
 * This is the heart of provable fairness for Limbo: every served RESULT multiplier must recompute
 * from the revealed (serverSeed, clientSeed, nonce) through the published algorithm, and every
 * served win flag must follow from that recomputed result and the player's chosen target. No
 * operator field is trusted — `localDraw` / `localResult` / `localWin` are present in the capture
 * and are ignored here; every figure below is re-derived from primitives.
 */

import type { StepResult, VerifyContext } from './context';
import { step, servedResultMatches, isTwoDecimal } from './context';
import { limboDraw, rejectedLeadingChunks } from '../../src/rng';
import { drawBiasBound, acceptanceProbe } from '../../src/bias';
import {
  resultMultiplier, limboWin, isTargetLegal,
  RANGE, MIN_RESULT, MAX_MULTIPLIER, RESULT_NUMERATOR, MULTIPLIER_SCALE, EXPECTED_BETS, MIN_MULTIPLIER,
  targetToHundredths,
} from '../../src/config';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, seedMap } = ctx;

  // ── Step 5: Draw & result recomputation ─────────────────────────────────────
  // k = HMAC-SHA256 bias-free draw in [0, 1e8) at cursor 0;
  // R = min(1e6, max(1, floor(9.9e9 / (k+1)) / 100)).
  //
  // The lower clamp (MIN_RESULT = 1) is not cosmetic: it fires for every k > 98,999,999, i.e. 1% of
  // the draw space. It was MISSING from the model until the capture's own inline check caught it on
  // 2026-09-11 in an earlier capture run that is not shipped (serverSeed 5d8a6efd…, nonce 49); the first
  // clamped round in the shipped dataset is epoch 3 nonce 29. The floored rounds are counted below because a suite that silently dropped
  // them would be reporting on 98% of the capture while claiming 100%.
  let checked = 0;
  let mismatches = 0;
  let unrevealed = 0;
  let rangeViolations = 0;
  let sample = '';
  let flooredRounds = 0;      // served R exactly at the MIN_RESULT floor
  let clampedRaw = 0;         // rounds where the RAW formula fell below the floor (the clamp fired)
  let ceilingRounds = 0;      // served R at the MAX_MULTIPLIER ceiling
  let minResultSeen = Infinity;
  let maxResultSeen = -Infinity;
  let minDraw = Infinity;
  let maxDraw = -Infinity;
  // DRAW-BIAS BOUND (profile LIMBO-08, rules.drawBias R1). Computed from the SAME maxFair rule the
  // live draw applies (src/bias.ts drawBiasBound, tied to src/rng.ts by acceptanceProbe) and ASSERTED: maxFair must be a whole number of
  // ranges, so every k in [0, 1e8) is reached by exactly the same number of accepted 32-bit chunks
  // and the per-value bias is exactly 0. The rejection CENSUS is counted over the capture: rounds
  // whose first chunk fell in the discarded tail are rounds on which an unguarded server would have
  // served a different result, so every one of them reproducing (the mismatch count above) is the
  // live witness that the operator applies the guard. This used to be a prose derivation (L11).
  const bias = drawBiasBound(RANGE);
  const probe = acceptanceProbe(RANGE);
  let roundsFirstChunkRejected = 0;
  let chunksRejected = 0;
  let rejectedMismatch = 0;

  for (const b of bets) {
    const served = Number(b.result);
    // G-RANGE: bounds come from src/config.ts and from the draw grid, never from the artifact.
    // A served result outside [MIN_RESULT, MAX_MULTIPLIER], or one that is not a 2-dp value, is not
    // a mismatch to be measured — it is physically impossible under the published formula.
    if (!Number.isFinite(served) || served < MIN_RESULT || served > MAX_MULTIPLIER || !isTwoDecimal(served)) rangeViolations++;

    const ss = seedMap.get(b.hashedServerSeed);
    if (!ss) { unrevealed++; continue; }
    const k = limboDraw(ss, b.clientSeed, b.nonce);
    if (!Number.isInteger(k) || k < 0 || k >= RANGE) rangeViolations++;
    const rej = rejectedLeadingChunks(ss, b.clientSeed, b.nonce, RANGE);
    chunksRejected += rej;
    const local = resultMultiplier(k);
    if (rej > 0) { roundsFirstChunkRejected++; if (!servedResultMatches(served, local)) rejectedMismatch++; }
    if (!servedResultMatches(served, local)) {
      mismatches++;
      if (!sample) sample = `epoch ${b.epoch} nonce ${b.nonce}: local ${local} vs served ${b.result}`;
    }
    if (served === MIN_RESULT) flooredRounds++;
    if (Math.floor(RESULT_NUMERATOR / (k + 1)) / MULTIPLIER_SCALE < MIN_RESULT) clampedRaw++;
    if (served === MAX_MULTIPLIER) ceilingRounds++;
    if (served < minResultSeen) minResultSeen = served;
    if (served > maxResultSeen) maxResultSeen = served;
    if (k < minDraw) minDraw = k;
    if (k > maxDraw) maxDraw = k;
    checked++;
  }

  const s5 = step(5, 'Draw & Result Recomputation',
    mismatches === 0 && rangeViolations === 0 && unrevealed === 0 && checked === EXPECTED_BETS
      && bias.wholeRanges && bias.biasPerValue === 0 && probe.disagree === 0 && probe.firstChunkRejected > 0 ? 'PASS' : 'FAIL',
    (mismatches === 0
      ? `${checked}/${EXPECTED_BETS} bets (denominator from src/config.ts EXPECTED_BETS — G-BIND): R = min(${MAX_MULTIPLIER}, max(${MIN_RESULT}, floor(${RESULT_NUMERATOR}/(k+1))/${MULTIPLIER_SCALE})) `
        + `recomputed from the revealed (serverSeed, clientSeed, nonce) equals the served result EXACTLY (strict ===, no tolerance)`
      : `${mismatches} mismatches (e.g. ${sample})`)
    + `; ${unrevealed} bets whose epoch seed was never revealed; ${rangeViolations} served results outside [${MIN_RESULT}, ${MAX_MULTIPLIER}] or not a 2-dp value (G-RANGE, bounds from config); `
    + `draws span k ${minDraw}..${maxDraw} of [0, ${RANGE}); results span ${minResultSeen}x..${maxResultSeen}x; `
    + `${flooredRounds} rounds served at the R = ${MIN_RESULT} floor (${(flooredRounds / Math.max(1, checked) * 100).toFixed(2)}% of the capture), of which ${clampedRaw} had a RAW formula value below ${MIN_RESULT} so the clamp actually fired `
    + `— legitimate rounds, and the clamp they exercise was absent from the model until the capture's own inline check caught it on 2026-09-11 in an earlier capture run that is not shipped (serverSeed 5d8a6efd…, nonce 49); `
    + `${ceilingRounds} rounds at the ${MAX_MULTIPLIER}x ceiling (the upper clamp is therefore ${ceilingRounds > 0 ? 'exercised by' : 'NOT witnessed in'} this capture — see Step 21); `
    + `DRAW-BIAS BOUND: maxFair = floor(2^32/${RANGE}) x ${RANGE} = ${bias.maxFair} (${bias.wholeRanges ? 'a whole number of ranges' : 'NOT a whole number of ranges'}), `
    + `so each k is reached by exactly ${bias.acceptedPerValue} accepted chunk values and the per-value bias is ${bias.biasPerValue} (ceiling 2^-32); `
    + `${bias.rejectedChunkValues} of 2^32 chunk values (${(bias.rejectedPerChunk * 100).toFixed(4)}%) fall in the discarded tail; `
    + `rejection census over the capture: ${roundsFirstChunkRejected} of ${checked} rounds had their FIRST chunk rejected (${chunksRejected} chunks rejected in all, expected ${(checked * bias.rejectedPerChunk).toFixed(2)} rounds) `
    + `and ${roundsFirstChunkRejected - rejectedMismatch} of them reproduce under the guarded model — an unguarded server would have served a different result on every one; `
    + `acceptance probe (src/bias.ts, ${probe.rounds} fixed rounds through src/rng.ts): ${probe.disagree} draws disagree with "first chunk below maxFair, mod range", ${probe.firstChunkRejected} of the probe rounds exercised the rejected tail`,
  );

  // ── Step 6: Win-rule reproduction ───────────────────────────────────────────
  // win <=> R >= target. The `>=` (rather than `>`) is WITNESSED, not assumed:
  //   • evidence/E13 — the operator's own /verify endpoint, same seed pair: target == R won,
  //     target == R + 0.01 lost (reproduced under our model in Step 19);
  //   • AND in the settled money data itself — the rounds where the served result lands EXACTLY on
  //     the chosen target. Those are the only rounds with any power to separate `>=` from `>`; they
  //     are counted below, and under a strict `>` rule every one of them would have to be a LOSS.
  let winChecked = 0;
  let winFails = 0;
  let firstWinFail = '';
  let discriminating = 0;        // rounds where served R == target exactly
  let discriminatingWins = 0;    // ... and the operator settled them as a win
  let flipsUnderStrictGt = 0;    // bets whose win flag would change if the rule were R > target
  let illegalTargets = 0;
  let floorRounds = 0;           // recomputed R at the MIN_RESULT floor
  let floorWins = 0;             // ... settled as a win (impossible: the floor is below every legal target)
  let expectedOnTarget = 0;      // Σ P(R == target) over the bets actually placed — the boundary-hit expectation

  for (const b of bets) {
    const target = Number(b.params.target);
    // P(R == m) on the 1e8 draw grid: #k with R >= m minus #k with R >= m + 0.01, i.e.
    // floor(N/ci) - floor(N/(ci+1)); at the result cap every draw at or above it serves the cap.
    {
      const ci = targetToHundredths(target);
      const upper = ci >= MAX_MULTIPLIER * MULTIPLIER_SCALE ? 0 : Math.floor(RESULT_NUMERATOR / (ci + 1));
      expectedOnTarget += (Math.floor(RESULT_NUMERATOR / ci) - upper) / RANGE;
    }
    // G-RANGE: the target is a player input the operator accepted; it must be a legal 2-dp value in
    // [MIN_MULTIPLIER, MAX_MULTIPLIER] per the operator's own published constants.
    if (!isTargetLegal(target)) illegalTargets++;
    const ss = seedMap.get(b.hashedServerSeed);
    if (!ss) continue;
    const local = resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce));
    if (limboWin(local, target) !== !!b.win) {
      winFails++;
      if (!firstWinFail) firstWinFail = `epoch ${b.epoch} nonce ${b.nonce}: R ${local} vs target ${target}, served win=${b.win}`;
    }
    if (local === target) { discriminating++; if (b.win) discriminatingWins++; }
    if (local === MIN_RESULT) { floorRounds++; if (b.win) floorWins++; }
    if ((local > target) !== !!b.win) flipsUnderStrictGt++;
    winChecked++;
  }

  const s6 = step(6, 'Win-Rule Reproduction',
    winFails === 0 && illegalTargets === 0 && winChecked === EXPECTED_BETS
      && floorWins === 0 && MIN_RESULT < MIN_MULTIPLIER ? 'PASS' : 'FAIL',
    (winFails === 0
      ? `${winChecked}/${EXPECTED_BETS} bets: win == (recomputed R >= chosen target) reproduces the served win flag exactly`
      : `${winFails} win-flag mismatches (e.g. ${firstWinFail})`)
    + `; ${illegalTargets} targets outside the operator's own legal window (2-dp, [1.01, ${MAX_MULTIPLIER}]) — G-RANGE; `
    + `the >= boundary is WITNESSED, not assumed: ${discriminating} captured rounds land with R EXACTLY on the chosen target and the operator settled ${discriminatingWins} of them as WINS `
    + `(under a strict R > target rule ${flipsUnderStrictGt} of the ${winChecked} settled bets would flip, so this dataset has real discriminating power — unlike the sibling dice capture, where the two boundary models disagreed on zero bets); `
    + `the same boundary is independently witnessed against the operator's own /verify endpoint in evidence/E13 and reproduced in Step 19; `
    + `boundary-hit expectation over the bets actually placed, Σ [floor(N/ci) − floor(N/(ci+1))]/${RANGE} = ${expectedOnTarget.toFixed(2)} against ${discriminating} observed; `
    + `RESULT FLOOR: ${floorRounds} recomputed rounds at R = ${MIN_RESULT}x, ${floorWins} of them settled as a win (the floor ${MIN_RESULT}x is below the minimum legal target ${MIN_MULTIPLIER}x, so every floor round must lose)`,
  );

  // ── Step 7: Recomputation determinism ───────────────────────────────────────
  // A verifier whose answer depends on when or in what order it ran is not a verifier. Three
  // probes, all on the SAME frozen population:
  //   (a) the full 6,700-bet recomputation, run twice, must agree bet for bet;
  //   (b) the same recomputation in REVERSE order must agree — no accumulated state leaks between
  //       bets (the HMAC path is stateless, and this is what demonstrates it rather than asserting it);
  //   (c) a sampled set of bets recomputed five times each must return one distinct value.
  // This is producer-side determinism over the real inputs, not a replay of a stored answer:
  // nothing here reads the served `result` field.
  const pass1: number[] = [];
  const pass2: number[] = [];
  for (const b of bets) {
    const ss = seedMap.get(b.hashedServerSeed);
    pass1.push(ss ? resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce)) : NaN);
  }
  for (const b of bets) {
    const ss = seedMap.get(b.hashedServerSeed);
    pass2.push(ss ? resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce)) : NaN);
  }
  let repeatDisagreements = 0;
  for (let i = 0; i < pass1.length; i++) if (pass1[i] !== pass2[i]) repeatDisagreements++;

  let reverseDisagreements = 0;
  for (let i = bets.length - 1; i >= 0; i--) {
    const b = bets[i];
    const ss = seedMap.get(b.hashedServerSeed);
    const r = ss ? resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce)) : NaN;
    if (r !== pass1[i]) reverseDisagreements++;
  }

  const REPEATS = 5;
  const SAMPLE = 200;
  const stride = Math.max(1, Math.floor(bets.length / SAMPLE));
  let sampled = 0;
  let unstable = 0;
  for (let i = 0; i < bets.length; i += stride) {
    const b = bets[i];
    const ss = seedMap.get(b.hashedServerSeed);
    if (!ss) continue;
    const values = new Set<number>();
    for (let r = 0; r < REPEATS; r++) values.add(resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce)));
    if (values.size !== 1) unstable++;
    sampled++;
  }

  const coverOk = pass1.length === EXPECTED_BETS && sampled > 0 && pass1.every((v) => Number.isFinite(v));
  const s7 = step(7, 'Recomputation Determinism',
    repeatDisagreements === 0 && reverseDisagreements === 0 && unstable === 0 && coverOk ? 'PASS' : 'FAIL',
    `the full ${pass1.length}-bet derivation was executed twice and once in reverse order: ${repeatDisagreements} bet(s) disagreed between the two forward passes, `
    + `${reverseDisagreements} between forward and reverse (order independence — the HMAC path carries no state between bets); `
    + `${sampled} sampled bets recomputed ${REPEATS}x each produced more than one distinct result on ${unstable} of them; `
    + `coverage ${coverOk ? 'ok' : 'FAIL — the population was short or a recomputation returned a non-finite value'} `
    + `(this is producer-side determinism over the real seed inputs: nothing in this step reads the served result field, so a replayed stored answer could not pass it)`,
  );

  return [s5, s6, s7];
}
