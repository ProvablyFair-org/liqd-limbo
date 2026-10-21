/**
 * Steps 8–11: Payout integrity.
 *
 * Limbo's payout rule is the simplest in the LIQD Originals set — a win pays stake x TARGET, and the
 * target is the player's own input, so there is no operator-derived odds field to re-derive (contrast
 * dice, where the multiplier is 9900/basisPoints and the derivation is the whole question). What
 * remains to be proven is that the operator paid the rule it published: the credit is the settled
 * product of stake and target (Step 9, read from the casino's credited amount), a loss pays exactly
 * nothing, and the wallet ledger says the same thing as the game ledger. Step 8 checks the dataset's
 * `multiplier` column, which the capture script filled itself (see Step 8) — a check of the file.
 *
 * ── ARITHMETIC, AND WHY IT IS DONE IN INTEGERS ──────────────────────────────────────────────────
 * Stakes and targets are both exact 2-dp decimals, so `stake x target` is an exact decimal with at
 * most 4 dp — but it is NOT exactly representable in binary64 (0.1 x 33.35 = 3.3350000000000004).
 * Comparing the credit against that binary64 product with a tolerance would be a masked
 * comparison: it reports every win as "rounded" and cannot see a credit-sized edit. Every money assertion below is therefore an INTEGER identity in hundredths,
 * with zero tolerance. The binary64 residual is reported as a measured figure, never scored.
 */

import type { StepResult, VerifyContext } from './context';
import { step, hundredths, isTwoDecimal } from './context';
import {
  round8, isTargetLegal,
  MIN_BET_USDC, MAX_EXPOSURE_USDC, MAX_PLAYABLE_TARGET, EXPECTED_BETS,
} from '../../src/config';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets } = ctx;

  // ── Step 8: Paid-multiplier derivation ──────────────────────────────────────
  // On every win the dataset's `multiplier` column must equal the target; on a loss it is 0. WHAT THIS
  // CHECKS (2026-10-02): the FILE, not the casino. capture/capture-limbo.reference.mjs fills that column
  // from a wager-level `multiplier`, else an outcome-level `payoutMultiplier`, else the target on a win
  // and 0 on a loss; none of the 303 raw casino responses kept in this package carries either key (the
  // casino's field is `outcome.multiplier`, which that script does not read), and no raw response from
  // 2026-09-11 was kept. The payout itself is checked in Step 9, from the casino's credited amount.
  // Asserted bit-exact (`===`), not within a tolerance.
  let mChecked = 0;
  let mFails = 0;
  let maxDev = 0;
  let firstMFail = '';
  for (const b of bets) {
    if (!b.win) continue;
    const target = Number(b.params.target);
    const served = Number(b.multiplier);
    const dev = Math.abs(served - target);
    if (dev > maxDev) maxDev = dev;
    if (served !== target) {
      mFails++;
      if (!firstMFail) firstMFail = `epoch ${b.epoch} nonce ${b.nonce}: paid ${served}x vs chosen target ${target}x`;
    }
    mChecked++;
  }
  const s8 = step(8, 'Paid-Multiplier Derivation',
    mFails === 0 && mChecked > 0 ? 'PASS' : 'FAIL',
    `${mChecked} winning bets: on every win the dataset's multiplier column equals the target, bit-exact (strict ===, no tolerance); ${mFails} mismatches`
    + (firstMFail ? ` (e.g. ${firstMFail})` : '')
    + `; max deviation ${maxDev.toExponential(2)}. The capture script fills that column itself when the casino's response has no wager-level multiplier, and no response kept in the package has one. `
    + `So this checks the file, not the casino. The payout is checked in Step 9`,
  );

  // ── Step 9: Credit arithmetic ───────────────────────────────────────────────
  // The winning credit must be the exact decimal product of stake and target. Two forms, both
  // asserted with ZERO tolerance:
  //   (a) INTEGER identity: credit x 1e8 == hundredths(stake) x hundredths(target) x 1e4. This is
  //       the operator's own number system (decimal hundredths), immune to binary64 dust;
  //   (b) credit == ROUND_8(stake x target) in binary64, the form a re-implementer would write.
  // Losses must credit exactly 0. The binary64 residual |credit - stake x target| is MEASURED and
  // reported; it is not a pass criterion, because a residual of a few 1e-16 is a property of the
  // representation, not of the operator.
  let cChecked = 0;
  let intFails = 0;
  let r8Fails = 0;
  let maxRawResidual = 0;
  let landsOnProduct = 0;
  let firstCFail = '';
  let netResidual = 0;
  for (const b of bets) {
    const stake = Number(b.betAmount);
    const target = Number(b.params.target);
    const credit = Number(b.winningAmount);
    cChecked++;
    if (b.win) {
      const lhs = Math.round(credit * 1e8);
      const rhs = hundredths(stake) * hundredths(target) * 1e4;
      if (lhs !== rhs) {
        intFails++;
        if (!firstCFail) firstCFail = `epoch ${b.epoch} nonce ${b.nonce}: credit ${credit} vs exact decimal ${rhs / 1e8}`;
      }
      if (credit !== round8(stake * target)) r8Fails++;
      const raw = credit - stake * target;
      netResidual += raw;
      if (Math.abs(raw) > maxRawResidual) maxRawResidual = Math.abs(raw);
      if (raw === 0) landsOnProduct++;
    } else {
      if (credit !== 0) {
        intFails++;
        if (!firstCFail) firstCFail = `epoch ${b.epoch} nonce ${b.nonce}: losing bet credited ${credit}`;
      }
    }
  }
  const winCount = bets.filter((b) => b.win).length;
  const s9 = step(9, 'Credit Arithmetic',
    intFails === 0 && r8Fails === 0 && cChecked === EXPECTED_BETS ? 'PASS' : 'FAIL',
    `${cChecked}/${EXPECTED_BETS} bets: on a win the credit is the EXACT decimal product of stake and target, asserted as the integer identity `
    + `credit x 1e8 == hundredths(stake) x hundredths(target) x 1e4 with zero tolerance (${intFails} violations`
    + (firstCFail ? `, e.g. ${firstCFail}` : '')
    + `); the same credits also satisfy credit == ROUND_8(stake x target) in binary64 on ${winCount - r8Fails}/${winCount} wins (${r8Fails} violations); `
    + `against the raw binary64 product the credit lands EXACTLY on it for ${landsOnProduct} of ${winCount} wins, max |credit - stake x target| ${maxRawResidual.toExponential(2)}, `
    + `net ${netResidual >= 0 ? '+' : ''}${netResidual.toExponential(2)} USDC — that residual is a property of binary64, NOT of the settlement, which is why it is measured here and scored nowhere; `
    + `no rounding rule is assumed: the capture exhibits none, because a 2-dp stake times a 2-dp target is already exact in 4 dp`,
  );

  // ── Step 10: Loss settlement ────────────────────────────────────────────────
  // Every losing bet credits exactly 0, carries multiplier 0, is labelled "lost", and — the part
  // that matters — genuinely failed the rule: the recomputed result did NOT reach the target. The
  // last clause is what stops this being a check on labels.
  let lChecked = 0;
  let lFails = 0;
  let labelFails = 0;
  let firstLFail = '';
  for (const b of bets) {
    if (b.win) continue;
    lChecked++;
    if (Number(b.winningAmount) !== 0 || Number(b.multiplier) !== 0) {
      lFails++;
      if (!firstLFail) firstLFail = `epoch ${b.epoch} nonce ${b.nonce}: credit ${b.winningAmount}, multiplier ${b.multiplier}`;
    }
    if (b.resultLabel !== 'lost') labelFails++;
    if (Number(b.result) >= Number(b.params.target)) {
      lFails++;
      if (!firstLFail) firstLFail = `epoch ${b.epoch} nonce ${b.nonce}: settled as a LOSS but R ${b.result} >= target ${b.params.target}`;
    }
  }
  const wonLabels = bets.filter((b) => b.win && b.resultLabel !== 'won').length;
  const s10 = step(10, 'Loss Settlement',
    lFails === 0 && labelFails === 0 && wonLabels === 0 && lChecked > 0 ? 'PASS' : 'FAIL',
    `${lChecked} losing bets: winningAmount == 0 and multiplier == 0 (${lFails} violations`
    + (firstLFail ? `, e.g. ${firstLFail}` : '')
    + `), and every one of them genuinely failed the rule — R < target on all ${lChecked}, so no bet was labelled a loss while reaching its target; `
    + `resultLabel agrees with the win flag on ${lChecked - labelFails}/${lChecked} losses and ${winCount - wonLabels}/${winCount} wins`,
  );

  // ── Step 11: Wallet ledger, stake floor and exposure ceiling ────────────────
  // Three distinct claims:
  //   (a) the wallet-denominated fields are present on every bet and are the SAME money as the game
  //       ledger (they are, on all 6,700 rows) — a divergence either way would be a real finding;
  //   (b) every stake clears the $0.10 minimum — INFERRED, not probed: E15 holds a 3113 refusal after the
  //       3138 one, both recorded at $0.10; that the second was the $0.05 retry follows from the capture script;
  //   (c) every bet's EXPOSURE (stake x target, the operator's own quantity in the 3138 refusal)
  //       sits inside the $50,000 ceiling, and no target exceeds MAX_PLAYABLE_TARGET.
  // (b) and (c) are integer comparisons, so the result does not depend on floating-point rounding: for
  // 427 of the capture's 1,105 distinct stake x target pairs the binary64 product is not the decimal
  // answer (e.g. 0.1 x 1.07 = 0.10700000000000001).
  //
  // DECLARED LIMITATION. `stakeWallet` / `winningAmountWallet` are settle-RESPONSE fields and the
  // capture recorded no wallet BALANCE before and after each bet. What this step establishes is that
  // the operator's reported credit is internally consistent with the rule — not what the wallet was
  // actually credited. Counted below so the artifact carries the limitation, not only the prose.
  let wChecked = 0;
  let wMissing = 0;
  let wLedgerFails = 0;
  let stakeFloorFails = 0;
  let exposureFails = 0;
  let targetBoundFails = 0;
  let stakeShapeFails = 0;
  let firstWFail = '';
  let maxExposure = 0;
  const minStakeH = hundredths(MIN_BET_USDC);
  const maxExposureH2 = MAX_EXPOSURE_USDC * 1e4;     // ceiling expressed in hundredths x hundredths
  for (const b of bets) {
    const stake = Number(b.betAmount);
    const target = Number(b.params.target);
    if (!isTwoDecimal(stake)) stakeShapeFails++;
    if (hundredths(stake) < minStakeH) stakeFloorFails++;
    const expH2 = hundredths(stake) * hundredths(target);
    if (expH2 > maxExposureH2) {
      exposureFails++;
      if (!firstWFail) firstWFail = `epoch ${b.epoch} nonce ${b.nonce}: exposure ${expH2 / 1e4} > ceiling ${MAX_EXPOSURE_USDC}`;
    }
    if (expH2 / 1e4 > maxExposure) maxExposure = expH2 / 1e4;
    if (!isTargetLegal(target) || target > MAX_PLAYABLE_TARGET) targetBoundFails++;
    if (b.stakeWallet == null || b.winningAmountWallet == null) { wMissing++; continue; }
    if (Number(b.stakeWallet) !== stake || Number(b.winningAmountWallet) !== Number(b.winningAmount)) {
      wLedgerFails++;
      if (!firstWFail) firstWFail = `epoch ${b.epoch} nonce ${b.nonce}: wallet ${b.stakeWallet}/${b.winningAmountWallet} vs game ${b.betAmount}/${b.winningAmount}`;
    }
    wChecked++;
  }
  // How often binary64 would get the decimal product wrong — measured, printed, never scored.
  const pairs = new Set(bets.map((b) => `${Number(b.betAmount)}|${Number(b.params.target)}`));
  let floatOffPairs = 0;
  for (const p of pairs) {
    const [s, t] = p.split('|').map(Number);
    if (s * t !== hundredths(s) * hundredths(t) / 1e4) floatOffPairs++;
  }
  const balanceLedgerRows = bets.filter(
    (b) => (b as unknown as { balanceOk?: unknown }).balanceOk !== null
      && (b as unknown as { balanceOk?: unknown }).balanceOk !== undefined,
  ).length;

  const s11 = step(11, 'Wallet Ledger, Stake Floor & Exposure Ceiling',
    wMissing === 0 && wLedgerFails === 0 && stakeFloorFails === 0 && exposureFails === 0
      && targetBoundFails === 0 && stakeShapeFails === 0 && wChecked === EXPECTED_BETS ? 'PASS' : 'FAIL',
    `${wChecked}/${EXPECTED_BETS} bets carry both wallet fields (${wMissing} missing) and the wallet ledger equals the game ledger on ${wChecked - wLedgerFails} of them (${wLedgerFails} divergent`
    + (firstWFail ? `, e.g. ${firstWFail}` : '')
    + `); every stake clears the $${MIN_BET_USDC} minimum (inferred, not probed: E15's 3113 refusal is recorded at $0.10, and that it was the $0.05 retry follows from the capture script) (${stakeFloorFails} below, ${stakeShapeFails} not a 2-dp amount) and every target is a legal 2-dp value at or below MAX_PLAYABLE_TARGET ${MAX_PLAYABLE_TARGET}x (${targetBoundFails} outside); `
    + `maximum exposure (stake x target) in the capture $${maxExposure} against the $${MAX_EXPOSURE_USDC} ceiling witnessed in evidence/E15, ${exposureFails} bets over it — compared in whole hundredths so the result does not depend on floating-point rounding (for ${floatOffPairs} of the capture's ${pairs.size} distinct stake x target pairs the binary64 product is not the decimal answer, e.g. 0.1 x 1.07 = ${(0.1 * 1.07).toString()}); `
    + `wallet BALANCE ledger present on ${balanceLedgerRows}/${bets.length} bets — stakeWallet/winningAmountWallet are settle-RESPONSE fields, so this step establishes internal consistency with the rule, NOT what the wallet was credited (declared limitation, Step 21)`,
  );

  return [s8, s9, s10, s11];
}
