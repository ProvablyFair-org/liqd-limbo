/**
 * The capture chain shipped with the package: the three exports, the converter source, the reply record (one line per
 * reply LIQD sent in each run, built from the exports by capture/build-reply-record.mjs) and the runner source of each
 * build. Read by Step 19 (the converter and the record builder are RERUN on the shipped exports and must reproduce the
 * dataset and the record byte for byte; every reply body in the exports re-hashes to the digest the runner recorded;
 * the identifier scan) and by Step 2 (LIQD's Date headers on the commitment, the client-seed submission and the first
 * bet of every epoch).
 *
 * WHAT THIS IS NOT. The exports' first line was edited before shipping (capture/redact-export.mjs: the user-agent
 * string removed, a person's name in a plan note replaced); no reply body is on that line. A recorded digest shows the
 * bytes the runner received; it does not show LIQD signed them (L10).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import type { VerifyContext } from './context';
import { servedResultMatches } from './context';
import {
  CAPTURE_RUNNER_FILES, RUNNER_VERSION_TAG, RUNNER_BUILDS, CONVERTER_FILES, CONVERTER_ENTRY, REPLY_RECORD_FILES, REPLY_RECORD_BUILDER,
  EXPORT_FILES, IDENTIFIER_SCAN_DIRS, EXPECTED_BETS, EXPECTED_SEEDS, EXPECTED_CAPTURES, DATA_PATH,
} from '../../src/config';

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export interface ReplyRow {
  line?: number; t: string; at?: string; epoch?: number; seq?: number; nonce?: number; betId?: string; closes?: string | number;
  submitted?: string; date?: string; status?: number; bodyBytes?: number; bodySha256?: string; body?: string;
  request?: { method?: string; url?: string; body?: string };
  capture?: number; file?: string; sha256?: string; bytes?: number; lines?: number; runner?: string;
}
export interface ReplyFile { capture: number; rel: string; present: boolean; pinOk: boolean; parseOk: boolean; header: ReplyRow | null; rows: ReplyRow[] }

const cache = new Map<string, ReplyFile[]>();
export function loadReplyRecord(repoRoot: string): ReplyFile[] {
  const hit = cache.get(repoRoot); if (hit) return hit;
  const files = REPLY_RECORD_FILES.map((f) => {
    const fp = path.join(repoRoot, f.file);
    if (!fs.existsSync(fp)) return { capture: f.capture, rel: f.file, present: false, pinOk: false, parseOk: false, header: null, rows: [] };
    const raw = fs.readFileSync(fp);
    let rows: ReplyRow[] = []; let parseOk = true;
    try { rows = raw.toString('utf8').split('\n').filter((l) => l !== '').map((l) => JSON.parse(l) as ReplyRow); } catch { parseOk = false; }
    const header = rows[0]?.t === 'source' ? rows[0] : null;
    return { capture: f.capture, rel: f.file, present: true, pinOk: sha(raw) === f.sha256, parseOk, header, rows: header ? rows.slice(1) : rows };
  });
  cache.set(repoRoot, files);
  return files;
}

const parse = <T>(s: string | undefined): T | null => { try { return s === undefined ? null : JSON.parse(s) as T; } catch { return null; } };
type PairBody = { activeServerSeedHash?: string; nextServerSeedHash?: string; clientSeed?: string; nonce?: number; revealedServerSeed?: string };

// ── Step 19 ─────────────────────────────────────────────────────────────────────────────────────
export function captureChain(ctx: VerifyContext): { ok: boolean; note: string } {
  const parts: string[] = [];
  let ok = true;
  const meta = ctx.meta as unknown as {
    captures?: { capture: number; file: string; sha256: string; lines: number; runner: string; preCapture?: { hashedServerSeed?: string; nextHashedServerSeed?: string; revealedServerSeed?: string } }[];
    conversion?: { converter?: string };
  };
  const caps = meta.captures ?? [];

  // (a) the runner source of each build: its code (every full-line `//` comment removed) is the code of the original
  //     build, by the digest the auditor computed from the original; and it carries the seed generator the dataset names
  {
    const code = (s: string) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    let pinned = 0, idOk = 0, used = 0, gen = 0;
    const generatorA = (ctx.meta as unknown as { clientSeedGenerator?: { A?: string } }).clientSeedGenerator?.A ?? '\u0000';
    for (const r of CAPTURE_RUNNER_FILES) {
      const fp = path.join(ctx.repoRoot, r.file);
      if (!fs.existsSync(fp)) continue;
      const buf = fs.readFileSync(fp); const src = buf.toString('utf8');
      if (sha(buf) === r.sha256) pinned++;
      const stamped = `'${RUNNER_VERSION_TAG} build ${r.build}'`;
      if (src.split(stamped).length === 2 && sha(code(src)) === r.codeSha256) idOk++;
      if (RUNNER_BUILDS.some((b) => b.build === `${RUNNER_VERSION_TAG} build ${r.build}`)) used++;
      if (src.includes(generatorA) && src.includes(`const newSeed = () => 'audit' + hex(root.crypto.getRandomValues(new Uint8Array(6)));`)) gen++;
    }
    const n = CAPTURE_RUNNER_FILES.length;
    const buildsInRuns = new Set(RUNNER_BUILDS.map((b) => b.build));
    const allShipped = [...buildsInRuns].every((b) => CAPTURE_RUNNER_FILES.some((r) => b === `${RUNNER_VERSION_TAG} build ${r.build}`));
    if (pinned !== n || idOk !== n || used !== n || gen !== n || !allShipped) ok = false;
    parts.push(`RUNNER SOURCE: ${n} builds shipped (${CAPTURE_RUNNER_FILES.map((r) => r.file).join(', ')}): ${pinned}/${n} match their pins; on ${idOk}/${n} the version string names the build once and the code `
      + `(the source with every full-line // comment removed) has the SHA-256 the auditor computed from the original build file the same way, after replacing a person's name in two plan-note strings of 7e33ea9cd02d `
      + `(the build id itself is a digest of the original source, which is not shipped, so it is not recomputed here); ${used}/${n} are the build a run names, and every run's build is shipped (${allShipped}); `
      + `${gen}/${n} draw the per-epoch client seed as 'audit' + 6 bytes of crypto.getRandomValues and carry the generator text the dataset header names`);
  }

  // (b) the converter source, and its input list naming the three exports the dataset names
  {
    let pinned = 0;
    for (const c of CONVERTER_FILES) { const fp = path.join(ctx.repoRoot, c.file); if (fs.existsSync(fp) && sha(fs.readFileSync(fp)) === c.sha256) pinned++; }
    const inputsRel = CONVERTER_FILES.find((c) => c.file.endsWith('inputs.limbo.json'))?.file ?? '';
    const inputs = fs.existsSync(path.join(ctx.repoRoot, inputsRel)) ? (parse<{ capture: string; sha256: string }[]>(fs.readFileSync(path.join(ctx.repoRoot, inputsRel), 'utf8')) ?? []) : [];
    const named = inputs.filter((j, i) => caps[i] && caps[i].sha256 === j.sha256 && j.capture.split('/').pop() === caps[i].file).length;
    const convOk = String(meta.conversion?.converter ?? '').startsWith('convert/full-limbo.mjs + convert/adapters/limbo.mjs');
    // the exports: pinned, named by the dataset header, every reply body the bytes the runner hashed
    let expPinned = 0, expNamed = 0, bodies = 0, bodiesOk = 0, uaLeft = 0;
    for (const e of EXPORT_FILES) {
      const fp = path.join(ctx.repoRoot, e.file);
      if (!fs.existsSync(fp)) continue;
      const buf = fs.readFileSync(fp);
      const h = sha(buf);
      if (h === e.sha256) expPinned++;
      const c = caps.find((x) => x.capture === e.capture);
      if (c && c.sha256 === h && c.file === path.basename(e.file)) expNamed++;
      type Http = { bodyBytes?: number; bodySha256?: string };
      for (const line of buf.toString('utf8').split('\n')) {
        if (line === '') continue;
        let ev: { t?: string; raw?: unknown; http?: Http; rec?: { raw?: unknown; http?: Http }; body?: string; bodyBytes?: number; bodySha256?: string; meta?: Record<string, unknown> };
        try { ev = JSON.parse(line); } catch { bodies++; continue; }
        const check = (body: string, n?: number, d?: string) => { bodies++; if (Buffer.byteLength(body, 'utf8') === n && sha(body) === d) bodiesOk++; };
        if (ev.t === 'pre' || ev.t === 'rotate') check(JSON.stringify(ev.raw), ev.http?.bodyBytes, ev.http?.bodySha256);
        else if (ev.t === 'bet') check(JSON.stringify(ev.rec?.raw), ev.rec?.http?.bodyBytes, ev.rec?.http?.bodySha256);
        else if (ev.t === 'verify' && typeof ev.body === 'string') check(ev.body, ev.bodyBytes, ev.bodySha256);
        else if (ev.t === 'meta' && ev.meta && 'userAgent' in ev.meta) uaLeft++;
      }
    }
    const expectedBodies = EXPECTED_CAPTURES + (EXPECTED_SEEDS + EXPECTED_CAPTURES) + 2 * EXPECTED_BETS;   // seed pairs, rotations, place-bet and verifier replies
    const expOk = expPinned === EXPORT_FILES.length && expNamed === EXPECTED_CAPTURES && bodies === expectedBodies && bodiesOk === expectedBodies && uaLeft === 0;
    if (!expOk) ok = false;
    parts.push(`EXPORTS (${EXPORT_FILES.map((e) => e.file).join(', ')}): ${expPinned}/${EXPORT_FILES.length} match their pins and ${expNamed}/${EXPECTED_CAPTURES} are the files the dataset header names by file name and SHA-256; `
      + `${bodiesOk}/${bodies} reply bodies (expected ${expectedBodies}: seed pairs, rotations, place-bet and verifier replies) have the byte length and SHA-256 the runner recorded for the bytes as received; `
      + `user-agent fields left: ${uaLeft} (the first line of each export is the edited copy of the runner's meta line, capture/redact-export.mjs)`);

    // the converter, RERUN on the shipped exports: the dataset must come out byte for byte
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'limbo-convert-'));
    let rerun = 'NOT RUN', rerunOk = false;
    try {
      let out = '', code = 0;
      try { out = execFileSync(process.execPath, [CONVERTER_ENTRY, '--out', tmp], { cwd: ctx.repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 }); }
      catch (e) { code = (e as { status?: number }).status ?? 1; out = String((e as { stdout?: string }).stdout ?? ''); }
      const produced = path.join(tmp, path.basename(DATA_PATH));
      const exists = fs.existsSync(produced);
      const same = exists && Buffer.compare(fs.readFileSync(produced), fs.readFileSync(path.join(ctx.repoRoot, DATA_PATH))) === 0;
      rerunOk = code === 0 && same;
      const verdict = /SELF-CHECK (PASS|FAIL[^\n]*)/.exec(out)?.[0] ?? 'no self-check line';
      rerun = `node ${CONVERTER_ENTRY} exited ${code}, ${verdict}; its output ${exists ? (same ? 'IS byte for byte' : 'DIFFERS FROM') : 'was not written, so it is not'} ${DATA_PATH}`;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

    if (!rerunOk || pinned !== CONVERTER_FILES.length || named !== EXPECTED_CAPTURES || inputs.length !== EXPECTED_CAPTURES || !convOk) ok = false;
    parts.push(`CONVERTER: ${pinned}/${CONVERTER_FILES.length} files match their pins; its input list names ${named}/${EXPECTED_CAPTURES} exports by the file name and SHA-256 the dataset header records; `
      + `the dataset header names this converter (${convOk}); RERUN on the shipped exports: ${rerun}`);
  }

  // (c) the reply record: LIQD's replies, run by run, against the dataset
  {
    const rec = loadReplyRecord(ctx.repoRoot);
    let filesOk = 0, headersOk = 0, withBody = 0, intact = 0, betRows = 0, betOrder = 0, betAt = 0, verRows = 0, verOk = 0, verDate = 0, digestOnly = 0;
    let seedOpen = 0, seedReveal = 0, preOk = 0;
    const counts: Record<string, number> = {};
    for (const f of rec) {
      if (f.present && f.pinOk && f.parseOk) filesOk++;
      const c = caps.find((x) => x.capture === f.capture);
      const h = f.header;
      if (c && h && h.capture === f.capture && h.file === c.file && h.sha256 === c.sha256 && h.lines === c.lines && h.runner === c.runner) headersOk++;
      for (const r of f.rows) {
        counts[r.t] = (counts[r.t] ?? 0) + 1;
        if (typeof r.body === 'string') { withBody++; if (Buffer.byteLength(r.body, 'utf8') === r.bodyBytes && sha(r.body) === r.bodySha256) intact++; }
        else if (r.t === 'bet' && Number.isInteger(r.bodyBytes) && /^[0-9a-f]{64}$/.test(String(r.bodySha256))) digestOnly++;
      }
      const dsBets = ctx.bets.filter((b) => (b as unknown as { capture?: number }).capture === f.capture);
      const rb = f.rows.filter((r) => r.t === 'bet'), rv = f.rows.filter((r) => r.t === 'verify');
      betRows += rb.length; verRows += rv.length;
      dsBets.forEach((b, i) => {
        if (rb[i]?.betId === b.id && rb[i]?.status === 200) betOrder++;
        if (rb[i]?.at === b.at) betAt++;
        const v = (b as unknown as { verifier?: { date?: string; request?: { serverSeed?: string; clientSeed?: string; nonce?: number; target?: number }; echo?: { clientSeed?: string; nonce?: number; target?: number }; result?: number; win?: boolean; multiplier?: number } }).verifier;
        const rows = rv.filter((r) => r.betId === b.id);
        if (rows.length !== 1 || !v) return;
        const r = rows[0];
        const q = parse<{ serverSeed?: string; clientSeed?: string; nonce?: number; params?: { target?: number } }>(r.request?.body);
        const o = parse<{ seeds?: { clientSeed?: string; nonce?: number }; derivationParams?: { target?: number }; outcome?: { result?: number; win?: boolean; multiplier?: number } }>(r.body);
        if (q && o && r.status === 200 && r.request?.method === 'POST'
          && q.serverSeed === v.request?.serverSeed && q.clientSeed === v.request?.clientSeed && q.nonce === v.request?.nonce && q.params?.target === v.request?.target
          && o.seeds?.clientSeed === v.echo?.clientSeed && o.seeds?.nonce === v.echo?.nonce && o.derivationParams?.target === v.echo?.target
          && servedResultMatches(Number(o.outcome?.result), Number(v.result)) && o.outcome?.win === v.win && o.outcome?.multiplier === v.multiplier) verOk++;
        if (r.date === v.date) verDate++;
      });
      const rot = f.rows.filter((r) => r.t === 'rotate').map((r) => ({ r, b: parse<PairBody>(r.body) }));
      for (const s of ctx.seeds.filter((x) => (x as unknown as { capture?: number }).capture === f.capture)) {
        if (rot.some(({ r, b }) => b && b.activeServerSeedHash === s.hashedServerSeed && b.nextServerSeedHash === s.nextHashedServerSeed && b.clientSeed === s.clientSeed && r.submitted === s.clientSeed)) seedOpen++;
        if (s.serverSeed && rot.some(({ b }) => b && b.revealedServerSeed === s.serverSeed)) seedReveal++;
      }
      const pre = f.rows.find((r) => r.t === 'pre'); const pb = parse<PairBody>(pre?.body);
      const pc = c?.preCapture;
      if (pb && pc && pb.activeServerSeedHash === pc.hashedServerSeed && pb.nextServerSeedHash === pc.nextHashedServerSeed
        && rot.some(({ r, b }) => String(r.closes) === 'pre' && b?.revealedServerSeed === pc.revealedServerSeed)) preOk++;
    }
    const nf = REPLY_RECORD_FILES.length;
    const builder = fs.existsSync(path.join(ctx.repoRoot, REPLY_RECORD_BUILDER));
    // the record builder, RERUN on the shipped exports: the record must come out byte for byte
    let rebuilt = 0, rebuildCode = -1;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'limbo-replies-'));
    try {
      try { execFileSync(process.execPath, [REPLY_RECORD_BUILDER, path.dirname(EXPORT_FILES[0].file), tmp], { cwd: ctx.repoRoot, stdio: ['ignore', 'pipe', 'pipe'] }); rebuildCode = 0; }
      catch (e) { rebuildCode = (e as { status?: number }).status ?? 1; }
      for (const f of REPLY_RECORD_FILES) {
        const a = path.join(tmp, path.basename(f.file)), b = path.join(ctx.repoRoot, f.file);
        if (fs.existsSync(a) && fs.existsSync(b) && Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0) rebuilt++;
      }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
    const good = filesOk === nf && headersOk === nf && intact === withBody && withBody > 0 && betRows === EXPECTED_BETS && betOrder === EXPECTED_BETS && betAt === EXPECTED_BETS
      && digestOnly === EXPECTED_BETS && verRows === EXPECTED_BETS && verOk === EXPECTED_BETS && verDate === EXPECTED_BETS
      && seedOpen === EXPECTED_SEEDS && seedReveal === EXPECTED_SEEDS && preOk === EXPECTED_CAPTURES && builder && rebuildCode === 0 && rebuilt === nf;
    if (!good) ok = false;
    parts.push(`REPLY RECORD (${REPLY_RECORD_FILES.map((f) => f.file).join(', ')}; built from the exports by ${REPLY_RECORD_BUILDER}${builder ? '' : ' ABSENT'}): ${filesOk}/${nf} files match their pins and parse; `
      + `RERUN on the shipped exports: the builder exited ${rebuildCode} and reproduced ${rebuilt}/${nf} files byte for byte; `
      + `${headersOk}/${nf} name the export the dataset header records (file, SHA-256, line count, runner build); replies by kind ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}; `
      + `${intact}/${withBody} replies kept with their body have the byte length and SHA-256 the runner recorded for the bytes as received; ${digestOnly}/${EXPECTED_BETS} place-bet replies carry the recorded byte length and SHA-256, their bodies re-hashed in the exports above; `
      + `place-bet replies equal the dataset's rounds in order on ${betOrder}/${EXPECTED_BETS} (bet id, HTTP 200) and in time on ${betAt}/${EXPECTED_BETS}; `
      + `verifier replies: ${verRows} rows, the request and LIQD's reply equal the dataset's verifier field on ${verOk}/${EXPECTED_BETS} and the Date header on ${verDate}/${EXPECTED_BETS}; `
      + `seed records: ${seedOpen}/${EXPECTED_SEEDS} commitments, next commitments and client seeds are those of a rotation reply whose request submitted that client seed, ${seedReveal}/${EXPECTED_SEEDS} revealed seeds are in a rotation reply; `
      + `pre-capture anchors ${preOk}/${EXPECTED_CAPTURES} are the run's first seed-pair reply and the rotation reply that revealed it`);
  }

  // (d) the identifier scan: nothing in the shipped capture, data or evidence files names the account or a session
  {
    const scan = identifierScan(ctx.repoRoot);
    if (scan.hits.length) ok = false;
    parts.push(`IDENTIFIER SCAN over every file under ${IDENTIFIER_SCAN_DIRS.join('/, ')}/ (${scan.files} files): ${scan.hits.length} hits `
      + `(JSON keys naming a user, account, e-mail, cookie, authorization, token, session, user agent or Cloudflare ray id; values shaped as an e-mail, a JWT, an IPv4 address, a 0x wallet address or a Cloudflare ray id)`
      + (scan.hits.length ? `: ${scan.hits.slice(0, 5).join('; ')}` : ''));
  }
  return { ok, note: parts.join('; ') };
}

const KEY_RE = /"(user(?:name|Id|_id)?|account(?:Id|_id)?|e-?mail|cookie|set-cookie|authori[sz]ation|token|session(?:Id)?|jwt|userAgent|cf-ray)"\s*:/i;
const VALUE_RES: [string, RegExp][] = [
  ['e-mail', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['IPv4', /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/],
  ['0x address', /0x[0-9a-fA-F]{40}/],
  ['Cloudflare ray id', /\b[0-9a-f]{16}-[A-Z]{3}\b/],
];
export function identifierScan(repoRoot: string): { files: number; hits: string[] } {
  const hits: string[] = []; let files = 0;
  const walk = (rel: string) => {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) return;
    for (const d of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const r = path.posix.join(rel, d.name);
      if (d.isDirectory()) { walk(r); continue; }
      files++;
      const text = fs.readFileSync(path.join(repoRoot, r), 'utf8');
      const isData = /\.(json|jsonl|ndjson)$/.test(d.name);
      text.split('\n').forEach((line, i) => {
        if (isData) { const k = KEY_RE.exec(line); if (k) hits.push(`${r}:${i + 1} key "${k[1]}"`); }
        for (const [label, re] of VALUE_RES) if (re.test(line)) hits.push(`${r}:${i + 1} ${label}`);
      });
    }
  };
  for (const d of IDENTIFIER_SCAN_DIRS) walk(d);
  return { files, hits };
}

// ── Step 2 ──────────────────────────────────────────────────────────────────────────────────────
/**
 * LIQD's own clock on every epoch: the reply that first published the epoch's commitment (the run's seed-pair reply
 * for its first epoch, the rotation that opened the previous epoch otherwise), the rotation reply to the request that
 * submitted the epoch's client seed, and the place-bet reply of its first round. Their Date headers must come in that
 * order. A Date header has one-second resolution, so two replies in the same second are counted as such: on LIQD's
 * clock they are not ordered, only not out of order.
 */
export function dateOrder(ctx: VerifyContext): { ok: boolean; note: string } {
  const rec = loadReplyRecord(ctx.repoRoot);
  let resolved = 0, inOrder = 0, outOfOrder = 0, commitBefore = 0, commitSame = 0, seedBefore = 0, seedSame = 0;
  const bad: string[] = [];
  for (const f of rec) {
    const pre = f.rows.find((r) => r.t === 'pre');
    const rots = f.rows.filter((r) => r.t === 'rotate');
    const opener = (E: number) => rots.find((r) => String(r.closes) === (E === 0 ? 'pre' : String(E - 1)));
    const seeds = ctx.seeds.filter((s) => (s as unknown as { capture?: number }).capture === f.capture);
    for (const s of seeds) {
      const E = (s as unknown as { captureEpoch?: number }).captureEpoch as number;
      const commitR = E === 0 ? pre : opener(E - 1), seedR = opener(E);
      const first = f.rows.find((r) => r.t === 'bet' && r.epoch === E);
      const cb = parse<PairBody>(commitR?.body), sb = parse<PairBody>(seedR?.body);
      const linked = !!cb && !!sb && !!first && cb.nextServerSeedHash === s.hashedServerSeed && sb.activeServerSeedHash === s.hashedServerSeed
        && sb.clientSeed === s.clientSeed && seedR?.submitted === s.clientSeed && first.betId === ctx.bets.find((b) => b.epoch === s.epoch && b.nonce === s.nonceStart)?.id;
      const a = Date.parse(String(commitR?.date)), b = Date.parse(String(seedR?.date)), d = Date.parse(String(first?.date));
      if (!linked || ![a, b, d].every(Number.isFinite)) { bad.push(`epoch ${s.epoch}: the three replies are not resolved`); continue; }
      resolved++;
      if (a <= b && b <= d) inOrder++; else { outOfOrder++; bad.push(`epoch ${s.epoch}: ${commitR?.date} / ${seedR?.date} / ${first?.date}`); }
      if (a < b) commitBefore++; else if (a === b) commitSame++;
      if (b < d) seedBefore++; else if (b === d) seedSame++;
    }
  }
  const ok = resolved === EXPECTED_SEEDS && inOrder === EXPECTED_SEEDS && outOfOrder === 0;
  return {
    ok,
    note: `LIQD'S CLOCK (the Date header of LIQD's replies in the reply record, one-second resolution): on ${resolved}/${EXPECTED_SEEDS} epochs the reply that published the commitment, the rotation reply to the request that submitted the client seed and the place-bet reply of the first round are resolved; `
      + `they come in that order on ${inOrder}/${EXPECTED_SEEDS} and out of order on ${outOfOrder}; the commitment reply is a second or more earlier than the client-seed reply on ${commitBefore} and in the same second on ${commitSame}; `
      + `the client-seed reply is a second or more earlier than the first bet's reply on ${seedBefore} and in the same second on ${seedSame}`
      + (bad.length ? ` — ${bad.slice(0, 5).join('; ')}` : ''),
  };
}
