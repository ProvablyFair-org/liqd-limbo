// Offline self-test for capture-limbo-v2.mjs — NO network, NO casino. Runs the real capture engine
// against selftest-mock-liqd.mjs. Usage:  node capture/selftest-capture-limbo-v2.mjs [outDir] [--only=<test-name prefix>]
// tests/limbo/capProbeTests.ts runs it with --only=cap and scores the journals it writes with Step 25's judge.
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createMock } from './selftest-mock-liqd.mjs';
import { makeApi, runCapture, secretNeedles, AUDIT_SEED_RE, commitHash } from './liqd-capture-core.mjs';
import { limboResult } from './rng.reference.mjs';
import { buildPlan, probePlan, capProbePlan, makeGame, recordReplies, randomTarget, decadeOf, DECADES, EPOCH, CEILING, CAP_PROBE_TARGETS } from './capture-limbo-v2.mjs';

const ARGS = process.argv.slice(2);
const ONLY = ARGS.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? null;
const OUT = ARGS.find((a) => !a.startsWith('--')) || mkdtempSync(join(tmpdir(), 'limbo-selftest-'));
const COOKIE = 'CF_Authorization=abcDEF1234567890ghijklmnop; AccessToken=zyxwVUT9876543210qponml';
const needles = secretNeedles(COOKIE);
let passed = 0; const t = async (name, fn) => { if (ONLY && !name.startsWith(ONLY)) return; await fn(); passed++; console.log(`  ok  ${name}`); };
// A target ceiling in front of the shared mock (which has none): a place-bet above `ceiling` is refused the way
// LIQD refused 93,830.94x on 2026-09-26 (errorCode 3001, as hand-noted then). Kept HERE so the shared mock, which
// keno and mines also carry byte for byte, does not change.
const capped = (inner, ceiling) => async (method, url, body) => {
  if (ceiling != null && /\/originals\/limbo\/place-bet$/.test(new URL(url).pathname) && Number(body?.params?.target) > ceiling) {
    return { status: 400, text: JSON.stringify({ data: null, errors: [{ name: 'RequestInputValidationError', errorCode: 3001, fields: { path: ['body', 'params', 'target'], message: `Too big: expected number to be <=${ceiling}` } }] }) };
  }
  return inner(method, url, body);
};
const mk = (faults = {}, { ceiling = null } = {}) => {
  const m = createMock({ limboResult, faults });
  const rec = recordReplies(capped(m.transport, ceiling));
  return { m, rec, api: makeApi({ transport: rec.transport, base: 'https://mock.invalid/api/v1' }) };
};
const lines = [];
const run = (api, plan, runName, { rec, ...extra } = {}) => runCapture({ api, game: makeGame({ replies: rec?.drain }), plan, meta: { test: runName }, outDir: OUT, runName, needles, log: (l) => lines.push(l), rotateDelayMs: 0, ...extra });
const allText = (prefix) => readdirSync(OUT).filter((f) => f.startsWith(prefix)).map((f) => readFileSync(join(OUT, f), 'utf8')).join('\n');
const events = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
/** Every place-bet intent has at least one saved reply, and the last one for it is a 200. */
const everyIntentReplied = (ev) => ev.filter((e) => e.t === 'intent').every((i) => { const r = ev.filter((e) => e.t === 'reply' && e.key === i.key); return r.length >= 1 && r[r.length - 1].status === 200; });
console.log(`limbo capture v2 self-test (out: ${OUT})`);

await t('plan: 100 rounds in each of decades 10^2..10^4 (floor 50; 10^4 = the 10,000x ceiling), 6 epochs of exactly 50, every epoch holds all 3 decades', () => {
  const plan = buildPlan(); const c = {};
  for (const b of plan.flatMap((e) => e.bets)) { c[b.decade] = (c[b.decade] ?? 0) + 1; assert.equal(decadeOf(b.target), b.decade); }
  assert.deepEqual(c, { 2: 100, 3: 100, 4: 100 }); assert.equal(plan.length, 6); assert.ok(plan.every((e) => e.bets.length === EPOCH));
  assert.ok(plan.every((e) => new Set(e.bets.map((b) => b.decade)).size === 3));
});

await t('target generator: 20,000 draws per decade stay in [lo, hi), on the 0.01 grid; decade 10^4 is the single point 10,000x', () => {
  for (const [d, [lo, hi]] of Object.entries(DECADES)) for (let i = 0; i < 20000; i++) {
    const x = randomTarget(lo, hi); assert.ok(x >= lo && x < hi, `${x}`); assert.equal(Math.round(x * 100) / 100, x); assert.equal(decadeOf(x), Number(d));
  }
});

await t('result adapter: rng.reference.mjs recomputes every round of the audited dataset (data/limbo-master-6700bets.json)', () => {
  const d = JSON.parse(readFileSync(new URL('../data/limbo-master-6700bets.json', import.meta.url), 'utf8'));
  const seeds = new Map(d.seeds.map((s) => [s.hashedServerSeed, s.serverSeed]));
  let n = 0; for (const b of d.bets) { assert.equal(limboResult(seeds.get(b.hashedServerSeed), b.clientSeed, b.nonce), b.result); n++; }
  assert.equal(n, 6700);
});

await t('probe: anchor + 2 rounds (10,000x and one in decade 10^3) + rotation; record shape; every reply saved; planted secrets scrubbed', async () => {
  const { api, rec } = mk({ plantSecrets: true });
  const { ds, journalFile } = await run(api, probePlan(), 'probe', { rec });
  assert.ok(everyIntentReplied(events(journalFile)));
  assert.equal(ds.bets.length, 2); assert.ok(ds.bets.some((b) => b.decade === 4 && b.params.target === 10000) && ds.bets.every((b) => b.params.target <= 10000));
  assert.equal(ds.meta.preCapture.commitVerified, true); assert.equal(ds.meta.preCapture.anchorLinkOk, true);
  assert.equal(ds.seeds[0].commitVerified, true); assert.equal(ds.seeds[0].chainLinkOk, true); assert.equal(ds.seeds[0].nonceEnd, 1);
  for (const k of ['epoch', 'phase', 'decade', 'id', 'idempotencyKey', 'params', 'nonce', 'clientSeed', 'hashedServerSeed', 'result', 'win', 'betAmount', 'winningAmount', 'raw']) assert.ok(k in ds.bets[0], k);
  const txt = allText('probe'); assert.ok(!txt.includes('someone@example.com') && !/eyJ[A-Za-z0-9_-]{8,}\./.test(txt)); for (const n of needles) assert.ok(!txt.includes(n));
});

await t('full plan run (300 rounds) with lost responses and a 429: 6 epochs revealed, results recompute, no double bet, decades 100 each', async () => {
  const { api, m, rec } = mk({ dropAfterAct: [5, 77, 200], rate429: [30] });
  const { ds, finished, journalFile } = await run(api, buildPlan(), 'full', { rec });
  const ev = events(journalFile);
  assert.ok(everyIntentReplied(ev));
  assert.ok(ev.some((e) => e.t === 'reply' && e.status === null && e.transportError), 'a lost response is journalled as a reply with no status');
  assert.equal(finished, true); assert.equal(ds.bets.length, 300); assert.equal(ds.seeds.length, 6);
  for (const [E, sd] of ds.seeds.entries()) {
    assert.equal(sd.commitVerified, true); assert.equal(sd.chainLinkOk, true); assert.equal(sd.nonceEnd, 49); assert.match(sd.clientSeed, AUDIT_SEED_RE);
    assert.equal(sd.clientSeedDrawnAfterCommitment, E === 0 ? ds.meta.preCapture.nextHashedServerSeed : ds.seeds[E - 1].nextHashedServerSeed);
    assert.equal(commitHash(sd.serverSeed), sd.hashedServerSeed);
    ds.bets.filter((b) => b.epoch === E).forEach((b, i) => { assert.equal(b.nonce, i); assert.equal(limboResult(sd.serverSeed, b.clientSeed, b.nonce), b.result); });
  }
  const c = {}; for (const b of ds.bets) c[b.decade] = (c[b.decade] ?? 0) + 1; assert.deepEqual(c, { 2: 100, 3: 100, 4: 100 });
  assert.equal(m.st.idem.size, 300);
  assert.ok(lines.filter((l) => /^epoch \d/.test(l)).every((l) => !/BAD/.test(l)));
});

await t('max exposure (3138): witness kept, one retry at the named stake; an unplayable target aborts', async () => {
  const { api } = mk();
  const { ds } = await run(api, [{ phase: 'A2', group: null, seed: { tag: 'audit' }, bets: [{ decade: 5, target: 400000, amount: 0.2 }] }], 'exposure');
  assert.equal(ds.meta.witnesses[0].maxAllowedBetUsdc, 0.125); assert.equal(ds.bets[0].betAmount, 0.125); assert.equal(ds.bets[0].exposureRetry, true);
  const { api: api2 } = mk();
  await assert.rejects(run(api2, [{ phase: 'A2', group: null, seed: { tag: 'audit' }, bets: [{ decade: 5, target: 900000, amount: 0.1 }] }], 'unplayable'), /unplayable/);
});

await t('resume: cookie expires mid-epoch → AUTH stop; --resume finishes with contiguous nonces and no double bet', async () => {
  const { api, m } = mk({ authAt: 80 });
  const plan = buildPlan().slice(0, 3);
  await assert.rejects(run(api, plan, 'resume'), (e) => e.kind === 'AUTH');
  m.faults.authAt = null;
  const jf = join(OUT, readdirSync(OUT).find((f) => f.startsWith('resume-') && f.endsWith('.journal.ndjson')));
  const r = await run(api, plan, 'resume', { resumeFile: jf });
  assert.equal(r.finished, true); assert.equal(r.ds.bets.length, 150); assert.equal(m.st.idem.size, 150);
  for (const E of [0, 1, 2]) r.ds.bets.filter((b) => b.epoch === E).forEach((b, i) => assert.equal(b.nonce, i));
});

await t('cap re-probe, server capped at 10,000x: the control settles and recomputes; each of the 4 targets is refused (3001), its reply saved (HTTP 400), no nonce consumed, no bet; the run carries on and finishes', async () => {
  const { api, rec } = mk({}, { ceiling: CEILING });
  const { ds, finished, journalFile } = await run(api, capProbePlan(), 'cap-capped', { rec });
  const ev = events(journalFile);
  assert.equal(finished, true); assert.equal(ds.bets.length, 1); assert.equal(ds.bets[0].params.target, CEILING);
  const sd = ds.seeds.find((s) => s?.serverSeed && s.hashedServerSeed === ds.bets[0].hashedServerSeed);
  assert.ok(sd && sd.commitVerified === true); assert.equal(limboResult(sd.serverSeed, ds.bets[0].clientSeed, ds.bets[0].nonce), ds.bets[0].result);
  for (const t of CAP_PROBE_TARGETS) {
    const ints = ev.filter((e) => e.t === 'intent' && e.body.params.target === t); assert.equal(ints.length, 1, `${t}: one intent`);
    const rep = ev.filter((e) => e.t === 'reply' && e.key === ints[0].key); assert.equal(rep.length, 1); assert.equal(rep[0].status, 400); assert.equal(rep[0].body.errors[0].errorCode, 3001);
    const ref = ev.find((e) => e.t === 'refusal' && e.spec.target === t); assert.ok(ref, `${t}: refusal journalled`); assert.equal(ref.code, 3001); assert.equal(ref.nonceConsumed, false);
    assert.ok(!ds.bets.some((b) => b.params.target === t));
  }
  assert.ok(!ev.some((e) => e.t === 'witness'), 'no 3138 retry in a cap re-probe');
});

await t('cap re-probe, server NOT capped (the 2026-09-11 state, $50,000 exposure ceiling): 100,101.12x, 497,487.44x and 500,000x settle; 990,000.01x is refused on exposure (3138) and recorded, not retried, not aborted', async () => {
  const { api, rec } = mk();
  const { ds, finished, journalFile } = await run(api, capProbePlan(), 'cap-open', { rec });
  const ev = events(journalFile);
  assert.equal(finished, true);
  assert.deepEqual(ds.bets.map((b) => b.params.target).sort((a, z) => a - z), [CEILING, 100101.12, 497487.44, 500000]);
  const ref = ev.find((e) => e.t === 'refusal' && e.spec.target === 990000.01); assert.ok(ref); assert.equal(ref.code, 3138); assert.equal(ref.nonceConsumed, false);
  assert.ok(!ev.some((e) => e.t === 'witness')); assert.ok(ev.filter((e) => e.t === 'reply').length === 5);
});

console.log(`SELF-TEST PASS — ${passed}/${ONLY ? `${passed} selected (--only=${ONLY})` : 9} checks (limbo capture v2, offline mock)`);
