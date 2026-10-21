#!/usr/bin/env node
// ============================================================================
//  LIQD Limbo — terminal capture rig  (single-step settlement)
//  Run by the auditor:  source ./set-cookie.sh  &&  npm run probe  →  npm run capture
// ============================================================================
//
//  Standard PF.org formula-game capture — 6,700 bets, 50/seed (matches Dice).
//  Executed phase plan (as encoded in buildEpochs() below and recorded in the dataset):
//    Phase A  5,000  $0.10  random targets across the win-chance range (edge-curve sweep)
//    Phase B  1,000  $0.10  high-multiplier tail — 100× / 1,000× / 100,000× / 1,000,000× (cap)
//    Phase C    200  $10    stake independence (target 2.00×, 100× stake)
//    Phase D    500  $0.10  custom client-seed variation (pfaudit-…)
//    ────────  6,700 total · 134 epochs
//
//  Limbo model (reverse-engineered 2026-09-07 from the operator's client bundle + confirmed
//  against LIQD's own /api/v1/originals/limbo/verify over 4 live vectors; the audit's binding
//  anchor is the money-settled dataset recomputed under the commitment chain):
//    k = generateProvablyFairNumber(serverSeed, clientSeed, nonce, cursor=0, 1e8)  ∈ [0, 1e8)
//    R = min(1e6, floor(9.9e9 / (k+1)) / 100)                 // RESULT (crash) multiplier
//    win = R >= target                                        // ASSUMED ≥; witnessed via /verify boundary probe
//    winChance(target) = floor(9.9e9 / round(100·target)) / 1e8   ( ≈ 0.99/target )
//    payout on win = stake · target ;  house edge = 1 − winChance·target  (≥ 1.00%, closed-form)
//
//  The ≥-vs-> win boundary is NOT assumed silently: runProbe() calls the operator's /verify
//  with target set EXACTLY to a revealed round's own R (equality) and to R+0.01 (just above),
//  retaining the raw responses in outputs/ as the boundary witness (see boundary-witness rule).
//
//  Endpoints (shared PF core across all fast-games/originals for the account):
//    GET  /api/v1/fast-games/provably-fair/active            → { activeServerSeedHash, nextServerSeedHash, clientSeed, nonce }
//    POST /api/v1/fast-games/provably-fair/rotate  {clientSeed} → { revealedServerSeed, activeServerSeedHash, nextServerSeedHash, clientSeed, nonce }
//    POST /api/v1/originals/limbo/place-bet  { idempotencyKey, stake:string, params:{target} }
//    POST /api/v1/originals/limbo/verify     { serverSeed, clientSeed, nonce, params:{target} } (cross-check + boundary)
//
//  NOTE: the PF seed pair + nonce chain is SHARED across all fast-games/originals for the
//  account. Play ONLY limbo during the capture, or nonces interleave. Ensure the account's
//  active currency is USDC before starting (stake currency is taken from the account).
// ============================================================================

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
// Session-side module; shipped in this repo as capture/rng.reference.mjs (same code).
import { limboDraw, limboResult, limboWin, limboWinChancePct, commitHash, MAX_MULTIPLIER } from './rng.reference.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'outputs');
// Created eagerly. Every evidence write in this rig is wrapped so it can never take the capture
// down — which meant the missing directory surfaced only as a warning, and the E13 boundary
// witness was silently not written on 2026-09-11. A directory that has to exist is created, not
// hoped for.
try { mkdirSync(OUT_DIR, { recursive: true }); } catch { /* exists */ }
const CHECKPOINT = join(OUT_DIR, 'limbo-capture-checkpoint.json');

// ── CLI ───────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find((a) => a === `--${n}` || a.startsWith(`--${n}=`)); if (!h) return d; const eq = h.indexOf('='); return eq === -1 ? true : h.slice(eq + 1); };
const PROBE = !!flag('probe', false);
const RESUME = !!flag('resume', false);
const DEMO = !!flag('demo', false);
const CURRENCY = String(flag('currency', 'USDC'));
// PACING. Defaults to ZERO wait between bets: the run goes as fast as the server will serve it,
// and the SERVER sets the pace rather than a number guessed in advance.
//
// A flat delay is the wrong instrument in both directions. Too high and a 6,700-bet capture spends
// most of its wall clock asleep — at the old 350 ms default that was 39 minutes of pure sleeping.
// Too low and the run trips 429s, and a 429 costs FAR more than it saves: `retry()` backs off
// 2s x attempt up to 30s, so a single rate-limit stall is worth ~85 skipped 350 ms delays.
//
// So the throttle is adaptive. It starts at `--delay` (0 by default), rises on every 429, and
// decays back down after a run of clean responses. It finds the floor the server actually enforces
// instead of assuming one. `--delay=N` raises the starting point; `--max-delay=N` caps it.
//
// Nothing here touches WHAT is captured — only the spacing between requests. The dataset, the
// nonce sequence and the epoch structure are identical at any pacing.
const DELAY_BET = Number(flag('delay', 0));
const DELAY_MAX = Number(flag('max-delay', 2000));
const DELAY_ROTATE = Number(flag('rotate-delay', 250));
let adaptiveDelay = DELAY_BET;          // current floor, moved only by the server's own 429s
let cleanRun = 0;                       // consecutive non-429 responses
const DECAY_AFTER = 40;                 // clean responses before easing back off
function onRateLimited() {
  adaptiveDelay = Math.min(DELAY_MAX, adaptiveDelay === 0 ? 100 : Math.ceil(adaptiveDelay * 2));
  cleanRun = 0;
  return adaptiveDelay;
}
function onCleanResponse() {
  if (adaptiveDelay <= DELAY_BET) return;
  if (++cleanRun < DECAY_AFTER) return;
  cleanRun = 0;
  adaptiveDelay = Math.max(DELAY_BET, Math.floor(adaptiveDelay / 2));
}
const TOTAL_OVERRIDE = flag('total', null);
const HOUSE_EDGE = 0.01;

const EPOCH = 50;
const AMT_LOW = 0.10, AMT_STAKE = 10;
const MAX_TRANSIENT = 40, REQ_TIMEOUT = 20000, SAVE_EVERY = 10;
const MIN_TARGET = 1.01, MAX_TARGET = MAX_MULTIPLIER;

const BASE = 'https://qa.liqd.com/api/v1';
const EP = {
  active: `${BASE}/fast-games/provably-fair/active`,
  rotate: `${BASE}/fast-games/provably-fair/rotate`,
  bet:    `${BASE}/originals/limbo/place-bet`,
  verify: `${BASE}/originals/limbo/verify`,
};
const COOKIE = process.env.LIQD_COOKIE || '';
const UA = process.env.LIQD_UA || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const STAMP = Date.now();

// ── Target configs ─────────────────────────────────────────────────────────────
const round2 = (x) => Math.round(x * 100) / 100;
const clampTarget = (m) => round2(Math.min(MAX_TARGET, Math.max(MIN_TARGET, m)));

// Random target for Phase A — sample the WIN CHANCE uniformly in [2%, 98%] and invert to a
// target (target = 0.99 / winChanceFrac). This sweeps the common edge curve evenly; the rare
// high-multiplier tail is covered deterministically in Phase B.
function randTarget() {
  const wcPct = 2 + Math.random() * (98 - 2);        // 2%..98%
  return clampTarget(0.99 / (wcPct / 100));           // → ~1.01× … 49.5×
}

// ── Plan: PF.org standard formula-game capture — 6,700 bets, 50/seed ──
//   A 5,000 random target                 — edge-curve sweep + outcome uniformity
//   B 1,000 fixed high-multiplier tail     — 250×@100, 250×@1,000, 250×@100,000, 250×@1,000,000 (cap)
//   C   200 @ $10 fixed target 2.00×        — stake independence
//   D   500 random target, custom pfaudit   — client-seed control
// ── MAX EXPOSURE ──────────────────────────────────────────────────────────────
// WITNESSED 2026-09-11 during pre-flight. A $0.10 bet at the 1,000,000x cap was REFUSED by the
// operator:
//   {"name":"MaxExposureExceededError","errorCode":3138,
//    "fields":{"maxAllowedBetUsdc":0.05,"maxAllowedBetInDisplayCurrency":0.05,...}}
//
// So the binding constraint is NOT the flat `maxBetUsdc` this rig previously declared — it is
// POTENTIAL PAYOUT: stake x target must stay under a ceiling. 0.05 x 1e6 => $50,000, which is the
// implied ceiling and is DERIVED FROM ONE OBSERVATION, not from documentation. It is therefore
// treated as a starting estimate that the server is allowed to correct: `placeBet` catches error
// 3138, reads `maxAllowedBetUsdc` out of the operator's own response, records it as a witness and
// retries once at that stake. The capture adapts to the real limit instead of asserting one.
//
// This matters beyond the rig. LIQD Dice had to declare the exposure cap UNWITNESSED — its E14
// evidence record states explicitly that it does not demonstrate a maximum exposure cap. Here the
// operator enforced it against us and named the number, so the limit becomes an observed
// enforcement rather than a config field we read and believed (G-LIMITS).
const MAX_EXPOSURE_USDC = Number(flag('max-exposure', 50000));
const GRID = 1e-8;
const floor8 = (x) => Math.floor(x / GRID) * GRID;
// MINIMUM BET, INFERRED (not witnessed — corrected 2026-10-02): after the 3138 above, a second request was
// refused with {"name":"BetAmountIsNotInLimitError","errorCode":3113}. This script sends that retry at the
// stake the operator named ($0.05) but writes the ORIGINAL $0.10 into the witness record (`requestedStake`
// below), so evidence/E15 records $0.10 on both refusals; that the 3113 was the $0.05 retry follows from this
// code, not from the record (src/config.ts MIN_BET_USDC). It agrees with the client config field `minBetUsdc: 0.1`.
const MIN_BET_USDC = Number(flag('min-bet', 0.1));

// The two limits COLLIDE, and that is a finding rather than an inconvenience:
//   stake >= 0.10          (minimum bet, 3113)
//   stake x target <= 50000 (maximum exposure, 3138)
// => target <= 50000 / 0.10 = 500,000x
// LIQD's client code sets a 1,000,000x maximum target (read 2026-09-07), and NO LEGAL STAKE CAN REACH IT
// on these limits. Same family as LIQD Dice's F-LIMITS (config said maxOdds 99 while 9900x settled live),
// inverted: here the client-code ceiling is unreachable rather than exceeded. (Whether players are TOLD
// 1,000,000x is not evidenced in the package — Step 17.) The capture records the boundary it can actually
// play and declares the client-code one as refused-in-practice; it does NOT quietly retarget and stay
// silent (G-LIMITS, G-SCOPE).
const MAX_PLAYABLE_TARGET = Number(floor8(MAX_EXPOSURE_USDC / MIN_BET_USDC).toFixed(2));

/** Largest on-grid stake whose potential payout stays under the exposure ceiling, capped at the
 *  phase's nominal stake. Never raises a stake, only lowers it — and never below the minimum bet:
 *  a target needing less than the minimum is UNPLAYABLE, and returns null so the caller must deal
 *  with it explicitly instead of silently sending a bet that will be refused. */
function stakeFor(target, nominal = AMT_LOW) {
  const s = Math.min(nominal, Number(floor8(MAX_EXPOSURE_USDC / target).toFixed(8)));
  return s < MIN_BET_USDC ? null : s;
}
const exposureWitness = [];   // every 3138 the operator returned, retained as evidence
// The ceiling the OPERATOR has actually demonstrated, as opposed to the one we estimated. Starts
// at the estimate and only ever ratchets DOWN, from the operator's own `maxAllowedBetUsdc`.
let EXPOSURE_OBSERVED = MAX_EXPOSURE_USDC;

function buildEpochs() {
  const epochs = [];
  const epR = (phase, amount, seedTag) => epochs.push({ phase, amount, seedTag, bets: Array.from({ length: EPOCH }, () => ({ params: { target: randTarget() } })) });
  const epF = (phase, amount, seedTag, target) => epochs.push({ phase, amount, seedTag, bets: Array.from({ length: EPOCH }, () => ({ params: { target } })) });
  for (let e = 0; e < 100; e++) epR('A', AMT_LOW, 'audit');                 // A — 5,000 random
  for (let e = 0; e < 5;  e++) epF('B', AMT_LOW, 'audit', 100.00);          // B1 — 250 @ 100× (0.99%)
  for (let e = 0; e < 5;  e++) epF('B', AMT_LOW, 'audit', 1000.00);         // B2 — 250 @ 1,000×
  for (let e = 0; e < 5;  e++) epF('B', stakeFor(100000.00), 'audit', 100000.00);  // B3 — 250 @ 100,000×
  // B4 targets the HIGHEST PLAYABLE multiplier, not the advertised one. MAX_TARGET (1,000,000x)
  // cannot be bet at any legal stake — see MAX_PLAYABLE_TARGET above — so aiming there would give
  // 250 refusals and no data. The gap between the two is itself recorded as a finding.
  for (let e = 0; e < 5;  e++) epF('B', stakeFor(MAX_PLAYABLE_TARGET), 'audit', MAX_PLAYABLE_TARGET);
  for (let e = 0; e < 4;  e++) epF('C', AMT_STAKE, 'audit', 2.00);          // C — 200 @ $10, target 2.00×
  for (let e = 0; e < 10; e++) epR('D', AMT_LOW, 'pfaudit');                // D — 500 random, custom seeds
  return epochs;
}
function buildSmoke(total) {
  const epochs = []; let made = 0;
  while (made < total) { const n = Math.min(EPOCH, total - made); epochs.push({ phase: 'A', amount: AMT_LOW, seedTag: 'audit', bets: Array.from({ length: n }, () => ({ params: { target: randTarget() } })) }); made += n; }
  return epochs;
}
let EPOCHS = TOTAL_OVERRIDE != null ? buildSmoke(Number(TOTAL_OVERRIDE)) : buildEpochs();
const TOTAL_BETS = EPOCHS.reduce((s, e) => s + e.bets.length, 0);

// ── Dataset ─────────────────────────────────────────────────────────────────────
let dataset = {
  meta: {
    audit: 'LIQD Limbo', platform: 'qa.liqd.com', gameId: 'originals-limbo', schema: 'liqd-limbo-capture-v1',
    houseEdge: HOUSE_EDGE, currency: CURRENCY, epochSize: EPOCH, plannedTotal: TOTAL_BETS,
    // `minBetUsdc` / `maxBetUsdc` are CONFIG FIELDS read from the operator's client — advertised
    // labels, not measured behaviour. The binding constraint observed in play is neither of them:
    // it is POTENTIAL PAYOUT. `maxExposureUsdc` is an auditor DERIVATION from a single witnessed
    // refusal (target 1,000,000x -> maxAllowedBetUsdc 0.05), and `maxExposureWitnessed` records
    // what the operator actually enforced. Anything a scored step asserts about limits must read
    // the witnessed field, never the advertised one.
    limits: { minMultiplier: MIN_TARGET, maxMultiplier: MAX_TARGET, minBetUsdc: 0.1, maxBetUsdc: 9898,
              maxExposureUsdc: MAX_EXPOSURE_USDC, maxExposureSource: 'DERIVED from one witnessed refusal, errorCode 3138' },
    limboModel: { range: 100000000, cursor: 0, resultNumerator: 9900000000, params: ['target'] },
    phases: { A: { bets: 5000, target: 'random' }, B: { bets: 1000, target: '100/1000/100k/1M' }, C: { bets: 200, amount: AMT_STAKE, target: '2.00' }, D: { bets: 500, target: 'random', customSeeds: true } },
    startedAt: null, finishedAt: null, progress: {}, preCapture: null, boundaryProbe: null,
  },
  seeds: [], bets: [],
};

// ── Utils / rendering ─────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const randHex = (n) => randomBytes(n).toString('hex');
const idemKey = () => `limbo-${STAMP}-${randHex(8)}`;
const clientSeedFor = (E, tag) => tag === 'pfaudit' ? `pfaudit-${STAMP}-${E}` : 'audit' + randHex(6);
const tLabel = (p) => `@${p.target}x`;
const isTTY = !!process.stdout.isTTY;
const cols = () => process.stdout.columns || 100;
const comma = (n) => Number(n).toLocaleString('en-US');
const C = { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', gray: '\x1b[90m', green: '\x1b[92m', cyan: '\x1b[96m', mag: '\x1b[95m', yellow: '\x1b[93m', blue: '\x1b[94m', red: '\x1b[91m', orange: '\x1b[38;5;208m' };
const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
const CLR = '\r\x1b[2K';
function fmtTime(s) { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}h${String(m).padStart(2, '0')}m` : m ? `${m}m${String(x).padStart(2, '0')}s` : `${x}s`; }
function smoothBar(frac, width) { frac = Math.max(0, Math.min(1, frac)); const parts = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']; const exact = frac * width, full = Math.floor(exact), partial = parts[Math.floor((exact - full) * 8)] || ''; const empty = Math.max(0, width - full - (partial ? 1 : 0)); return C.green + '█'.repeat(full) + partial + C.reset + C.gray + '·'.repeat(empty) + C.reset; }
const phaseBadge = (p) => (({ A: C.cyan, B: C.mag, C: C.yellow, D: C.blue, E: C.orange }[p]) || C.cyan) + C.bold + `[${p}]` + C.reset;
function logAbove(msg) { if (isTTY) process.stdout.write(CLR); console.log(msg); }
let lastDraw = 0;
function draw(i, phase, label, rate, t0, last) {
  const t = Date.now(); if (t - lastDraw < 80 && i < TOTAL_BETS) return; lastDraw = t;
  const frac = i / TOTAL_BETS, el = (t - t0) / 1000, eta = rate > 0 ? (TOTAL_BETS - i) / rate : 0, pct = (frac * 100).toFixed(1) + '%';
  if (!isTTY) { if (i % 100 === 0 || i === TOTAL_BETS) console.log(`${pct}  ${i}/${TOTAL_BETS}  [${phase}] ${label}  ${rate.toFixed(0)}/s  ETA ${fmtTime(eta)}`); return; }
  const left = `${phaseBadge(phase)} ${C.bold}${pct.padStart(6)}${C.reset} ${C.gray}${comma(i)}/${comma(TOTAL_BETS)}${C.reset} `;
  const meta = `${C.dim}${label}  ${rate.toFixed(0)}/s  ${fmtTime(el)}${C.reset}${C.gray}·ETA ${C.reset}${C.dim}${fmtTime(eta)}${C.reset}`;
  let drop = `  ${C.gray}${last}${C.reset}`, w = cols() - 1;
  let barW = w - strip(left).length - strip(meta).length - strip(drop).length - 3;
  if (barW < 12) { drop = ''; barW = w - strip(left).length - strip(meta).length - 3; }
  barW = Math.max(8, barW);
  process.stdout.write(`${CLR}${left}${smoothBar(frac, barW)}  ${meta}${drop}`);
}

// ── HTTP via Chrome-TLS impersonation ──────────────────────────────────────────────
// qa.liqd.com's API is behind Cloudflare bot-mitigation that gates on the TLS/JA3
// fingerprint — real Chrome passes; node/plain-curl get the "Just a moment" challenge.
// Route requests through a Chrome-TLS client (python3 req.py / curl_cffi), same as Dice.
const HERE_REQ = join(HERE, 'req.py');
const PY_BIN = process.env.LIQD_PYTHON || 'python3';
const CURL_BIN = process.env.LIQD_CURL || '';
class HttpError extends Error { constructor(m, k) { super(m); this.kind = k; } }
function transport(method, url, body) {
  return new Promise((resolve, reject) => {
    const done = (err, stdout, stderr) => {
      if (err && err.code === 'ENOENT') return reject(new HttpError(`${CURL_BIN || PY_BIN} not found`, 'AUTH'));
      if (err && !stdout) return reject(new HttpError('transport ' + (err.killed ? 'timeout' : (stderr || err.message).slice(0, 120)), 'TRANSIENT'));
      const out = String(stdout);
      if (CURL_BIN) {
        const i = out.lastIndexOf('\n__STATUS__');
        if (i === -1) return reject(new HttpError('curl: no status marker — ' + out.slice(0, 120), 'TRANSIENT'));
        return resolve({ status: Number(out.slice(i + 11).trim()), text: out.slice(0, i) });
      }
      const nl = out.indexOf('\n');
      const status = Number(out.slice(0, nl).trim());
      const text = out.slice(nl + 1);
      if (/__NO_CURL_CFFI__/.test(text)) return reject(new HttpError('curl_cffi missing — run:  pip3 install curl_cffi', 'AUTH'));
      if (/__REQ_ERR__/.test(text)) return reject(new HttpError('transport ' + text.slice(0, 120), 'TRANSIENT'));
      resolve({ status, text });
    };
    const opts = { maxBuffer: 8 * 1024 * 1024, timeout: REQ_TIMEOUT + 5000 };
    if (CURL_BIN) {
      const args = ['-sS', '--compressed', '--max-time', String(Math.ceil(REQ_TIMEOUT / 1000)), '-X', method, '-b', COOKIE,
        '-H', 'Accept: application/json', '-H', 'Origin: https://qa.liqd.com', '-H', 'Referer: https://qa.liqd.com/originals/limbo',
        '-w', '\n__STATUS__%{http_code}'];
      if (body) { args.push('-H', 'Content-Type: application/json', '--data-raw', JSON.stringify(body)); }
      args.push(url);
      execFile(CURL_BIN, args, opts, done);
    } else {
      const child = execFile(PY_BIN, [HERE_REQ, method, url], opts, done);
      child.stdin.end(body ? JSON.stringify(body) : '');
    }
  });
}
async function http(method, url, body) {
  if (!COOKIE) throw new HttpError('LIQD_COOKIE empty — source ./set-cookie.sh', 'AUTH');
  const { status, text } = await transport(method, url, body);
  if (status === 401 || status === 403) throw new HttpError(`${status} auth rejected`, 'AUTH');
  if (/cf-mitigated|Just a moment|__cf_chl|challenge-platform/i.test(text)) throw new HttpError('Cloudflare challenge — Chrome-TLS transport rejected (curl_cffi installed?)', 'AUTH');
  if (/Cloudflare Access|<!DOCTYPE html|<html/i.test(text)) throw new HttpError('Cloudflare Access sign-in — cookie expired', 'AUTH');
  if (status === 429) { const d = onRateLimited(); throw new HttpError(`429 rate limited (throttle -> ${d}ms)`, 'TRANSIENT'); }
  if (status >= 500) throw new HttpError(`${status} server error`, 'TRANSIENT');
  onCleanResponse();
  let json; try { json = JSON.parse(text); } catch { throw new HttpError(`${status} non-JSON: ${text.slice(0, 120)}`, 'TRANSIENT'); }
  if (json && Array.isArray(json.errors) && json.errors.length) {
    const code = json.errors[0]?.errorCode;
    // Keep the STRUCTURED error, not just a truncated string. The 200-char slice below cost us a
    // real measurement on 2026-09-11: the operator's MaxExposureExceededError carries
    // `fields.maxAllowedBetUsdc`, and the truncation cut the payload off mid-field, so the one
    // number the rig needed to adapt to — and the one worth retaining as evidence — was discarded
    // before anything could read it. The message stays short for the console; `raw` keeps all of it.
    const e = new HttpError('api error: ' + JSON.stringify(json.errors).slice(0, 400), 'API');
    e.code = code; e.raw = json.errors[0]; e.errors = json.errors; throw e;
  }
  return json && json.data !== undefined ? json.data : json;
}
async function retry(fn, label, onStatus) {
  let attempt = 0;
  for (;;) {
    try { return await fn(); }
    catch (e) { if (e.kind === 'AUTH' || e.kind === 'API') throw e; attempt++; if (attempt >= MAX_TRANSIENT) throw new HttpError(`${label} failed after ${attempt} retries: ${e.message}`, 'TRANSIENT'); const wait = Math.min(2000 * attempt, 30000); if (onStatus) onStatus(`${label} hiccup: ${e.message.slice(0, 40)} — retry ${attempt}/${MAX_TRANSIENT} in ${Math.round(wait / 1000)}s`); await sleep(wait); }
  }
}
const pick = (o, ...k) => { for (const x of k) if (o && o[x] != null) return o[x]; return undefined; };
const readActive = (a) => ({ hashedServerSeed: pick(a, 'activeServerSeedHash', 'hashedServerSeed'), nextHashedServerSeed: pick(a, 'nextServerSeedHash', 'nextHashedServerSeed'), clientSeed: pick(a, 'activeClientSeed', 'clientSeed'), nonce: pick(a, 'nonce') });
const readRotate = (r) => ({ revealedServerSeed: pick(r, 'revealedServerSeed', 'serverSeed'), hashedServerSeed: pick(r, 'activeServerSeedHash', 'hashedServerSeed'), nextHashedServerSeed: pick(r, 'nextServerSeedHash', 'nextHashedServerSeed'), clientSeed: pick(r, 'clientSeed', 'activeClientSeed'), nonce: pick(r, 'nonce') });
const getActive = async () => readActive(await http('GET', EP.active));
const rotate = async (clientSeed) => readRotate(await http('POST', EP.rotate, { clientSeed }));

// place-bet: single call places + settles. The limbo outcome field names are confirmed by the
// PROBE (raw dumped) before the full run — this parser reads them defensively with fallbacks:
//   outcome.result / outcome.crashMultiplier / outcome.multiplier(served) — the CRASH multiplier R
// The paid multiplier on a win equals the chosen target; winningAmount = stake × target.
// The stake is sent as a fixed 8-decimal string and the wallet is named explicitly by
// `currencyId`. Both were missing before 2026-09-10 and both were found the same way: by diffing
// this body against a REAL place-bet request captured from the browser during pre-flight.
//
//   rig sent:  { idempotencyKey, stake: "0.1",        params: { target } }
//   browser:   { idempotencyKey, stake: "0.10000000", currencyId: 2, params: { target } }
//
// `currencyId` absent is the dangerous one — the server then picks a wallet by its own default
// rather than by our instruction, so the capture could settle against a currency the audit does
// not describe, and every stake and credit in the dataset would be denominated in something the
// report never names. 8-dp is how the client sends money everywhere in this API and matches the
// 1e-8 settlement grid, so it is sent the same way rather than relying on Number->String, which
// yields "0.1" and drops the grid entirely.
//
// `--currency-id` overrides it. The default is what the live request carried while the account
// was set to USDC — an OBSERVED value, not a documented mapping, so the probe re-confirms it and
// the run refuses to start if the settled currency comes back as anything else.
const CURRENCY_ID = Number(flag('currency-id', 2));
const stake8 = (n) => Number(n).toFixed(8);
async function placeBet(params, amount) {
  let s;
  try {
    s = await http('POST', EP.bet, { idempotencyKey: idemKey(), stake: stake8(amount), currencyId: CURRENCY_ID, params });
  } catch (e) {
    // 3138 MaxExposureExceededError — the operator names the largest stake it will accept for this
    // target. Record it as a witness, retry ONCE at exactly that stake, and let the observation
    // correct our estimated ceiling for every later bet. Retrying once and only once is deliberate:
    // a second rejection means the limit is not what the operator just said it was, and that is a
    // finding to stop on, not a loop to grind through.
    const allowed = Number(e?.raw?.fields?.maxAllowedBetUsdc ?? e?.fields?.maxAllowedBetUsdc ?? NaN);
    if (e.kind !== 'API' || e.code !== 3138 || !Number.isFinite(allowed) || allowed <= 0) throw e;
    exposureWitness.push({ at: new Date().toISOString(), target: Number(params.target), requestedStake: Number(stake8(amount)), maxAllowedBetUsdc: allowed, impliedExposureCeiling: Number((allowed * Number(params.target)).toFixed(8)), errorCode: e.code, raw: e.raw ?? e.message });
    const implied = allowed * Number(params.target);
    if (implied < MAX_EXPOSURE_USDC) EXPOSURE_OBSERVED = Math.min(EXPOSURE_OBSERVED, implied);
    s = await http('POST', EP.bet, { idempotencyKey: idemKey(), stake: stake8(allowed), currencyId: CURRENCY_ID, params });
    amount = allowed;
  }
  const round = s.round || {};
  const w = (round.wagers || []).find((x) => x.betType === 'main') || (round.wagers || [])[0] || {};
  const oc = w.outcome || {};
  return {
    raw: s,
    id: round.betId ?? round.roundId,
    nonce: s.consumedNonce ?? round.nonce ?? s.provablyFair?.nonce,
    clientSeed: round.clientSeed ?? s.provablyFair?.clientSeed,
    serverSeedId: round.serverSeedId,
    result: Number(pick(oc, 'result', 'crashMultiplier', 'crashPoint', 'multiplier')),  // R (crash) — probe confirms the exact key
    win: oc.win ?? (w.result === 'won'),
    multiplier: Number(pick(w, 'multiplier') ?? pick(oc, 'payoutMultiplier') ?? (w.result === 'won' ? params.target : 0)),
    result_label: w.result,
    target: Number(params.target),
    betAmount: Number(w.stake ?? amount),
    winningAmount: Number(w.winningAmount ?? 0),
    stakeWallet: w.stakeWallet != null ? Number(w.stakeWallet) : undefined,
    winningAmountWallet: w.winningAmountWallet != null ? Number(w.winningAmountWallet) : undefined,
  };
}

// Operator /verify cross-check + boundary probe (NO stake). Returns the server's own recomputed
// result + win for a (serverSeed, clientSeed, nonce, target). Raw retained for evidence.
/** Depth-first search for a key anywhere in the response. The /verify response does NOT put `win`
 *  and `result` at the top level — place-bet nests them under round.wagers[].outcome, and a
 *  top-level `pick()` returned `undefined` for both on 2026-09-11, which turned the ≥-boundary
 *  witness into "win undefined" and silently produced no evidence at all. Rather than hardcode a
 *  second guessed path, walk the object: the first match at any depth wins, and the raw response is
 *  retained and printed so the exact path can be pinned once it is known. */
function deepPick(obj, ...keys) {
  const seen = new Set();
  const walk = (o) => {
    if (o == null || typeof o !== 'object' || seen.has(o)) return undefined;
    seen.add(o);
    for (const k of keys) if (Object.prototype.hasOwnProperty.call(o, k) && o[k] != null) return o[k];
    for (const v of Object.values(o)) { const r = walk(v); if (r !== undefined) return r; }
    return undefined;
  };
  return walk(obj);
}
async function serverVerify(serverSeed, clientSeed, nonce, target) {
  const v = await http('POST', EP.verify, { serverSeed, clientSeed, nonce, params: { target } });
  const win = deepPick(v, 'win');
  const result = Number(deepPick(v, 'result', 'crashMultiplier', 'crashPoint', 'multiplier'));
  return { raw: v, result, win: typeof win === 'boolean' ? win : (win === 'won' ? true : win === 'lost' ? false : undefined) };
}

// ── Checkpoint ─────────────────────────────────────────────────────────────────
function save() { dataset.meta.progress.savedAt = now(); dataset.meta.progress.bets = dataset.bets.length; dataset.meta.progress.seeds = dataset.seeds.length; writeFileSync(CHECKPOINT, JSON.stringify(dataset, null, 2)); }
function load() { if (!existsSync(CHECKPOINT)) { console.log('No checkpoint — starting fresh.'); return 0; } dataset = JSON.parse(readFileSync(CHECKPOINT, 'utf8')); const done = dataset.seeds.filter((s) => s.serverSeed != null).length; dataset.seeds = dataset.seeds.slice(0, done); dataset.bets = dataset.bets.filter((b) => b.epoch < done); console.log(`Resumed: ${done} revealed epochs, ${dataset.bets.length} bets. Continuing at epoch ${done}.`); return done; }

// ── Inline verify ─────────────────────────────────────────────────────────────────
// Per bet: (1) R recomputes from the revealed seed and equals the served result; (2) win flag
// agrees with the recomputed R>=target rule; (3) paid multiplier == target on a win; (4)
// credited winningAmount == stake × target. Wallet-denominated amounts captured for the money path.
function verifyEpoch(E, hashedServerSeed, revealedServerSeed) {
  const commitOk = commitHash(revealedServerSeed) === hashedServerSeed;
  let checked = 0, bad = 0, creditChecked = 0, creditBad = 0, winRuleChecked = 0, winRuleBad = 0;
  const epochBets = dataset.bets.filter((b) => b.epoch === E).sort((a, c) => (a.nonce ?? 0) - (c.nonce ?? 0));
  for (const b of epochBets) {
    const localResult = limboResult(revealedServerSeed, b.clientSeed, b.nonce);
    const localWin = limboWin(localResult, b.params.target);
    b.localDraw = limboDraw(revealedServerSeed, b.clientSeed, b.nonce);
    b.localResult = localResult; b.localWin = localWin;
    b.verified = Math.abs(localResult - Number(b.result)) < 1e-9;
    checked++; if (!b.verified) bad++;
    if (b.win != null) { winRuleChecked++; if (localWin !== !!b.win) winRuleBad++; }
    const bet = Number(b.betAmount), win = Number(b.winningAmount || 0), tgt = Number(b.params.target);
    const expWin = b.win ? bet * tgt : 0;   // paid = stake × target on win (rounding characterised in the report)
    b.creditedOk = Math.abs(win - expWin) < 1e-6; creditChecked++; if (!b.creditedOk) creditBad++;
    if (b.winningAmountWallet != null && b.stakeWallet != null) {
      const expWinW = b.win ? Number(b.stakeWallet) * tgt : 0;
      b.walletOk = Math.abs(Number(b.winningAmountWallet) - expWinW) < 1e-6;
    }
  }
  return { commitOk, checked, bad, creditChecked, creditBad, winRuleChecked, winRuleBad };
}

// ── Probe ────────────────────────────────────────────────────────────────────────
async function runProbe() {
  console.log('\n── PROBE ── endpoints + local verification + ≥-boundary witness\n');
  const a = await getActive();
  console.log(`GET /active → hash=${a.hashedServerSeed} clientSeed=${a.clientSeed} nonce=${a.nonce}`);
  // Spread of targets: ordinary range, the highest PLAYABLE multiplier, the minimum, and — last,
  // deliberately — the ADVERTISED cap, which we expect to be refused. The refusal is the point:
  // it is the witness that the advertised 1,000,000x is unreachable, and it is retained rather
  // than avoided. `expectRefusal` entries never abort the probe.
  const plan = [
    { target: 1.50 }, { target: 2.00 }, { target: 10.00 }, { target: 100.00 },
    { target: MAX_PLAYABLE_TARGET, note: 'highest target playable at the minimum bet' },
    { target: 1.01 },
    { target: MAX_TARGET, expectRefusal: true, note: 'ADVERTISED maximum multiplier — expected to be refused at every legal stake' },
  ];
  for (const entry of plan) {
    const target = entry.target;
    const stake = stakeFor(target) ?? MIN_BET_USDC;   // unplayable targets are sent at the minimum, to witness the refusal
    let s;
    try {
      s = await placeBet({ target }, stake);
    } catch (e) {
      if (entry.expectRefusal && e.kind === 'API') {
        const f = e.raw?.fields ?? {};
        console.log(`  bet @${target}x → REFUSED as expected: ${e.raw?.name ?? 'error'} (${e.code})${f.maxAllowedBetUsdc != null ? `, maxAllowedBetUsdc=${f.maxAllowedBetUsdc}` : ''}`);
        exposureWitness.push({ at: new Date().toISOString(), target, requestedStake: stake, errorCode: e.code, errorName: e.raw?.name, fields: f, raw: e.raw, interpretation: 'advertised maximum multiplier is not playable at any legal stake' });
        continue;
      }
      throw e;
    }
    if (dataset.bets.length === 0) console.log('  RAW place-bet response (schema witness):\n' + JSON.stringify(s.raw, null, 2).split('\n').map(l => '    ' + l).join('\n'));
    dataset.bets.push({ epoch: 0, params: { target }, nonce: s.nonce, clientSeed: s.clientSeed ?? a.clientSeed, hashedServerSeed: a.hashedServerSeed, result: s.result, win: s.win, multiplier: s.multiplier, resultLabel: s.result_label, betAmount: s.betAmount, winningAmount: s.winningAmount, stakeWallet: s.stakeWallet, winningAmountWallet: s.winningAmountWallet });
    console.log(`  bet ${tLabel({ target })} → nonce=${s.nonce} R=${s.result} win=${s.win} paidMult=${s.multiplier} winAmt=${s.winningAmount}`);
    await sleep(adaptiveDelay);   // server-set pace, not a guessed constant
  }
  console.log('\nRotating to reveal...');
  const r = await rotate(clientSeedFor(1, 'audit'));
  const v = verifyEpoch(0, a.hashedServerSeed, r.revealedServerSeed);

  // ── ≥-boundary witness via /verify (no stake) ──
  // Take the first probe bet's revealed round; its R is a 2-dp value. Ask the operator's own
  // verifier whether target == R wins (equality) and target == R+0.01 loses (just above). This
  // pins the R>=target rule with the operator's authority — retained as the boundary evidence.
  let boundary = null;
  try {
    const b0 = dataset.bets[0];
    const R = limboResult(r.revealedServerSeed, b0.clientSeed, b0.nonce);
    const atEqual = await serverVerify(r.revealedServerSeed, b0.clientSeed, b0.nonce, round2(R));
    const justAbove = await serverVerify(r.revealedServerSeed, b0.clientSeed, b0.nonce, round2(R + 0.01));
    console.log('  RAW /verify response (boundary schema witness):\n' + JSON.stringify(atEqual.raw, null, 2).split('\n').map((l) => '    ' + l).join('\n'));
    boundary = { serverSeed: r.revealedServerSeed, clientSeed: b0.clientSeed, nonce: b0.nonce, R,
      atEqual: { target: round2(R), serverWin: atEqual.win, serverResult: atEqual.result, raw: atEqual.raw },
      justAbove: { target: round2(R + 0.01), serverWin: justAbove.win, serverResult: justAbove.result, raw: justAbove.raw } };
    dataset.meta.boundaryProbe = boundary;
    writeFileSync(join(OUT_DIR, 'E13-limbo-boundary-probes.json'), JSON.stringify(boundary, null, 2));
  } catch (e) { console.log(`  ⚠️  boundary /verify probe failed: ${e.message}`); }

  console.log('\n── VERIFY ──');
  console.log(`  commit SHA256(utf8(serverSeed)) == active hash : ${v.commitOk ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`  local R recompute == served result : ${v.checked - v.bad}/${v.checked} ${v.bad ? '❌' : '✅'}`);
  console.log(`  R>=target win rule == served win flag : ${v.winRuleChecked - v.winRuleBad}/${v.winRuleChecked} ${v.winRuleBad ? '❌' : '✅'}`);
  console.log(`  credited winningAmount == stake × target : ${v.creditChecked - v.creditBad}/${v.creditChecked} ${v.creditBad ? '❌' : '✅'}`);
  if (boundary) {
    console.log(`  ≥-boundary (operator /verify): target==R → win ${boundary.atEqual.serverWin}  |  target==R+0.01 → win ${boundary.justAbove.serverWin}`);
    console.log(`     ${boundary.atEqual.serverWin === true && boundary.justAbove.serverWin === false ? '✅ confirms win = R >= target (≥, inclusive)' : '⚠️  UNEXPECTED — record and investigate the win rule'}`);
  }
  // The boundary witness is part of the gate, not a nice-to-have. On 2026-09-11 this line printed
  // "Ready for `npm run capture`" while the ≥-boundary probe had failed outright and written no
  // evidence — a green over a check that did not run, which is the exact defect class the framework
  // calls G-EXEC. The whole point of this probe is that the ≥ rule is WITNESSED rather than assumed;
  // a run that could not witness it is not ready, however clean everything else looks.
  const boundaryOk = boundary != null && boundary.atEqual.serverWin === true && boundary.justAbove.serverWin === false;
  const ready = v.commitOk && v.bad === 0 && v.creditBad === 0 && v.winRuleBad === 0 && boundaryOk;
  if (!boundaryOk) console.log(`  ❌ ≥-boundary NOT witnessed — ${boundary == null ? 'the /verify probe did not complete' : 'the operator did not answer win@R=true and win@R+0.01=false'}`);
  // The probe is the ONLY run that attempts the advertised-but-unplayable maximum multiplier, so it
  // is the only run that can witness the refusal. The capture deliberately never sends that bet, so
  // if this is not written here the evidence is lost — the in-memory witness would simply vanish
  // when the process exits, and E15 would later be written by the capture saying "no refusal
  // occurred", which is true of that run and deeply misleading about the limit.
  saveExposureWitness();
  console.log(ready ? '\n✅ Confirmed end-to-end. Ready for `npm run capture`.\n' : '\n⚠️  Not green — stop and investigate. Do NOT run the capture.\n');
}

// ── Capture ──────────────────────────────────────────────────────────────────────
async function runCapture(startEpoch) {
  if (!dataset.meta.startedAt) dataset.meta.startedAt = now();
  const done = dataset.bets.length;
  const turnover = (5000 + 1000 + 500) * AMT_LOW + 200 * AMT_STAKE;
  console.log(`\n── CAPTURE ── ${TOTAL_BETS} bets · ${EPOCHS.length} epochs · ${EPOCH}/seed`);
  console.log(`   A 5,000 random · B 1,000 tail (100/1k/100k/1M×) · C 200@$${AMT_STAKE} · D 500 (pfaudit)   turnover ≈ ${turnover.toFixed(0)} ${CURRENCY} · EV cost ≈ ${(turnover * HOUSE_EDGE).toFixed(2)} ${CURRENCY}\n`);
  let t0 = Date.now(), placed = done, lastResult = '';
  const onStatus = (msg) => { if (isTTY) process.stdout.write(`${CLR}  ${C.yellow}⟳${C.reset} ${C.dim}${msg}${C.reset}`); else console.log(msg); };

  let cur;
  if (startEpoch === 0) {
    const pre = await retry(() => getActive(), 'active', onStatus);
    dataset.meta.preCapture = { at: now(), hashedServerSeed: pre.hashedServerSeed, clientSeed: pre.clientSeed, nonce: pre.nonce, nextHashedServerSeed: pre.nextHashedServerSeed, revealedServerSeed: null, commitVerified: null };
    logAbove(`${C.dim}current seed snapshot — hash ${String(pre.hashedServerSeed).slice(0, 12)}… nonce ${pre.nonce}${C.reset}`);
    cur = await retry(() => rotate(clientSeedFor(0, EPOCHS[0].seedTag)), 'rotate', onStatus);
    dataset.meta.preCapture.revealedServerSeed = cur.revealedServerSeed;
    dataset.meta.preCapture.commitVerified = cur.revealedServerSeed ? commitHash(cur.revealedServerSeed) === dataset.meta.preCapture.hashedServerSeed : null;
    logAbove(`${C.dim}rotated to a fresh seed; starting clean at epoch 0 nonce 0${C.reset}`);
  } else {
    cur = await retry(() => getActive(), 'active', onStatus);
    logAbove(`${C.dim}resume: continuing from the current active seed (chain-preserving) at epoch ${startEpoch}${C.reset}`);
  }
  const startSeed = (E) => { dataset.seeds[E] = { epoch: E, phase: EPOCHS[E].phase, at: now(), clientSeed: cur.clientSeed, hashedServerSeed: cur.hashedServerSeed, nextHashedServerSeed: cur.nextHashedServerSeed, serverSeed: null, nonceStart: cur.nonce ?? 0, nonceEnd: null, commitVerified: null, chainLinkOk: null }; };
  startSeed(startEpoch);

  for (let E = startEpoch; E < EPOCHS.length; E++) {
    const epc = EPOCHS[E];
    for (let j = 0; j < epc.bets.length; j++) {
      const { params } = epc.bets[j];
      let s;
      try { s = await retry(() => placeBet(params, epc.amount), 'bet', onStatus); }
      catch (e) {
        if (e.kind === 'API') { logAbove(`  ${C.yellow}skip${C.reset} ${tLabel(params)} rejected: ${String(e.message).slice(0, 80)}`); continue; }
        throw e;
      }
      dataset.bets.push({
        at: now(), epoch: E, phase: epc.phase, id: s.id, params,
        nonce: s.nonce, clientSeed: s.clientSeed ?? cur.clientSeed, serverSeedId: s.serverSeedId,
        hashedServerSeed: cur.hashedServerSeed, result: s.result, win: s.win, multiplier: s.multiplier, resultLabel: s.result_label,
        betAmount: s.betAmount, winningAmount: s.winningAmount, stakeWallet: s.stakeWallet, winningAmountWallet: s.winningAmountWallet,
        localDraw: null, localResult: null, localWin: null, verified: null, creditedOk: null,
      });
      placed++;
      lastResult = `${tLabel(params)} n=${s.nonce} R=${s.result} ${s.win ? 'x' + s.multiplier : 'loss'}`;
      const el = (Date.now() - t0) / 1000, rate = (placed - done) / Math.max(0.001, el);
      draw(placed, epc.phase, tLabel(params), rate, t0, lastResult);
      if (placed % SAVE_EVERY === 0) save();
      await sleep(adaptiveDelay);   // server-set pace, not a guessed constant
    }
    await sleep(DELAY_ROTATE);
    const nextTag = E + 1 < EPOCHS.length ? EPOCHS[E + 1].seedTag : 'audit';
    const next = await retry(() => rotate(clientSeedFor(E + 1, nextTag)), 'rotate', onStatus);
    const sd = dataset.seeds[E];
    sd.serverSeed = next.revealedServerSeed;
    sd.nonceEnd = dataset.bets[dataset.bets.length - 1].nonce;
    const v = verifyEpoch(E, sd.hashedServerSeed, next.revealedServerSeed);
    sd.chainLinkOk = sd.nextHashedServerSeed != null ? sd.nextHashedServerSeed === next.hashedServerSeed : null;
    sd.commitVerified = v.commitOk && v.bad === 0 && v.creditBad === 0 && v.winRuleBad === 0;
    const mark = (ok, na) => na ? `${C.gray}n/a${C.reset}` : ok ? `${C.green}OK${C.reset}` : `${C.red}FAIL${C.reset}`;
    logAbove(`  ${v.commitOk && !v.bad && !v.creditBad && !v.winRuleBad && sd.chainLinkOk !== false ? C.green + '✔' : C.red + '✘'}${C.reset} epoch ${String(E).padStart(3)} ${phaseBadge(epc.phase)} ${C.dim}commit${C.reset} ${mark(v.commitOk)}  ${C.dim}chain${C.reset} ${mark(sd.chainLinkOk, sd.chainLinkOk == null)}  ${C.dim}R${C.reset} ${v.checked - v.bad}/${v.checked} ${v.bad ? C.red + '✘' : C.green + '✓'}${C.reset}  ${C.dim}winRule${C.reset} ${v.winRuleChecked - v.winRuleBad}/${v.winRuleChecked} ${v.winRuleBad ? C.red + '✘' : C.green + '✓'}${C.reset}  ${C.dim}credit${C.reset} ${v.creditChecked - v.creditBad}/${v.creditChecked} ${v.creditBad ? C.red + '✘' : C.green + '✓'}${C.reset}`);
    if (sd.chainLinkOk === false) logAbove(`  ${C.red}⚠️  CHAIN BROKEN${C.reset} at epoch ${E}. Do not ship.`);
    if (v.creditBad) logAbove(`  ${C.red}⚠️  ${v.creditBad} bets: winningAmount != stake × target${C.reset} at epoch ${E}.`);
    if (v.winRuleBad) logAbove(`  ${C.red}⚠️  ${v.winRuleBad} bets: served win flag != (R>=target)${C.reset} at epoch ${E} — investigate the win rule.`);
    save(); cur = next; if (E + 1 < EPOCHS.length) startSeed(E + 1);
  }
  finalize(t0);
}

function finalize(t0) {
  const verified = dataset.bets.filter((b) => b.verified === true).length;
  const failed = dataset.bets.filter((b) => b.verified === false).length;
  dataset.meta.progress.status = dataset.bets.length >= TOTAL_BETS ? 'completed' : 'partial';
  dataset.meta.finishedAt = now();
  const outFile = join(OUT_DIR, `liqd-limbo-${dataset.bets.length}bets.json`);
  writeFileSync(outFile, JSON.stringify(dataset, null, 2)); save();
  const byPhase = {}; for (const b of dataset.bets) byPhase[b.phase] = (byPhase[b.phase] || 0) + 1;
  if (isTTY) process.stdout.write(CLR);
  const nullSeeds = dataset.seeds.filter((s) => s.serverSeed == null).length;
  const chainBroken = dataset.seeds.filter((s) => s.chainLinkOk === false).length;
  console.log('\n── DONE ──');
  console.log(`  bets   : ${dataset.bets.length}/${TOTAL_BETS}   by phase: ${JSON.stringify(byPhase)}`);
  console.log(`  epochs : ${dataset.seeds.length} (${dataset.seeds.filter((s) => s.commitVerified).length} commit-verified)`);
  console.log(`  chain  : ${dataset.seeds.filter((s) => s.chainLinkOk === true).length} links OK${chainBroken ? `   ❌ ${chainBroken} BROKEN` : '  ✅'}`);
  console.log(`  local-verified bets : ${verified}${failed ? `   ❌ FAILED ${failed}` : '  ✅'}`);
  console.log(`  dataset: ${outFile}`);
  if (!nullSeeds && !failed && !chainBroken) console.log('\n  ✅ 100% verifiable: every seed revealed, every R recomputed, chain intact.');
  else console.log('\n  ❌ Integrity issue — do NOT ship. Run --resume.');

  // ── Deterministic edge / payout scan (bug + exploit watch) ──
  // Per bet the edge = 1 − winChance(target)·target is deterministic (no variance); any bet with
  // edge < 0 would be player-favourable (a real +EV exploit). All should read ≥ 1.00%.
  let favorable = 0, sumEdge = 0, minEdge = Infinity, maxEdge = -Infinity;
  for (const b of dataset.bets) {
    const p = limboWinChancePct(b.params.target) / 100, edge = 1 - p * b.params.target;
    if (edge < -1e-9) favorable++;
    sumEdge += edge; if (edge < minEdge) minEdge = edge; if (edge > maxEdge) maxEdge = edge;
  }
  const totStake = dataset.bets.reduce((s, b) => s + Number(b.betAmount || 0), 0);
  const totWon = dataset.bets.reduce((s, b) => s + Number(b.winningAmount || 0), 0);
  console.log(`\n── EDGE SCAN ── empirical RTP ${(totWon / totStake * 100).toFixed(2)}% (variance) · deterministic mean edge ${(sumEdge / dataset.bets.length * 100).toFixed(4)}% (target ${(HOUSE_EDGE * 100).toFixed(2)}%)`);
  console.log(`  player-favourable bets (edge < 0) : ${favorable}  ${favorable ? C.red + '⚠️ EXPLOIT' + C.reset : '✅'}`);
  console.log(`  edge min ${(minEdge * 100).toFixed(4)}%  max ${(maxEdge * 100).toFixed(4)}%  (all should be ≥ 1.00%)`);
  dataset.meta.edgeSummary = { meanEdge: sumEdge / dataset.bets.length, favorable, minEdge, maxEdge };
  writeFileSync(outFile, JSON.stringify(dataset, null, 2));
}

// ── Closeout + SIGINT ──────────────────────────────────────────────────────────
async function closeout(reason) {
  const E = dataset.seeds.length - 1; if (E < 0) { save(); return; }
  const sd = dataset.seeds[E]; const n = dataset.bets.filter((b) => b.epoch === E).length;
  if (sd && sd.serverSeed == null && n > 0) {
    try {
      console.log(`\nCloseout (${reason}): revealing epoch ${E} (${n} bets)...`);
      const next = await rotate(clientSeedFor(E + 1, 'audit'));
      sd.serverSeed = next.revealedServerSeed; sd.nonceEnd = dataset.bets.filter((b) => b.epoch === E).slice(-1)[0]?.nonce ?? sd.nonceEnd;
      const v = verifyEpoch(E, sd.hashedServerSeed, next.revealedServerSeed);
      sd.chainLinkOk = sd.nextHashedServerSeed != null ? sd.nextHashedServerSeed === next.hashedServerSeed : null;
      sd.commitVerified = v.commitOk && v.bad === 0;
      console.log(`  epoch ${E} revealed: commit ${v.commitOk ? 'OK' : 'FAIL'}, ${v.checked - v.bad}/${v.checked} R recomputed ${v.bad ? '❌' : '✅'}`);
    } catch (e) { console.log(`  ⚠️  closeout reveal failed: ${e.message} — --resume to re-capture epoch ${E}.`); }
  }
  saveExposureWitness();
  save();
}

/** Retain every max-exposure refusal the operator returned, as an evidence record.
 *  This is a WITNESSED ENFORCEMENT — the operator refused a bet and named its own limit — which is
 *  a strictly stronger class of evidence than a config field read from the client bundle. LIQD Dice
 *  had to declare its exposure cap unwitnessed for exactly the want of this. Written even when the
 *  list is empty, so "no refusal occurred" is recorded as a measurement rather than left as a
 *  silent absence. */
function saveExposureWitness() {
  try {
    writeFileSync(join(OUT_DIR, 'E15-limbo-max-exposure.json'), JSON.stringify({
      what: 'Operator-enforced maximum exposure (potential payout) on originals/limbo place-bet',
      capturedAgainst: 'qa.liqd.com',
      errorCode: 3138,
      errorName: 'MaxExposureExceededError',
      estimatedCeilingUsdc: MAX_EXPOSURE_USDC,
      observedCeilingUsdc: EXPOSURE_OBSERVED,
      ceilingIsDerived: 'stake x target; derived from the operator\'s own maxAllowedBetUsdc in each refusal below',
      refusals: exposureWitness,
      note: exposureWitness.length === 0
        ? 'No refusal occurred during this run: every bet was sized under the estimated ceiling before being sent. The ceiling therefore rests on the pre-flight witness recorded separately, NOT on this run.'
        : 'Each entry is a live refusal with the operator\'s stated maximum for that target. This does not establish the ceiling for targets or currencies not probed here.',
    }, null, 2));
  } catch { /* evidence write must never take the capture down */ }
}
let closing = false;
process.on('SIGINT', async () => { if (closing) { console.log('\nForce quit.'); process.exit(1); } closing = true; console.log('\n\nInterrupted — closing the chain (Ctrl-C again to force)...'); try { await closeout('interrupt'); } catch (e) { console.log('closeout error: ' + e.message); } console.log('Resume with --resume.'); process.exit(0); });

// ── Demo ────────────────────────────────────────────────────────────────────────
async function runDemo() {
  console.log(`${C.dim}DEMO — synthetic render, no bets, no auth${C.reset}\n`);
  const t0 = Date.now(); let i = 0;
  for (let E = 0; E < EPOCHS.length; E++) { const epc = EPOCHS[E]; for (let j = 0; j < epc.bets.length; j++) { i++; const p = epc.bets[j].params; const rate = i / Math.max(0.001, (Date.now() - t0) / 1000); draw(i, epc.phase, tLabel(p), rate, t0, `${tLabel(p)} ${Math.random() < 1 / p.target ? 'x' + p.target : 'loss'}`); await sleep(1); } logAbove(`  ${C.green}✔${C.reset} epoch ${String(E).padStart(3)} ${phaseBadge(epc.phase)} ${C.dim}commit${C.reset} ${C.green}OK${C.reset}  ${C.dim}chain${C.reset} ${C.green}OK${C.reset}  ${C.dim}R${C.reset} ${epc.bets.length}/${epc.bets.length} ${C.green}✓${C.reset}`); }
  if (isTTY) process.stdout.write(CLR);
  console.log(`\n${C.green}✅ demo complete${C.reset} — the live run renders exactly like this.\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────────
(async () => {
  console.log('='.repeat(64) + '\n  LIQD Limbo capture\n' + '='.repeat(64));
  if (DEMO) { await runDemo(); return; }
  if (!COOKIE) { console.log('\n❌ LIQD_COOKIE not set. Run:  source ./set-cookie.sh\n'); process.exit(1); }
  try {
    if (PROBE) { await runProbe(); return; }
    const startEpoch = RESUME ? load() : 0;
    await runCapture(startEpoch);
  } catch (e) {
    if (e.kind === 'AUTH') { logAbove(`\n${C.yellow}⏸  Auth lost${C.reset} — ${e.message}`); try { await closeout('auth'); } catch {} console.log(`\n${C.bold}Cookie expired. Refresh + resume:${C.reset}\n  source ./set-cookie.sh\n  npm run resume\n`); process.exit(2); }
    logAbove(`\n${C.red}FATAL${C.reset} — ${e.message}`); try { await closeout('fatal'); } catch {} console.log(`\nResume with:  npm run resume\n`); process.exit(1);
  }
})();
