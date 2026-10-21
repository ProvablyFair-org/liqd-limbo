import { strict as assert } from 'assert';
import { limboDraw, limboResult } from '../../src/rng';
import { MIN_RESULT, MAX_MULTIPLIER, MIN_MULTIPLIER, RESULT_NUMERATOR, RANGE, limboWin, resultMultiplier } from '../../src/config';

/**
 * The RESULT floor, regression-locked against the live round that exposed it.
 *
 * The capture's own inline per-epoch check reported `R 49/50` on the first epoch of the 2026-09-11
 * capture session, under a seed pair that is NOT in the shipped dataset (this round is not in
 * data/limbo-master-6700bets.json, whose first clamped round is epoch 3 nonce 29): the model
 * computed floor(9.9e9 / (k+1)) / 100 with only an upper clamp, so a large draw produced 0.99
 * where the operator served 1. Without the capture verifying each epoch as it went, that would
 * have mismatched ~1% of a 6,700-bet dataset before anyone looked.
 *
 * The vector below is that exact round, copied from the capture checkpoint — not constructed.
 */
describe('limbo result floor (witnessed 2026-09-11 in an earlier, unshipped capture run, nonce 49)', () => {
  const serverSeed = '5d8a6efd34122167215b2f41ac797a7f';
  const clientSeed = 'audit5c0e40a9cd8f';
  const nonce = 49;

  it('reproduces the operator-served R = 1 on the round that exposed the missing clamp', () => {
    assert.equal(limboResult(serverSeed, clientSeed, nonce), 1);
  });

  it('the raw formula WOULD have returned 0.99 — the floor is what closes the gap', () => {
    const k = limboDraw(serverSeed, clientSeed, nonce);
    assert.equal(k, 99_588_964);
    assert.equal(Math.floor(RESULT_NUMERATOR / (k + 1)) / 100, 0.99);
  });

  it('floors at exactly 1, never at the minimum legal TARGET of 1.01', () => {
    // Conflating the two constants is the obvious wrong fix: it would rewrite every floored round
    // as 1.01 and break the recompute in the other direction.
    assert.equal(MIN_RESULT, 1);
    assert.equal(MIN_MULTIPLIER, 1.01);
    assert.notEqual(MIN_RESULT, MIN_MULTIPLIER);
  });

  it('a floored result loses against every legal target, so no edge or win chance moves', () => {
    assert.equal(limboWin(1, MIN_MULTIPLIER), false);
    assert.equal(limboWin(1, 1.7), false);
  });

  it('the clamp is reachable for 1% of the draw space, not a rare edge', () => {
    // Two distinct populations, and they are easy to confuse:
    //   raw < 1  (actually CLAMPED)      k >= 99,000,000            1,000,000 draws = 1.0000%
    //   R === 1  (clamped OR naturally)  k >= 98,019,801            1,980,199 draws = 1.9802%
    // Measured, not asserted from arithmetic done in my head — an earlier version of this test
    // claimed k = 98,999,999 was above 1, and it is exactly 1.00.
    const clamped = RANGE - 99_000_000;
    assert.equal(clamped, 1_000_000);
    assert.equal(clamped / RANGE, 0.01);
    const equalsOne = RANGE - 98_019_801;
    assert.equal(equalsOne, 1_980_199);
    assert.equal(resultMultiplier(98_019_800) > 1, true);
    assert.equal(resultMultiplier(98_019_801), 1);
  });

  it('still clamps at the top', () => {
    assert.equal(resultMultiplier(0), MAX_MULTIPLIER);
    assert.equal(resultMultiplier(98), MAX_MULTIPLIER);
  });

  it('src/rng.ts limboResult and src/config.ts resultMultiplier agree, except above the 1,000,000x cap (k <= 97)', () => {
    // Since 20 Oct 2026 there are two: src/rng.ts is the clean-room module rebuilt from docs/ALGORITHM.md,
    // which applies no upper cap (spec O3); src/config.ts resultMultiplier, which the scored steps use, caps
    // at MAX_MULTIPLIER. Both carry the 1.00 floor. The cap binds only for k <= 97 (k = 98 gives exactly
    // 1,000,000x), 98 of 10^8 draws, no captured round reaches it, and either value wins every legal target.
    assert.equal(Math.floor(RESULT_NUMERATOR / (98 + 1)) / 100, MAX_MULTIPLIER);
    assert.ok(Math.floor(RESULT_NUMERATOR / (97 + 1)) / 100 > MAX_MULTIPLIER);
    assert.equal(resultMultiplier(97), MAX_MULTIPLIER);
    for (const n of [0, 1, 49, 7, 123]) {
      const k = limboDraw('5d8a6efd34122167215b2f41ac797a7f', 'audit5c0e40a9cd8f', n);
      assert.equal(limboResult('5d8a6efd34122167215b2f41ac797a7f', 'audit5c0e40a9cd8f', n), resultMultiplier(k));
    }
  });
});
