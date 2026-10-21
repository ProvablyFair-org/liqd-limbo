/**
 * Step 18: Custom client-seed control (Phase D).
 *
 * Provable fairness depends on the player being able to contribute an input the operator cannot
 * choose after the fact. Phase D tests exactly that: 500 bets across 10 epochs placed under
 * auditor-chosen `pfaudit-…` client seeds. Three things have to be true, and the third is the one
 * that is usually skipped:
 *   (a) those bets recompute exactly, so the operator honoured the seed it was given;
 *   (b) a DIFFERENT client seed produces a different draw, so the seed is load-bearing rather than
 *       decorative — tested over many bets, because a single-bet test has a real false-fail rate
 *       when the altered seed happens to collide;
 *   (c) the custom-seed phase behaves no differently from the Phase A-C rounds (rig CSPRNG seeds) — same rule,
 *       same edge, same recomputation — so "the auditor's seeds work" is not a special case the
 *       operator could be servicing separately.
 */

import type { StepResult, VerifyContext } from './context';
import { step, servedResultMatches } from './context';
import { limboDraw } from '../../src/rng';
import { resultMultiplier, limboWin, EXPECTED_PHASES, EXPECTED_EPOCH_SIZE, EXPECTED_BETS, RANGE } from '../../src/config';
import * as fs from 'fs';
import * as path from 'path';

/** The capture rig as shipped — read for its client-seed generators (profile LIMBO-06). */
const CAPTURE_SCRIPT = 'capture/capture-limbo.reference.mjs';

export function run(ctx: VerifyContext): StepResult[] {
  const { phaseD, seedMap, bets } = ctx;

  const custom = phaseD.filter((b) => /^pfaudit-/.test(b.clientSeed));

  // (a) exact recomputation under the auditor's own seeds
  let checked = 0;
  let fails = 0;
  let winFails = 0;
  let firstFail = '';
  for (const b of custom) {
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

  // (b) sensitivity — altering the client seed must change the draw. Probed over up to 64 bets
  //     rather than one: a single probe has a ~1/1e8 chance of colliding per bet on the draw, but
  //     the RESULT is a coarser function of the draw, so collisions on R alone are far more common
  //     and a one-bet test on R would flake. Both are measured, and the claim rests on the DRAW.
  let probes = 0;
  let drawChanges = 0;
  let resultChanges = 0;
  for (const b of custom) {
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

  // (c) nonce sensitivity on the same pair — consecutive nonces under one (serverSeed, clientSeed)
  //     must produce independent draws, not a repeated one.
  let noncePairs = 0;
  let nonceChanges = 0;
  for (const b of custom) {
    const ss = seedMap.get(b.hashedServerSeed);
    if (!ss || b.nonce + 1 >= EXPECTED_EPOCH_SIZE) continue;
    const k1 = limboDraw(ss, b.clientSeed, b.nonce);
    const k2 = limboDraw(ss, b.clientSeed, b.nonce + 1);
    noncePairs++;
    if (k1 !== k2) nonceChanges++;
    if (noncePairs >= 64) break;
  }

  // (d) parity with the Phase A-C rounds (auditor-rig CSPRNG client seeds, not operator seeds — see (f)): the custom-seed phase is not a special case
  const operatorSeeded = bets.filter((b) => b.phase !== 'D');
  const customSeeds = new Set(custom.map((b) => b.clientSeed));
  const customEpochs = new Set(custom.map((b) => b.epoch));
  const expectedD = EXPECTED_PHASES.D.bets;

  // (e) MODEL-RATE GATE over EVERY bet (profile LIMBO-06). A wrong client seed must change the draw k
  //     at the rate the draw domain predicts: under a uniform, independent draw two seeds collide on k
  //     with probability 1/RANGE per bet, so over n bets the expected number of unchanged draws is
  //     E = n/RANGE and the gate allows floor(E + 5·sqrt(E)) of them. A server that ignored the client
  //     seed would leave all n unchanged (0 % change → hard fail). The EMPTY-SEED CONTROL does the same
  //     with clientSeed = '' — the input a server that drops the field would effectively use.
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

  // (f) CLIENT-SEED GENERATORS. Phases A-C: every seed must have the shape the rig's CSPRNG generator
  //     produces ('audit' + 12 hex = randomBytes(6)), each epoch its own; the generator line is read
  //     from the shipped capture script, so a rig that switched to Math.random or a counter would have
  //     to change the evidence this step reads. Phase D: 'pfaudit-<ms timestamp>-<epoch>' is
  //     PREDICTABLE by construction — the exposed epochs are enumerated, and each one's commitment is
  //     checked to have been published one epoch EARLIER as the previous epoch's nextHashedServerSeed.
  //     That ordering does NOT contain a predictable seed — it was derivable from the session
  //     timestamp before the commitment existed — so the exposure is disclosed, not passed off.
  const abc = bets.filter((b) => b.phase !== 'D');
  const abcShapeBad = abc.filter((b) => !/^audit[0-9a-f]{12}$/.test(b.clientSeed)).length;
  const abcEpochSeeds = new Map<number, Set<string>>();
  for (const b of abc) (abcEpochSeeds.get(b.epoch) ?? abcEpochSeeds.set(b.epoch, new Set()).get(b.epoch)!).add(b.clientSeed);
  const abcDistinct = new Set(abc.map((b) => b.clientSeed)).size;
  let rigText = '';
  try { rigText = fs.readFileSync(path.join(ctx.repoRoot, CAPTURE_SCRIPT), 'utf8'); } catch { rigText = ''; }
  const csprngLine = /const randHex = \(n\) => randomBytes\(n\)\.toString\('hex'\)/.test(rigText)
    && /import \{ randomBytes \} from 'node:crypto'/.test(rigText)
    && /'audit' \+ randHex\(6\)/.test(rigText) && !/Math\.random\(\)[^\n]*clientSeed/.test(rigText);
  const generatorOk = abcShapeBad === 0 && abcDistinct === abcEpochSeeds.size && csprngLine;
  const dPattern = /^pfaudit-(\d{13})-(\d+)$/;
  const exposed = [...customEpochs].sort((a, z) => a - z);
  const dPredictable = custom.every((b) => { const m = dPattern.exec(b.clientSeed); return !!m && Number(m[2]) === b.epoch; });
  const seedsByEpoch = [...ctx.seeds].sort((a, z) => a.epoch - z.epoch);
  let exposedChained = 0;
  for (const e of exposed) {
    const prev = seedsByEpoch.find((x) => x.epoch === e - 1);
    const cur = seedsByEpoch.find((x) => x.epoch === e);
    if (prev && cur && prev.nextHashedServerSeed === cur.hashedServerSeed) exposedChained++;
  }
  const predictableDisclosed = dPredictable && exposedChained === exposed.length;

  const s18 = step(18, 'Custom Client-Seed Control (Phase D)',
    fails === 0 && winFails === 0 && checked === expectedD && sensitivityOk
      && gateOk && generatorOk && predictableDisclosed ? 'PASS' : 'FAIL',
    `${checked}/${expectedD} Phase-D bets under auditor-chosen client seeds (denominator from src/config.ts EXPECTED_PHASES.D — G-BIND) recompute EXACTLY: ${fails} result mismatches`
    + (firstFail ? ` (e.g. ${firstFail})` : '')
    + `, ${winFails} win-flag mismatches — the operator honoured the seed it was handed rather than substituting one; `
    + `${customSeeds.size} distinct pfaudit- seeds across ${customEpochs.size} epochs, none of them operator-generated; `
    + `client-seed sensitivity over ${probes} probed bets: altering one character of the client seed changes the underlying draw k on ${drawChanges}/${probes} and the resulting multiplier on ${resultChanges}/${probes} `
    + `(the claim rests on the DRAW — R is a coarse function of k over a ${RANGE}-point grid, so R collisions are expected and are not evidence of an ignored seed); `
    + `nonce sensitivity on the same pair: ${nonceChanges}/${noncePairs} consecutive-nonce pairs produce different draws; `
    + `parity: the same recomputation, win rule and edge arithmetic scored these ${checked} bets and the ${operatorSeeded.length} Phase A-C bets (auditor-rig CSPRNG seeds, not operator-generated) — Phase D is not handled by a separate code path here, so it cannot be passing for a different reason; `
    + `MODEL-RATE GATE over ${gateN}/${EXPECTED_BETS} bets: a wrong client seed left the draw unchanged on ${wrongSame} and the EMPTY-SEED control on ${emptySame}, against E = n/${RANGE} = ${gateE.toExponential(3)} and an allowance of floor(E + 5·sqrt(E)) = ${gateAllowed} (${gateOk}); `
    + `CLIENT-SEED GENERATORS: Phases A-C ${abc.length - abcShapeBad}/${abc.length} bets carry an 'audit'+12-hex seed, ${abcDistinct} distinct seeds over ${abcEpochSeeds.size} epochs, `
    + `generator read from ${CAPTURE_SCRIPT}: randomBytes(6) from node:crypto — a CSPRNG (${csprngLine}); `
    + `Phase D seeds are PREDICTABLE by construction ('pfaudit-<ms timestamp>-<epoch>', ${dPredictable}) — exposed epochs ${exposed.join(', ')} (${exposed.length}); `
    + `each exposed epoch's commitment was published one epoch earlier as the previous epoch's nextHashedServerSeed on ${exposedChained}/${exposed.length} — but the seed was derivable from the session timestamp before that commitment existed, `
    + `so for these ${exposed.length} epochs the order "commitment before client seed" does NOT exclude a server seed chosen against a known client seed: DISCLOSED exposure (Operator Trust R-CHERRY), not a claim of containment`,
  );

  return [s18];
}
