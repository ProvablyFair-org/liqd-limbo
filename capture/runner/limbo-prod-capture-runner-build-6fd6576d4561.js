// ============================================================================
//  LIQD Limbo - IN-PAGE PROD capture runner (written 2026-11-03). Paste the whole file into the DevTools console of the
//  auditor's logged-in https://liqd.com limbo tab. It refuses to do anything on any other origin. The browser sends its
//  own session with each same-origin request; this script never reads cookies, storage or tokens.
//  Modelled on the keno prod runner that ran on 2026-10-21 (repositories/liqd/keno/capture/prod-2026-10-21/).
//
//  Requests:
//    GET  /api/v1/fast-games/provably-fair/active     the active seed commitment (hash) and the next one
//    POST /api/v1/fast-games/provably-fair/rotate     { clientSeed }: reveals the active server seed
//    POST /api/v1/originals/limbo/place-bet           { idempotencyKey, stake, currencyId, stakeCurrency, params: { target } }
//    POST /api/v1/originals/limbo/verify              { serverSeed, clientSeed, nonce, params: { target } } (prod, 2026-11-03)
//  1. Pre-capture anchor: read active + next hash, then rotate (reveals the active seed) before any bet.
//  2. 5 epochs of 50 rounds; each epoch plays all 50 targets once, log-spaced from 1.01x to 10,000x (the
//     highest target; prod's verifier refused 100,000x on 2026-11-03), so each target gets 5 rounds; stake 0.10;
//     client seeds ("audit" + 12 hex) from the browser CSPRNG; every epoch closed by a rotation (250 rounds, 6 rotations).
//  3. Then the verify endpoint once per round, with its revealed seed. Every reply is stored as received.
//  Every place-bet carries an idempotencyKey written to storage BEFORE it is sent; a retry or a resume re-sends the same key,
//  so a lost reply never becomes a second bet.
//  Guards: hard cap 250 rounds (never more, whatever the options); a balance floor (the run stops before a round that could
//  take the balance below it); any refusal, auth failure, lost rotation or unexpected reply shape stops the run.
//  Every event goes to this origin's IndexedDB before the next request: a reload or re-login loses nothing.
//
//  API (window.__limbo):
//    await __limbo.dry()                                   read-only: seeds, the page's API paths, wallet currencies. No bet.
//    await __limbo.start({ stakeCurrency, floor, currencyId, balance, limit, maxBets })
//    await __limbo.resume({ floor })                       continue after any resumable stop (after a reload: paste again first)
//    await __limbo.resume({ skipRefused: true })           skip ONE round the site refused with HTTP 400 before it was placed
//    __limbo.stop()                                        stop after the current request
//    __limbo.status() / __limbo.statusText()                  progress, money, guard, stop reason, epoch checks, findings
//    await __limbo.exportFile()                            secret scan, then ONE download: liqd-limbo-prod-capture-<ISO>.ndjson
//        IPv4/IPv6 addresses are replaced by "[ip redacted]" in the exported copy (counted in a final 'export-note' line);
//        a JWT, an e-mail or a secret-looking key still refuses the export. The stored events are never changed.
//    await __limbo.reset('discard')                        wipe the stored run (only after its file is exported and checked)
//  Built from runners/_build (core.js + games/limbo.js) by runners/_build/build.mjs.
// ============================================================================
(function (root) {
  'use strict';
  const ORIGIN = 'https://liqd.com';
  const P_ACTIVE = '/api/v1/fast-games/provably-fair/active', P_ROTATE = '/api/v1/fast-games/provably-fair/rotate';
  const STAKE = '0.10000000', STAKE_U = 10000000n;
  // Rounds per run: start({ bets }) sets the plan's size, an integer DEFAULT_BETS (the 250-round sample) .. MAX_BETS (a full
  // capture). The plan is cut into epochs of about EPOCH_TARGET rounds (never fewer than MIN_EPOCHS), each closed by a seed
  // rotation: sizes differ by at most 1, so 250 rounds stay 5 x 50 and 7,000 are 35 x 200.
  const DEFAULT_BETS = 250, MIN_BETS = 5, MAX_BETS = 7000, EPOCH_TARGET = 200, MIN_EPOCHS = 5;
  function epochSizes(n) { const k = Math.max(MIN_EPOCHS, Math.ceil(n / EPOCH_TARGET)); return Array.from({ length: k }, (_, e) => Math.floor(n / k) + (e < n % k ? 1 : 0)); }
  /** The plan's round specs (in play order) cut into epochs by epochSizes. */
  function epochsOf(specs) { let i = 0; return epochSizes(specs.length).map((m) => ({ phase: 'A', group: null, seed: { tag: 'audit' }, bets: specs.slice(i, (i += m)) })); }
  function betsOpt(v) {
    if (v === undefined) return DEFAULT_BETS;
    const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v;
    if (!Number.isInteger(n) || n < MIN_BETS || n > MAX_BETS) throw new Error(`bets must be an integer from ${MIN_BETS} to ${MAX_BETS} (the default is ${DEFAULT_BETS}); got ${JSON.stringify(v)}. Nothing was sent`);
    return n;
  }
  const DEFAULTS = { betDelayMs: 1000, stepDelayMs: 300, verifyDelayMs: 500, maxRetries: 20, backoffMs: 2000, timeoutMs: 25000 };
  const SEED_META = { generator: '"audit" + 6 bytes of crypto.getRandomValues as hex (browser CSPRNG)', predictable: false };

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const iso = () => new Date().toISOString();
  const msg = (e) => String((e && e.message) || e).slice(0, 200);
  const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  const sha256 = async (bytes) => hex(await root.crypto.subtle.digest('SHA-256', bytes));
  const utf8 = (s) => new root.TextEncoder().encode(s);
  const decode = (b) => new root.TextDecoder('utf-8', { ignoreBOM: true }).decode(b);
  function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000))); return root.btoa(s); }
  class KpError extends Error { constructor(m, kind, http, json) { super(m); this.kind = kind; this.http = http || null; this.json = json || null; } }
  const stopErr = (reason, m) => { const e = new KpError(m, 'STOP'); e.stop = reason; return e; };
  function units(s) {
    const m = /^(\d+)(?:\.(\d{1,8}))?$/.exec(String(s));
    if (!m) throw new KpError(`not an amount: ${String(s).slice(0, 30)}`, 'STOP');
    return BigInt(m[1]) * 100000000n + BigInt((m[2] || '').padEnd(8, '0'));
  }
  const fmt = (u) => { const n = u < 0n ? -u : u; return `${u < 0n ? '-' : ''}${n / 100000000n}.${String(n % 100000000n).padStart(8, '0')}`; };
  const toAmount = (x) => (typeof x === 'number' ? x.toFixed(8) : String(x).trim());
  const unitsOf = (x) => { if (x === null || x === undefined || x === '') return null; try { return units(toAmount(x)); } catch (e) { return null; } };
  function randInt(n) { const lim = Math.floor(0x100000000 / n) * n, b = new Uint32Array(1); for (;;) { root.crypto.getRandomValues(b); if (b[0] < lim) return b[0] % n; } }
  function shuffled(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const newSeed = () => 'audit' + hex(root.crypto.getRandomValues(new Uint8Array(6)));
  const pick = (a, ...k) => { for (const x of k) if (a && a[x] != null) return a[x]; return undefined; };

  // Pause: a worker timer (a hidden tab throttles page timers) raced against a page timer, so it can only fall back, never hang.
  let worker = null, workerDead = false, wseq = 0; const wwait = new Map();
  function getWorker() {
    if (worker || workerDead || typeof root.Worker !== 'function' || !root.Blob || !root.URL || !root.URL.createObjectURL) return worker;
    try {
      worker = new root.Worker(root.URL.createObjectURL(new root.Blob(['onmessage=function(e){setTimeout(function(){postMessage(e.data.id)},e.data.ms)}'], { type: 'text/javascript' })));
      worker.onmessage = (e) => { const r = wwait.get(e.data); if (r) { wwait.delete(e.data); r(); } };
      worker.onerror = () => { workerDead = true; worker = null; for (const r of wwait.values()) r(); wwait.clear(); };
    } catch (e) { workerDead = true; worker = null; }
    return worker;
  }
  function sleep(ms) {
    return new Promise((resolve) => {
      let done = false; const fin = () => { if (!done) { done = true; resolve(); } };
      const w = ms > 0 ? getWorker() : null;
      if (w) { const id = ++wseq; wwait.set(id, fin); try { w.postMessage({ id, ms }); } catch (e) { wwait.delete(id); } }
      root.setTimeout(fin, ms);
    });
  }

  // ── Secrets (the export scan, as the keno prod runner) ──
  const SECRET_KEY_RE = /(cookie|authori[sz]ation|token|password|passwd|secret|session|jwt|e-?mail|^cf_|bearer|api[-_]?key)/i;
  const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./;
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
  const IPV4_RE = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;
  const ipv4Private = (ip) => { const [a, b] = ip.split('.').map(Number); return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168); };
  function scrub(v, dropped, path) {
    if (Array.isArray(v)) return v.map((x, i) => scrub(x, dropped, `${path}[${i}]`));
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { if (SECRET_KEY_RE.test(k)) dropped.push(path ? `${path}.${k}` : k); else o[k] = scrub(x, dropped, path ? `${path}.${k}` : k); } return o; }
    return v;
  }
  function assertLineClean(line) {
    if (JWT_RE.test(line)) throw new KpError('SCRUBBER: a JWT-shaped string reached a record; nothing stored for it', 'SCRUBBER');
    if (EMAIL_RE.test(line)) throw new KpError('SCRUBBER: an e-mail address reached a record; nothing stored for it', 'SCRUBBER');
  }
  function scanLine(text) {
    const hits = [];
    if (JWT_RE.test(text)) hits.push('JWT-shaped string');
    if (EMAIL_RE.test(text)) hits.push('e-mail address');
    if (Array.from(text.matchAll(IPV4_RE)).some((m) => !ipv4Private(m[0]))) hits.push('IPv4 address');
    let rec = null; try { rec = JSON.parse(text); } catch (e) { hits.push('unreadable line'); }
    const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (SECRET_KEY_RE.test(k)) hits.push(`secret-looking key "${k}"`); walk(x); } };
    if (rec) { walk(rec); if (typeof rec.body === 'string') { try { walk(JSON.parse(rec.body)); } catch (e) { /* non-JSON body: stored as received */ } } }
    return Array.from(new Set(hits));
  }
  const IP_MARK = '[ip redacted]';
  const IPV6_CAND_RE = /(?<![0-9A-Za-z:])[0-9A-Fa-f]{0,4}(?::[0-9A-Fa-f]{0,4}){2,7}(?![0-9A-Za-z:])/g;
  function isIpv6(s) {
    if ((s.match(/:/g) || []).length < 3) return false;
    const halves = s.split('::'), g = (x) => (x ? x.split(':') : []), hexg = (p) => /^[0-9A-Fa-f]{1,4}$/.test(p);
    if (halves.length > 2) return false;
    if (halves.length === 1) { const p = s.split(':'); return p.length === 8 && p.every(hexg); }
    const p = g(halves[0]).concat(g(halves[1])); return p.length <= 7 && p.every(hexg);
  }
  function redactIps(line) {
    let v4 = 0, v6 = 0;
    const out = line.replace(IPV4_RE, () => { v4++; return IP_MARK; }).replace(IPV6_CAND_RE, (m) => (isIpv6(m) ? (v6++, IP_MARK) : m));
    return { out, v4, v6 };
  }

  // ── Transport: same-origin fetch, the browser attaches the session ─────────────
  let REFERRER = ORIGIN;
  async function fetchRaw(method, path, bodyText, o) {
    const ctl = new root.AbortController(), timer = root.setTimeout(() => ctl.abort(), o.timeoutMs);
    try {
      let res;
      const headers = bodyText === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' };
      try { res = await root.fetch(ORIGIN + path, { method, credentials: 'include', headers, body: bodyText, redirect: 'manual', cache: 'no-store', referrer: REFERRER, signal: ctl.signal }); }
      catch (e) { throw new KpError(e && e.name === 'AbortError' ? `timeout (${o.timeoutMs} ms)` : `network: ${msg(e).slice(0, 100)}`, 'TRANSIENT'); }
      if (res.type === 'opaqueredirect') throw new KpError('redirect (not followed): session expired?', 'AUTH');
      let buf; try { buf = await res.arrayBuffer(); } catch (e) { throw new KpError('reply body read failed', 'TRANSIENT'); }
      return { status: res.status, date: res.headers.get('date'), contentType: res.headers.get('content-type'), bytes: new Uint8Array(buf) };
    } finally { root.clearTimeout(timer); }
  }
  const CF_RE = /cf-mitigated|Just a moment|__cf_chl|challenge-platform|Cloudflare Access|<!DOCTYPE html|<html/i;
  /** JSON in, the `data` envelope unwrapped; errors classified AUTH / TRANSIENT (rateLimited on 429) / API (refusal). */
  async function http(method, path, body, o) {
    const r = await fetchRaw(method, path, body === undefined ? undefined : JSON.stringify(body), o);
    const text = decode(r.bytes), status = r.status;
    const meta = { status, date: r.date, contentType: r.contentType, bodyBytes: r.bytes.length, bodySha256: await sha256(r.bytes) };
    if (status === 401 || status === 403 || (status >= 300 && status < 400)) throw new KpError(`HTTP ${status}: auth rejected`, 'AUTH', meta);
    if (status === 429 || status >= 500 || status === 0) { const e = new KpError(`HTTP ${status}`, 'TRANSIENT', meta); e.rateLimited = status === 429; throw e; }
    if (CF_RE.test(text)) throw new KpError('an HTML / Cloudflare page came back: session expired or challenge', 'AUTH', meta);
    let json; try { json = JSON.parse(text); } catch (e) { throw new KpError(`HTTP ${status}: non-JSON reply`, 'TRANSIENT', meta); }
    if (json && Array.isArray(json.errors) && json.errors.length) throw new KpError(`refused (HTTP ${status}): ${JSON.stringify(json.errors).slice(0, 300)}`, 'API', meta, json);
    if (status >= 400) throw new KpError(`refused (HTTP ${status}): ${text.slice(0, 200)}`, 'API', meta, json);
    return { data: json && json.data !== undefined ? json.data : json, http: meta };
  }
  async function retrying(fn, label, o) {
    for (let attempt = 1; ; attempt++) {
      try { return await fn(); } catch (e) {
        if (e.kind !== 'TRANSIENT' || attempt >= o.maxRetries) throw e;
        S.retries++; log(`${label}: ${e.message.slice(0, 60)}; retry ${attempt}/${o.maxRetries}`);
        await sleep(Math.min(o.backoffMs * attempt, 30000));
      }
    }
  }
  const seedState = (a) => ({ hashedServerSeed: pick(a, 'activeServerSeedHash', 'hashedServerSeed'), nextHashedServerSeed: pick(a, 'nextServerSeedHash', 'nextHashedServerSeed'),
    clientSeed: pick(a, 'clientSeed', 'activeClientSeed'), nonce: pick(a, 'nonce'), revealedServerSeed: pick(a, 'revealedServerSeed', 'serverSeed'), gamesInProgress: pick(a, 'gamesInProgress') });
  const stateOf = (r) => ({ hashedServerSeed: r.hashedServerSeed, nextHashedServerSeed: r.nextHashedServerSeed, clientSeed: r.clientSeed, nonce: r.nonce, revealedServerSeed: r.revealedServerSeed });
  async function active(o) { const r = await http('GET', P_ACTIVE, undefined, o); return { ...seedState(r.data), raw: r.data, http: r.http }; }
  const inProgress = (a) => Array.isArray(a.gamesInProgress) && a.gamesInProgress.length > 0;
  /** A rotation is not safe to repeat blindly: on a lost reply the active hash is read, and the rotation re-sent only if it did not happen. */
  async function safeRotate(expectHash, clientSeed, o) {
    for (let attempt = 1; ; attempt++) {
      try { const r = await http('POST', P_ROTATE, { clientSeed }, o); return { ...seedState(r.data), raw: r.data, http: r.http }; } catch (e) {
        if (e.kind !== 'TRANSIENT' || attempt >= o.maxRetries) throw e;
        S.retries++; log(`rotate: ${e.message.slice(0, 60)}; checking whether it went through`);
        await sleep(Math.min(o.backoffMs * attempt, 20000));
        const a = await retrying(() => active(o), 'active', o);
        if (a.hashedServerSeed !== expectHash) {
          const m = `the rotation away from ${expectHash} went through but its reply (the revealed seed) was lost`;
          await append({ t: 'gap', origin: 'capture', note: m });
          throw new KpError(`${m}. Export the file and send it; do not resume.`, 'ABORT');
        }
      }
    }
  }

  // ── The game (its endpoints, plan, round flow and reply shapes) ──────────────────
  const K = { ORIGIN, STAKE, STAKE_U, epochsOf, KpError, stopErr, units, unitsOf, fmt, toAmount, randInt, shuffled, sleep, iso, pick, inProgress, retrying, http, active,
    append: (e) => append(e), log: (m) => log(m), retried: (label, e) => { S.retries++; log(`${label}: ${msg(e).slice(0, 60)}; checking the account before sending again`); } };
  const G = (function (K) {
  'use strict';
  // ── The originals engine's single-step round (dice, limbo; the keno prod runner's protocol) ──
  //    place-bet { idempotencyKey, stake, currencyId, stakeCurrency, params } settles in one request; a retry or a resume re-sends
  //    the SAME key, so a lost reply never becomes a second bet (the keno prod runner of 2026-10-21 ran this way).
  //    Reply: { idempotencyKey, consumedNonce, provablyFair: { serverSeedHash, clientSeed, nonce, serverSeedStatus },
  //             round: { roundId, betId, clientSeed, serverSeedId, nonce, cursor, wagers: [{ stake, stakeWallet, result, winningAmount, winningAmountWallet, params, outcome }] } }
  //    (the keno prod file of 2026-10-21 holds this shape as received).
  function originalsBody(K, ctx, params) {
    const m = ctx.meta;
    return { idempotencyKey: ctx.intent.key, stake: K.STAKE, ...(m.currencyId === null ? {} : { currencyId: m.currencyId }), stakeCurrency: m.stakeCurrency, params };
  }
  async function originalsPlace(K, ctx, path, body) {
    return K.retrying(() => ctx.http('POST', path, body), 'place-bet', ctx.o);
  }
  function originalsRec(K, body, s, http) {
    const round = s.round || {}, w = (round.wagers || [])[0] || {}, pf = s.provablyFair || {};
    return {
      requestBody: body, idempotencyEcho: s.idempotencyKey ?? null, betId: round.betId ?? null, roundId: round.roundId ?? null,
      serverSeedHash: pf.serverSeedHash ?? null, serverSeedId: round.serverSeedId ?? null, serverSeedStatus: pf.serverSeedStatus ?? null,
      clientSeed: pf.clientSeed ?? round.clientSeed ?? null, roundClientSeed: round.clientSeed ?? null,
      nonce: s.consumedNonce ?? pf.nonce ?? round.nonce ?? null, roundNonce: round.nonce ?? null, consumedNonce: s.consumedNonce ?? null, cursor: round.cursor ?? null,
      wagerCount: (round.wagers || []).length, logicVersion: w.logicVersion ?? null, servedParams: w.params ?? null, outcome: w.outcome ?? null,
      stake: w.stake ?? null, stakeWallet: w.stakeWallet ?? null, winningAmount: w.winningAmount ?? null, winningAmountWallet: w.winningAmountWallet ?? null, result: w.result ?? null,
      stakeTotal: w.stake != null ? K.toAmount(w.stake) : null, wonTotal: w.winningAmount != null ? K.toAmount(w.winningAmount) : null,
      raw: s, http,
    };
  }
  function originalsShape(K, rec) {
    const bad = [];
    if (!rec.betId) bad.push('no round.betId');
    if (!Number.isInteger(rec.nonce)) bad.push(`nonce ${JSON.stringify(rec.nonce)}`);
    if (rec.wagerCount !== 1) bad.push(`${rec.wagerCount} wagers`);
    if (K.unitsOf(rec.stake) !== K.STAKE_U) bad.push(`stake ${JSON.stringify(rec.stake)}`);
    if (K.unitsOf(rec.winningAmount) === null) bad.push(`winningAmount ${JSON.stringify(rec.winningAmount)}`);
    if (rec.result !== 'won' && rec.result !== 'lost') bad.push(`result ${JSON.stringify(rec.result)}`);
    if (!rec.outcome || typeof rec.outcome !== 'object') bad.push('no wager outcome');
    return bad;
  }
  /** The verify replies of the originals engine: { gameType, seeds: { clientSeed, nonce }, derivationParams, outcome } (prod, logged out, 2026-11-03). */
  function originalsEcho(rec, d, params) {
    const dp = d.derivationParams || {};
    return !!d.seeds && d.seeds.clientSeed === rec.clientSeed && d.seeds.nonce === rec.nonce && Object.keys(params).every((k) => dp[k] === params[k]);
  }
  const P_BET = '/api/v1/originals/limbo/place-bet', P_VERIFY = '/api/v1/originals/limbo/verify';
  // 50 targets, log-spaced from 1.01x to 10,000x (above which the prod verifier refused on 2026-11-03), rounded to the 0.01 grid. 5 rounds each: every epoch plays all 50 once.
  const CEILING = 10000, FULL_TOP = 100;
  const ladder = (top) => Array.from({ length: 50 }, (_, i) => Math.min(top, Math.round(1.01 * Math.pow(top / 1.01, i / 49) * 100) / 100));
  let TOP = CEILING, TARGETS = ladder(CEILING);
  return {
    name: 'limbo', title: 'LIQD Limbo', gameId: 'originals-limbo', global: '__limbo', page: '/originals/limbo',
    version: 'limbo-prod-capture-runner 2026-11-03 build 6fd6576d4561',
    verifyPath: P_VERIFY, maxOutlayU: K.STAKE_U, resumesOpenRound: false,
    endpoints: () => ({ placeBet: P_BET, verify: P_VERIFY }),
    metaExtra: () => ({ targets: TARGETS, targetRule: `1.01 x (${TOP} / 1.01)^(i / 49), i = 0..49, rounded to 0.01`, ceiling: CEILING, ladderTop: TOP, houseEdge: 0.01 }),
    buildPlan(n) { TOP = n > 250 ? FULL_TOP : CEILING; TARGETS = ladder(TOP); return K.epochsOf(Array.from({ length: n }, (_, i) => ({ target: TARGETS[i % 50], amount: 0.1 }))); },   // round i plays target i mod 50
    settingKey: (spec) => String(spec.target),
    async play(intent, ctx) {
      const body = originalsBody(K, ctx, { target: intent.spec.target });
      const r = await originalsPlace(K, ctx, P_BET, body);
      const rec = originalsRec(K, body, r.data, r.http), oc = rec.outcome || {};
      return { rec: { ...rec, limboResult: oc.result ?? null, win: oc.win ?? null, multiplier: oc.multiplier ?? null } };
    },
    shape(rec) {
      const bad = originalsShape(K, rec);
      if (typeof rec.limboResult !== 'number') bad.push(`outcome.result ${JSON.stringify(rec.limboResult)}`);
      if (typeof rec.win !== 'boolean') bad.push(`outcome.win ${JSON.stringify(rec.win)}`);
      if (typeof rec.multiplier !== 'number') bad.push(`outcome.multiplier ${JSON.stringify(rec.multiplier)}`);
      return bad.length ? bad.join('; ') : null;
    },
    summary: (rec) => ({ target: rec.spec.target, result: rec.limboResult, win: rec.win, multiplier: rec.multiplier, winningAmount: rec.winningAmount, nonce: rec.nonce }),
    verifyBody: (rec, serverSeed) => ({ serverSeed, clientSeed: rec.clientSeed, nonce: rec.nonce, params: { target: rec.spec.target } }),
    verifyShape(d) {
      const o = d && d.outcome;
      if (!o || typeof o.result !== 'number' || typeof o.win !== 'boolean' || typeof o.multiplier !== 'number') return 'no outcome.result / outcome.win / outcome.multiplier';
      return null;
    },
    verifyCompare: (rec, d) => ({ echo: originalsEcho(rec, d, { target: rec.spec.target }), result: d.outcome.result === rec.limboResult, win: d.outcome.win === rec.win, multiplier: d.outcome.multiplier === rec.multiplier }),
  };
})(K);
  const VERSION = G.version;
  REFERRER = ORIGIN + G.page;
  const DB_NAME = `pf-liqd-${G.name}-prod-capture`, LOCK_NAME = DB_NAME + '-run', FILE_PREFIX = `liqd-${G.name}-prod-capture-`;
  const GLOBAL = G.global;
  const MAX_OUTLAY_U = G.maxOutlayU || STAKE_U;

  const prev = root[GLOBAL];
  if (prev && typeof prev.isRunning === 'function' && prev.isRunning()) {
    root.console && root.console.warn(`${GLOBAL}: a run is in progress in this tab; the running instance is kept.`);
    return;
  }

  // ── Storage: this origin's IndexedDB ───────────────────────────────────────────
  function memoryStore() { const m = new Map(); return { kind: 'memory (lost on reload)', get: async (k) => m.get(k), put: async (k, v) => { m.set(k, v); }, clear: async () => { m.clear(); } }; }
  function idbStore() {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const rq = root.indexedDB.open(DB_NAME, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); rq.onblocked = () => rej(new Error('IndexedDB open blocked'));
    }));
    const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('kv', mode), rq = fn(t.objectStore('kv')); let out; rq.onsuccess = () => { out = rq.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('IndexedDB transaction aborted')); }); };
    return { kind: 'indexeddb', get: (k) => tx('readonly', (s) => s.get(k)), put: (k, v) => tx('readwrite', (s) => s.put(v, k)), clear: () => tx('readwrite', (s) => s.clear()) };
  }
  const store = typeof root.__pfStoreFactory === 'function' ? root.__pfStoreFactory() : root.indexedDB ? idbStore() : memoryStore();

  // ── State: the journal (append-only) is the record; everything else is derived from it ──
  const S = { ev: [], lines: [], guard: null, running: false, stopReq: false, stop: null, state: 'loading', retries: 0, epochs: [], findings: [], log: [],
    session: null, exported: null, runPromise: null, dry: null, lastBet: null, anchor: null, opts: { ...DEFAULTS } };
  const log = (m) => { S.log.push(`${iso()} ${m}`); if (S.log.length > 60) S.log.shift(); root.console && root.console.log(`[${GLOBAL}] ` + m); };
  async function append(evt) {
    const dropped = [];
    const o = scrub({ at: iso(), ...evt }, dropped, '');
    if (dropped.length) o.droppedKeys = dropped;
    const line = JSON.stringify(o);
    assertLineClean(line);
    try { await store.put('ev:' + S.lines.length, line); } catch (e) { throw new KpError(`could not store event ${S.lines.length}: ${msg(e)}`, 'STORAGE'); }
    S.lines.push(line); S.ev.push(o);
    return o;
  }
  function derive(ev) {
    const D = { meta: null, pre: null, preRot: null, lastRot: null, rots: [], epochs: new Map(), refusals: [], bets: [], lost: [], abandoned: new Map(), intents: [], settled: new Set(), verifyOk: new Map(), betsDone: false, done: false, abort: null, opts: {} };
    for (const e of ev) {
      if (e.t === 'meta') D.meta = e.meta;
      else if (e.t === 'pre') D.pre = e;
      else if (e.t === 'rotate') { if (e.closes === 'pre') D.preRot = e; else D.rots[e.closes] = e; D.lastRot = e; }
      else if (e.t === 'refusal') D.refusals.push(e);
      else if (e.t === 'epoch') D.epochs.set(e.epoch, e);
      else if (e.t === 'intent') D.intents.push(e);
      else if (e.t === 'bet') { D.bets.push(e.rec); D.settled.add(e.rec.key); }
      else if (e.t === 'lost') { D.lost.push(e); D.settled.add(e.key); }
      else if (e.t === 'abandon') { D.abandoned.set(e.key, e); D.settled.add(e.key); }
      else if (e.t === 'option') Object.assign(D.opts, e.set);
      else if (e.t === 'verify') { if (classifyStored(e).cls === 'ok') D.verifyOk.set(e.seq, e); }
      else if (e.t === 'bets-done') D.betsDone = true;
      else if (e.t === 'done') D.done = true;
      else if (e.t === 'abort') D.abort = e;
    }
    const nPlan = D.meta ? D.meta.plan.length : 5;
    D.closed = 0; while (D.closed < nPlan && D.rots[D.closed]) D.closed++;
    D.cur = D.lastRot ? D.lastRot.state : null;
    D.keys = new Set(D.intents.map((i) => i.key)).size;
    D.unsettled = D.intents.filter((i) => !D.settled.has(i.key)).pop() || null;
    D.planned = D.meta ? D.meta.plan.reduce((s, e) => s + e.bets.length, 0) : DEFAULT_BETS;
    D.doneIn = (E) => D.bets.filter((b) => b.epoch === E).length + D.lost.filter((x) => x.epoch === E).length + Array.from(D.abandoned.values()).filter((x) => x.epoch === E).length;
    D.playable = D.planned - D.abandoned.size;
    return D;
  }
  function money(D) {
    let staked = 0n, won = 0n;
    for (const b of D.bets) { try { staked += units(b.stakeTotal); won += units(b.wonTotal); } catch (e) { /* reported by the shape stop */ } }
    for (const x of D.lost) staked += MAX_OUTLAY_U;   // settlement not seen: the guard assumes the worst until the wallet is read
    return { staked, won };
  }

  // ── The balance guard (kept in this browser only, never exported) ─────────────
  function guardMsg(D) {
    const g = S.guard; if (!g) return 'no balance guard is stored: start({ floor }) sets one';
    const { staked, won } = money(D), proj = g.startU - staked + won + g.adjU;
    if (proj - MAX_OUTLAY_U < g.floorU) return `the next round could take the balance to ${fmt(proj - MAX_OUTLAY_U)} ${D.meta.stakeCurrency} (a round can cost up to ${fmt(MAX_OUTLAY_U)}), below the floor ${fmt(g.floorU)}`;
    return null;
  }
  const projected = (D) => { const g = S.guard; if (!g) return null; const { staked, won } = money(D); return g.startU - staked + won + g.adjU; };

  // ── Wallet (read-only): the page's own wallet/balance request, found among the requests it has already made ──
  function apiSeen() {
    const names = root.performance && typeof root.performance.getEntriesByType === 'function' ? root.performance.getEntriesByType('resource').map((e) => e.name) : [];
    const paths = new Set(), hosts = new Set();
    for (const n of names) { let u; try { u = new root.URL(n); } catch (e) { continue; } if (!/^\/api\//.test(u.pathname)) continue; if (u.origin === ORIGIN) paths.add(u.pathname); else hosts.add(u.host); }
    return { paths: Array.from(paths).sort().slice(0, 40), otherHosts: Array.from(hosts) };
  }
  function walletEntries(data) {
    const out = [];
    const isAmt = (x) => (typeof x === 'number' && isFinite(x)) || (typeof x === 'string' && /^\d+(\.\d+)?$/.test(x));
    const walk = (v, d) => {
      if (d > 6 || !v || typeof v !== 'object' || out.length >= 20) return;
      if (Array.isArray(v)) { v.forEach((x) => walk(x, d + 1)); return; }
      const co = v.currency && typeof v.currency === 'object' ? v.currency : null;
      const cur = [v.currency, v.currencyCode, v.currencySymbol, v.symbol, v.ticker, co && (co.code || co.symbol || co.name)].find((x) => typeof x === 'string' && /^[A-Za-z0-9.]{2,12}$/.test(x));
      const bal = [v.balance, v.availableBalance, v.available, v.amount, v.total].find(isAmt);
      if (cur && bal !== undefined) out.push({ currency: cur, currencyId: v.currencyId ?? (co ? co.id ?? null : null), balance: toAmount(bal) });
      for (const k of Object.keys(v)) walk(v[k], d + 1);
    };
    walk(data, 0);
    return out;
  }
  async function walletRead(o, path) {
    const cands = path ? [path] : apiSeen().paths.filter((p) => /wallet|balance/i.test(p) && !/history|transaction|deposit|withdraw/i.test(p)).slice(0, 3);
    if (!cands.length) return { found: false, note: 'no wallet or balance request seen on this page: read the balance in the site header and pass it as balance' };
    const tried = [];
    for (const p of cands) {
      try { const r = await http('GET', p, undefined, o); const entries = walletEntries(r.data); if (entries.length) return { found: true, path: p, entries }; tried.push(`${p}: no currency/balance pair in the reply`); }
      catch (e) { tried.push(`${p}: ${e.message.slice(0, 80)}`); }
    }
    return { found: false, tried, note: 'read the balance in the site header and pass it as balance' };
  }
  async function walletRefresh(o) {
    const g = S.guard; if (!g || !g.walletPath) return;
    let w; try { w = await walletRead(o, g.walletPath); } catch (e) { return; }
    const en = w.found && w.entries.find((x) => x.currency.toUpperCase() === g.currency.toUpperCase());
    if (!en) return;
    let m; try { m = units(en.balance); } catch (e) { return; }
    const p = projected(derive(S.ev));
    if (m < p) { g.adjU -= p - m; log(`wallet reads ${fmt(m)}, below the projected ${fmt(p)}: the guard now uses the wallet figure`); try { await store.put('guard', guardOut(g)); } catch (e) { /* kept in memory */ } }
  }
  const guardOut = (g) => ({ floor: fmt(g.floorU), start: fmt(g.startU), adj: fmt(g.adjU), source: g.source, walletPath: g.walletPath, currency: g.currency });
  const guardIn = (x) => (x ? { floorU: units(x.floor), startU: units(x.start), adjU: (String(x.adj).startsWith('-') ? -1n : 1n) * units(String(x.adj).replace('-', '')), source: x.source, walletPath: x.walletPath, currency: x.currency } : null);

  // ── Live checks shown in status() (the offline checker re-derives everything from the file) ──
  async function epochCheck(D, E) {
    const ep = D.epochs.get(E), rot = D.rots[E], seed = rot && rot.state.revealedServerSeed;
    const commit = !!seed && (await sha256(utf8(seed))) === ep.hashedServerSeed;
    const bets = D.bets.filter((b) => b.epoch === E);
    const c = { epoch: E, bets: bets.length, lost: D.lost.filter((x) => x.epoch === E).length, commit: commit ? 'OK' : 'FAIL', chain: ep.nextHashedServerSeed === rot.state.hashedServerSeed ? 'OK' : 'FAIL',
      hash: bets.every((b) => b.serverSeedHash === null || b.serverSeedHash === ep.hashedServerSeed) ? 'OK' : 'FAIL', clientSeed: ep.clientSeed === ep.submitted ? 'accepted' : 'NOT accepted' };
    S.epochs[E] = c;
    if (c.commit !== 'OK' || c.chain !== 'OK' || c.hash !== 'OK') S.findings.push({ epoch: E, what: `epoch ${E}: commit ${c.commit}, chain ${c.chain}, round hashes ${c.hash}` });
  }
  async function preCheck(D) {
    const seed = D.preRot.state.revealedServerSeed;
    S.anchor = { commit: !!seed && (await sha256(utf8(seed))) === D.pre.state.hashedServerSeed ? 'OK' : 'FAIL', link: D.pre.state.nextHashedServerSeed === D.preRot.state.hashedServerSeed ? 'OK' : 'FAIL' };
  }

  // ── The verify calls ──────────────────────────────────────────────────────────
  function classifyReply({ status, bytes }) {
    const text = decode(bytes);
    if (status === 401 || status === 403 || (status >= 300 && status < 400)) return { cls: 'auth', why: `${status} auth rejected` };
    if (status === 429 || status >= 500 || status === 0) return { cls: 'transient', why: `${status}` };
    if (CF_RE.test(text)) return { cls: 'auth', why: 'Cloudflare page: session expired or challenge' };
    let json; try { json = JSON.parse(text); } catch (e) { return { cls: 'refused', why: `${status} non-JSON body` }; }
    if (json && Array.isArray(json.errors) && json.errors.length) return { cls: 'refused', why: `${status} errors: ${JSON.stringify(json.errors).slice(0, 300)}` };
    if (status !== 200) return { cls: 'refused', why: `HTTP ${status}` };
    const d = json && json.data !== undefined ? json.data : json;
    const bad = G.verifyShape(d);
    if (bad) return { cls: 'refused', why: `200 but not the expected reply shape: ${bad}` };
    return { cls: 'ok', data: d };
  }
  // A stored event never changes, so its classification is computed once (derive() runs every round; at 7,000 rounds
  // re-parsing every stored verify reply on each call would be quadratic).
  const classified = new WeakMap();
  const classifyStored = (e) => { let c = classified.get(e); if (!c) { c = classifyStored0(e); classified.set(e, c); } return c; };
  const classifyStored0 = (e) => classifyReply({ status: e.status, bytes: e.body !== null && e.body !== undefined ? utf8(e.body) : Uint8Array.from(root.atob(e.bodyB64 || ''), (c) => c.charCodeAt(0)) });
  function verifyEntries(D) {
    // A round stored without its nonce (prod blackjack 2026-11-06, settled on the insurance reply) takes it from its own
    // place-bet step's reply (same intent key); nothing else is inferred.
    const placeNonce = (b) => { const st = S.ev.find((e) => e.t === 'step' && e.key === b.key && e.name === 'place-bet' && e.reply); const r = st && (st.reply.round || st.reply); return r && Number.isInteger(r.nonce) && r.id === b.betId ? r.nonce : null; };
    return D.bets.map((b0, seq) => {
      const b = Number.isInteger(b0.nonce) ? b0 : { ...b0, nonce: placeNonce(b0) };
      const rot = D.rots[b.epoch], serverSeed = rot ? rot.state.revealedServerSeed : null;
      return { seq, epoch: b.epoch, nonce: b.nonce, betId: b.betId, serverSeed, rec: b, bodyText: JSON.stringify(G.verifyBody(b, serverSeed)) };
    });
  }
  function noteFinding(en, d) {
    const cmp = G.verifyCompare(en.rec, d);
    const bad = Object.entries(cmp).filter(([, v]) => !v).map(([k]) => k);
    if (bad.length) S.findings.push({ seq: en.seq, epoch: en.epoch, nonce: en.nonce, betId: en.betId, setting: G.settingKey(en.rec.spec), differs: bad.join(', ') });
  }

  // ── The run ───────────────────────────────────────────────────────────────────
  function roundCtx(o, E, seq, ep, D, intent, recovered) {
    const expectNonce = (ep.nonceStart || 0) + D.bets.filter((b) => b.epoch === E).length + D.lost.filter((x) => x.epoch === E).length;
    return { o, epoch: E, seq, phase: D.meta.plan[E].phase, meta: D.meta, opts: D.opts, clientSeed: D.cur.clientSeed, hashedServerSeed: D.cur.hashedServerSeed, expectNonce, intent, recovered,
      http: (method, path, body) => http(method, path, body, o), active: () => retrying(() => active(o), 'active', o),
      step: (x) => append({ t: 'step', epoch: E, seq, key: intent.key, ...x }),
      stepsOf: async () => S.ev.filter((e) => e.t === 'step' && e.key === intent.key),
      option: (set, why) => append({ t: 'option', set, why }),
      refusal: (e) => append({ t: 'refusal', epoch: E, seq, key: intent.key, status: e.http ? e.http.status : null, error: (e.json && (e.json.errors || e.json)) || e.message, http: e.http }) };
  }
  async function resumeCheck(o) {
    const D = derive(S.ev), expect = D.cur ? D.cur.hashedServerSeed : D.pre.state.hashedServerSeed;
    const a = await retrying(() => active(o), 'active', o);
    await append({ t: 'resume-check', state: { hashedServerSeed: a.hashedServerSeed, nonce: a.nonce, gamesInProgress: a.gamesInProgress }, raw: a.raw, http: a.http });
    if (a.hashedServerSeed !== expect) throw new KpError('the active seed is not the one this run left open (rotated outside the run, or a rotation reply was lost). Export the file and send it; do not resume.', 'ABORT');
    if (inProgress(a) && !(D.unsettled && G.resumesOpenRound)) throw stopErr('in-progress', 'a game is in progress on this account: finish it in the page, then resume()');
  }
  async function applySkip(o) {
    if (!o.skipRefused) return;
    const D = derive(S.ev), it = D.unsettled;
    if (!it) throw new Error('skipRefused: there is no unsettled round to skip. Nothing was sent');
    const r = D.refusals.filter((x) => x.key === it.key).pop();
    if (!r || r.status !== 400) throw new Error(`skipRefused: the round of epoch ${it.epoch} seq ${it.seq} has ${r ? 'a refusal with HTTP ' + r.status : 'no stored refusal'}, so it may exist on the site; resume() without skipRefused sends it again. Nothing was sent`);
    if (S.ev.some((e) => e.t === 'step' && e.key === it.key && e.ok)) throw new Error(`skipRefused: the round of epoch ${it.epoch} seq ${it.seq} was started on the site (a step was accepted); it cannot be skipped. Nothing was sent`);
    await append({ t: 'abandon', epoch: it.epoch, seq: it.seq, key: it.key, setting: G.settingKey(it.spec), refusalStatus: r.status, refusal: JSON.stringify(r.error).slice(0, 300), note: 'refused by the operator with HTTP 400 before it was placed; abandoned by the auditor (resume({ skipRefused: true })), never re-sent' });
    log(`epoch ${it.epoch} seq ${it.seq} [${G.settingKey(it.spec)}] abandoned: refused HTTP 400, never placed`);
  }
  async function betsPhase(o) {
    let D = derive(S.ev);
    const plan = D.meta.plan, cap = Math.min(D.planned, o.maxBets || D.planned);
    if (!D.pre) {
      const a = await retrying(() => active(o), 'active', o);
      await append({ t: 'pre', state: { hashedServerSeed: a.hashedServerSeed, nextHashedServerSeed: a.nextHashedServerSeed, clientSeed: a.clientSeed, nonce: a.nonce }, raw: a.raw, http: a.http });
      if (!a.hashedServerSeed || !a.nextHashedServerSeed) throw new KpError('the site gave no active / next seed hash: the pre-capture anchor cannot be recorded. Export the file and send it.', 'ABORT');
      if (inProgress(a)) throw stopErr('in-progress', 'a game is in progress on this account: finish it in the page, then resume()');
      D = derive(S.ev);
    }
    if (!D.preRot) {
      const s = newSeed(), rot = await safeRotate(D.pre.state.hashedServerSeed, s, o);
      await append({ t: 'rotate', closes: 'pre', planPos: -1, submitted: s, seedMeta: SEED_META, drawnAfter: D.pre.state.nextHashedServerSeed, state: stateOf(rot), raw: rot.raw, http: rot.http });
      D = derive(S.ev); await preCheck(D);
      log(`pre-capture anchor: commit ${S.anchor.commit}, link ${S.anchor.link}`);
    }
    for (let E = D.closed; E < plan.length; E++) {
      const epc = plan[E];
      if (!D.epochs.has(E)) {
        await append({ t: 'epoch', epoch: E, planPos: E, phase: epc.phase, group: null, plannedBets: epc.bets.length,
          hashedServerSeed: D.cur.hashedServerSeed, nextHashedServerSeed: D.cur.nextHashedServerSeed, clientSeed: D.cur.clientSeed, submitted: (D.lastRot || D.preRot).submitted, nonceStart: D.cur.nonce ?? 0 });
        D = derive(S.ev);
      }
      const ep = D.epochs.get(E);
      // One derive() per round (it reads the whole journal; at 7,000 rounds a second one per round is measurable): nothing is
      // appended between the loop's update and the round's checks.
      for (let seq = D.doneIn(E); seq < epc.bets.length; D = derive(S.ev), seq = D.doneIn(E)) {
        if (S.stopReq) throw stopErr('user', 'stop() requested; resume() continues');
        if (o.limit && S.session.bets >= o.limit) throw stopErr('limit', `limit of ${o.limit} round(s) reached; resume() continues`);
        const g = guardMsg(D); if (g) throw stopErr('balance', g + '; resume({ floor }) with a lower floor continues');
        let intent = D.unsettled && D.unsettled.epoch === E && D.unsettled.seq === seq ? D.unsettled : null;
        if (!intent && D.unsettled) throw new KpError(`an unsettled round (epoch ${D.unsettled.epoch}, seq ${D.unsettled.seq}) is not the next one: the record is inconsistent`, 'ABORT');
        if (!intent) {
          if (D.keys >= cap) throw stopErr('cap', `the round cap (${cap}) is reached: no further round is started`);
          intent = await append({ t: 'intent', epoch: E, seq, key: root.crypto.randomUUID(), spec: epc.bets[seq] });
          S.session.keys.add(intent.key);
        }
        const recovered = !S.session.keys.has(intent.key);
        const ctx = roundCtx(o, E, seq, ep, D, intent, recovered);
        let out;
        try { out = await G.play(intent, ctx); } catch (e) { if (e.kind === 'API' && !e.recorded) await ctx.refusal(e); throw e; }
        if (out.lost) {
          await append({ t: 'lost', epoch: E, seq, key: intent.key, setting: G.settingKey(intent.spec), ...out.lost });
          S.findings.push({ epoch: E, seq, what: `round ${E}/${seq}: ${out.lost.note}` });
          log(`epoch ${E} seq ${seq}: ${out.lost.note}`);
        } else {
          const rec = { epoch: E, seq, phase: epc.phase, at: iso(), key: intent.key, spec: intent.spec, ...out.rec, ...(recovered ? { recovered: true } : {}) };
          await append({ t: 'bet', rec });
          if (recovered) await append({ t: 'recovered', epoch: E, seq, intent: intent.key });
          S.session.bets++;
          S.lastBet = { epoch: E, seq, ...G.summary(rec) };
          // The nonce this round should have consumed; a higher one means rounds this run did not record (kept as gaps).
          if (Number.isInteger(rec.nonce) && rec.nonce > ctx.expectNonce) for (let n = ctx.expectNonce; n < rec.nonce; n++) await append({ t: 'gap', epoch: E, nonce: n, origin: 'capture', note: 'nonce consumed by a request this run did not record' });
          if (rec.serverSeedHash !== null && rec.serverSeedHash !== undefined && rec.serverSeedHash !== ep.hashedServerSeed) S.findings.push({ epoch: E, seq, what: `round ${rec.betId} carries seed hash ${rec.serverSeedHash}, not the epoch's` });
          const bad = G.shape(rec);
          if (bad) throw stopErr('shape', `round ${rec.betId}: the reply is not the expected shape (${bad}). Export the file and send it before resuming`);
        }
        if (o.betDelayMs) await sleep(o.betDelayMs);
      }
      D = derive(S.ev);
      const s = newSeed(), rot = await safeRotate(D.cur.hashedServerSeed, s, o);
      await append({ t: 'rotate', closes: E, planPos: E, submitted: s, seedMeta: SEED_META, drawnAfter: D.cur.nextHashedServerSeed, state: stateOf(rot), raw: rot.raw, http: rot.http });
      D = derive(S.ev); await epochCheck(D, E);
      const c = S.epochs[E]; log(`epoch ${E} ${c.bets} rounds${c.lost ? ` (${c.lost} reply lost)` : ''}  commit ${c.commit}  chain ${c.chain}  hashes ${c.hash}`);
      await walletRefresh(o);
      D = derive(S.ev);
    }
    await append({ t: 'bets-done' });
  }
  async function verifyPhase(o) {
    const D = derive(S.ev), entries = verifyEntries(D), okSeq = new Set(D.verifyOk.keys());   // the verify phase is the only writer of verify events
    for (const en of entries) {
      if (okSeq.has(en.seq)) continue;
      if (!en.serverSeed) { S.findings.push({ seq: en.seq, epoch: en.epoch, what: `round ${en.betId}: its server seed was not revealed, so it is not sent to the verifier` }); continue; }
      if (S.stopReq) throw stopErr('user', 'stop() requested; resume() continues');
      let reply, attempts = 0, sentAt, receivedAt;
      for (;;) {
        attempts++; sentAt = iso();
        try { reply = await fetchRaw('POST', G.verifyPath, en.bodyText, o); } catch (e) {
          if (e.kind !== 'TRANSIENT' || attempts >= o.maxRetries) throw e;
          S.retries++; await sleep(Math.min(o.backoffMs * attempts, 30000)); continue;
        }
        receivedAt = iso();
        const c0 = classifyReply(reply);
        if (c0.cls === 'auth') throw new KpError(`verify call ${en.seq}: ${c0.why}; nothing stored for it`, 'AUTH');
        if (c0.cls === 'transient') { if (attempts >= o.maxRetries) throw new KpError(`verify call ${en.seq}: HTTP ${reply.status} after ${attempts} attempts`, 'TRANSIENT'); S.retries++; await sleep(Math.min(o.backoffMs * attempts, 30000)); continue; }
        break;
      }
      let body = null, bodyB64; try { body = new root.TextDecoder('utf-8', { fatal: true }).decode(reply.bytes); } catch (e) { bodyB64 = b64(reply.bytes); }
      await append({ t: 'verify', seq: en.seq, epoch: en.epoch, nonce: en.nonce, betId: en.betId, setting: G.settingKey(en.rec.spec), attempts, sentAt, receivedAt,
        request: { method: 'POST', url: ORIGIN + G.verifyPath, body: en.bodyText }, status: reply.status, date: reply.date, contentType: reply.contentType,
        bodyBytes: reply.bytes.length, bodySha256: await sha256(reply.bytes), body, ...(bodyB64 !== undefined ? { bodyB64 } : {}), source: 'inpage' });
      S.session.verifies++;
      const c = classifyReply(reply);
      if (c.cls !== 'ok') throw new KpError(`verify call ${en.seq} (epoch ${en.epoch} nonce ${en.nonce}) was refused: ${c.why}. The reply is stored; resume() sends it again`, 'API');
      okSeq.add(en.seq);
      noteFinding(en, c.data);
      if (o.verifyDelayMs) await sleep(o.verifyDelayMs);
    }
    await append({ t: 'done' });
    log(`DONE: ${derive(S.ev).bets.length} rounds, ${entries.length} verify replies; exportFile() next`);
  }
  const REASON = { AUTH: 'auth', API: 'refused', TRANSIENT: 'transient', SCRUBBER: 'scrubber', STORAGE: 'storage', ABORT: 'abort' };
  async function halt(e) {
    const reason = (e && e.stop) || REASON[e && e.kind] || 'error';
    const hint = { auth: 'log in again in this tab (a reload is fine), paste the runner again, then resume()', refused: 'export the file and send it; resume() sends the refused request again, resume({ skipRefused: true }) skips a round refused before it was placed',
      transient: 'resume() later', abort: 'export the file and send it; this run cannot be resumed', shape: 'export the file and send it; do not resume', 'in-progress': 'finish the open game in the page, then resume()' }[reason] || 'resume() continues';
    S.stop = { reason, message: msg(e), hint: (e && e.hint) || hint, at: iso(), resumable: reason !== 'abort' };
    log(`STOPPED (${reason}): ${S.stop.message}`);
    try { await append(reason === 'abort' ? { t: 'abort', message: S.stop.message } : { t: 'stop', reason, message: S.stop.message }); } catch (x) { /* storage may be the cause */ }
  }
  async function run(mode, o) {
    try {
      const D = derive(S.ev);
      if (mode === 'resume' && D.pre && !D.betsDone) await resumeCheck(o);
      if (!derive(S.ev).betsDone) { await applySkip(o); await betsPhase(o); }
      await verifyPhase(o);
    } catch (e) { await halt(e); }
  }
  async function withLock(fn, busy) {
    const locks = root.navigator && root.navigator.locks;
    if (!locks || typeof locks.request !== 'function') return fn();
    return locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => (lock ? fn() : busy()));
  }
  function originCheck() {
    const origin = root.location && root.location.origin;
    if (origin !== ORIGIN) throw new Error(`this page is ${origin}, not ${ORIGIN}: open the ${G.name} page on ${ORIGIN}, logged in, and paste the runner there`);
  }
  function settle() {
    if (S.running) return;
    const D = derive(S.ev);
    S.state = D.abort ? 'aborted' : D.done ? 'finished' : S.lines.length ? 'stopped' : 'ready';
    if (D.abort && !S.stop) S.stop = { reason: 'abort', message: D.abort.message, resumable: false };
  }
  async function begin(mode, opts) {
    await restoring;
    originCheck();
    if (S.running) throw new Error('already running');
    opts = opts || {};
    const o = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) if (opts[k] !== undefined) o[k] = Number(opts[k]);
    o.limit = opts.limit > 0 ? Math.floor(opts.limit) : 0;
    let D = derive(S.ev);
    if (mode === 'start') {
      if (S.lines.length) throw new Error(`a run is stored here (${S.lines.length} events): resume() continues it, or exportFile() and then reset('discard')`);
      const cur = opts.stakeCurrency;
      if (typeof cur !== 'string' || !/^[A-Za-z0-9.]{2,12}$/.test(cur)) throw new Error(`stakeCurrency is required, e.g. start({ stakeCurrency: 'USDC', floor: 10 }); dry() shows the wallet currencies`);
      if (opts.floor === undefined || !(Number(opts.floor) >= 0)) throw new Error('floor is required: the lowest balance the run may leave, e.g. floor: 10');
      const currencyId = opts.currencyId === undefined ? 2 : opts.currencyId === null ? null : Number(opts.currencyId);
      if (currencyId !== null && !Number.isInteger(currencyId)) throw new Error('currencyId must be an integer (qa used 2) or null to leave it out');
      if (opts.maxBets !== undefined && !(Number(opts.maxBets) >= 1)) throw new Error('maxBets must be at least 1');
      if (opts.skipRefused) throw new Error('skipRefused is for resume() only');
      const nPlan = betsOpt(opts.bets);
      const gameOpts = G.startOptions ? G.startOptions(opts) : {};   // throws on a bad game option, before anything is sent
      o.maxBets = Math.min(nPlan, Math.floor(Number(opts.maxBets || nPlan)));
      let startU, source, walletPath = null;
      if (opts.balance !== undefined) { startU = units(toAmount(opts.balance)); source = 'entered by the auditor'; }
      else {
        const w = await walletRead(o, opts.walletPath);
        const en = w.found && w.entries.find((x) => x.currency.toUpperCase() === cur.toUpperCase());
        if (!en) throw new Error(`could not read the ${cur} balance (${w.note || 'no ' + cur + ' entry in ' + w.path}): pass it, e.g. start({ stakeCurrency: '${cur}', floor: 10, balance: 50 })`);
        startU = units(en.balance); source = 'wallet read'; walletPath = w.path;
      }
      const floorU = units(toAmount(Number(opts.floor)));
      if (startU - MAX_OUTLAY_U < floorU) throw new Error(`the balance ${fmt(startU)} leaves no room above the floor ${fmt(floorU)} for one round (up to ${fmt(MAX_OUTLAY_U)})`);
      S.guard = { floorU, startU, adjU: 0n, source, walletPath, currency: cur };
      try { await store.put('guard', guardOut(S.guard)); } catch (e) { throw new Error('could not store the balance guard: ' + msg(e)); }
      const plan = G.buildPlan(nPlan);
      const nBets = plan.reduce((s, e) => s + e.bets.length, 0);
      if (nBets !== nPlan || nBets > MAX_BETS) throw new Error(`the plan has ${nBets} rounds, not the ${nPlan} asked for`);
      await append({ t: 'meta', meta: { audit: G.title, platform: 'liqd.com', gameId: G.gameId, schema: `liqd-${G.name}-prod-capture-v1`, mode: 'prod-2026-11-03', script: VERSION,
        origin: ORIGIN, epochSize: Math.max(...plan.map((e) => e.bets.length)), nonceBase: 0, currencyId, stakeCurrency: cur, stake: STAKE, maxOutlay: fmt(MAX_OUTLAY_U), maxBets: o.maxBets,
        clientSeedGenerator: { A: SEED_META.generator }, endpoints: G.endpoints(gameOpts), ...G.metaExtra(gameOpts),
        balanceGuard: { set: true, source }, pacing: { betDelayMs: o.betDelayMs, stepDelayMs: o.stepDelayMs, verifyDelayMs: o.verifyDelayMs }, userAgent: root.navigator ? root.navigator.userAgent : null,
        planSummary: { epochs: plan.length, rounds: nBets, stake: STAKE, epochRule: `max(${MIN_EPOCHS}, ceil(rounds / ${EPOCH_TARGET})) epochs, sizes differ by at most 1`, worstCaseOutlay: fmt(BigInt(nBets) * MAX_OUTLAY_U) }, plan } });
      if (Object.keys(gameOpts).length) await append({ t: 'option', set: gameOpts, why: 'given to start()' });
      D = derive(S.ev);
    } else {
      if (!S.lines.length) throw new Error('nothing to resume: start() first');
      if (D.abort) throw new Error('this run was aborted (' + D.abort.message + '); export it, then reset(\'discard\')');
      if (D.done) throw new Error('the run is finished: exportFile()');
      if (!S.guard) throw new Error('the balance guard is missing from this browser; nothing was sent');
      if (opts.bets !== undefined) throw new Error(`bets is fixed by start() (this run plans ${D.planned}); nothing was sent`);
      if (opts.floor !== undefined) { if (!(Number(opts.floor) >= 0)) throw new Error('floor must be a number'); S.guard.floorU = units(toAmount(Number(opts.floor))); await store.put('guard', guardOut(S.guard)); log(`floor set to ${fmt(S.guard.floorU)}`); }
      if (opts.skipRefused && !(D.unsettled && D.refusals.some((r) => r.key === D.unsettled.key))) throw new Error('skipRefused: there is no refused round waiting. Nothing was sent');
      if (G.resumeOptions) { const set = G.resumeOptions(opts, D); if (set && Object.keys(set).length) await append({ t: 'option', set, why: 'given to resume()' }); }
      o.maxBets = Math.min(D.planned, D.meta.maxBets || D.planned);
      o.skipRefused = !!opts.skipRefused;
    }
    S.running = true; S.stopReq = false; S.stop = null; S.state = 'running'; S.opts = o;
    S.session = { mode, startedAt: iso(), t0: Date.now(), bets: 0, verifies: 0, keys: new Set() };
    log(`${mode === 'start' ? 'START' : 'RESUME'}: ${D.bets.length} rounds and ${D.verifyOk.size} verify replies stored`);
    S.runPromise = withLock(() => run(mode, o), () => halt(stopErr('busy', 'another tab of this browser is running this capture'))).finally(() => { S.running = false; S.stopReq = false; settle(); });
    return { started: true, mode };
  }
  async function dry(opts) {
    await restoring;
    originCheck();
    if (S.running) throw new Error('a run is in progress');
    const o = { ...DEFAULTS }, seen = apiSeen();
    const paths = G.endpoints(G.startOptions ? (() => { try { return G.startOptions(opts || {}); } catch (e) { return {}; } })() : {});
    const out = { version: VERSION, at: iso(), origin: ORIGIN, page: root.location.pathname, betsPlaced: 0, seedsRotated: 0,
      apiPathsSeen: seen.paths, otherApiHosts: seen.otherHosts, runnerPathsSeen: [P_ACTIVE, P_ROTATE, ...Object.values(paths)].filter((p) => seen.paths.includes(p)), runnerPaths: paths };
    try { const a = await active(o); out.active = { activeServerSeedHash: a.hashedServerSeed, nextServerSeedHash: a.nextHashedServerSeed, clientSeed: a.clientSeed, nonce: a.nonce, gamesInProgress: Array.isArray(a.gamesInProgress) ? a.gamesInProgress.length : a.gamesInProgress ?? null, ok: !!(a.hashedServerSeed && a.nextHashedServerSeed) }; }
    catch (e) { out.active = { ok: false, error: e.message, kind: e.kind }; }
    out.wallet = await walletRead(o, opts && opts.walletPath);
    const usd = out.wallet.found && (out.wallet.entries.find((x) => /^USDC$/i.test(x.currency)) || out.wallet.entries[0]);
    out.next = !out.active.ok ? 'the seed read failed: are you logged in on this tab? Fix that before start()'
      : `${GLOBAL}.start({ stakeCurrency: '${usd ? usd.currency : 'USDC'}', currencyId: ${usd && Number.isInteger(Number(usd.currencyId)) && usd.currencyId !== null ? Number(usd.currencyId) : 2}, floor: <lowest balance you accept>${usd ? '' : ', balance: <the balance in the site header>'} })`;
    S.dry = out;
    return out;
  }
  function status() {
    const D = derive(S.ev), m = money(D), p = projected(D), ss = S.session;
    const actions = ss ? ss.bets + ss.verifies : 0, secs = ss ? (Date.now() - ss.t0) / 1000 : 0, spa = actions > 0 ? secs / actions : null;
    const left = 2 * D.playable - D.bets.length - D.lost.length - D.verifyOk.size;
    return {
      version: VERSION, state: S.running ? 'running' : S.state, running: S.running, stopping: S.running && S.stopReq,
      phase: D.done ? 'done' : D.betsDone ? 'verify' : D.meta ? 'bets' : 'not started',
      bets: { done: D.bets.length, lost: D.lost.length, skipped: D.abandoned.size, of: D.playable, planned: D.planned, keysSent: D.keys, cap: Math.min(D.planned, (D.meta && D.meta.maxBets) || D.planned) },
      verify: { done: D.verifyOk.size, of: D.betsDone ? D.bets.length : D.playable },
      money: { currency: D.meta ? D.meta.stakeCurrency : null, staked: fmt(m.staked), won: fmt(m.won), net: fmt(m.won - m.staked) },
      guard: S.guard ? { floor: fmt(S.guard.floorU), projectedBalance: p === null ? null : fmt(p), source: S.guard.source } : null,
      options: D.opts, anchor: S.anchor || null, epochs: S.epochs.filter(Boolean), findings: S.findings.length, recentFindings: S.findings.slice(-10),
      stop: S.stop, resumable: !S.running && S.state === 'stopped', lastBet: S.lastBet, retries: S.retries,
      session: ss ? { mode: ss.mode, startedAt: ss.startedAt, bets: ss.bets, verifies: ss.verifies, secondsPerRequest: spa && +spa.toFixed(2), etaMinutes: spa && S.running ? +((left * spa) / 60).toFixed(1) : null } : null,
      visibility: root.document ? root.document.visibilityState || null : null, storage: store.kind, exported: S.exported, log: S.log.slice(-8),
    };
  }
  const statusText = () => JSON.stringify(status()).replace(/[?=&]/g, '_');
  async function exportFile({ download = true } = {}) {
    await restoring;
    if (S.running) throw new Error('a run is in progress: stop() and wait, or wait for it to finish');
    if (!S.lines.length) throw new Error('nothing to export');
    const red = { marker: IP_MARK, ipv4: 0, ipv6: 0, lines: [] }, outLines = S.lines.map((l, i) => {
      const r = redactIps(l); if (r.v4 + r.v6) { red.ipv4 += r.v4; red.ipv6 += r.v6; red.lines.push({ line: i + 1, t: S.ev[i] && S.ev[i].t, ipv4: r.v4, ipv6: r.v6 }); } return r.out;
    });
    outLines.push(JSON.stringify({ t: 'export-note', at: iso(), script: VERSION, storedLines: S.lines.length,
      redaction: { ...red, note: 'IP addresses replaced by the marker in this exported copy only; the events stored in the browser are unchanged' } }));
    const hits = [];
    outLines.forEach((t, i) => { const h = scanLine(t); if (h.length) hits.push(`line ${i + 1}: ${h.join(', ')}`); });
    if (hits.length) { S.exported = { refused: true, hits: hits.slice(0, 20), at: iso() }; throw new Error(`export refused, the secret scan hit ${hits.length} line(s): ${hits.slice(0, 5).join(' | ')}. Send this message (it names no value)`); }
    // Encoded line by line into one buffer (sized for ASCII, doubled if a line needs more): a full capture (7,000 rounds,
    // tens of MB) is never held as one joined string next to its bytes.
    let buf = new Uint8Array(outLines.reduce((s, l) => s + l.length + 1, 0) || 1), at = 0;
    const enc = new root.TextEncoder();
    for (const l of outLines) {
      const line = l + '\n';
      for (;;) { const r = enc.encodeInto(line, buf.subarray(at)); if (r.read === line.length) { at += r.written; break; } const nb = new Uint8Array(buf.length * 2); nb.set(buf.subarray(0, at)); buf = nb; }
    }
    const bytes = buf.subarray(0, at);
    const D = derive(S.ev);
    const name = `${FILE_PREFIX}${iso().replace(/[:.]/g, '-')}.ndjson`;
    const out = { name, lines: outLines.length, bytes: bytes.length, sha256: await sha256(bytes), rounds: D.bets.length, lostReplies: D.lost.length, skippedRounds: D.abandoned.size, verifyReplies: D.verifyOk.size, complete: D.done, at: iso(), scan: 'clean',
      ipRedacted: { ipv4: red.ipv4, ipv6: red.ipv6, lines: red.lines.map((x) => `${x.line} (${x.t})`) } };
    if (download) {
      const href = root.URL.createObjectURL(new root.Blob([bytes], { type: 'application/x-ndjson' }));
      const a = root.document.createElement('a'); a.href = href; a.download = name; if (a.style) a.style.display = 'none';
      root.document.body.appendChild(a); a.click(); if (a.remove) a.remove();
      root.setTimeout(() => root.URL.revokeObjectURL(href), 120000);
    }
    S.exported = out; log(`exported ${name}: ${out.lines} lines, ${out.bytes} bytes, SHA-256 ${out.sha256}`);
    return out;
  }
  async function reset(confirm) {
    await restoring;
    if (confirm !== 'discard') throw new Error("reset('discard') wipes the stored run; export it first");
    if (S.running) throw new Error('a run is in progress');
    let busy = false; await withLock(() => store.clear(), () => { busy = true; });
    if (busy) throw new Error('another tab is running this capture; nothing was discarded');
    Object.assign(S, { ev: [], lines: [], guard: null, stop: null, retries: 0, epochs: [], findings: [], session: null, exported: null, lastBet: null, anchor: null });
    settle(); log('reset: the stored run is discarded');
    return status();
  }
  async function restore() {
    try {
      for (let i = 0; ; i++) { const l = await store.get('ev:' + i); if (l === undefined) break; S.lines.push(l); S.ev.push(JSON.parse(l)); }
      S.guard = guardIn(await store.get('guard'));
      const D = derive(S.ev);
      if (D.preRot) await preCheck(D);
      for (let E = 0; E < D.closed; E++) if (D.rots[E] && D.epochs.has(E)) await epochCheck(D, E);
      const ents = verifyEntries(D);
      for (const [seq, e] of D.verifyOk) if (ents[seq]) noteFinding(ents[seq], classifyStored(e).data);
      settle();
      log(`ready: ${D.planned} rounds planned; ${D.bets.length} rounds, ${D.verifyOk.size} verify replies stored (storage: ${store.kind})`);
    } catch (e) { S.state = 'error'; S.stop = { reason: 'error', message: 'restore failed: ' + msg(e), resumable: false }; log(S.stop.message); }
  }
  const restoring = restore();

  root[GLOBAL] = {
    version: VERSION, dry,
    start: (opts) => begin('start', opts), resume: (opts) => begin('resume', opts),
    stop: () => { if (S.running) { S.stopReq = true; log('stop requested: stopping after the current request'); } return status(); },
    isRunning: () => S.running, done: () => S.runPromise || Promise.resolve(), ready: () => restoring.then(status),
    status, statusText, findings: () => S.findings.slice(), exportFile, reset,
    _internals: { scanLine, redactIps, classifyReply, walletEntries, apiSeen, derive: () => derive(S.ev), DEFAULT_BETS, MAX_BETS, EPOCH_TARGET, epochSizes, STAKE, ORIGIN, DEFAULTS, MAX_OUTLAY: fmt(MAX_OUTLAY_U), G },
  };
})(typeof window !== 'undefined' ? window : globalThis);
