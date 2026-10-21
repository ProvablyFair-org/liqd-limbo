import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { judgeCapProbe } from '../steps/supplement';
import { CAP_PROBE_TARGETS, LIVE_TARGET_CEILING } from '../../src/config';

/**
 * Step 25's reader for the cap re-probe (judgeCapProbe), scored on journals the REAL capture engine writes
 * (capture/capture-limbo-v2.mjs --cap-probe plan, liqd-capture-core.mjs) against the offline mock — so the
 * judge and the journal can never drift apart in shape. No network: the self-test's mock stands in for the
 * casino, once capped at 10,000x and once in its 2026-09-11 state (no target cap, $50,000 exposure ceiling).
 * Since 2026-10-02 the real re-probe journal (evidence/E21) is pinned in src/config.ts and Step 25 runs the
 * PASS branch on it; these specs keep the FLAG branch (a server that settles the targets) exercised too.
 */
type Ev = Record<string, any>;
const ROOT = path.join(__dirname, '..', '..');
const read = (f: string): Ev[] => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

describe('cap re-probe judge (Step 25 / capture --cap-probe, C1 2026-10-02)', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'limbo-capjudge-'));
  execFileSync(process.execPath, [path.join(ROOT, 'capture', 'selftest-capture-limbo-v2.mjs'), out, '--only=cap re-probe'], { stdio: 'pipe' });
  const journal = (prefix: string) => path.join(out, fs.readdirSync(out).find((f) => f.startsWith(prefix) && f.endsWith('.journal.ndjson'))!);
  const capped = read(journal('cap-capped-'));
  const open = read(journal('cap-open-'));

  it('a server capped at 10,000x: control settled and recomputed, all four targets refused with a saved reply and no nonce consumed', () => {
    const j = judgeCapProbe(capped, CAP_PROBE_TARGETS, LIVE_TARGET_CEILING);
    assert.strictEqual(j.controlSettled, 1);
    assert.strictEqual(j.controlRecomputed, 1);
    assert.deepStrictEqual(j.rows.map((r) => [r.target, r.refused, r.status, r.code]), CAP_PROBE_TARGETS.map((t) => [t, true, 400, '3001']));
    assert.strictEqual(j.allRefused, true);
  });

  it('a server in its 2026-09-11 state: three targets settle, so the cap is NOT evidenced', () => {
    const j = judgeCapProbe(open, CAP_PROBE_TARGETS, LIVE_TARGET_CEILING);
    assert.deepStrictEqual(j.accepted, [100_101.12, 497_487.44, 500_000]);
    assert.strictEqual(j.allRefused, false);
  });

  it('a refusal without its saved reply, one that consumed a nonce, or a run without the control does not count', () => {
    assert.strictEqual(judgeCapProbe(capped.filter((e) => e.t !== 'reply'), CAP_PROBE_TARGETS, LIVE_TARGET_CEILING).allRefused, false);
    const consumed = capped.map((e) => (e.t === 'refusal' && e.spec?.target === CAP_PROBE_TARGETS[0] ? { ...e, nonceConsumed: true } : e));
    const jc = judgeCapProbe(consumed, CAP_PROBE_TARGETS, LIVE_TARGET_CEILING);
    assert.strictEqual(jc.rows[0].refused, false);
    assert.strictEqual(jc.allRefused, false);
    assert.strictEqual(judgeCapProbe(capped.filter((e) => e.t !== 'bet'), CAP_PROBE_TARGETS, LIVE_TARGET_CEILING).allRefused, false);
  });
});
