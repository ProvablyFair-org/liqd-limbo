/**
 * Steps 8–11: Payout integrity.
 *
 * Limbo's payout rule is the simplest in the LIQD Originals set — a win pays stake x TARGET, and the
 * target is the player's own input, so there is no operator-derived odds field to re-derive (contrast
 * dice, where the multiplier is 9900/basisPoints and the derivation is the whole question). What
 * remains to be proven is that the operator paid the rule it published: the credit is the settled
 * product of stake and target (Step 9, read from the casino's credited amount), a loss pays exactly
 * nothing, and the wallet fields say the same thing as the game fields. Step 8 checks the multiplier the
 * casino served in its place-bet reply.
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
  PROD_TOP_TARGET, EXPECTED_BETS, EXPECTED_PHASES,
} from '../../src/config';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets } = ctx;

  // ── Step 8: Paid-multiplier derivation ──────────────────────────────────────
  // On every win the served multiplier must equal the target; on a loss it is 0 (Step 10). WHAT THIS
  // CHECKS: the casino's place-bet reply carries the wager's own outcome.multiplier, and the dataset's
  // `multiplier` column is that served value (meta.conversion.bets.served). Asserted bit-exact (`===`),
  // not within a tolerance. The payout itself is checked in Step 9, from the casino's credited amount.
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
    `${mChecked} winning bets: on every win the multiplier the casino served in its place-bet reply (outcome.multiplier, carried in the dataset's multiplier column) equals the target, bit-exact (strict ===, no tolerance); ${mFails} mismatches`
    + (firstMFail ? ` (e.g. ${firstMFail})` : '')
    + `; max deviation ${maxDev.toExponential(2)}. The payout is checked in Step 9, from the casino's credited amount`,
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
    + `net ${netResidual >= 0 ? '+' : ''}${netResidual.toExponential(2)} ${ctx.meta.currency} — that residual is a property of binary64, NOT of the settlement, which is why it is measured here and scored nowhere; `
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

  // ── Step 11: Wallet fields, stakes and exposure as played ───────────────────
  // Three distinct claims:
  //   (a) the wallet-denominated fields are present on every bet and are the SAME money as the game
  //       fields (the account is USDT and the stake is USDT, so a divergence either way would be a
  //       real finding);
  //   (b) every stake is the planned stake of its phase (0.10 or 10.00 USDT, src/config.ts), a 2-dp amount;
  //   (c) every target is a 2-dp value inside the audited range [1.01, PROD_TOP_TARGET].
  // The largest exposure (stake x target) the casino ACCEPTED in this capture is measured and printed.
  // It is a measured maximum, NOT a limit: no bet was refused in any of the three runs, so this audit
  // holds no evidence of the casino's minimum stake, maximum stake, maximum payout or exposure ceiling.
  //
  // DECLARED LIMITATION. `stakeWallet` / `winningAmountWallet` are settle-RESPONSE fields and the
  // capture recorded no wallet BALANCE before and after each bet. What this step establishes is that
  // the operator's reported credit is internally consistent with the rule, not what the wallet was
  // actually credited. Counted below so the artifact carries the limitation, not only the prose.
  let wChecked = 0;
  let wMissing = 0;
  let wLedgerFails = 0;
  let stakePlanFails = 0;
  let targetBoundFails = 0;
  let stakeShapeFails = 0;
  let firstWFail = '';
  let maxExposure = 0;
  let maxExposureAt = '';
  let maxCredit = 0;
  let maxCreditAt = '';
  for (const b of bets) {
    const stake = Number(b.betAmount);
    const target = Number(b.params.target);
    if (!isTwoDecimal(stake)) stakeShapeFails++;
    const planned = (EXPECTED_PHASES as Record<string, { stake: number }>)[b.phase]?.stake;
    if (planned === undefined || hundredths(stake) !== hundredths(planned)) stakePlanFails++;
    const exp = hundredths(stake) * hundredths(target) / 1e4;
    if (exp > maxExposure) { maxExposure = exp; maxExposureAt = `${stake} x ${target}x, phase ${b.phase}`; }
    const credit = Number(b.winningAmount);
    if (credit > maxCredit) { maxCredit = credit; maxCreditAt = `${stake} x ${target}x, phase ${b.phase}`; }
    if (!isTargetLegal(target) || hundredths(target) > hundredths(PROD_TOP_TARGET)) targetBoundFails++;
    if (b.stakeWallet == null || b.winningAmountWallet == null) { wMissing++; continue; }
    if (Number(b.stakeWallet) !== stake || Number(b.winningAmountWallet) !== credit) {
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

  const s11 = step(11, 'Wallet Fields, Stakes & Exposure As Played',
    wMissing === 0 && wLedgerFails === 0 && stakePlanFails === 0
      && targetBoundFails === 0 && stakeShapeFails === 0 && wChecked === EXPECTED_BETS ? 'PASS' : 'FAIL',
    `${wChecked}/${EXPECTED_BETS} bets carry both wallet fields (${wMissing} missing) and the wallet fields equal the game fields on ${wChecked - wLedgerFails} of them (${wLedgerFails} divergent`
    + (firstWFail ? `, e.g. ${firstWFail}` : '')
    + `); every stake is its phase's planned stake from src/config.ts (${stakePlanFails} off plan, ${stakeShapeFails} not a 2-dp amount) and every target is a 2-dp value in [1.01, ${PROD_TOP_TARGET}] (${targetBoundFails} outside); `
    + `largest exposure (stake x target) accepted in the capture ${maxExposure} ${ctx.meta.currency} (${maxExposureAt}); largest credit paid ${maxCredit} ${ctx.meta.currency} (${maxCreditAt}). `
    + `These are measured maxima, NOT limits: no bet was refused in the three runs, so the casino's minimum stake, maximum stake, maximum payout and exposure ceiling are not established by this audit (declared limitation). `
    + `Products are compared in whole hundredths so the result does not depend on floating-point rounding (for ${floatOffPairs} of the capture's ${pairs.size} distinct stake x target pairs the binary64 product is not the decimal answer); `
    + `wallet BALANCE ledger present on ${balanceLedgerRows}/${bets.length} bets: stakeWallet/winningAmountWallet are settle-RESPONSE fields, so this step establishes internal consistency with the rule, NOT what the wallet was credited (declared limitation, Step 21)`,
  );

  return [s8, s9, s10, s11];
}
