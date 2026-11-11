/**
 * Step 25: The production verifier — parity on every settled round, and the result cap (profiles LIMBO-17, LIMBO-24).
 *
 * LIQD publishes a verifier: POST https://liqd.com/api/v1/originals/limbo/verify takes a revealed server
 * seed, a client seed, a nonce and a target and returns the result, the win flag and the multiplier. It
 * answers logged out. Two bodies of production evidence are scored here:
 *
 *  (A) PARITY ON EVERY SETTLED ROUND. After each run the runner sent every round's revealed inputs to the
 *      verifier and stored the reply; the dataset carries it on the bet (`verifier`). For every bet the
 *      request must BE the round (the epoch's revealed seed, the round's client seed, nonce and target),
 *      the reply must echo it, and the reply's result / win / multiplier must equal the settled round AND
 *      this package's own recomputation. So the page a player would use to check a bet gives the answer
 *      the casino settled on and the answer src/ computes, on all 5,838 rounds.
 *
 *  (B) THE RESULT CAP. No settled round reached 1,000,000x (probability 99/1e8 per round). On 9 November
 *      2026 the auditor searched the 25 revealed Phase A seeds offline for nonces whose draw is at or near
 *      the cap and sent six requests on them to the verifier, logged out, no bet (evidence/E02, kept as
 *      received and pinned). Each record is recomputed here from src/: the seed must be a revealed seed of
 *      the dataset used with its own client seed, the draw and the capped result are recomputed, and the
 *      casino's reply must equal them. On the requests whose raw value is ABOVE the cap only a capped model
 *      reproduces the reply. The step COUNTS the requests and the distinct draws (seed, client seed, nonce)
 *      they cover: two of the six requests are the same draw sent at two targets, so the four requests
 *      above the cap are three distinct draws.
 *
 * WHAT (B) IS NOT. A verifier observation. It shows what the verifier reports, not that a bet settling on
 * such a draw would be paid by the same rule; no settled production round is at the cap (limitation L4).
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';

import type { StepResult, VerifyContext } from './context';
import { step, servedResultMatches } from './context';
import { limboDraw, commitHash } from '../../src/rng';
import {
  resultMultiplier, limboWin, epochSize,
  EXPECTED_BETS, MAX_MULTIPLIER, MIN_RESULT, RESULT_NUMERATOR, MULTIPLIER_SCALE,
  CAP_PROBE_DIR, CAP_PROBE_RECORDS, CAP_PROBE_RECORDS_SHA256, CAP_PROBE_EXPECTED, CAP_PROBE_DISCRIMINATING,
  CAP_PROBE_DISCRIMINATING_DRAWS,
} from '../../src/config';

export const STEP_NUMBER = 25;
export const STEP_NAME = 'Production Verifier Parity & Result Cap';
const VERIFY_URL = 'https://liqd.com/api/v1/originals/limbo/verify';

interface VerifierField {
  status?: number; date?: string;
  request?: { serverSeed?: string; clientSeed?: string; nonce?: number; target?: number };
  echo?: { clientSeed?: string; nonce?: number; target?: number };
  result?: number; win?: boolean; multiplier?: number;
}

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, seeds, seedMap } = ctx;
  const bad: string[] = [];

  // ── (A) parity on every settled round ─────────────────────────────────────────────────────────
  let present = 0, requestIsRound = 0, echoOk = 0, equalsServed = 0, equalsModel = 0;
  let ties = 0, tieWins = 0, floors = 0, floorLosses = 0;
  let firstBad = '';
  for (const b of bets) {
    const v = (b as unknown as { verifier?: VerifierField }).verifier;
    if (!v || v.status !== 200 || !v.request) continue;
    present++;
    const ss = seedMap.get(b.hashedServerSeed);
    const target = Number(b.params.target);
    const reqOk = !!ss && v.request.serverSeed === ss && v.request.clientSeed === b.clientSeed && v.request.nonce === b.nonce && v.request.target === target;
    if (reqOk) requestIsRound++;
    if (v.echo?.clientSeed === b.clientSeed && v.echo?.nonce === b.nonce && v.echo?.target === target) echoOk++;
    const servedOk = servedResultMatches(Number(v.result), Number(b.result)) && v.win === b.win && v.multiplier === b.multiplier;
    if (servedOk) equalsServed++;
    let modelOk = false;
    if (ss) {
      const R = resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce));
      const win = limboWin(R, target);
      modelOk = servedResultMatches(Number(v.result), R) && v.win === win && v.multiplier === (win ? target : 0);
      if (R === target) { ties++; if (v.win === true) tieWins++; }
      if (R === MIN_RESULT) { floors++; if (v.win === false) floorLosses++; }
    }
    if (modelOk) equalsModel++;
    if (!(reqOk && servedOk && modelOk) && !firstBad) firstBad = `epoch ${b.epoch} nonce ${b.nonce}: verifier ${v.result}/${v.win}/${v.multiplier} vs served ${b.result}/${b.win}/${b.multiplier}`;
  }
  const parityOk = present === EXPECTED_BETS && requestIsRound === EXPECTED_BETS && echoOk === EXPECTED_BETS
    && equalsServed === EXPECTED_BETS && equalsModel === EXPECTED_BETS && ties > 0 && tieWins === ties && floors > 0 && floorLosses === floors;
  if (!parityOk) bad.push(`verifier parity incomplete${firstBad ? ` (e.g. ${firstBad})` : ''}`);

  // ── (B) the result cap, from the pinned probe records ─────────────────────────────────────────
  const recPath = path.join(ctx.repoRoot, CAP_PROBE_DIR, CAP_PROBE_RECORDS);
  let capNote = `${CAP_PROBE_DIR}/${CAP_PROBE_RECORDS} ABSENT`;
  let capOk = false;
  if (fs.existsSync(recPath)) {
    const raw = fs.readFileSync(recPath);
    const pinOk = createHash('sha256').update(raw).digest('hex') === CAP_PROBE_RECORDS_SHA256;
    type Rec = { id?: string; status?: number; request?: { method?: string; url?: string; body?: string }; body?: string; headers?: { date?: string } };
    let recs: Rec[] = [];
    let parseOk = true;
    try { recs = raw.toString('utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Rec); } catch { parseOk = false; }
    const seedByValue = new Map(seeds.filter((s) => s.serverSeed).map((s) => [s.serverSeed as string, s]));
    let ok = 0, atCap = 0, rawAbove = 0, rawExactly = 0, justUnder = 0, unsettled = 0, settledControl = 0;
    // distinct draws: one key per (server seed, client seed, nonce); a draw sent at two targets is one draw
    const drawsUnsettled = new Set<string>(), drawsAtCap = new Set<string>(), drawsAbove = new Set<string>();
    const lines: string[] = [];
    const dates = new Set<string>();
    for (const r of recs) {
      let q: { serverSeed?: string; clientSeed?: string; nonce?: number; params?: { target?: number } } = {};
      let o: { result?: number; win?: boolean; multiplier?: number } = {};
      try { q = JSON.parse(r.request?.body ?? '{}'); o = (JSON.parse(r.body ?? '{}') as { outcome?: typeof o }).outcome ?? {}; } catch { /* counted as not ok below */ }
      const s = seedByValue.get(String(q.serverSeed));
      const target = Number(q.params?.target);
      const tied = !!s && commitHash(String(q.serverSeed)) === s.hashedServerSeed && q.clientSeed === s.clientSeed && Number.isInteger(q.nonce) && (q.nonce as number) >= 0;
      if (!tied) { lines.push(`${r.id}: NOT a revealed seed of the dataset under its own client seed`); continue; }
      const k = limboDraw(String(q.serverSeed), String(q.clientSeed), q.nonce as number);
      const rawValue = Math.floor(RESULT_NUMERATOR / (k + 1)) / MULTIPLIER_SCALE;
      const R = resultMultiplier(k);
      const win = limboWin(R, target);
      const replyOk = r.status === 200 && r.request?.method === 'POST' && r.request?.url === VERIFY_URL
        && servedResultMatches(Number(o.result), R) && o.win === win && o.multiplier === (win ? target : 0);
      if (replyOk) ok++;
      if (r.headers?.date) dates.add(String(r.headers.date).slice(5, 16));
      const isSettled = (q.nonce as number) < epochSize(s.epoch);
      if (isSettled) {
        const round = bets.find((b) => b.epoch === s.epoch && b.nonce === q.nonce);
        if (round && Number(round.result) === R && Number(round.params.target) === target) settledControl++;
      } else unsettled++;
      const drawKey = `${q.serverSeed}|${q.clientSeed}|${q.nonce}`;
      if (!isSettled) drawsUnsettled.add(drawKey);
      if (!isSettled && R === MAX_MULTIPLIER) { atCap++; drawsAtCap.add(drawKey); if (rawValue > MAX_MULTIPLIER) { rawAbove++; drawsAbove.add(drawKey); } else if (rawValue === MAX_MULTIPLIER) rawExactly++; }
      if (!isSettled && R < MAX_MULTIPLIER) justUnder++;
      lines.push(`${r.id}: epoch ${s.epoch} nonce ${q.nonce} target ${target}x, draw k = ${k}, raw value ${rawValue}, model ${R}x; casino replied ${o.result}x win ${o.win} multiplier ${o.multiplier} (${replyOk ? 'equal' : 'DIFFERENT'})`);
    }
    capOk = pinOk && parseOk && recs.length === CAP_PROBE_EXPECTED && ok === CAP_PROBE_EXPECTED
      && rawAbove === CAP_PROBE_DISCRIMINATING && drawsAbove.size === CAP_PROBE_DISCRIMINATING_DRAWS && rawExactly >= 1 && justUnder >= 1 && settledControl === 1 && unsettled === CAP_PROBE_EXPECTED - 1;
    capNote = `${CAP_PROBE_DIR}/${CAP_PROBE_RECORDS} (${pinOk ? 'matches its pin' : 'PIN MISMATCH'}; replies dated ${[...dates].join(', ')}): ${recs.length}/${CAP_PROBE_EXPECTED} records, every one an HTTP 200 reply of ${VERIFY_URL} to a revealed seed of this dataset under its own client seed; `
      + `${ok}/${CAP_PROBE_EXPECTED} replies equal the recomputation from src/ (result, win, multiplier). `
      + `${settledControl} is a settled round sent again as a transport check; ${unsettled} are requests on ${drawsUnsettled.size} distinct draws (seed, client seed, nonce) the capture never played, chosen by the auditor's offline search of the Phase A seeds for draws at and around the cap (the search itself is not part of this package; each probe is recomputed here): `
      + `${atCap} requests on ${drawsAtCap.size} distinct draws recompute to the ${MAX_MULTIPLIER}x cap, of which ${rawAbove} requests on ${drawsAbove.size} distinct draws have a raw value ABOVE the cap (only a capped model reproduces the casino's ${MAX_MULTIPLIER}) and ${rawExactly} a raw value of exactly ${MAX_MULTIPLIER}; ${justUnder} is a control just under the cap, reported uncapped. `
      + `[${lines.join(' | ')}]`;
  }
  if (!capOk) bad.push('result-cap probe set not reproduced');

  const detail = `PARITY, every settled round (denominator EXPECTED_BETS from src/config.ts — G-BIND): ${present}/${EXPECTED_BETS} bets carry an HTTP 200 reply of the production verifier (POST ${VERIFY_URL}); `
    + `the request is the round itself (the epoch's revealed server seed, the round's client seed, nonce and target) on ${requestIsRound}/${EXPECTED_BETS} and the reply echoes it on ${echoOk}/${EXPECTED_BETS}; `
    + `the verifier's result, win flag and multiplier equal the SETTLED round on ${equalsServed}/${EXPECTED_BETS} and this package's own recomputation on ${equalsModel}/${EXPECTED_BETS}. `
    + `BOUNDARY WITNESSES IN THE VERIFIER (profile LIMBO-17): ${ties} rounds whose result equals the target exactly, the verifier says WIN on ${tieWins}; ${floors} rounds at the ${MIN_RESULT}x result floor, the verifier says LOSS on ${floorLosses}. `
    + `RESULT CAP (verifier only; no settled round reached it): ${capNote}. `
    + `NOT SHOWN by the cap probes: that a bet settling on such a draw is paid by the same rule (L4)`
    + (bad.length ? ` — FAILURES: ${bad.join('; ')}` : '');
  return [step(STEP_NUMBER, STEP_NAME, bad.length === 0 ? 'PASS' : 'FAIL', detail)];
}
