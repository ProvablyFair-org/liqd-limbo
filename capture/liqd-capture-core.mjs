// ============================================================================
//  liqd-capture-core.mjs — shared engine of the LIQD capture scripts written 2026-09-26
//  (keno capture-keno-v2.mjs, mines capture-mines-v3.mjs, limbo capture-limbo-v2.mjs).
//  The SAME file sits in each package's capture/ folder, byte for byte, so each package stays
//  standalone. Nothing here knows a game; the game scripts supply the plan, the bet call and the
//  capture-time recomputation.
//
//  What the engine guarantees, for every capture built on it:
//   * PRE-CAPTURE ANCHOR — the first two requests are an `active` read (active hash AND next hash
//     recorded) and a rotation that reveals that active seed, both before any bet. No next hash, or a
//     game still in progress → abort before a single bet.
//   * CSPRNG CLIENT SEEDS — every non-player seed is `audit` + crypto.randomBytes(6) hex, drawn AFTER
//     the commitment it will be used under was published, and each seed record names its generator,
//     whether it is predictable, and the commitment it was drawn after.
//   * DECLARED EPOCHS — each epoch is closed by a rotation after exactly its planned bet count; the
//     rotation response is kept raw; nonceStart / nonceEnd are recorded per rotation.
//   * CREDENTIAL SCRUBBING — the cookie lives only in the environment of the Python transport
//     (never argv, never a file). Every line written is scrubbed of secret-looking keys and then
//     checked against the cookie's own values and a JWT pattern; a hit ABORTS the write.
//   * RESUME — every event is journalled (NDJSON, append-only) before and after each request, so a
//     crash, a Ctrl-C or an expired cookie loses nothing: `--resume` continues the same capture.
// ============================================================================
import { execFile, execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

export const API_BASE_DEFAULT = 'https://qa.liqd.com/api/v1';
export const CORE_VERSION = 'liqd-capture-core 2026-09-26';

// ── Client seeds ────────────────────────────────────────────────────────────────
export const AUDIT_SEED_GENERATOR = '"audit" + crypto.randomBytes(6).toString("hex")  (node:crypto CSPRNG)';
export const newAuditSeed = () => `audit${randomBytes(6).toString('hex')}`;
export const AUDIT_SEED_RE = /^audit[0-9a-f]{12}$/;

// ── Small helpers ───────────────────────────────────────────────────────────────
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const now = () => new Date().toISOString();
export const commitHash = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const stake8 = (n) => Number(n).toFixed(8);
export const pick = (o, ...k) => { for (const x of k) if (o && o[x] != null) return o[x]; return undefined; };
export const seedState = (a) => ({
  hashedServerSeed: pick(a, 'activeServerSeedHash', 'hashedServerSeed'),
  nextHashedServerSeed: pick(a, 'nextServerSeedHash', 'nextHashedServerSeed'),
  clientSeed: pick(a, 'clientSeed', 'activeClientSeed'),
  nonce: pick(a, 'nonce'),
  revealedServerSeed: pick(a, 'revealedServerSeed', 'serverSeed'),
  gamesInProgress: pick(a, 'gamesInProgress'),
});

// ── Credential scrubbing ────────────────────────────────────────────────────────
// Keys dropped from anything written. Deliberately broad: a dropped non-secret field costs nothing,
// a kept secret costs everything. No provably-fair field matches it (serverSeed, clientSeed, nonce,
// hashes, idempotencyKey were checked against the pattern in the self-test).
export const SECRET_KEY_RE = /(cookie|authori[sz]ation|token|password|passwd|secret|session|jwt|e-?mail|^cf_|bearer|api[-_]?key)/i;
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./;
export function scrub(v) {
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!SECRET_KEY_RE.test(k)) o[k] = scrub(x);
    return o;
  }
  return v;
}
/** The cookie's own values (≥ 12 chars) — the strings that must never appear in an output file. */
export function secretNeedles(cookie = '') {
  return String(cookie).split(';').map((p) => p.slice(p.indexOf('=') + 1).trim()).filter((x) => x.length >= 12);
}
export function assertClean(text, needles) {
  for (const n of needles) if (text.includes(n)) throw new Error('SCRUBBER: a cookie value reached an output line — write aborted');
  if (JWT_RE.test(text)) throw new Error('SCRUBBER: a JWT-shaped string reached an output line — write aborted');
  return true;
}

// ── Transport: Chrome-TLS via python3 + curl_cffi (qa.liqd.com gates on the TLS fingerprint) ──
export class HttpError extends Error { constructor(m, kind, extra = {}) { super(m); this.kind = kind; Object.assign(this, extra); } }
export function pythonTransport({ reqPy, python = process.env.LIQD_PYTHON || 'python3', referer, timeoutMs = 25000 }) {
  return (method, url, body) => new Promise((resolve, reject) => {
    const child = execFile(python, [reqPy, method, url, referer, String(Math.ceil(timeoutMs / 1000))],
      { env: process.env, maxBuffer: 16 << 20, timeout: timeoutMs + 5000 }, (err, stdout, stderr) => {
        if (err && err.code === 'ENOENT') return reject(new HttpError(`${python} not found`, 'AUTH'));
        if (err && !stdout) return reject(new HttpError('transport ' + (err.killed ? 'timeout' : String(stderr || err.message).slice(0, 120)), 'TRANSIENT'));
        const out = String(stdout); const nl = out.indexOf('\n');
        const status = Number(out.slice(0, nl).trim()); const text = out.slice(nl + 1);
        if (/__NO_CURL_CFFI__/.test(text)) return reject(new HttpError('curl_cffi missing — run:  pip3 install curl_cffi', 'AUTH'));
        if (/__REQ_ERR__/.test(text)) return reject(new HttpError('transport ' + text.slice(0, 120), 'TRANSIENT'));
        resolve({ status, text });
      });
    child.stdin.end(body == null ? '' : JSON.stringify(body));
  });
}

export function makeApi({ transport, base = API_BASE_DEFAULT }) {
  async function http(method, path, body) {
    const { status, text } = await transport(method, base + path, body);
    if (status === 401 || status === 403 || (status >= 300 && status < 400)) throw new HttpError(`${status} auth rejected — re-copy the cURL and re-source set-cookie.sh`, 'AUTH');
    if (/cf-mitigated|Just a moment|__cf_chl|challenge-platform/i.test(text)) throw new HttpError('Cloudflare challenge — Chrome-TLS transport rejected (curl_cffi installed?)', 'AUTH');
    if (/Cloudflare Access|<!DOCTYPE html|<html/i.test(text)) throw new HttpError('Cloudflare Access sign-in page — cookie expired', 'AUTH');
    if (status === 429) throw new HttpError('429 rate limited', 'TRANSIENT', { rateLimited: true });
    if (status >= 500 || status === 0) throw new HttpError(`${status} server error`, 'TRANSIENT');
    let json; try { json = JSON.parse(text); } catch { throw new HttpError(`${status} non-JSON: ${text.slice(0, 120)}`, 'TRANSIENT'); }
    if (json && Array.isArray(json.errors) && json.errors.length) {
      throw new HttpError('api error: ' + JSON.stringify(json.errors).slice(0, 300), 'API', { code: json.errors[0]?.errorCode, raw: json.errors[0], errors: json.errors, status });
    }
    if (status >= 400) throw new HttpError(`${status}: ${text.slice(0, 200)}`, 'API', { status, raw: json });
    return json && json.data !== undefined ? json.data : json;
  }
  return {
    http,
    active: async () => { const raw = await http('GET', '/fast-games/provably-fair/active'); return { raw, ...seedState(raw) }; },
    rotate: async (clientSeed) => { const raw = await http('POST', '/fast-games/provably-fair/rotate', { clientSeed }); return { raw, ...seedState(raw) }; },
  };
}

/** Retries TRANSIENT failures. Only for requests that are safe to repeat (reads, and place-bet calls
 *  that carry the SAME idempotencyKey on every attempt). */
export async function retrying(fn, { label = 'request', max = 40, log = () => {} } = {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); } catch (e) {
      if (e.kind !== 'TRANSIENT' || attempt >= max) throw e;
      const wait = Math.min(2000 * attempt, 30000);
      log(`  ${label}: ${e.message.slice(0, 60)} — retry ${attempt}/${max} in ${Math.round(wait / 1000)}s`);
      await sleep(wait);
    }
  }
}

// ── Journal (append-only NDJSON) and dataset files ───────────────────────────────
export function openJournal(file, needles) {
  return {
    file,
    append(evt) { const line = JSON.stringify(scrub({ at: now(), ...evt })); assertClean(line, needles); appendFileSync(file, line + '\n'); },
    read() { return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; },
  };
}
export function writeJsonClean(file, obj, needles) {
  const text = JSON.stringify(scrub(obj), null, 2);
  assertClean(text, needles);
  writeFileSync(file + '.tmp', text); renameSync(file + '.tmp', file);
}

/** Rebuilds the dataset from the journal — the journal is the record, the JSON is a view of it. */
export function buildDataset(events) {
  const metaEvt = events.find((e) => e.t === 'meta');
  const ds = { meta: { ...(metaEvt?.meta ?? {}), core: CORE_VERSION, startedAt: metaEvt?.at ?? null, finishedAt: null, preCapture: null,
    refusals: [], skippedGroups: [], captureGaps: [], recovered: [] }, seeds: [], bets: [] };
  let open = null;
  for (const e of events) {
    if (e.t === 'pre') ds.meta.preCapture = { at: e.at, hashedServerSeed: e.state.hashedServerSeed, nextHashedServerSeed: e.state.nextHashedServerSeed,
      clientSeed: e.state.clientSeed, nonce: e.state.nonce, activeRaw: e.raw, revealedServerSeed: null, commitVerified: null, anchorLinkOk: null, rotateRaw: null };
    if (e.t === 'rotate') {
      if (e.closes === 'pre') {
        const p = ds.meta.preCapture;
        p.revealedServerSeed = e.state.revealedServerSeed; p.rotateRaw = e.raw;
        p.commitVerified = !!e.state.revealedServerSeed && commitHash(e.state.revealedServerSeed) === p.hashedServerSeed;
        p.anchorLinkOk = p.nextHashedServerSeed === e.state.hashedServerSeed;
      } else {
        const sd = ds.seeds[e.closes];
        sd.serverSeed = e.state.revealedServerSeed; sd.rotateRaw = e.raw; sd.closedAt = e.at;
        sd.commitVerified = !!sd.serverSeed && commitHash(sd.serverSeed) === sd.hashedServerSeed;
        sd.chainLinkOk = sd.nextHashedServerSeed === e.state.hashedServerSeed;
        const nb = ds.bets.filter((b) => b.epoch === e.closes);
        sd.bets = nb.length; sd.nonceEnd = nb.length ? nb[nb.length - 1].nonce : null;
      }
      open = { state: e.state, submitted: e.submitted, seedMeta: e.seedMeta, drawnAfter: e.drawnAfter };
    }
    if (e.t === 'epoch') {
      ds.seeds[e.epoch] = { epoch: e.epoch, phase: e.phase, group: e.group ?? null, openedAt: e.at, plannedBets: e.plannedBets,
        clientSeed: open.state.clientSeed, clientSeedSubmitted: open.submitted, clientSeedGenerator: open.seedMeta?.generator ?? null,
        clientSeedPredictable: open.seedMeta?.predictable ?? null, clientSeedDrawnAfterCommitment: open.drawnAfter ?? null,
        clientSeedAccepted: open.state.clientSeed === open.submitted,
        hashedServerSeed: open.state.hashedServerSeed, nextHashedServerSeed: open.state.nextHashedServerSeed,
        serverSeed: null, nonceStart: open.state.nonce ?? null, nonceEnd: null, bets: 0, commitVerified: null, chainLinkOk: null };
    }
    if (e.t === 'bet') ds.bets.push(e.rec);
    if (e.t === 'refusal') ds.meta.refusals.push(e);
    if (e.t === 'skip-group') ds.meta.skippedGroups.push({ group: e.group, epochsSkipped: e.epochsSkipped, reason: e.reason });
    if (e.t === 'gap') ds.meta.captureGaps.push(e);
    if (e.t === 'recovered') ds.meta.recovered.push(e);
    if (e.t === 'done') ds.meta.finishedAt = e.at;
    if (e.t === 'witness') (ds.meta.witnesses ??= []).push(e);
  }
  return ds;
}

// ── Console I/O for browser-assisted epochs ──────────────────────────────────────
export function waitForEnter(prompt) {
  return new Promise((resolve) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); rl.question(prompt, (a) => { rl.close(); resolve(a); }); });
}
export function readClipboard() { return execFileSync('pbpaste', { encoding: 'utf8', maxBuffer: 64 << 20 }); }


// ── Terminal UI: live progress bar + coloured epoch lines (same look as the limbo reference rig) ──
const isTTY = !!process.stdout.isTTY;
const C = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', gray: '\x1b[90m', green: '\x1b[92m', cyan: '\x1b[96m', mag: '\x1b[95m', yellow: '\x1b[93m', blue: '\x1b[94m', red: '\x1b[91m', orange: '\x1b[38;5;208m' };
const paint = (c, t) => (isTTY ? c + t + C.reset : t);
const strip = (t) => t.replace(/\x1b\[[0-9;]*m/g, '');
const CLR = '\r\x1b[2K';
const comma = (n) => Number(n).toLocaleString('en-US');
export function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60; return h ? `${h}h${String(m).padStart(2, '0')}m` : m ? `${m}m${String(x).padStart(2, '0')}s` : `${x}s`; }
function smoothBar(frac, width) { frac = Math.max(0, Math.min(1, frac)); const parts = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']; const exact = frac * width, full = Math.floor(exact), partial = parts[Math.floor((exact - full) * 8)] || ''; const empty = Math.max(0, width - full - (partial ? 1 : 0)); return C.green + '█'.repeat(full) + partial + C.reset + C.gray + '·'.repeat(empty) + C.reset; }
const PHASE_COLOR = { A: C.cyan, B: C.mag, C: C.yellow, D: C.blue, E: C.orange, P: C.orange, probe: C.cyan };
const phaseBadge = (p) => paint((PHASE_COLOR[String(p)[0]] || C.cyan) + C.bold, `[${p}]`);
/** Colour an epoch verdict line: OK green, FAIL/BAD red — or yellow when the group is a declared open question. */
export function colourVerdicts(line, { expectedBad = false } = {}) {
  if (!isTTY) return line;
  return line.replace(/\bOK\b/g, C.green + 'OK' + C.reset)
    .replace(/\b(\d+ )?(BAD|FAIL)\b/g, (m) => (expectedBad ? C.yellow : C.red + C.bold) + m + C.reset);
}
export function makeProgress({ total, title }) {
  let done = 0, t0 = Date.now(), base = 0, lastDraw = 0, phase = '', label = '', lastLine = '';
  const api = {
    start(already = 0) { done = base = already; t0 = Date.now(); },
    header(lines) { console.log(''); console.log(paint(C.bold + C.cyan, `  ${title}`)); for (const l of lines) console.log(paint(C.gray, `  ${l}`)); console.log(''); },
    log(msg) { if (isTTY) process.stdout.write(CLR); console.log(msg); api.draw(true); },
    set(p, l) { phase = p; label = l; },
    tick(last = '') { done++; lastLine = last; api.draw(); },
    draw(force = false) {
      const t = Date.now(); if (!force && t - lastDraw < 80 && done < total) return; lastDraw = t;
      const el = (t - t0) / 1000, rate = el > 0 ? (done - base) / el : 0, eta = rate > 0 ? (total - done) / rate : 0;
      const frac = total ? done / total : 0, pct = (frac * 100).toFixed(1) + '%';
      if (!isTTY) { if (done % 100 === 0 || done === total) console.log(`${pct}  ${done}/${total}  [${phase}] ${label}  ${rate.toFixed(1)}/s  ETA ${fmtTime(eta)}`); return; }
      const left = `${phaseBadge(phase || '·')} ${C.bold}${pct.padStart(6)}${C.reset} ${C.gray}${comma(done)}/${comma(total)}${C.reset} `;
      const meta = `${C.dim}${label}  ${rate.toFixed(1)}/s  ${fmtTime(el)}${C.reset}${C.gray} · ETA ${C.reset}${C.dim}${fmtTime(eta)}${C.reset}`;
      let drop = lastLine ? `  ${C.gray}${lastLine}${C.reset}` : '', w = (process.stdout.columns || 100) - 1;
      let barW = w - strip(left).length - strip(meta).length - strip(drop).length - 3;
      if (barW < 12) { drop = ''; barW = w - strip(left).length - strip(meta).length - 3; }
      process.stdout.write(`${CLR}${left}${smoothBar(frac, Math.max(8, barW))}  ${meta}${drop}`);
    },
    end() { if (isTTY) process.stdout.write(CLR); },
    summary(title2, rows, good) {
      const w = Math.max(title2.length, ...rows.map((r) => strip(r).length)) + 4, bar = '─'.repeat(w);
      const col = good ? C.green : C.red;
      console.log(paint(col, `  ┌${bar}┐`)); console.log(paint(col, '  │ ') + paint(C.bold, title2.padEnd(w - 2)) + paint(col, ' │'));
      console.log(paint(col, `  ├${bar}┤`)); for (const r of rows) console.log(paint(col, '  │ ') + r + ' '.repeat(Math.max(0, w - 2 - strip(r).length)) + paint(col, ' │'));
      console.log(paint(col, `  └${bar}┘`));
    },
  };
  return api;
}

// ── The runner ─────────────────────────────────────────────────────────────────
/**
 * plan: [{ phase, group?, seed: { tag:'audit' } | { tag:'player', value, predictable:true }, bets:[spec...] , browser?:true }]
 * game: { name, play(spec, ctx) → rec, recover?(intent, ctx) → rec|null, verifyEpoch(seedRec, bets) → string,
 *         refusalSkipsGroup?(err, spec) → bool, browserEpoch?(epc, ctx) → rec[] , probeReport?(ds) → string }
 */
export async function runCapture({ api, game, plan, meta, outDir, runName, resumeFile = null, needles, log = console.log,
  betDelayMs = 0, rotateDelayMs = 0, stopFlag = { stop: false }, progress = null, expectedBadGroups = [] }) {
  mkdirSync(outDir, { recursive: true });
  let journal, events, E = 0, seqInEpoch = 0, planPos = 0, cur, epochOpen = false, lastIntent = null;
  const skipped = new Set();

  if (resumeFile) {
    journal = openJournal(resumeFile, needles);
    events = journal.read();
    const m = events.find((e) => e.t === 'meta');
    if (!m) throw new Error('resume: journal has no meta event');
    if (events.some((e) => e.t === 'done')) throw new Error('resume: that capture already finished');
    plan = m.meta.plan;               // the plan is fixed at the start and never re-drawn
    for (const e of events) if (e.t === 'skip-group') skipped.add(e.group);
    const rots = events.filter((e) => e.t === 'rotate');
    const lastRot = rots[rots.length - 1];
    if (!lastRot) throw new Error('resume: no rotation journalled yet — start a fresh capture instead');
    cur = { ...lastRot.state, submitted: lastRot.submitted, seedMeta: lastRot.seedMeta };
    const epochEvts = events.filter((e) => e.t === 'epoch');
    const lastEp = epochEvts[epochEvts.length - 1];
    const closed = rots.filter((r) => r.closes !== 'pre').length;
    E = closed;
    planPos = lastRot.closes === 'pre' ? 0 : (events.filter((e) => e.t === 'rotate' && e.closes !== 'pre').pop().planPos + 1);
    const lastEpSkipped = lastEp && plan[lastEp.planPos]?.group && skipped.has(plan[lastEp.planPos].group);
    if (lastEp && lastEp.epoch === closed && !lastEpSkipped) {          // an epoch is open
      epochOpen = true; planPos = lastEp.planPos;
      const betsIn = events.filter((e) => e.t === 'bet' && e.rec.epoch === closed);
      seqInEpoch = betsIn.length;
      const lastBetIdx = events.map((e) => e.t).lastIndexOf('bet');
      const intents = events.filter((e, i) => e.t === 'intent' && i > lastBetIdx && e.epoch === closed);
      lastIntent = intents[intents.length - 1] ?? null;
    }
    const act = await retrying(() => api.active(), { label: 'active', log });
    journal.append({ t: 'resume-check', state: { hashedServerSeed: act.hashedServerSeed, nonce: act.nonce, gamesInProgress: act.gamesInProgress }, raw: act.raw });
    if (act.hashedServerSeed !== cur.hashedServerSeed) throw new Error('resume: the active seed is not the one this capture opened — something rotated it outside the run; start a fresh capture');
    if (lastIntent && game.recover) {
      const rec = await game.recover(lastIntent, { api, journal, epoch: E, seq: seqInEpoch, phase: plan[planPos]?.phase, clientSeed: cur.clientSeed, hashedServerSeed: cur.hashedServerSeed, active: act, log });
      if (rec) { journal.append({ t: 'recovered', epoch: E, seq: seqInEpoch, intent: lastIntent.key ?? null }); journal.append({ t: 'bet', rec }); seqInEpoch++; }
    }
    const act2 = await retrying(() => api.active(), { label: 'active', log });
    if (Number.isFinite(act2.nonce) && act2.nonce > seqInEpoch + (cur.nonce ?? 0)) {
      for (let n = seqInEpoch + (cur.nonce ?? 0); n < act2.nonce; n++) journal.append({ t: 'gap', epoch: E, nonce: n, origin: 'capture', note: 'nonce consumed by a request whose response the capture did not record (crash / network) — auditor-side' });
      seqInEpoch = act2.nonce - (cur.nonce ?? 0);
    }
    log(`Resumed ${resumeFile}: epoch ${E}, ${seqInEpoch} bets already in it.`);
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    journal = openJournal(join(outDir, `${runName}-${stamp}.journal.ndjson`), needles);
    events = [];
    journal.append({ t: 'meta', meta: { ...meta, plan } });
    // PRE-CAPTURE ANCHOR — before any bet.
    const pre = await retrying(() => api.active(), { label: 'active', log });
    journal.append({ t: 'pre', state: { hashedServerSeed: pre.hashedServerSeed, nextHashedServerSeed: pre.nextHashedServerSeed, clientSeed: pre.clientSeed, nonce: pre.nonce }, raw: pre.raw });
    if (!pre.hashedServerSeed || !pre.nextHashedServerSeed) throw new HttpError('ABORT before any bet: the operator exposed no active/next hash — the pre-capture anchor cannot be recorded', 'ABORT');
    if (Array.isArray(pre.gamesInProgress) && pre.gamesInProgress.length) throw new HttpError('ABORT before any bet: a game is still in progress on this account — finish it in the browser first', 'ABORT');
    const first = firstPlayable(plan, 0, skipped);
    const s = seedFor(first === -1 ? null : plan[first]);
    const rot = await safeRotate(api, pre.hashedServerSeed, s.value, log);
    journal.append({ t: 'rotate', closes: 'pre', planPos: -1, submitted: s.value, seedMeta: s.meta, drawnAfter: pre.nextHashedServerSeed, state: stateOf(rot), raw: rot.raw });
    cur = { ...stateOf(rot), submitted: s.value, seedMeta: s.meta };
    log(`pre-capture anchor: active ${short(pre.hashedServerSeed)} next ${short(pre.nextHashedServerSeed)} → revealed, commit ${commitHash(rot.revealedServerSeed ?? '') === pre.hashedServerSeed ? 'OK' : 'FAIL'}, link ${pre.nextHashedServerSeed === rot.hashedServerSeed ? 'OK' : 'FAIL'}`);
  }

  progress?.start(journal.read().filter((e) => e.t === 'bet').length);
  // ── epochs ──
  for (; planPos < plan.length; planPos++) {
    const epc = plan[planPos];
    if (epc.group && skipped.has(epc.group)) continue;
    if (stopFlag.stop) break;
    if (!epochOpen) { journal.append({ t: 'epoch', epoch: E, planPos, phase: epc.phase, group: epc.group ?? null, plannedBets: epc.browser ? epc.plannedBets : epc.bets.length }); seqInEpoch = 0; }
    epochOpen = false;
    progress?.set(epc.phase, `epoch ${E}${epc.group ? ' · ' + epc.group : ''}`);
    const ctx = () => ({ api, journal, epoch: E, seq: seqInEpoch, phase: epc.phase, clientSeed: cur.clientSeed, hashedServerSeed: cur.hashedServerSeed, log });
    let groupSkipped = false;
    if (epc.browser) {
      if (seqInEpoch === 0) {
        const recs = await game.browserEpoch(epc, ctx());
        for (const rec of recs) { journal.append({ t: 'bet', rec }); seqInEpoch++; progress?.tick(); }
      }
    } else {
      for (; seqInEpoch < epc.bets.length; ) {
        if (stopFlag.stop) break;
        const spec = epc.bets[seqInEpoch];
        let rec;
        try { rec = await game.play(spec, ctx()); } catch (e) {
          if (e.kind === 'API' && seqInEpoch === 0 && epc.group && game.refusalSkipsGroup?.(e, spec)) {
            const act = await retrying(() => api.active(), { label: 'active', log });
            journal.append({ t: 'refusal', epoch: E, spec, code: e.code ?? null, error: e.raw ?? e.message, activeNonceAfter: act.nonce, nonceConsumed: act.nonce !== cur.nonce });
            const n = plan.filter((p) => p.group === epc.group).length;
            journal.append({ t: 'skip-group', group: epc.group, epochsSkipped: n, reason: `operator refused the first bet of group ${epc.group} (errorCode ${e.code ?? '?'})` });
            skipped.add(epc.group); groupSkipped = true;
            log(`  group ${epc.group} REFUSED by the operator (code ${e.code ?? '?'}) — recorded as a witness, its ${n} epochs skipped; the open seed carries on`);
            break;
          }
          throw e;
        }
        journal.append({ t: 'bet', rec }); seqInEpoch++;
        progress?.tick(rec?.hits != null ? `${rec.mode ?? ''} ${rec.hits} hit${rec.hits === 1 ? '' : 's'} ×${rec.multiplier ?? '?'}` : '');
        if (betDelayMs) await sleep(betDelayMs);
      }
    }
    if (groupSkipped) continue;   // no bet consumed the open seed: epoch E carries on with the next plan entry (the builder overwrites seeds[E])
    if (stopFlag.stop && seqInEpoch < (epc.browser ? 1 : epc.bets.length)) break;
    // CLOSE THE EPOCH — rotate, which reveals this epoch's seed; the next seed is drawn now, after
    // the commitment for the next epoch (this epoch's nextHashedServerSeed) was published.
    await sleep(rotateDelayMs);
    const nxt = firstPlayable(plan, planPos + 1, skipped);
    const s = seedFor(nxt === -1 ? null : plan[nxt]);
    const rot = await safeRotate(api, cur.hashedServerSeed, s.value, log, (m) => journal.append({ t: 'gap', epoch: E, origin: 'capture', note: m }));
    journal.append({ t: 'rotate', closes: E, planPos, submitted: s.value, seedMeta: s.meta, drawnAfter: cur.nextHashedServerSeed, state: stateOf(rot), raw: rot.raw });
    const ds = buildDataset(journal.read());
    const sd = ds.seeds[E];
    const line = game.verifyEpoch(sd, ds.bets.filter((b) => b.epoch === E));
    log(colourVerdicts(`epoch ${E} [${epc.phase}${epc.group ? '/' + epc.group : ''}] ${sd.bets} bets  commit ${sd.commitVerified ? 'OK' : 'FAIL'}  chain ${sd.chainLinkOk ? 'OK' : 'FAIL'}  ${line}`, { expectedBad: !!epc.group && expectedBadGroups.includes(epc.group) }));
    writeJsonClean(journal.file.replace(/\.journal\.ndjson$/, '.json'), ds, needles);
    cur = { ...stateOf(rot), submitted: s.value, seedMeta: s.meta };
    E++;
  }
  const finished = planPos >= plan.length && !stopFlag.stop;
  if (finished) journal.append({ t: 'done' });
  const ds = buildDataset(journal.read());
  const outFile = journal.file.replace(/\.journal\.ndjson$/, '.json');
  writeJsonClean(outFile, ds, needles);
  return { ds, outFile, journalFile: journal.file, finished };
}
/** A rotation is NOT safe to repeat blindly: if the first attempt went through and only its response
 *  was lost, a second one would retire the NEXT seed too. So on a transient failure the active hash is
 *  read first, and the rotation is re-sent only if the seed it was meant to retire is still active. */
export async function safeRotate(api, expectActiveHash, clientSeed, log = () => {}, onLost = () => {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await api.rotate(clientSeed); } catch (e) {
      if (e.kind !== 'TRANSIENT' || attempt >= 20) throw e;
      log(`  rotate: ${e.message.slice(0, 60)} — checking whether it went through`);
      await sleep(Math.min(2000 * attempt, 20000));
      const act = await retrying(() => api.active(), { label: 'active', log });
      if (act.hashedServerSeed !== expectActiveHash) {
        const m = `rotation away from ${expectActiveHash} went through but its response (the revealed seed) was lost in transit`;
        onLost(m);
        throw new HttpError(`ABORT: ${m}. Stop here and tell the auditor; do not re-run.`, 'ABORT');
      }
    }
  }
}
const short = (h) => (h ? String(h).slice(0, 10) + '…' : String(h));
const stateOf = (r) => ({ hashedServerSeed: r.hashedServerSeed, nextHashedServerSeed: r.nextHashedServerSeed, clientSeed: r.clientSeed, nonce: r.nonce, revealedServerSeed: r.revealedServerSeed });
function firstPlayable(plan, from, skipped) { for (let i = from; i < plan.length; i++) if (!(plan[i].group && skipped.has(plan[i].group))) return i; return -1; }
/** The seed submitted with a rotation is the NEXT epoch's client seed. Drawn here, at rotation time. */
function seedFor(epc) {
  if (epc && epc.seed?.tag === 'player') return { value: epc.seed.value, meta: { generator: 'player-set literal (Phase D) — PREDICTABLE, disclosed', predictable: true } };
  return { value: newAuditSeed(), meta: { generator: AUDIT_SEED_GENERATOR, predictable: false } };
}

/** Latest unfinished journal in outDir whose name starts with runName (for --resume without a path). */
export function latestJournal(outDir, runName) {
  if (!existsSync(outDir)) return null;
  // A full run must never pick up a probe's journal: '<run>-probe-…' also starts with '<run>-', and sorts after
  // '<run>-2026-…' — resume then found the finished probe (2026-09-26, limbo). Exclude probes unless asked for one,
  // and take the most recently written journal.
  const isProbeRun = runName.endsWith('-probe');
  const f = readdirSync(outDir).filter((x) => x.startsWith(runName + '-') && x.endsWith('.journal.ndjson') && (isProbeRun || !x.startsWith(runName + '-probe-')))
    .map((x) => ({ x, t: statSync(join(outDir, x)).mtimeMs })).sort((a, b) => a.t - b.t).map((o) => o.x);
  return f.length ? join(outDir, f[f.length - 1]) : null;
}

/** Standard CLI flags shared by the three scripts. */
export function parseFlags(argv) {
  const get = (n, d) => { const h = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (!h) return d; const i = h.indexOf('='); return i === -1 ? true : h.slice(i + 1); };
  return { get, plan: !!get('plan', false), probe: !!get('probe', false), resume: get('resume', false) };
}
