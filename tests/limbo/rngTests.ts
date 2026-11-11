import * as assert from 'node:assert';
import { limboDraw, limboResult, commitHash, generateProvablyFairNumber } from '../../src/rng';
import {
  RANGE, CURSOR, RESULT_NUMERATOR, MAX_MULTIPLIER, MIN_MULTIPLIER, MULTIPLIER_SCALE,
  resultMultiplier, winChance, winChancePct, isTargetLegal, targetToHundredths,
  theoreticalRTP, effectiveEdge, limboWin, MAX_WIN_CHANCE_PERCENT,
} from '../../src/config';

describe('LIQD Limbo RNG', () => {
  // Settled production rounds of data/limbo-prod-full-5838bets.json (liqd.com): the seed is the one the
  // casino revealed for the epoch, `result` is the result the casino served, and the production verifier
  // returned the same value for the same inputs (Step 25). Used as fixed vectors on src/rng.ts; the audit's
  // binding anchor remains the whole dataset (Step 5).
  const oracle: Array<{ label: string; seed: string; client: string; nonce: number; k: number; result: number }> = [
    { label: 'epoch 0 nonce 0 (7 Nov)',            seed: 'ea7c5163f5e0ac12ffe0efd8b6cd5dd7', client: 'audit395ae5c90a74', nonce: 0,   k: 11265120, result: 8.78 },
    { label: 'epoch 21 nonce 76, tie at 11.57',    seed: 'aefb854f2db350ef9db660cd9f565042', client: 'audit3b77da5eea13', nonce: 76,  k: 8555954,  result: 11.57 },
    { label: 'epoch 6 nonce 162, highest result',  seed: '7bfeb75c44f3a438f86cc3232b72211c', client: 'auditc72e948ee77c', nonce: 162, k: 3512,     result: 28181.04 },
    { label: 'epoch 25 nonce 0, player-set seed',  seed: 'b69bc456d161bf8126f6075674f06e03', client: 'pfaudit-prod-limbo-d1-6fa0b0094142', nonce: 0, k: 69732708, result: 1.41 },
    { label: 'epoch 31 nonce 2, 10.00 stake',      seed: 'a072c3f5bb121bb493eb99e1459c8db1', client: 'auditc42639ada586', nonce: 2,   k: 8193866,  result: 12.08 },
  ];
  const OS = oracle[0].seed, OC = oracle[0].client;

  it('reproduces the result the casino served on five production rounds, exactly', () => {
    for (const v of oracle) assert.strictEqual(limboResult(v.seed, v.client, v.nonce), v.result, v.label);
  });

  it('the intermediate draw k matches', () => {
    for (const v of oracle) assert.strictEqual(limboDraw(v.seed, v.client, v.nonce), v.k, v.label);
  });

  it('draws are bias-free integers in [0, 1e8) at cursor 0', () => {
    for (const v of oracle) {
      const k = generateProvablyFairNumber(v.seed, v.client, v.nonce, CURSOR, RANGE);
      assert.ok(Number.isInteger(k) && k >= 0 && k < RANGE, `draw ${k}`);
    }
  });

  it('commitment hash = SHA-256(utf8(serverSeed hex string)), on the commitments the casino published', () => {
    assert.strictEqual(commitHash('a072c3f5bb121bb493eb99e1459c8db1'), '729e9926f5c4bdcfe2d18e93f9adefda0e60bf997407aec5fbfd32be5deec51a');
    assert.strictEqual(commitHash('b69bc456d161bf8126f6075674f06e03'), 'c7bc348c45bdbc27e2a75f78ee804af9783a1dbc74e6cc4955b6b26eab2690b3');
  });

  it('client seed is load-bearing — a different client seed changes the result', () => {
    assert.notStrictEqual(limboResult(OS, OC, 0), limboResult(OS, OC + 'x', 0));
  });

  // ── Rejection guard, on production rounds ────────────────────────────────────
  // maxFair = floor(2³²/1e8)·1e8 = 4,200,000,000; a first 32-bit chunk in [maxFair, 2³²)
  // (≈2.21% of draws) MUST be skipped and the next chunk taken. On these settled production rounds
  // chunk0 >= maxFair, so a guardless modulo-on-chunk0 implementation returns `unguarded`, which is NOT
  // the result the casino served; a correct implementation returns `draw`, which is.
  it('rejection guard fires: first chunk >= maxFair is skipped, next chunk taken', () => {
    const maxFair = Math.floor(0x1_0000_0000 / RANGE) * RANGE;
    const vectors = [
      { seed: 'ea7c5163f5e0ac12ffe0efd8b6cd5dd7', client: 'audit395ae5c90a74', nonce: 2,  chunk0: 4256041591, draw: 30920117, served: 3.2 },
      { seed: 'ea7c5163f5e0ac12ffe0efd8b6cd5dd7', client: 'audit395ae5c90a74', nonce: 70, chunk0: 4291299156, draw: 26056765, served: 3.79 },
      { seed: 'ea7c5163f5e0ac12ffe0efd8b6cd5dd7', client: 'audit395ae5c90a74', nonce: 91, chunk0: 4229026917, draw: 52773486, served: 1.87 },
    ];
    for (const v of vectors) {
      assert.ok(v.chunk0 >= maxFair, `precondition: chunk0 ${v.chunk0} in rejected tail`);
      const k = generateProvablyFairNumber(v.seed, v.client, v.nonce, CURSOR, RANGE);
      assert.strictEqual(k, v.draw, `nonce ${v.nonce}: guarded draw`);
      assert.notStrictEqual(k, v.chunk0 % RANGE, `nonce ${v.nonce}: guard did not fire`);
      assert.strictEqual(resultMultiplier(k), v.served, `nonce ${v.nonce}: the served result`);
      assert.notStrictEqual(resultMultiplier(v.chunk0 % RANGE), v.served, `nonce ${v.nonce}: the unguarded draw gives another result`);
    }
  });
});

describe('LIQD Limbo game math', () => {
  it('win chance = floor(9.9e9 / round(100·m)) / 1e8', () => {
    assert.ok(Math.abs(winChancePct(2.00) - 49.5) < 1e-9);            // matches the UI at target 2.00
    assert.ok(Math.abs(winChancePct(1.01) - 98.019801) < 1e-6);      // = LIMBO_MAX_WIN_CHANCE_PERCENT
    assert.ok(Math.abs(MAX_WIN_CHANCE_PERCENT - 98.019801) < 1e-6);
    assert.ok(Math.abs(winChancePct(10.00) - 9.9) < 1e-9);
    assert.ok(Math.abs(winChancePct(100.00) - 0.99) < 1e-9);
  });

  it('RESULT_NUMERATOR ties to (edge, scale, range): 9.9e9', () => {
    assert.strictEqual(RESULT_NUMERATOR, 9_900_000_000);
  });

  it('house edge is CLOSED-FORM ≥ 1.00% for every target, = 1.00% when 9.9e7/m is integer', () => {
    // Dividing targets → edge exactly 1% (9.9e7/m ∈ ℤ):
    for (const m of [1.10, 2.00, 3.00, 9.90, 99.00, 990.00]) {
      assert.ok(Number.isInteger(9.9e7 / m), `precondition ${m}`);
      assert.ok(Math.abs(effectiveEdge(m) - 0.01) < 1e-12, `${m}: edge ${effectiveEdge(m)}`);
      assert.ok(Math.abs(theoreticalRTP(m) - 0.99) < 1e-12, `${m}: rtp ${theoreticalRTP(m)}`);
    }
    // Non-dividing targets → edge strictly > 1% (the floor only ever lowers RTP), never below:
    for (const m of [1.71, 2.65, 20.14, 7.77, 123.45]) {
      const e = effectiveEdge(m);
      assert.ok(e >= 0.01 - 1e-12, `${m}: edge ${e} below 1%`);
      assert.ok(e > 0.01, `${m}: expected edge strictly above 1%, got ${e}`);
    }
  });

  it('sweep: RTP(m) ≤ 0.99 for a dense range of targets (no player-favourable target exists)', () => {
    for (let h = targetToHundredths(MIN_MULTIPLIER); h <= 200_000; h += 7) {
      const m = h / MULTIPLIER_SCALE;
      assert.ok(theoreticalRTP(m) <= 0.99 + 1e-12, `target ${m}: RTP ${theoreticalRTP(m)} > 0.99`);
    }
  });

  // ── Result ↔ win-chance identity at the exact boundary ───────────────────────
  // The served win chance and the result multiplier are two faces of one constant N. For a
  // 2-dp target m, the winning draws are exactly { k : R(k) ≥ m }, whose count is
  // winChance(m)·RANGE. This checks the identity AND the knife's edge: the largest winning k
  // wins, the next k loses.
  it('P(R ≥ m) equals the win chance, verified at the boundary draw', () => {
    for (const m of [1.50, 2.00, 5.00, 20.14, 100.00, 1000.00]) {
      const winCount = Math.round(winChance(m) * RANGE);
      assert.strictEqual(winCount, Math.floor(RESULT_NUMERATOR / targetToHundredths(m)),
        `identity mismatch at ${m}`);
      const lastWinK = winCount - 1;
      assert.ok(limboWin(resultMultiplier(lastWinK), m), `k=${lastWinK} should win at ${m}`);
      assert.ok(!limboWin(resultMultiplier(winCount), m), `k=${winCount} should lose at ${m}`);
    }
  });

  // The bottom clamp is witnessed by production rounds (tests/limbo/resultFloorTests.ts).
  it('result clamps to MAX_MULTIPLIER at the top and to MIN_RESULT = 1 at the bottom', () => {
    assert.strictEqual(resultMultiplier(0), MAX_MULTIPLIER);           // floor(9.9e9/1)/100 = 9.9e7 → clamp
    assert.strictEqual(resultMultiplier(98), MAX_MULTIPLIER);          // last draw giving 1e6 (k ≤ 98: 99 draws); raw is already exactly 1e6 here, so the clamp changes k ≤ 97 (98 draws)
    assert.ok(resultMultiplier(99) < MAX_MULTIPLIER);                  // first un-clamped
    assert.strictEqual(resultMultiplier(RANGE - 1), 1);                // raw 0.99 → floored to 1
    assert.strictEqual(resultMultiplier(99_000_000), 1);               // first CLAMPED draw (raw 0.99)
    assert.strictEqual(resultMultiplier(98_999_999), 1);               // raw is exactly 1.00 here — no clamp needed
    assert.strictEqual(resultMultiplier(98_019_801), 1);               // first draw whose raw value equals 1
    assert.strictEqual(resultMultiplier(98_019_800), 1.01);            // last draw strictly above 1
  });

  it('target grid: 2-dp values within [1.01, 1e6]', () => {
    assert.strictEqual(isTargetLegal(1.01), true);
    assert.strictEqual(isTargetLegal(1.00), false);   // below min
    assert.strictEqual(isTargetLegal(MAX_MULTIPLIER), true);
    assert.strictEqual(isTargetLegal(MAX_MULTIPLIER + 0.01), false);
    assert.strictEqual(isTargetLegal(2.005), false);  // not 2-dp
    assert.strictEqual(isTargetLegal(2.5), true);
  });

  it('draw domain is enforced', () => {
    assert.throws(() => resultMultiplier(-1), /out of domain/);
    assert.throws(() => resultMultiplier(RANGE), /out of domain/);
    assert.throws(() => resultMultiplier(1.5), /out of domain/);
  });
});
