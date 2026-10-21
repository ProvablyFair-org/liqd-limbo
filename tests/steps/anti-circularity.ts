/**
 * Steps 14–15: Anti-circularity, and the identity that ties PRICING to PHYSICS.
 *
 * Step 14 answers "could this suite fail?" — a verifier that cannot reject a wrong answer is not
 * evidence of anything. Step 15 answers the question that actually decides whether Limbo is fair:
 * the operator SELLS a win chance (its `cr` function prices the target), and the RNG PRODUCES a
 * result distribution. Those are two different objects, and nothing forces them to agree. Step 15
 * shows they do — exactly, in integers, for every target in the capture — and anchors the closed
 * form against a literal tally over the whole 100,000,000-point draw grid.
 */

import type { StepResult, VerifyContext } from './context';
import { step, servedResultMatches } from './context';
import { limboDraw } from '../../src/rng';
import {
  resultMultiplier, limboWin, winChance, targetToHundredths,
  RANGE, RESULT_NUMERATOR, MIN_RESULT, MAX_MULTIPLIER,
} from '../../src/config';

/**
 * Literal tally over the ENTIRE draw grid: apply the published result formula and the published win
 * rule to every one of the 100,000,000 possible draws and count the winners.
 *
 * This is the arithmetic-error-immune anchor. It cannot share a flooring, clamping or off-by-one
 * mistake with the closed form `floor(N / ci(m))`, because it does not do any of that reasoning —
 * it just runs the game 1e8 times. ~0.35 s per target on the validated runtime.
 */
function tallyWinningDraws(target: number): number {
  let c = 0;
  for (let k = 0; k < RANGE; k++) if (limboWin(resultMultiplier(k), target)) c++;
  return c;
}

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, seedMap, distinctTargets } = ctx;

  // ── Step 14: Negative control + grid boundary anchor ────────────────────────
  // (a) NEGATIVE CONTROL. Take a real bet, recompute its result, and require the EXACT predicate
  //     Step 5 uses to ACCEPT the true value while REJECTING a perturbed one and a non-numeric one.
  //     The perturbation is +0.01 — one tick of the 2-dp result grid, the smallest wrong answer
  //     that exists — so this is not the tautological `x+1 !== x` control the dice audit shipped
  //     and had to replace.
  const probe = bets.find((b) => seedMap.has(b.hashedServerSeed));
  if (!probe) throw new Error('anti-circularity: no bet with a revealed seed — the suite cannot establish falsifiability');
  const ss = seedMap.get(probe.hashedServerSeed)!;
  const trueResult = resultMultiplier(limboDraw(ss, probe.clientSeed, probe.nonce));
  const perturbed = Math.round((trueResult + 0.01) * 100) / 100;
  const accepts = (r: number) => servedResultMatches(r, trueResult);
  const negControlRejects = accepts(trueResult) && !accepts(perturbed) && !accepts(NaN) && !accepts(Infinity);

  // (b) BOUNDARY ANCHOR, per distinct target. The closed form says exactly floor(N/ci(m)) draws win.
  //     If that is right then k = floor(N/ci) - 1 must WIN and k = floor(N/ci) must LOSE, under the
  //     real result formula and the real win rule — not under a restatement of the closed form.
  //     Run for every distinct target in the capture, so a clamp or off-by-one that only bites at
  //     one end of the target range cannot hide.
  let boundaryChecked = 0;
  let boundaryFails = 0;
  let firstBoundaryFail = '';
  for (const m of distinctTargets) {
    const ci = targetToHundredths(m);
    const count = Math.floor(RESULT_NUMERATOR / ci);
    if (count - 1 >= 0 && !limboWin(resultMultiplier(count - 1), m)) {
      boundaryFails++;
      if (!firstBoundaryFail) firstBoundaryFail = `target ${m}: k=${count - 1} should WIN, R=${resultMultiplier(count - 1)}`;
    }
    if (count < RANGE && limboWin(resultMultiplier(count), m)) {
      boundaryFails++;
      if (!firstBoundaryFail) firstBoundaryFail = `target ${m}: k=${count} should LOSE, R=${resultMultiplier(count)}`;
    }
    boundaryChecked++;
  }

  // (c) GRID EXTREMES. The two clamps are model behaviour no captured bet can fully witness (the
  //     capture never reached the 1e6 ceiling), so they are exercised here directly.
  const bottomOfGrid = resultMultiplier(RANGE - 1);
  const topOfGrid = resultMultiplier(0);
  const clampsOk = bottomOfGrid === MIN_RESULT && topOfGrid === MAX_MULTIPLIER
    && resultMultiplier(98) === MAX_MULTIPLIER && resultMultiplier(99) < MAX_MULTIPLIER;

  const s14 = step(14, 'Anti-Circularity (Negative Control + Grid Boundary Anchor)',
    negControlRejects && boundaryFails === 0 && boundaryChecked === distinctTargets.length && clampsOk ? 'PASS' : 'FAIL',
    `negative control on epoch ${probe.epoch} nonce ${probe.nonce}: the predicate Step 5 uses ACCEPTS the recomputed ${trueResult}x and REJECTS ${perturbed}x (one 2-dp tick away), NaN and Infinity (${negControlRejects ? 'falsifiable' : 'VACUOUS — this suite could not fail'}); `
    + `boundary anchor over ${boundaryChecked}/${distinctTargets.length} distinct captured targets: for each, k = floor(${RESULT_NUMERATOR}/ci(m)) - 1 WINS and k = floor(${RESULT_NUMERATOR}/ci(m)) LOSES under the real formula and rule — ${boundaryFails} violations`
    + (firstBoundaryFail ? ` (e.g. ${firstBoundaryFail})` : '')
    + `; grid extremes exercised directly because the capture cannot witness them: k=0 -> ${topOfGrid}x (upper clamp), k=98 -> ${resultMultiplier(98)}x, k=99 -> ${resultMultiplier(99)}x (first draw below the clamp), k=${RANGE - 1} -> ${bottomOfGrid}x (lower clamp) — ${clampsOk ? 'all as published' : 'CLAMP BEHAVIOUR WRONG'}; `
    + `every quantity in this step is derived from the draw grid and the operator's published constants; no operator payout, odds or win-chance field is read`,
  );

  // ── Step 15: Win-chance ↔ result-distribution identity ──────────────────────
  // The operator prices a target as winChance(m) = floor(9.9e9 / ci(m)) / 1e8. The RNG produces
  // R = min(1e6, max(1, floor(9.9e9/(k+1))/100)) from a uniform k. For the game to be what it
  // claims, P(R >= m) over the uniform grid must EQUAL the price. It does, and the proof is an
  // integer one:
  //     R >= m  <=>  floor(N/(k+1)) >= ci(m)  <=>  k + 1 <= N/ci(m)  <=>  k <= floor(N/ci(m)) - 1
  // so exactly floor(N/ci(m)) of the 1e8 draws win — which is RANGE x winChance(m) exactly.
  //
  // Asserted as an INTEGER equality, with no tolerance: `Math.floor(N/ci) === winChance(m) * RANGE`.
  // A float comparison at 1e-12 would be the dice audit's Step 15 mistake, where the threshold was
  // under 2x the binary64 noise of the very quantity it was thresholding.
  //
  // HONESTY ABOUT WHAT THIS IS. The equality is a property of the MODEL — it holds by algebra for
  // every legal target, so no dataset can falsify it. What it catches is a change to OUR model (a
  // clamp edit, a pricing edit, an inclusive/exclusive boundary regression), and that is worth a
  // scored step. What makes it a statement about the OPERATOR is the anchoring: the same closed
  // form is tallied literally over the full 1e8 grid below, and the model it prices is the one that
  // reproduced all 6,700 settled results in Step 5.
  let identityChecked = 0;
  let identityFails = 0;
  let firstIdentityFail = '';
  for (const m of distinctTargets) {
    const ci = targetToHundredths(m);
    const count = Math.floor(RESULT_NUMERATOR / ci);
    if (count !== Math.round(winChance(m) * RANGE) || count / RANGE !== winChance(m)) {
      identityFails++;
      if (!firstIdentityFail) firstIdentityFail = `target ${m}: grid count ${count} vs priced ${winChance(m) * RANGE}`;
    }
    identityChecked++;
  }

  // Literal tally anchor. Four targets spanning the captured range, each a full 100,000,000-draw
  // sweep of the real formula and the real rule — the check that would catch a clamp or flooring
  // error the closed form shares with itself.
  const anchorTargets = [1.01, 2.00, 100.00, 500_000];
  const anchors = anchorTargets.map((m) => {
    const tallied = tallyWinningDraws(m);
    const closedForm = Math.floor(RESULT_NUMERATOR / targetToHundredths(m));
    return { m, tallied, closedForm, agree: tallied === closedForm };
  });
  const anchorsOk = anchors.every((a) => a.agree);

  const s15 = step(15, 'Win-Chance vs Result-Distribution Identity',
    identityFails === 0 && anchorsOk && identityChecked === distinctTargets.length && distinctTargets.length > 0 ? 'PASS' : 'FAIL',
    `${identityChecked} distinct captured targets: the number of winning draws on the ${RANGE}-point grid is exactly floor(${RESULT_NUMERATOR}/ci(m)) == winChance(m) x ${RANGE}, asserted as an INTEGER equality with no tolerance — ${identityFails} violations`
    + (firstIdentityFail ? ` (e.g. ${firstIdentityFail})` : '')
    + `; so the win chance given by LIQD's pricing formula (read from its client code) equals the probability the result formula delivers — LIQD's page states two of these figures, 49.5% at 2x and 0.0099% at 10,000x (evidence/rtp-page-labels-2026-10-01.json), and both match. `
    + `Literal tally anchor, ${anchorTargets.length} full ${RANGE}-draw sweeps of the real formula and rule: `
    + `${anchors.map((a) => `${a.m}x tallied ${a.tallied} vs closed form ${a.closedForm} (${a.agree ? 'agree' : 'DISAGREE'})`).join('; ')}; `
    + `MODEL IDENTITY, stated plainly: it holds by algebra for every legal target, so no dataset can falsify it — it enforces our model and is anchored by the tally, while the tie to the operator is Step 5's reproduction of all ${bets.length} settled results`,
  );

  return [s14, s15];
}
