/**
 * Steps 1–4: Commit-Reveal Integrity.
 *
 * The commitment question is not "does the revealed seed hash to the published commitment" alone —
 * it is also "was that commitment fixed before the bets it settles". Step 1 answers the first,
 * Steps 2–4 answer as much of the second as a client-side capture can, and say plainly where the
 * evidence stops (G-SCOPE).
 */

import type { StepResult, VerifyContext } from './context';
import { step, isHex, servedResultMatches } from './context';
import { commitHash, limboDraw } from '../../src/rng';
import { resultMultiplier, EXPECTED_SEEDS, EXPECTED_EPOCH_SIZE, DECLARED_CAPTURE_GAPS } from '../../src/config';

export function run(ctx: VerifyContext): StepResult[] {
  const { seeds, bets, byHash, seedMap } = ctx;

  // ── Step 1: Seed hash integrity ─────────────────────────────────────────────
  // LIQD commitment = SHA-256( utf8_bytes( serverSeed hex STRING ) ) — the ASCII of the hex, not
  // the decoded bytes. Same convention as LIQD Dice/Plinko/Mines.
  //
  // G-BIND: the denominator is EXPECTED_SEEDS from src/config.ts, not `seeds.length`. Checking
  // "all the seeds that are here" is a tautology on a shrunken artifact; checking "all 134 the
  // capture plan says exist" is not.
  let checked = 0;
  let fails = 0;
  let shapeFails = 0;
  for (const s of seeds) {
    // G-RANGE: a commitment is 64 hex chars and a server seed is 32 (16 bytes, the operator's
    // format). A field of any other shape is not a near-miss to be tolerated, it is impossible.
    if (!isHex(s.hashedServerSeed, 64) || !isHex(s.nextHashedServerSeed, 64) || !isHex(s.serverSeed ?? '', 32)) shapeFails++;
    if (!s.serverSeed) continue;
    if (commitHash(s.serverSeed) !== s.hashedServerSeed) fails++;
    checked++;
  }
  const distinctServerSeeds = new Set(seeds.map((s) => s.serverSeed)).size;
  const s1 = step(1, 'Seed Hash Integrity',
    fails === 0 && shapeFails === 0 && checked === EXPECTED_SEEDS ? 'PASS' : 'FAIL',
    `${checked}/${EXPECTED_SEEDS} revealed seeds (denominator from src/config.ts EXPECTED_SEEDS, not from the artifact — G-BIND): `
    + `SHA-256(utf8(serverSeed hex string)) == hashedServerSeed; ${fails} mismatches; `
    + `${shapeFails} records with a malformed commitment (64 hex) or server seed (32 hex); `
    + `${distinctServerSeeds} distinct server seeds across ${seeds.length} epochs (a repeat would replay a whole draw stream)`,
  );

  // ── Step 2: Next-seed pre-commitment chain ──────────────────────────────────
  // Each epoch publishes the NEXT epoch's commitment before it is used. 133 in-capture transitions
  // show the chain was never broken DURING the capture — but on their own they say nothing about
  // epoch 0, whose commitment is simply the first thing the capture saw.
  //
  // `meta.preCapture` is the seed pair that was active BEFORE the first bet. Two checks turn it into
  // evidence: it must hash to its own commitment, and its `nextHashedServerSeed` must BE epoch 0's
  // commitment — placing epoch 0's commitment EARLIER IN THE CHAIN than the first bet.
  //
  // WHAT IT IS NOT. A hash chain orders records; it does not date them. The anchor for "before" is
  // the auditor's own capture record, not an independently authenticated timestamp, so the
  // no-post-hoc-choice reading is CONDITIONAL on that attested chronology (declared limitation,
  // Step 21).
  const byEpoch = [...seeds].sort((a, b) => a.epoch - b.epoch);
  const expectedTransitions = EXPECTED_SEEDS - 1;   // from config, not from seeds.length (G-BIND)
  let promoChecked = 0;
  let promoFails = 0;
  for (let i = 0; i + 1 < byEpoch.length; i++) {
    promoChecked++;
    if (byEpoch[i].nextHashedServerSeed !== byEpoch[i + 1].hashedServerSeed) promoFails++;
  }

  const pre = ctx.meta.preCapture as
    { hashedServerSeed?: string; revealedServerSeed?: string; nextHashedServerSeed?: string } | null | undefined;
  const epoch0 = byEpoch[0];
  let preOk = true;
  let preState: string;
  if (!pre || !pre.hashedServerSeed || !pre.revealedServerSeed || !pre.nextHashedServerSeed) {
    preOk = false;
    preState = 'no meta.preCapture record — epoch 0\'s commitment has NO pre-capture witness, so the chain '
      + 'begins at the first bet and nothing places epoch 0\'s commitment before it';
  } else {
    const preCommitOk = commitHash(pre.revealedServerSeed) === pre.hashedServerSeed;
    const preLinkOk = pre.nextHashedServerSeed === epoch0.hashedServerSeed;
    preOk = preCommitOk && preLinkOk;
    preState = preOk
      ? `pre-capture link verified: the pair recorded before the first bet reveals a seed hashing to its own commitment `
        + `(${pre.hashedServerSeed.slice(0, 12)}…) and its nextHashedServerSeed IS epoch 0's commitment `
        + `(${epoch0.hashedServerSeed.slice(0, 12)}…) — epoch 0's commitment was already fixed by an EARLIER LINK IN THE CHAIN. `
        + `A hash chain orders records, it does not date them: that this link predates the first bet is the auditor's capture `
        + `record, not independently authenticated timing, so the no-post-hoc-choice reading is CONDITIONAL on that attested chronology`
      : `pre-capture link BROKEN (commitment ${preCommitOk ? 'ok' : 'MISMATCH'}, link to epoch 0 ${preLinkOk ? 'ok' : 'MISMATCH'})`;
  }

  const s2 = step(2, 'Next-Seed Pre-Commitment Chain',
    promoFails === 0 && promoChecked === expectedTransitions && preOk ? 'PASS' : 'FAIL',
    (promoFails === 0
      ? `${promoChecked}/${expectedTransitions} transitions: nextHashedServerSeed == next epoch's hashedServerSeed (chain INTACT)`
      : `${promoChecked - promoFails}/${expectedTransitions} match; ${promoFails} mismatch`)
    + `; ${preState}`,
  );

  // ── Step 3: Hash consistency within epoch, and epoch COVERAGE ───────────────
  // Two separate claims, and only the second is a population claim:
  //   (a) every bet inside an epoch settles under the same commitment;
  //   (b) the epochs present are exactly 0..EXPECTED_SEEDS−1 — a contiguous cover with no epoch
  //       silently dropped. (b) is bound to src/config.ts (G-BIND): comparing the observed epoch
  //       count to `seeds.length` compares the artifact to itself.
  const betsByEpoch = new Map<number, typeof bets>();
  for (const b of bets) {
    const arr = betsByEpoch.get(b.epoch) ?? [];
    arr.push(b);
    betsByEpoch.set(b.epoch, arr);
  }
  let epochsMultipleHashes = 0;
  for (const [, epochBets] of betsByEpoch) {
    if (new Set(epochBets.map((b) => b.hashedServerSeed)).size !== 1) epochsMultipleHashes++;
  }
  const missingEpochs: number[] = [];
  for (let e = 0; e < EXPECTED_SEEDS; e++) if (!betsByEpoch.has(e)) missingEpochs.push(e);
  const strayEpochs = [...betsByEpoch.keys()].filter((e) => e < 0 || e >= EXPECTED_SEEDS);
  // The seed set and the set of commitments actually settled against must be the same set,
  // hash for hash — not merely the same size.
  const seedHashSet = new Set(seeds.map((s) => s.hashedServerSeed));
  const betHashSet = new Set(bets.map((b) => b.hashedServerSeed));
  const unbackedBetHashes = [...betHashSet].filter((h) => !seedHashSet.has(h));
  const unusedSeedHashes = [...seedHashSet].filter((h) => !betHashSet.has(h));
  const setsIdentical = unbackedBetHashes.length === 0 && unusedSeedHashes.length === 0
    && seedHashSet.size === betHashSet.size;
  const s3 = step(3, 'Hash Consistency & Epoch Coverage',
    epochsMultipleHashes === 0 && missingEpochs.length === 0 && strayEpochs.length === 0 && setsIdentical ? 'PASS' : 'FAIL',
    `${betsByEpoch.size} epochs observed, covering 0..${EXPECTED_SEEDS - 1} with ${missingEpochs.length} missing and ${strayEpochs.length} out of range `
    + `(bounds from src/config.ts EXPECTED_SEEDS — G-BIND); all bets within each epoch share one hashedServerSeed (${epochsMultipleHashes} violations); `
    + `the commitments the bets settle against and the revealed seed set are the SAME SET hash-for-hash: `
    + `${betHashSet.size} settled vs ${seedHashSet.size} revealed, ${unbackedBetHashes.length} bet commitment(s) with no seed record, ${unusedSeedHashes.length} seed record(s) no bet used`,
  );

  // ── Step 4: Nonce audit ─────────────────────────────────────────────────────
  // Per epoch: a single client seed, and nonces that are exactly 0..EXPECTED_EPOCH_SIZE−1 —
  // distinct (no reuse, which would replay a draw), contiguous (no interior hole), and closed at
  // both ends.
  //
  // The three bounds have DIFFERENT evidentiary weight and the detail string says so:
  //   • leading  — operator-sourced (`nonceStart`, the rotate response's post-rotation nonce);
  //   • epoch size — the capture placed exactly EXPECTED_EPOCH_SIZE bets per pair, so a short epoch
  //                  exposes a dropped bet ANYWHERE; bound to config, NOT to `meta.epochSize`,
  //                  because a coherent shrink doctors the header too;
  //   • trailing — operator-witnessed only if `operatorBetCount` was captured. It was not in this
  //                capture, so `nonceEnd` is the auditor's OWN last recorded nonce and can be
  //                checked for internal consistency only. Trailing withholding is not observable
  //                client-side; declared as a limitation in Step 21.
  const hardFailures: string[] = [];
  const disclosedGaps: string[] = [];
  let epochsChecked = 0;
  let trailingAuditorRecorded = 0;
  let trailingOperatorWitnessed = 0;
  let leadingOperatorBound = 0;

  for (const [hash, epochBets] of byHash) {
    const sorted = [...epochBets].sort((a, b) => a.nonce - b.nonce);
    const nonces = sorted.map((b) => b.nonce);
    const epochNum = sorted[0].epoch;

    if (new Set(sorted.map((b) => b.clientSeed)).size !== 1) {
      hardFailures.push(`epoch ${epochNum}: ${new Set(sorted.map((b) => b.clientSeed)).size} distinct client seeds`);
    }

    const nonceSet = new Set(nonces);
    // Nonce REUSE: interior contiguity alone treats a duplicated nonce as a benign gap, so a
    // replayed draw would pass. Require distinct nonces == bet count.
    if (nonceSet.size !== nonces.length) {
      hardFailures.push(`epoch ${epochNum}: nonce reuse — ${nonces.length} bets, ${nonceSet.size} distinct nonces`);
    }
    // G-RANGE: a nonce outside [0, EXPECTED_EPOCH_SIZE) is impossible under the capture plan.
    const outOfRange = nonces.filter((n) => !Number.isInteger(n) || n < 0 || n >= EXPECTED_EPOCH_SIZE);
    if (outOfRange.length) hardFailures.push(`epoch ${epochNum}: ${outOfRange.length} nonce(s) outside [0, ${EXPECTED_EPOCH_SIZE})`);

    const missing: number[] = [];
    for (let n = 0; n < EXPECTED_EPOCH_SIZE; n++) if (!nonceSet.has(n)) missing.push(n);

    const seedEntry = ctx.seedByHash.get(hash);
    if (!seedEntry) {
      hardFailures.push(`epoch ${epochNum}: no seed entry for hash ${hash.slice(0, 12)}…`);
    } else {
      if (seedEntry.nonceStart != null) {
        if (Math.min(...nonces) !== seedEntry.nonceStart) {
          hardFailures.push(`epoch ${epochNum}: first observed nonce ${Math.min(...nonces)} != operator post-rotation nonce ${seedEntry.nonceStart} (leading bets withheld?)`);
        }
        leadingOperatorBound++;
      }
      // Bound to the CODE constant, never to `meta.epochSize` (G-BIND). Read from the header this
      // guard agrees with a coherent shrink: delete the tail of every epoch, set epochSize to match,
      // re-pin the hash, and the artifact is internally consistent again.
      const declaredHere = DECLARED_CAPTURE_GAPS.filter((g) => g.epoch === epochNum && missing.includes(g.nonce)).length;
      if (epochBets.length + declaredHere !== EXPECTED_EPOCH_SIZE) {
        hardFailures.push(`epoch ${epochNum}: ${epochBets.length} bets + ${declaredHere} declared capture gap(s) != audited epoch size ${EXPECTED_EPOCH_SIZE} (src/config.ts)`);
      }
      if (ctx.meta.epochSize !== EXPECTED_EPOCH_SIZE) {
        hardFailures.push(`epoch ${epochNum}: dataset header epochSize ${ctx.meta.epochSize} != audited epoch size ${EXPECTED_EPOCH_SIZE}`);
      }
      const operatorCount = seedEntry.operatorBetCount;
      if (operatorCount != null) {
        if (Math.max(...nonces) !== operatorCount - 1) {
          hardFailures.push(`epoch ${epochNum}: last observed nonce ${Math.max(...nonces)} != operator bet count ${operatorCount} - 1 (trailing bets withheld?)`);
        }
        trailingOperatorWitnessed++;
      } else {
        if (seedEntry.nonceEnd != null && Math.max(...nonces) !== seedEntry.nonceEnd) {
          hardFailures.push(`epoch ${epochNum}: record inconsistent, max nonce ${Math.max(...nonces)} != recorded nonceEnd ${seedEntry.nonceEnd}`);
        }
        trailingAuditorRecorded++;
      }
    }

    // A gap is a DISCLOSED capture artifact only if the seed is revealed and every recorded bet in
    // the epoch still recomputes; otherwise it is unexplained and hard-fails.
    if (missing.length > 0) {
      const ss = seedMap.get(hash);
      let allVerify = ss !== undefined;
      if (ss) {
        for (const b of sorted) {
          if (!servedResultMatches(Number(b.result), resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce)))) { allVerify = false; break; }
        }
      }
      const undeclared = missing.filter((n) => !DECLARED_CAPTURE_GAPS.some((g) => g.epoch === epochNum && g.nonce === n));
      if (allVerify && undeclared.length === 0) disclosedGaps.push(`epoch ${epochNum} nonce ${missing.join(',')} orphaned by a declared capture retry; all recorded bets verify`);
      else if (!allVerify) hardFailures.push(`epoch ${epochNum}: unverifiable nonce gap at ${missing.join(',')}`);
      else hardFailures.push(`epoch ${epochNum}: nonce gap at ${undeclared.join(',')} that the capture log (DECLARED_CAPTURE_GAPS) does not attribute to a retry`);
    }
    epochsChecked++;
  }

  if (epochsChecked !== EXPECTED_SEEDS) hardFailures.push(`coverage: audited ${epochsChecked}/${EXPECTED_SEEDS} epochs`);

  let s4status: 'PASS' | 'FLAG' | 'FAIL';
  let s4detail: string;
  // A reconstructable capture-retry gap is a FLAG with origin = capture — NEVER a PASS (profile
  // LIMBO-04, the rule decided 2026-09-17). It used to be folded into a PASS detail string, which
  // erased the disclosure. An operator-side gap or repeat stays a HARD FAIL. On THIS capture every
  // epoch is contiguous 0..49, so the branch does not fire; the mechanism is present so a capture
  // that DID retry is disclosed rather than absorbed.
  let s4origin: 'capture' | undefined;
  if (hardFailures.length > 0) {
    s4status = 'FAIL';
    s4detail = `${hardFailures.length} violations: ${hardFailures.slice(0, 3).join('; ')}`;
  } else if (disclosedGaps.length > 0) {
    s4status = 'FLAG';
    s4origin = 'capture';
    s4detail = `LIMITATION ROW (origin = capture, verdict class unchanged): ${epochsChecked}/${EXPECTED_SEEDS} epochs, single client seed each, nonces otherwise contiguous; `
      + `${disclosedGaps.length} nonce gap${disclosedGaps.length === 1 ? '' : 's'} attributable to an auditor-side capture retry — the revealed seed reconstructs every recorded bet in the affected epoch, `
      + `so no operator draw is withheld or unverifiable, but the gap is DISCLOSED, not passed over (${disclosedGaps.join('; ')}). An operator-side gap or repeat would be a HARD FAIL; this is not one.`;
  } else {
    s4status = 'PASS';
    s4detail = `${epochsChecked}/${EXPECTED_SEEDS} epochs: single client seed each, ${EXPECTED_EPOCH_SIZE} distinct contiguous nonces 0..${EXPECTED_EPOCH_SIZE - 1} `
      + `(no interior gaps, no reuse, none out of range), epoch size bound to src/config.ts not to the dataset header (G-BIND); `
      + `leading bound operator-sourced (nonceStart) on ${leadingOperatorBound}/${epochsChecked}; `
      + `trailing bound operator-witnessed (operatorBetCount) on ${trailingOperatorWitnessed}/${epochsChecked} and auditor-recorded on ${trailingAuditorRecorded}/${epochsChecked} `
      + `— where it is auditor-recorded, trailing withholding is NOT observable client-side (declared limitation, Step 21)`;
  }
  const s4 = step(4, 'Nonce Audit', s4status, s4detail, s4origin);

  return [s1, s2, s3, s4];
}
