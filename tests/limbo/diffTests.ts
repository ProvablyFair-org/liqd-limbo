import * as assert from 'node:assert';
import { numbersAgree, fieldDiff, beyondTolerance } from '../../src/diff';

describe('Recomputed-float comparison (src/diff.ts, used by Step 24 and the reproduction gate)', () => {
  it('1-ulp libm drift agrees; a value moved beyond 1e-14 abs + 1e-12 rel, or a distinct integer, does not', () => {
    // The shipped Pass-2 zCritical, a normal quantile through Math.log / Math.sqrt.
    const z = -3.090232306167813;
    const ulp = 2 ** (Math.floor(Math.log2(Math.abs(z))) - 52);
    assert.ok(numbersAgree(z, z + ulp));
    assert.ok(numbersAgree(z, z - ulp));
    assert.ok(!numbersAgree(z, z + 4e-12));
    assert.ok(!numbersAgree(0.4321, 0.4322));
    assert.ok(!numbersAgree(10, 11));
  });

  it('a block that differs only by 1-ulp drift has no leaf beyond tolerance; a forged leaf does', () => {
    const committed = { servedReturn: { zCritical: -3.090232306167813, oneSidedP: 0.4321 }, earlyLateScreen: { flags: 10 } };
    const drift = { servedReturn: { zCritical: -3.0902323061678135, oneSidedP: 0.4321 }, earlyLateScreen: { flags: 10 } };
    const forged = { servedReturn: { zCritical: -3.090232306163813, oneSidedP: 0.4321 }, earlyLateScreen: { flags: 10 } };
    const flags = { servedReturn: { zCritical: -3.090232306167813, oneSidedP: 0.4321 }, earlyLateScreen: { flags: 11 } };
    assert.strictEqual(beyondTolerance(fieldDiff(committed, drift)).length, 0);
    assert.deepStrictEqual(beyondTolerance(fieldDiff(committed, forged)).map((d) => d.path), ['servedReturn.zCritical']);
    assert.deepStrictEqual(beyondTolerance(fieldDiff(committed, flags)).map((d) => d.path), ['earlyLateScreen.flags']);
  });
});
