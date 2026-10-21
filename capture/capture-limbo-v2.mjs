#!/usr/bin/env node
// ============================================================================
//  LIQD Limbo — CAPTURE v2: the TARGET-DECADE supplement. Written and RUN 2026-09-26 (the supplement in
//  data/ and the two probe journals in evidence/E20-…); the --cap-probe mode was added 2026-10-02 and RUN
//  the same day on qa.liqd.com (capture/PROBE-2026-10-02.md; journal pinned as evidence/E21-target-cap-probe/).
//
//  API CHANGE, first seen 2026-10-02: qa.liqd.com's place-bet now REQUIRES body.stakeCurrency. The first
//  --cap-probe run (18:20:11Z) sent none and its control bet was refused, HTTP 400, errorCode 3001, field
//  body.stakeCurrency "Invalid option: expected one of "BTC"|"ETH"|"USDT"|"USDC"|…|"USD"|"EUR"|"CAD""; no bet
//  was placed (its journal is kept in evidence/E21-target-cap-probe/, not scored). The script now sends
//  stakeCurrency 'USDC' (--stake-currency=…), the wallet currencyId 2 already named; the 2026-09-26 runs
//  predate the field and did not send it.
//
//  capture-limbo.reference.mjs is the record of the audited capture (6,700 rounds) and is unchanged.
//  That capture's Phase A drew targets from 1.01× to 49.5× only (decades 10^0 and 10^1); decades 10^2,
//  10^3 and 10^5 were reached by Phase B tranches, and decade 10^4 (10,000×–99,999.99×) never
//  (src/profile-map.ts, LIMBO-15). LIMBO-15's floor is "Phase A ≥ 50 bets per decade the plan
//  declares". v2 adds a Phase A2 of 100 rounds in EACH of decades 10^2, 10^3 and 10^4 (300 rounds, 6
//  epochs of 50, decades interleaved inside every epoch), targets drawn log-uniformly inside the decade
//  and floored to the 0.01 grid. Decade 10^4 is the single legal point 10,000× under the live ceiling
//  (CEILING below). A 3138 (max exposure) is handled the way the reference rig did: witness kept, one
//  retry at the stake the operator names — except in --cap-probe, where every refusal is the datum.
//
//  EVERY PLACE-BET REPLY IS JOURNALLED (C1, 2026-10-02): `recordReplies` wraps the transport and the game
//  writes a `reply` event — HTTP status and parsed body, scrubbed like every other line — for every
//  place-bet request, accepted or refused, before anything else happens to it. Until then a refusal
//  other than 3138 was thrown without being written, which is why the 2026-09-26 probe's reply is lost.
//
//  LIMBO-09 (the client-bundle pin) is a PAGE READ, not a capture: see console/limbo-bundle-read.console.js
//  (not run into this package: no evidence/client-bundle/ is shipped).
//
//  Engine (liqd-capture-core.mjs, shared with keno v2 and mines v3): pre-capture anchor before any
//  bet, CSPRNG client seeds ("audit"+randomBytes(6), the reference's own format), epochSize 50 closed by
//  a rotation each, nonceEnd per rotation, idempotent retries (same idempotencyKey), journal +
//  --resume, credential scrubbing. Transport: set-cookie.sh + curl_cffi, as the reference.
//
//  Usage (from the package root):
//    node capture/capture-limbo-v2.mjs --plan       print the plan, no network
//    node capture/capture-limbo-v2.mjs --probe      2 rounds ($0.10 each): one at 10,000× and one between 1,000× and 10,000×, + rotations, then stop
//    node capture/capture-limbo-v2.mjs --cap-probe  1 control round at 10,000× + one $0.10 request at each CAP_PROBE_TARGETS value, every reply saved
//    node capture/capture-limbo-v2.mjs            full run: 300 rounds
//    node capture/capture-limbo-v2.mjs --resume   continue an unfinished run (not for --cap-probe: start it fresh)
//  Options: --currency-id=2 (USDC, as the reference) · --stake-currency=USDC (required by the API since 2026-10-02) · --delay=ms
// ============================================================================
import { join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { makeApi, pythonTransport, runCapture, parseFlags, latestJournal, secretNeedles, retrying, stake8, AUDIT_SEED_GENERATOR, API_BASE_DEFAULT, makeProgress, colourVerdicts } from './liqd-capture-core.mjs';
import { limboResult, limboWin, limboWinChancePct } from './rng.reference.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(HERE, 'out');
export const RUN_NAME = 'liqd-limbo-capture-v2';
export const EPOCH = 50, AMT = 0.10, MIN_BET = 0.10, PER_DECADE = 100;
// CEILING 10,000x — from the 2026-09-26 probe: its bet at 10000 was accepted and one at 93830.94 was not settled
// (journal evidence/E20-target-ceiling-probe-2026-09-26/liqd-limbo-capture-v2-probe-2026-09-26T17-43-21-558Z). The
// error text, errorCode 3001 "Too big: expected number to be <=10000", is a HAND-TYPED NOTE copied from the terminal: the
// journal does not hold the server's reply (this script did not save it then; it does now — `reply` events).
// The audited 2026-09-11 capture had 500 bets above 10,000x (max 500,000x): the plain reading is that the operator
// lowered the ceiling since. On 2026-10-02 --cap-probe saved the server's reply: the same errorCode 3001 and "Too big:
// expected number to be <=10000" at 100,101.12x, 497,487.44x, 500,000x and 990,000.01x (evidence/E21, Step 25).
export const CEILING = 10000;
/** decade exponent → [lo, hi) target range actually sampled. */
export const DECADES = { 2: [100, 1000], 3: [1000, 10000], 4: [10000, 10000.01] };   // decade 10^4 is the single legal point 10,000x
export const TARGET_GENERATOR = 'log-uniform in [lo, hi) of the decade from crypto.randomBytes(6), floored to 0.01';

export function randomTarget(lo, hi) {
  const u = randomBytes(6).readUIntBE(0, 6) / 2 ** 48;                  // [0,1)
  const t = Math.floor(Math.exp(Math.log(lo) + u * (Math.log(hi) - Math.log(lo))) * 100) / 100;
  return Math.min(Math.max(t, lo), Math.round(hi * 100 - 1) / 100);
}
export const decadeOf = (t) => Math.floor(Math.log10(t) + 1e-12);

export function buildPlan() {
  const ex = Object.keys(DECADES).map(Number), total = ex.length * PER_DECADE, plan = [];
  for (let e = 0; e < total / EPOCH; e++) plan.push({ phase: 'A2', group: null, seed: { tag: 'audit' },
    bets: Array.from({ length: EPOCH }, (_, j) => { const d = ex[(e * EPOCH + j) % ex.length]; return { decade: d, target: randomTarget(...DECADES[d]), amount: AMT }; }) });
  return plan;
}
export const probePlan = () => [{ phase: 'probe', group: null, seed: { tag: 'audit' },
  bets: [{ decade: 4, target: CEILING, amount: AMT }, { decade: 3, target: randomTarget(1000, 10000), amount: AMT }] }];

/**
 * THE CAP RE-PROBE (C1, 2026-10-02) — the same four targets as CAP_PROBE_TARGETS in src/config.ts (the
 * verifier reads them from there; keep the two lists equal). Each is above the RTP-CLAIM band edge
 * 100,101.12× (the first target more than 0.1 pp below the 99% claim); see capture/PROBE-2026-10-02.md
 * for why each was chosen. A CONTROL bet at the 10,000× ceiling goes first, in its own epoch: it settles,
 * the rotation reveals its seed, and it shows the session, balance and stake were good — so a refusal that
 * follows cannot be an expired cookie or an empty wallet. Then ONE plan entry per target, each its own
 * GROUP, so the shared core's refusal path (liqd-capture-core.mjs: `refusal` event with the error, the
 * active nonce read back and whether a nonce was consumed) records it and carries on to the next target.
 */
export const CAP_PROBE_TARGETS = [100101.12, 497487.44, 500000, 990000.01];
export const CAP_RUN_NAME = 'liqd-limbo-cap-probe';
export const capProbePlan = () => [
  { phase: 'cap-control', group: null, seed: { tag: 'audit' }, bets: [{ decade: decadeOf(CEILING), target: CEILING, amount: AMT }] },
  ...CAP_PROBE_TARGETS.map((t) => ({ phase: 'cap-probe', group: `cap-${t}`, seed: { tag: 'audit' },
    bets: [{ decade: decadeOf(t), target: t, amount: AMT, capProbe: true }] })),
];

/**
 * C1 (2026-10-02): wraps a transport so every place-bet reply — HTTP status and body, accepted or refused,
 * and a transport failure with no reply — is kept until the game drains it into the journal as a `reply`
 * event. Reads and rotations are not kept here (the core journals their raw responses already).
 */
export function recordReplies(inner) {
  const pending = [];
  const isBet = (url) => /\/place-bet$/.test(new URL(url).pathname);
  const transport = async (method, url, body) => {
    let r;
    try { r = await inner(method, url, body); } catch (e) {
      if (isBet(url)) pending.push({ method, path: new URL(url).pathname, status: null, transportError: String(e?.message ?? e).slice(0, 200) });
      throw e;
    }
    if (isBet(url)) {
      let parsed; try { parsed = JSON.parse(r.text); } catch { parsed = String(r.text).slice(0, 4000); }
      pending.push({ method, path: new URL(url).pathname, status: r.status, body: parsed });
    }
    return r;
  };
  return { transport, drain: () => pending.splice(0) };
}

export function makeGame({ currencyId = 2, stakeCurrency = 'USDC', stamp = Date.now(), replies = null } = {}) {
  const idem = () => randomUUID(); // LIQD validates idempotencyKey as a UUID (probe 2026-09-26: errorCode 3001 "Invalid UUID")
  // Every place-bet reply (status + body), accepted or refused, is journalled before the result is used or
  // the error is handled — `replies` is recordReplies(...).drain. Without it (the 2026-09-26 runs) nothing is saved.
  const send = async (ctx, body) => {
    try { return await retrying(() => ctx.api.http('POST', '/originals/limbo/place-bet', body), { label: 'place-bet', log: ctx.log }); }
    finally { for (const r of (replies ? replies() : [])) ctx.journal.append({ t: 'reply', epoch: ctx.epoch, seq: ctx.seq, key: body.idempotencyKey, ...r }); }
  };
  const toRec = (ctx, spec, key, body, s, extra = {}) => {
    const round = s.round ?? {}; const w = (round.wagers ?? []).find((x) => x.betType === 'main') ?? (round.wagers ?? [])[0] ?? {}; const oc = w.outcome ?? {};
    const pf = s.provablyFair ?? {};
    const pickNum = (o, ...k) => { for (const x of k) if (o && o[x] != null) return Number(o[x]); return null; };
    return { at: new Date().toISOString(), epoch: ctx.epoch, phase: ctx.phase, seq: ctx.seq, decade: spec.decade, id: round.betId ?? round.roundId ?? null,
      idempotencyKey: key, requestBody: body, params: { target: Number(body.params.target) },
      nonce: s.consumedNonce ?? round.nonce ?? pf.nonce ?? null, clientSeed: round.clientSeed ?? pf.clientSeed ?? null, serverSeedId: round.serverSeedId ?? null,
      hashedServerSeed: pf.serverSeedHash ?? ctx.hashedServerSeed, result: pickNum(oc, 'result', 'crashMultiplier', 'crashPoint', 'multiplier'),
      win: oc.win ?? (w.result === 'won'), resultLabel: w.result ?? null, betAmount: Number(w.stake ?? body.stake), winningAmount: Number(w.winningAmount ?? 0),
      stakeWallet: w.stakeWallet != null ? Number(w.stakeWallet) : null, winningAmountWallet: w.winningAmountWallet != null ? Number(w.winningAmountWallet) : null,
      raw: s, ...extra };
  };
  return {
    name: 'limbo',
    async play(spec, ctx) {
      let key = idem(), body = { idempotencyKey: key, stake: stake8(spec.amount), currencyId, stakeCurrency, params: { target: spec.target } };
      ctx.journal.append({ t: 'intent', epoch: ctx.epoch, seq: ctx.seq, key, body });
      try { return toRec(ctx, spec, key, body, await send(ctx, body)); } catch (e) {
        // --cap-probe: a refusal of any kind IS the datum — no retry; the core journals it (refusalSkipsGroup).
        if (spec.capProbe) throw e;
        // 3138: the operator names the largest stake it accepts for this target — witness it, retry ONCE at that stake.
        const allowed = Number(e?.raw?.fields?.maxAllowedBetUsdc ?? NaN);
        if (e.kind !== 'API' || e.code !== 3138 || !Number.isFinite(allowed)) throw e;
        ctx.journal.append({ t: 'witness', kind: 'max-exposure', target: spec.target, requestedStake: spec.amount, maxAllowedBetUsdc: allowed, raw: e.raw });
        if (allowed < MIN_BET) throw Object.assign(new Error(`target ${spec.target}× is unplayable: max exposure allows $${allowed}, below the $${MIN_BET} minimum bet`), { kind: 'ABORT' });
        key = idem(); body = { idempotencyKey: key, stake: stake8(allowed), currencyId, stakeCurrency, params: { target: spec.target } };
        ctx.journal.append({ t: 'intent', epoch: ctx.epoch, seq: ctx.seq, key, body });
        return toRec(ctx, spec, key, body, await send(ctx, body), { exposureRetry: true });
      }
    },
    // The core records a refusal and carries on only for a grouped plan entry whose game says so: in
    // --cap-probe, every API refusal of a cap-probe request (any errorCode — the code says which rule refused).
    refusalSkipsGroup(e, spec) { return spec?.capProbe === true && e?.kind === 'API'; },
    async recover(intent, ctx) {
      const s = await send(ctx, intent.body);
      return toRec(ctx, { decade: decadeOf(Number(intent.body.params.target)) }, intent.key, intent.body, s, { recovered: true });
    },
    verifyEpoch(sd, bets) {
      let resBad = 0, winBad = 0, creditBad = 0, nonceBad = 0; const dec = {};
      bets.forEach((b, i) => {
        dec[b.decade] = (dec[b.decade] ?? 0) + 1;
        if (b.nonce !== (sd.nonceStart ?? 0) + i) nonceBad++;
        if (!sd.serverSeed) return;
        const R = limboResult(sd.serverSeed, b.clientSeed, b.nonce);
        if (R !== b.result) resBad++;
        if (limboWin(R, b.params.target) !== !!b.win) winBad++;
        const due = limboWin(R, b.params.target) ? Math.round(b.betAmount * b.params.target * 1e8) / 1e8 : 0;
        if (Math.abs(due - b.winningAmount) > 1e-8) creditBad++;
      });
      return `results ${resBad ? resBad + ' BAD' : 'OK'}  win rule ${winBad ? winBad + ' BAD' : 'OK'}  credit ${creditBad ? creditBad + ' BAD' : 'OK'}  nonces ${nonceBad ? nonceBad + ' BAD' : 'OK'}  decades ${JSON.stringify(dec)}`;
    },
  };
}

/** What the cap re-probe journal shows, target by target — the same reading Step 25 makes (judgeCapProbe). */
function capProbeReport(ds, events) {
  const L = ['', 'CAP RE-PROBE RESULT'];
  const ctl = ds.bets.filter((b) => b.params.target === CEILING);
  const sd = ds.seeds.find((s) => s?.serverSeed && ctl.some((b) => b.hashedServerSeed === s.hashedServerSeed));
  for (const b of ctl) {
    const R = sd ? limboResult(sd.serverSeed, b.clientSeed, b.nonce) : null;
    L.push(`  control ${b.params.target}×: accepted, served R ${b.result}, recomputed R ${R} ${R === b.result ? 'OK' : 'MISMATCH'}`);
  }
  if (!ctl.length) L.push('  control at 10,000×: NOT SETTLED — the refusals below cannot be read as the cap; send this output.');
  for (const t of CAP_PROBE_TARGETS) {
    const intents = events.filter((e) => e.t === 'intent' && Number(e.body?.params?.target) === t);
    const keys = new Set(intents.map((e) => e.key));
    const rep = events.filter((e) => e.t === 'reply' && keys.has(e.key)).pop();
    const ref = events.find((e) => e.t === 'refusal' && Number(e.spec?.target) === t);
    const bet = ds.bets.find((b) => b.params.target === t);
    if (bet) L.push(`  ${t}×: ACCEPTED — settled, R ${bet.result}, stake ${bet.betAmount}. The cap is NOT in force at this target.`);
    else if (ref) L.push(`  ${t}×: REFUSED — HTTP ${rep?.status ?? '?'}, errorCode ${ref.code ?? '?'}, ${JSON.stringify(ref.error?.message ?? ref.error?.fields ?? ref.error?.name ?? '')}; nonce consumed ${ref.nonceConsumed ? 'YES' : 'no'}; reply saved ${rep ? 'OK' : 'MISSING'}`);
    else L.push(`  ${t}×: NOT REACHED (${intents.length} intent(s)) — the run stopped before it; start a fresh --cap-probe.`);
  }
  L.push('  Done = control OK, and every target line REFUSED with "nonce consumed no" and "reply saved OK".');
  return L.join('\n');
}

function probeReport(ds) {
  const sd = ds.seeds[0]; const L = ['', 'PROBE RESULT',
    `  pre-capture anchor: commit ${ds.meta.preCapture?.commitVerified ? 'OK' : 'FAIL'}, link ${ds.meta.preCapture?.anchorLinkOk ? 'OK' : 'FAIL'}; epoch 0 commit ${sd?.commitVerified ? 'OK' : 'FAIL'}, chain ${sd?.chainLinkOk ? 'OK' : 'FAIL'}`];
  for (const b of ds.bets) {
    const R = sd?.serverSeed ? limboResult(sd.serverSeed, b.clientSeed, b.nonce) : null;
    L.push(`  target ${b.params.target}× (decade 10^${b.decade}, win chance ${limboWinChancePct(b.params.target).toFixed(6)}%): accepted, stake ${b.betAmount}, served R ${b.result}, recomputed R ${R} ${R === b.result ? 'OK' : 'MISMATCH'}, ${b.resultLabel}`);
  }
  if (ds.bets.length < 2) L.push('  FEWER THAN 2 ROUNDS SETTLED — do not start the full run; send this output.');
  L.push('  If every line says OK: run the full capture.');
  return L.join('\n');
}

async function main() {
  const F = parseFlags(process.argv.slice(2));
  const capProbe = !!F.get('cap-probe', false);
  if (capProbe && F.resume) { console.error('--cap-probe is not resumable: start it fresh (a refused request costs nothing, a fresh run re-anchors).'); process.exit(2); }
  const plan = capProbe ? capProbePlan() : F.probe ? probePlan() : buildPlan();
  const n = plan.reduce((s, e) => s + e.bets.length, 0);
  const prog = makeProgress({ total: n, title: `LIQD Limbo capture v2 (target decades) — ${capProbe ? 'CAP RE-PROBE' : F.probe ? 'PROBE' : 'FULL RUN'}` });
  prog.header([`${n.toLocaleString('en-US')} rounds · ${plan.length} epochs · stake $${(n * AMT).toFixed(2)}`, `pacing ${F.get('delay', 100)} ms between bets, ${F.get('rotate-delay', 500)} ms before rotations (LIQD rate-limits) · Ctrl-C stops cleanly · --resume continues`]);
  if (F.plan) {
    if (capProbe) { for (const e of plan) console.log(`  [${e.phase}${e.group ? ' / ' + e.group : ''}] ${e.bets.map((b) => `${b.target}× at $${b.amount}`).join(', ')}`); return; }
    for (const [d, [lo, hi]] of Object.entries(DECADES)) console.log(`  decade 10^${d}: ${PER_DECADE} rounds, targets ${lo}× … <${hi}×`); return;
  }
  const cookie = process.env.LIQD_COOKIE || '';
  if (!cookie) { console.error('LIQD_COOKIE is not set — copy any qa.liqd.com /api/v1 request as cURL and export its cookie header as LIQD_COOKIE'); process.exit(2); }
  const currencyId = Number(F.get('currency-id', 2));
  // 2026-10-02: qa.liqd.com place-bet now requires body.stakeCurrency (400, errorCode 3001, on the first cap-probe run).
  const stakeCurrency = String(F.get('stake-currency', 'USDC'));
  const rec = recordReplies(pythonTransport({ reqPy: join(HERE, 'req-v2.py'), referer: 'https://qa.liqd.com/originals/limbo' }));
  const api = makeApi({ transport: rec.transport, base: process.env.LIQD_BASE || API_BASE_DEFAULT });
  const stopFlag = { stop: false };
  process.on('SIGINT', () => { if (stopFlag.stop) process.exit(130); stopFlag.stop = true; prog.log('\nCtrl-C: stopping after the current round (again to quit at once). Continue with --resume.'); });
  const runName = capProbe ? CAP_RUN_NAME : F.probe ? RUN_NAME + '-probe' : RUN_NAME;
  const resumeFile = F.resume ? (F.resume === true ? latestJournal(OUT_DIR, runName) : F.resume) : null;
  if (F.resume && !resumeFile) { console.error('--resume: no journal found in capture/out'); process.exit(2); }
  const meta = { audit: 'LIQD Limbo', platform: 'qa.liqd.com', gameId: 'originals-limbo', schema: 'liqd-limbo-capture-v2', probe: F.probe,
    capProbe, ...(capProbe ? { capProbeTargets: CAP_PROBE_TARGETS, capProbeStake: AMT, capProbeControl: CEILING, replies: 'every place-bet reply journalled as a `reply` event (status, body)' } : {}),
    script: 'capture/capture-limbo-v2.mjs', supplementTo: 'data/limbo-master-6700bets.json (audited dataset; decades 10^0/10^1 Phase A stay there)',
    epochSize: EPOCH, nonceBase: 0, currencyId, clientSeedGenerator: AUDIT_SEED_GENERATOR, targetGenerator: TARGET_GENERATOR,
    phases: { A2: { perDecade: PER_DECADE, decades: DECADES, stake: AMT } }, floors: { phaseAPerDecade: 50 },
    limits: { minBetUsdc: MIN_BET, maxExposure: 'witnessed ≈ $50,000 potential payout (reference capture, errorCode 3138); 3138 handled by one retry at the named stake' } };
  try {
    const r = await runCapture({ api, game: makeGame({ currencyId, stakeCurrency, replies: rec.drain }), plan, meta, outDir: OUT_DIR, runName, resumeFile, needles: secretNeedles(cookie), betDelayMs: Number(F.get('delay', 100)), rotateDelayMs: Number(F.get('rotate-delay', 500)), stopFlag, progress: prog, log: prog.log });
    prog.end();
    if (capProbe) console.log(colourVerdicts(capProbeReport(r.ds, readFileSync(r.journalFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))));
    else if (F.probe) console.log(colourVerdicts(probeReport(r.ds)));
    console.log(`\n${r.finished ? 'DONE' : 'STOPPED (resume with --resume)'} — ${r.ds.bets.length} rounds, ${r.ds.seeds.filter((s) => s?.serverSeed).length} epochs revealed\n  dataset: ${r.outFile}\n  journal: ${r.journalFile}`);
    const rev = r.ds.seeds.filter((s) => s?.serverSeed), bad = rev.filter((s) => !s.commitVerified || !s.chainLinkOk).length;
    prog.summary(r.finished ? 'CAPTURE COMPLETE' : 'CAPTURE STOPPED — resume with --resume', [`rounds      ${r.ds.bets.length.toLocaleString('en-US')} / ${n.toLocaleString('en-US')}`, `epochs      ${rev.length} revealed · commit+chain ${bad ? bad + ' FAIL' : 'all OK'}`, `dataset     ${r.outFile.split('/').pop()}`], r.finished && !bad);
  } catch (e) {
    prog.end();
    console.error(`\nFATAL (${e.kind ?? 'error'}): ${e.message}`);
    console.error(e.kind === 'AUTH' ? '  → cookie expired/blocked: re-copy the cURL, re-source set-cookie.sh, then run again with --resume' : '  → run again with --resume to continue the same capture');
    process.exit(1);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
