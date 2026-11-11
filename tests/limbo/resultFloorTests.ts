import { strict as assert } from 'assert';
import { limboDraw, limboResult } from '../../src/rng';
import { MIN_RESULT, MAX_MULTIPLIER, MIN_MULTIPLIER, RESULT_NUMERATOR, RANGE, limboWin, resultMultiplier } from '../../src/config';

/**
 * The RESULT floor, locked against production rounds on which it fired.
 *
 * The raw formula floor(9.9e9 / (k+1)) / 100 gives 0.99 for every draw k > 98,999,999; the casino
 * serves 1 there. The vectors below are settled production rounds of the dataset (liqd.com, 7 November
 * 2026, epoch 1): the casino served result 1, settled a loss, and its verifier returned 1 for the same
 * inputs. They are copied from data/limbo-prod-full-5838bets.json, not constructed.
 */
describe('limbo result floor (production rounds, epoch 1 nonces 86 and 104)', () => {
  const serverSeed = '19d9d3f0f202d9b5f85f00b56b26e9af';
  const clientSeed = 'audit4ae5ddbd2dba';
  const rounds = [{ nonce: 86, k: 99_966_308 }, { nonce: 104, k: 99_329_010 }];

  it('reproduces the served R = 1 on rounds whose raw value is 0.99', () => {
    for (const r of rounds) assert.equal(limboResult(serverSeed, clientSeed, r.nonce), 1);
  });

  it('the raw formula WOULD have returned 0.99 — the floor is what closes the gap', () => {
    for (const r of rounds) {
      const k = limboDraw(serverSeed, clientSeed, r.nonce);
      assert.equal(k, r.k);
      assert.equal(Math.floor(RESULT_NUMERATOR / (k + 1)) / 100, 0.99);
    }
  });

  it('floors at exactly 1, never at the minimum TARGET of 1.01', () => {
    // Conflating the two constants is the obvious wrong fix: it would rewrite every floored round
    // as 1.01 and break the recompute in the other direction.
    assert.equal(MIN_RESULT, 1);
    assert.equal(MIN_MULTIPLIER, 1.01);
    assert.notEqual(MIN_RESULT, MIN_MULTIPLIER);
  });

  it('a floored result loses against every target, so no edge or win chance moves', () => {
    assert.equal(limboWin(1, MIN_MULTIPLIER), false);
    assert.equal(limboWin(1, 1.7), false);
  });

  it('the clamp is reachable for 1% of the draw space, not a rare edge', () => {
    // Two distinct populations, and they are easy to confuse:
    //   raw < 1  (actually CLAMPED)      k >= 99,000,000            1,000,000 draws = 1.0000%
    //   R === 1  (clamped OR naturally)  k >= 98,019,801            1,980,199 draws = 1.9802%
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
    // src/rng.ts limboResult applies no upper cap; src/config.ts resultMultiplier, which the scored steps
    // use, caps at MAX_MULTIPLIER. Both carry the 1.00 floor. The cap binds only for k <= 97 (k = 98 gives
    // exactly 1,000,000x), 98 of 10^8 draws; no settled round reaches it, and the production verifier
    // reports 1,000,000 on such draws (the next test).
    assert.equal(Math.floor(RESULT_NUMERATOR / (98 + 1)) / 100, MAX_MULTIPLIER);
    assert.ok(Math.floor(RESULT_NUMERATOR / (97 + 1)) / 100 > MAX_MULTIPLIER);
    assert.equal(resultMultiplier(97), MAX_MULTIPLIER);
    for (const n of [0, 1, 49, 7, 123]) {
      const k = limboDraw('5d8a6efd34122167215b2f41ac797a7f', 'audit5c0e40a9cd8f', n);
      assert.equal(limboResult('5d8a6efd34122167215b2f41ac797a7f', 'audit5c0e40a9cd8f', n), resultMultiplier(k));
    }
  });

  it('the capped map reproduces the production verifier at the result cap (evidence/E02, 9 Nov 2026)', () => {
    // Unsettled nonces of revealed Phase A seeds, as sent to POST liqd.com/api/v1/originals/limbo/verify.
    const probes = [
      { id: 'L-1', seed: '308029b433abadf085b5a67691e2ba3b', client: 'audit41cc055b9bfe', nonce: 1896728, k: 1, casino: 1_000_000 },
      { id: 'L-2', seed: 'f41c6e7cd2001abf63be7712cc6bdd75', client: 'audit546364daf88f', nonce: 784356, k: 2, casino: 1_000_000 },
      { id: 'L-3', seed: '759753950ecfcdeae8d13a2255fbdcb5', client: 'auditf7e4dbc7ca73', nonce: 40232, k: 97, casino: 1_000_000 },
      { id: 'L-4', seed: '2cbe9b3b95233f3a60df21da8fb3f6ee', client: 'audita15789db137d', nonce: 1395326, k: 98, casino: 1_000_000 },
      { id: 'L-5', seed: '759753950ecfcdeae8d13a2255fbdcb5', client: 'auditf7e4dbc7ca73', nonce: 1150803, k: 100, casino: 980198.01 },
    ];
    for (const p of probes) {
      const k = limboDraw(p.seed, p.client, p.nonce);
      assert.equal(k, p.k, p.id);
      assert.equal(resultMultiplier(k), p.casino, p.id);
    }
    // on L-1..L-3 the raw value is above the cap, so an uncapped map does NOT reproduce the casino
    assert.equal(limboResult(probes[0].seed, probes[0].client, probes[0].nonce), 49_500_000);
    assert.equal(limboResult(probes[2].seed, probes[2].client, probes[2].nonce), 1_010_204.08);
  });
});
