import * as assert from 'node:assert';
import { limboDraw, limboResult, commitHash, generateProvablyFairNumber } from '../../src/rng';
import {
  RANGE, CURSOR, RESULT_NUMERATOR, MAX_MULTIPLIER, MIN_MULTIPLIER, MULTIPLIER_SCALE,
  resultMultiplier, winChance, winChancePct, isTargetLegal, targetToHundredths,
  theoreticalRTP, effectiveEdge, limboWin, MAX_WIN_CHANCE_PERCENT,
} from '../../src/config';

describe('LIQD Limbo RNG', () => {
  // Vectors read directly from LIQD's own Provably-Fair "Verify" calculator during the
  // 2026-09-07 recon session (evidence/E12), for the fixed pair below. These four values are
  // the operator's OWN output, used as a SECOND CHECK on src/rng.ts, which since 20 Oct 2026 is
  // rebuilt from the written spec docs/ALGORITHM.md, not from LIQD's code. The audit's binding
  // RNG anchor remains the money-settled dataset (Step 5).
  const OS = '0000000000000000000000000000000000000000000000000000000000000001';
  const OC = 'abc';
  const oracle: Array<{ nonce: number; k: number; result: number }> = [
    { nonce: 0, k: 57877210, result: 1.71 },
    { nonce: 1, k: 37266926, result: 2.65 },
    { nonce: 2, k: 94506499, result: 1.04 },
    { nonce: 3, k: 4913898,  result: 20.14 },
  ];

  it('reproduces the operator Verify calculator byte-for-byte (4 live vectors)', () => {
    for (const v of oracle) {
      const R = limboResult(OS, OC, v.nonce);
      assert.ok(Math.abs(R - v.result) < 1e-9, `nonce ${v.nonce}: ${R} != ${v.result}`);
    }
  });

  it('the intermediate draw k matches the live vectors', () => {
    for (const v of oracle) {
      assert.strictEqual(limboDraw(OS, OC, v.nonce), v.k, `nonce ${v.nonce}`);
    }
  });

  it('draws are bias-free integers in [0, 1e8) at cursor 0', () => {
    for (const v of oracle) {
      const k = generateProvablyFairNumber(OS, OC, v.nonce, CURSOR, RANGE);
      assert.ok(Number.isInteger(k) && k >= 0 && k < RANGE, `draw ${k}`);
    }
  });

  it('commitment hash = SHA-256(utf8(serverSeed hex string))', () => {
    assert.strictEqual(
      commitHash('00112233445566778899aabbccddeeff'),
      '5947d7c33d783f94b3b4c1a96ebc8991ed28f1b069b71e03376cba8caa98a720',
    );
  });

  it('client seed is load-bearing — a different client seed changes the result', () => {
    assert.notStrictEqual(limboResult(OS, OC, 0), limboResult(OS, OC + 'x', 0));
  });

  // ── Rejection guard, force-exercised ─────────────────────────────────────────
  // maxFair = floor(2³²/1e8)·1e8 = 4,200,000,000; a first 32-bit chunk in [maxFair, 2³²)
  // (≈2.21% of draws) MUST be skipped and the next chunk taken. These nonces (found by
  // scanning the audit seed pair) each have chunk0 >= maxFair, so a guardless modulo-on-chunk0
  // implementation returns `unguarded` — a correct implementation returns `draw`.
  it('rejection guard fires: first chunk >= maxFair is skipped, next chunk taken', () => {
    const S = '00112233445566778899aabbccddeeff', C = 'audittest';
    const maxFair = Math.floor(0x1_0000_0000 / RANGE) * RANGE;
    const vectors = [
      { nonce: 11,  chunk0: 4290586986, draw: 49476266, unguarded: 90586986 },
      { nonce: 79,  chunk0: 4265982121, draw: 75872224, unguarded: 65982121 },
      { nonce: 134, chunk0: 4290596458, draw: 35655243, unguarded: 90596458 },
    ];
    for (const v of vectors) {
      assert.ok(v.chunk0 >= maxFair, `precondition: chunk0 ${v.chunk0} in rejected tail`);
      const k = generateProvablyFairNumber(S, C, v.nonce, CURSOR, RANGE);
      assert.strictEqual(k, v.draw, `nonce ${v.nonce}: guarded draw`);
      assert.notStrictEqual(k, v.unguarded, `nonce ${v.nonce}: guard did not fire`);
    }
  });
});

describe('LIQD Limbo game math', () => {
  it('win chance = floor(9.9e9 / round(100·m)) / 1e8  (operator cr)', () => {
    assert.ok(Math.abs(winChancePct(2.00) - 49.5) < 1e-9);            // matches the UI at target 2.00
    assert.ok(Math.abs(winChancePct(1.01) - 98.019801) < 1e-6);      // = LIMBO_MAX_WIN_CHANCE_PERCENT
    assert.ok(Math.abs(MAX_WIN_CHANCE_PERCENT - 98.019801) < 1e-6);
    assert.ok(Math.abs(winChancePct(10.00) - 9.9) < 1e-9);
    assert.ok(Math.abs(winChancePct(100.00) - 0.99) < 1e-9);
  });

  it('RESULT_NUMERATOR ties to (edge, scale, range): 9.9e9', () => {
    assert.strictEqual(RESULT_NUMERATOR, 9_900_000_000);
  });

  it('house edge is CLOSED-FORM ≥ 1.00% for every legal target, = 1.00% when 9.9e7/m is integer', () => {
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

  it('sweep: RTP(m) ≤ 0.99 for a dense range of legal targets (no player-favourable target exists)', () => {
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
  it('P(R ≥ m) equals the served win chance, verified at the boundary draw', () => {
    for (const m of [1.50, 2.00, 5.00, 20.14, 100.00, 1000.00]) {
      const winCount = Math.round(winChance(m) * RANGE);
      assert.strictEqual(winCount, Math.floor(RESULT_NUMERATOR / targetToHundredths(m)),
        `identity mismatch at ${m}`);
      const lastWinK = winCount - 1;
      assert.ok(limboWin(resultMultiplier(lastWinK), m), `k=${lastWinK} should win at ${m}`);
      assert.ok(!limboWin(resultMultiplier(winCount), m), `k=${winCount} should lose at ${m}`);
    }
  });

  // Asserting `resultMultiplier(RANGE - 1) ≈ 0.99` here would encode the model's defect rather
  // than the operator's behaviour: it passes for exactly as long as the model is wrong, and would
  // keep passing all the way to delivery. A live capture run on 2026-09-11 that is not shipped disagreed
  // at nonce 49, k = 99,588,964, operator served R = 1 — and the operator is the authority. The
  // assertion below is the witnessed value; the test is not relaxed to accommodate the code.
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

  it('target legality: 2-dp values within [1.01, 1e6]', () => {
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
