/**
 * Step 18: Client-seed control and Phase D (profile LIMBO-06).
 *
 * Provable fairness depends on the player being able to contribute an input the operator cannot
 * choose after the fact. On production the auditor submitted the client seed of EVERY epoch:
 *   - 28 epochs (Phases A and C) under a fresh 'audit' + 12-hex seed drawn by the in-page runner from
 *     the browser CSPRNG at the rotation that opened the epoch;
 *   - 5 epochs (Phase D, 500 rounds, 10 November 2026) under PLAYER-SET seeds of a different shape,
 *     'pfaudit-prod-limbo-d<k>-' + 12 hex, one per epoch: the test that a seed the player chooses is
 *     the seed the casino uses.
 * What has to be true:
 *   (a) every round recomputes exactly under the seed submitted for its epoch, so the operator honoured
 *       the seed it was given and did not substitute one;
 *   (b) a DIFFERENT client seed produces a different draw, so the seed is load-bearing;
 *   (c) a model-rate gate over every round, plus an empty-seed control;
 *   (d) Phase D: the planned number of distinct player-set seeds, each on its own epoch, each round of
 *       the epoch settled under it, and no player-set seed outside Phase D;
 *   (e) the generators: as the runs' own headers describe them, and each epoch's commitment is shown to have
 *       been published one rotation BEFORE the rotation that submitted its client seed.
 * The Phase D seeds are NOT predictable (each carries 6 bytes of the browser CSPRNG). They were drawn
 * when the run's plan was built, before the run's first rotation, and each was sent to the casino only
 * at the rotation opening its epoch; the step prints that.
 */

import type { StepResult, VerifyContext } from './context';
import { step, servedResultMatches } from './context';
import { limboDraw } from '../../src/rng';
import { resultMultiplier, limboWin, epochSize, EPOCH_PLAN, EXPECTED_BETS, EXPECTED_SEEDS, EXPECTED_PHASES, PHASE_D_SEEDS, RANGE } from '../../src/config';

export function run(ctx: VerifyContext): StepResult[] {
  const { seedMap, bets, seeds } = ctx;

  // (a) exact recomputation under the submitted seeds, every round
  let checked = 0;
  let fails = 0;
  let winFails = 0;
  let firstFail = '';
  for (const b of bets) {
    const ss = seedMap.get(b.hashedServerSeed);
    if (!ss) continue;
    const local = resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce));
    if (!servedResultMatches(Number(b.result), local)) {
      fails++;
      if (!firstFail) firstFail = `epoch ${b.epoch} nonce ${b.nonce}: local ${local} vs served ${b.result}`;
    }
    if (limboWin(local, Number(b.params.target)) !== !!b.win) winFails++;
    checked++;
  }

  // (b) sensitivity — altering the client seed must change the draw. Probed over 64 bets rather than one:
  //     the RESULT is a coarse function of the draw, so collisions on R alone are far more common than on k
  //     and a one-bet test on R would flake. Both are measured, and the claim rests on the DRAW.
  let probes = 0;
  let drawChanges = 0;
  let resultChanges = 0;
  for (const b of bets) {
    const ss = seedMap.get(b.hashedServerSeed);
    if (!ss) continue;
    const k1 = limboDraw(ss, b.clientSeed, b.nonce);
    const k2 = limboDraw(ss, `${b.clientSeed}x`, b.nonce);
    probes++;
    if (k1 !== k2) drawChanges++;
    if (resultMultiplier(k1) !== resultMultiplier(k2)) resultChanges++;
    if (probes >= 64) break;
  }
  const sensitivityOk = probes > 0 && drawChanges === probes;

  // nonce sensitivity on the same pair — consecutive nonces under one (serverSeed, clientSeed) must produce
  // independent draws, not a repeated one.
  let noncePairs = 0;
  let nonceChanges = 0;
  for (const b of bets) {
    const ss = seedMap.get(b.hashedServerSeed);
    if (!ss || b.nonce + 1 >= epochSize(b.epoch)) continue;
    const k1 = limboDraw(ss, b.clientSeed, b.nonce);
    const k2 = limboDraw(ss, b.clientSeed, b.nonce + 1);
    noncePairs++;
    if (k1 !== k2) nonceChanges++;
    if (noncePairs >= 64) break;
  }

  // (c) MODEL-RATE GATE over EVERY bet (profile LIMBO-06). A wrong client seed must change the draw k at the
  //     rate the draw domain predicts: under a uniform, independent draw two seeds collide on k with probability
  //     1/RANGE per bet, so over n bets the expected number of unchanged draws is E = n/RANGE and the gate allows
  //     floor(E + 5·sqrt(E)) of them. A server that ignored the client seed would leave all n unchanged. The
  //     EMPTY-SEED CONTROL does the same with clientSeed = '' — the input a server that drops the field would use.
  let gateN = 0, wrongSame = 0, emptySame = 0;
  for (const b of bets) {
    const ss = seedMap.get(b.hashedServerSeed);
    if (!ss) continue;
    const k = limboDraw(ss, b.clientSeed, b.nonce);
    if (limboDraw(ss, `${b.clientSeed}x`, b.nonce) === k) wrongSame++;
    if (limboDraw(ss, '', b.nonce) === k) emptySame++;
    gateN++;
  }
  const gateE = gateN / RANGE;
  const gateAllowed = Math.floor(gateE + 5 * Math.sqrt(gateE));
  const gateOk = gateN === EXPECTED_BETS && wrongSame <= gateAllowed && emptySame <= gateAllowed;

  // (d) PHASE D. The plan (src/config.ts) says which epochs are Phase D; the data must hold a player-set
  //     seed on exactly those, PHASE_D_SEEDS distinct ones, and every Phase D round must carry its epoch's.
  const AUDIT_SHAPE = /^audit[0-9a-f]{12}$/;
  const PLAYER_SHAPE = /^pfaudit-prod-limbo-d([1-9])-[0-9a-f]{12}$/;
  const dEpochs = EPOCH_PLAN.map((b, e) => (b.phase === 'D' ? e : -1)).filter((e) => e >= 0);
  const byEpoch = [...seeds].sort((a, z) => a.epoch - z.epoch);
  const seedOfEpoch = new Map(byEpoch.map((s) => [s.epoch, s.clientSeed]));
  const dSeeds = dEpochs.map((e) => seedOfEpoch.get(e) ?? '');
  const dShapeOk = dSeeds.every((cs, i) => { const m = PLAYER_SHAPE.exec(cs); return !!m && Number(m[1]) === i + 1; });
  const dDistinct = new Set(dSeeds).size;
  const dBets = bets.filter((b) => b.phase === 'D');
  const dUnderOwn = dBets.filter((b) => dEpochs.includes(b.epoch) && b.clientSeed === seedOfEpoch.get(b.epoch)).length;
  let dRecompute = 0;
  for (const b of dBets) {
    const ss = seedMap.get(b.hashedServerSeed);
    if (ss && servedResultMatches(Number(b.result), resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce)))
      && limboWin(resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce)), Number(b.params.target)) === !!b.win) dRecompute++;
  }
  const playerOutsideD = bets.filter((b) => b.phase !== 'D' && PLAYER_SHAPE.test(b.clientSeed)).length;
  const phaseDOk = dEpochs.length === PHASE_D_SEEDS && dShapeOk && dDistinct === PHASE_D_SEEDS && PHASE_D_SEEDS >= 2
    && dBets.length === EXPECTED_PHASES.D.bets && dUnderOwn === dBets.length && dRecompute === dBets.length && playerOutsideD === 0;

  // (e) GENERATORS AND ORDER. Every other epoch carries an 'audit' + 12-hex seed (6 random bytes), one per
  //     epoch and each epoch its own; the generators are the ones each run's header describes
  //     (meta.clientSeedGenerator, written by the runner; the runner is not part of this package, so this is the
  //     capture's own statement and the seed shapes are what the data shows).
  //     ORDER: the client seed of epoch e was submitted in the rotation that opened epoch e, and the
  //     commitment epoch e settles under was already published by then, as the previous record's
  //     nextHashedServerSeed (the first epoch of a run: that run's pre-capture pair, read before any bet).
  const auditBets = bets.filter((b) => b.phase !== 'D');
  const shapeBad = auditBets.filter((b) => !AUDIT_SHAPE.test(b.clientSeed)).length;
  const epochSeeds = new Map<number, Set<string>>();
  for (const b of bets) (epochSeeds.get(b.epoch) ?? epochSeeds.set(b.epoch, new Set()).get(b.epoch)!).add(b.clientSeed);
  const oneSeedPerEpoch = [...epochSeeds.values()].every((st) => st.size === 1);
  const distinctSeeds = new Set(bets.map((b) => b.clientSeed)).size;
  const gen = ((ctx.meta as unknown as { clientSeedGenerator?: Record<string, string> }).clientSeedGenerator ?? {});
  const csprngLines = /crypto\.getRandomValues/.test(gen.A ?? '') && /crypto\.getRandomValues/.test(gen.D ?? '')
    && /6 bytes/.test(gen.A ?? '') && /6 bytes/.test(gen.D ?? '');
  const generatorOk = shapeBad === 0 && oneSeedPerEpoch && distinctSeeds === EXPECTED_SEEDS && epochSeeds.size === EXPECTED_SEEDS && csprngLines;
  type Pre = { nextHashedServerSeed?: string } | null | undefined;
  const captures = ((ctx.meta as unknown as { captures?: { capture: number; preCapture?: Pre }[] }).captures ?? []);
  let publishedBefore = 0;
  for (const s of byEpoch) {
    const plan = EPOCH_PLAN[s.epoch];
    const firstOfRun = EPOCH_PLAN.findIndex((b) => b.capture === plan?.capture) === s.epoch;
    const prior = firstOfRun
      ? captures.find((c) => c.capture === plan?.capture)?.preCapture?.nextHashedServerSeed
      : byEpoch.find((x) => x.epoch === s.epoch - 1)?.nextHashedServerSeed;
    const seedOk = s.clientSeed === [...(epochSeeds.get(s.epoch) ?? [])][0];
    if (prior === s.hashedServerSeed && seedOk) publishedBefore++;
  }
  const orderOk = publishedBefore === EXPECTED_SEEDS;

  const s18 = step(18, 'Client-Seed Control & Phase D (player-set seeds)',
    fails === 0 && winFails === 0 && checked === EXPECTED_BETS && sensitivityOk
      && gateOk && phaseDOk && generatorOk && orderOk ? 'PASS' : 'FAIL',
    `${checked}/${EXPECTED_BETS} rounds settled under client seeds the auditor submitted (denominator from src/config.ts EXPECTED_BETS — G-BIND) recompute EXACTLY: ${fails} result mismatches`
    + (firstFail ? ` (e.g. ${firstFail})` : '')
    + `, ${winFails} win-flag mismatches — the operator honoured the seed it was handed and did not substitute one; `
    + `PHASE D (profile LIMBO-06, floor 2 distinct seeds): ${dEpochs.length} epochs (${dEpochs[0]}-${dEpochs[dEpochs.length - 1]}) under ${dDistinct}/${PHASE_D_SEEDS} distinct PLAYER-SET client seeds of the shape 'pfaudit-prod-limbo-d<k>-' + 12 hex (${dShapeOk}), `
    + `${dUnderOwn}/${dBets.length} Phase D rounds carry their epoch's player-set seed and ${dRecompute}/${dBets.length} recompute under it (result and win flag); player-set seeds on rounds outside Phase D: ${playerOutsideD}. `
    + `The Phase D seeds are not predictable (6 bytes of the browser CSPRNG each); they were drawn when the run's plan was built and each was sent to the casino at the rotation opening its epoch; `
    + `client-seed sensitivity over ${probes} probed bets: altering one character of the client seed changes the underlying draw k on ${drawChanges}/${probes} and the resulting multiplier on ${resultChanges}/${probes} `
    + `(the claim rests on the DRAW: R is a coarse function of k over a ${RANGE}-point grid, so R collisions are expected and are not evidence of an ignored seed); `
    + `nonce sensitivity on the same pair: ${nonceChanges}/${noncePairs} consecutive-nonce pairs produce different draws; `
    + `MODEL-RATE GATE over ${gateN}/${EXPECTED_BETS} bets: a wrong client seed left the draw unchanged on ${wrongSame} and the EMPTY-SEED control on ${emptySame}, against E = n/${RANGE} = ${gateE.toExponential(3)} and an allowance of floor(E + 5·sqrt(E)) = ${gateAllowed} (${gateOk}); `
    + `CLIENT-SEED GENERATORS: ${auditBets.length - shapeBad}/${auditBets.length} rounds outside Phase D carry an 'audit'+12-hex seed, ${distinctSeeds} distinct seeds over ${epochSeeds.size} epochs, one per epoch (${oneSeedPerEpoch}); `
    + `generators as each run's header describes them (meta.clientSeedGenerator): 6 bytes of crypto.getRandomValues, the browser CSPRNG, for both seed shapes (${csprngLines}); the runner is not part of this package, so the generator is the capture's own statement; `
    + `ORDER: on ${publishedBefore}/${EXPECTED_SEEDS} epochs the commitment the epoch settles under was already published as the previous record's nextHashedServerSeed (the first epoch of each run: that run's pre-capture pair) before the rotation that submitted its client seed, and that record carries the seed its rounds used — `
    + `a hash chain orders records, it does not date them, so this rests on the auditor's capture order (L6)`,
  );

  return [s18];
}
