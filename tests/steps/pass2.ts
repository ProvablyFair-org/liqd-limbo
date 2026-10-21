/**
 * Step 24: Simulation Pass 2 — the cherry-pick screen, re-derived from the dataset (profile LIMBO-21).
 *
 * Everything is computed HERE from the pinned dataset by src/pass2.ts (deterministic — no random number
 * anywhere), and the committed `pass2` block of outputs/simulation-results.json must equal the
 * re-derivation, every leaf (the artifact's pin is Step 19). The step FAILS when:
 *   - fewer than EXPECTED_SEEDS revealed seeds carried a full 50-bet epoch, or the replay did not cover
 *     EXPECTED_SEEDS x PASS2_NONCES nonces (G-BIND: zero checked is a FAIL, never a PASS);
 *   - window 0 does not reproduce every captured result (the replay is of the operator's own rounds);
 *   - the served-target rule fires (rank-sum Z < PASS2_Z_CRIT, one-sided alpha 0.001; fixed in code on
 *     2026-09-26, 15 days after the capture and after an earlier screen had run on the same data);
 *   - the early/late screen (fixed in code on the same date) rejects (exact binomial P(X >= flags | n, p0) < 0.05, p0 computed
 *     from the EXACT multinomial null of the chi-squared, never assumed);
 *   - the committed pass2 block differs from the re-derivation — every leaf, at the reproduction bound
 *     (src/diff.ts: two distinct integers never agree, non-numeric leaves must be identical, a float
 *     within 1e-14 absolute + 1e-12 relative is the same result). Bit equality was the rule until
 *     2026-09-28; it is not kept because `servedReturn.zCritical` is a normal quantile through
 *     Math.log / Math.sqrt, and libm is not guaranteed bit-identical across platforms (1-ulp drift on
 *     Linux has been measured for exactly this class). Mutation: zCritical forged just
 *     beyond the bound still FAILs this step.
 * Built 2026-09-26 (the old screen's null was an unseeded bootstrap with an assumed p0).
 */

import * as fs from 'fs';
import * as path from 'path';

import type { StepResult, VerifyContext } from './context';
import { step } from './context';
import { pass2Screen } from '../../src/pass2';
import { fieldDiff, beyondTolerance } from '../../src/diff';
import { EXPECTED_SEEDS, PASS2_NONCES, PASS2_Z_CRIT, PASS2_SCREEN_ALPHA } from '../../src/config';

const NAME = 'Simulation Pass 2 — Cherry-Pick Screen, 10,000 Nonces per Revealed Seed';

export function run(ctx: VerifyContext): StepResult[] {
  const p = pass2Screen(ctx.seeds, ctx.bets);
  const bad: string[] = [];
  if (p.seedsTested !== EXPECTED_SEEDS) bad.push(`${p.seedsTested}/${EXPECTED_SEEDS} revealed seeds carried a full epoch`);
  if (p.noncesTotal !== EXPECTED_SEEDS * PASS2_NONCES) bad.push(`${p.noncesTotal} nonces replayed, expected ${EXPECTED_SEEDS * PASS2_NONCES}`);
  const r = p.servedReturn, e = p.earlyLateScreen;
  if (r.replayMismatches !== 0) bad.push(`${r.replayMismatches} captured results not reproduced by window 0`);
  if (!(Number.isFinite(r.rankSumZ)) || r.rankSumZ < PASS2_Z_CRIT) bad.push(`served-target rank-sum Z ${r.rankSumZ} < ${PASS2_Z_CRIT.toFixed(3)} — cherry-pick indicated`);
  if (!(e.binomialP >= PASS2_SCREEN_ALPHA)) bad.push(`early/late screen: ${e.flags} flags, P ${e.binomialP} < ${PASS2_SCREEN_ALPHA}`);

  let artifactNote = '';
  const simPath = path.join(ctx.outputsDir, 'simulation-results.json');
  try {
    const committed = JSON.parse(fs.readFileSync(simPath, 'utf8')).pass2;
    const fresh = { available: true, ...p };
    const beyond = beyondTolerance(fieldDiff(committed, fresh));
    const same = committed !== undefined && committed !== null && beyond.length === 0;
    if (!same) bad.push(`the committed pass2 block of outputs/simulation-results.json differs from the re-derivation${beyond.length ? ` (${beyond.length} field(s) beyond the reproduction bound, first ${beyond[0].path}: committed ${JSON.stringify(beyond[0].committed)} vs re-derived ${JSON.stringify(beyond[0].thisRun)})` : ''}`);
    artifactNote = same ? 'committed pass2 block equals the re-derivation (every leaf; floats at the reproduction bound)' : 'committed pass2 block DIFFERS';
  } catch (err) {
    bad.push(`outputs/simulation-results.json unreadable (${(err instanceof Error ? err.message : String(err)).slice(0, 60)})`);
  }

  const detail = `${p.seedsTested}/${EXPECTED_SEEDS} revealed seeds x ${p.noncesPerSeed} nonces (${p.noncesTotal} draws, ${p.windows} windows of ${p.windowSize}); `
    + `window 0 replays the captured results: ${r.replayMismatches} mismatches. `
    + `A. SERVED-TARGET RETURN (each window bets the 50 targets the casino served in that epoch, unit stake, standardised by the exact per-target mean and variance from floor(N/ci)/RANGE): `
    + `exact permutation null (the captured window exchangeable with the other ${p.windows - 1}), rank-sum Z = ${r.rankSumZ} (one-sided p ${r.oneSidedP}; rule fixed in code on 2026-09-26, after the capture: cherry-pick indicated at Z < ${PASS2_Z_CRIT.toFixed(3)}, alpha 0.001); `
    + `direction split: captured window below its epoch median in ${r.capturedBelowMedian} epochs, above in ${r.capturedAboveMedian} (the rest tie at the median); `
    + `captured-window return ${r.capturedReturn} vs expectation ${r.capturedExpected} (unit stakes); power: detects with >= 50% probability a cherry-pick that puts >= ${(r.powerFraction * 100).toFixed(1)}% of epochs' captured windows in their worst decile. `
    + `B. EARLY/LATE CHI-SQUARED SCREEN, EXACT METHOD (nonces 0-49 vs 50-99, ${e.bins} bins): exact multinomial null over ${e.nullAttainableValues} attainable values, critical chi2 >= ${e.criticalChi2} (Q >= ${e.criticalQ}), attained size ${e.size}, p0 = a(1-a) = ${e.p0}; `
    + `${e.flags} flags vs ${e.expected} expected, exact binomial P ${e.binomialP} (rule fixed in code on 2026-09-26: rejected at < ${PASS2_SCREEN_ALPHA}) — ${e.consistent ? 'not rejected' : 'REJECTED'}; flagged epochs ${e.flaggedEpochs.join(', ')}. `
    + `Pooled captured draws: chi2 ${p.pooledRealDrawUniformity.chi2} df ${p.pooledRealDrawUniformity.df} p ${p.pooledRealDrawUniformity.pValue}. ${artifactNote}`
    + (bad.length ? ` — FAILURES: ${bad.join('; ')}` : '');
  return [step(24, NAME, bad.length === 0 ? 'PASS' : 'FAIL', detail)];
}
