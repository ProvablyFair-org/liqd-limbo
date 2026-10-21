/**
 * Step 25: Target-Decade Supplement — capture v2 (2026-09-26, 300 Phase-A rounds) + the live
 * target-ceiling witness (evidence/E20).
 *
 * The audited dataset (data/limbo-master-6700bets.json) is the population Steps 1–24 score. Its
 * Phase A drew win chances in [2%, 98%], i.e. targets 1.01x–49.5x, so decades 10^2 and above were
 * covered only by Phase B's fixed tranches and decade 10^4 not at all (Step 13). This step scores
 * the SUPPLEMENT captured by capture/capture-limbo-v2.mjs — Phase-A rounds (label `A2`) with a
 * CSPRNG log-uniform target inside each decade, 100 in each of 10^2 and 10^3 and 100 at exactly
 * 10,000x — and nothing else from it enters Steps 1–24, the simulations or the published RTP.
 *
 * Every arm runs over the WHOLE supplement with its denominator bound to src/config.ts, never to
 * the file's own meta (G-BIND):
 *
 *   (a) integrity — both vendored files hash to their pins; the journal's `bet` records ARE the
 *       dataset rows (JSON, bet for bet) and each was preceded by an `intent` with its idempotency
 *       key; the journal's event census holds no refusal, gap, recovery or skipped group, and the
 *       number of resumes equals SUPPLEMENT_DECLARED_RESUMES; each resume's read-back of the
 *       operator's active seed shows the nonce equal to the rounds recorded under it (no round
 *       consumed that the capture did not record);
 *   (b) population — 6 epochs x 50, nonces exactly 0..49 per epoch, distinct bet ids, every round
 *       phase A2 at the $0.10 stake;
 *   (c) commitment — SHA-256(utf8(serverSeed)) == hashedServerSeed on all 6, the 5 in-capture chain
 *       links, and the pre-capture anchor (its revealed seed hashes to its commitment and its
 *       next-hash IS epoch 0's commitment); every round bound to its epoch's commitment and client
 *       seed; each client seed set AFTER its commitment was published;
 *   (d) recomputation — R from the revealed seed === served result, win == (R >= target) === served
 *       win, credit exact in integer hundredths (win: stake x target; loss: 0), the round record's
 *       own outcome.multiplier (target on a win, 0 on a loss), wallet debit/credit == game ledger;
 *   (e) targets — every target a legal 2-dp value at or below LIVE_TARGET_CEILING;
 *   (f) coverage (profile LIMBO-15) — Phase A >= PHASE_A_DECADE_FLOOR in every decade from 10^0 up to
 *       the decade of LIVE_TARGET_CEILING: 10^0 and 10^1 from the AUDITED Phase A, 10^2..10^4 from
 *       the supplement; the minimum legal target 1.01x played in Phase A;
 *   (g) the ceiling witness (E20, profile LIMBO-14) — both probe journals hash-pinned; every bet the
 *       probes settled recomputes from the seed later revealed for it; the above-ceiling request has
 *       an intent and NO settlement, and the next opening read of that seed shows exactly the
 *       settled rounds consumed; the three runs chain (probe 1 → probe 2 → supplement) commitment
 *       to commitment. Printed beside it: the audited rounds above the live ceiling.
 *   (h) the cap re-probe (evidence/E21, prepared and run 2026-10-02, capture/PROBE-2026-10-02.md) — read
 *       ONLY when CAP_PROBE_JOURNAL / CAP_PROBE_SHA256 are set in src/config.ts (pinned 2026-10-02); judged
 *       by judgeCapProbe below.
 *
 * VERDICT POLICY (profile LIMBO-14, decided 2026-10-02 — until E21 was pinned, the audit's ONE operator FLAG). The RTP-CLAIM
 * PASS (Step 16) is scored on targets up to 10,000x, and it needs every target from the band edge
 * (100,101.12x) up to be refused by the server. On 2026-09-11 the server accepted and settled targets up
 * to 500,000x; the only later probe above 10,000x (2026-09-26, 93,830.94x, itself inside the band) did
 * not settle and its reply was not saved. So while the audited capture holds rounds above the ceiling
 * and no pinned re-probe shows the above-band targets refused, the step is a FLAG (origin operator),
 * worded with those dates. It PASSes when the pinned re-probe shows every probed target refused (and the
 * control settled), and then prints the 2026-09-11 rounds as history. A mismatch in (a)–(g), or a pinned
 * re-probe that is absent or off its pin, is a FAIL — a supplement that does not reproduce is not
 * evidence of anything. Until 2026-10-02 the condition was "the audited dataset holds rounds above
 * 10,000x", which this dataset always will, so the flag could never clear; it is now tied to the
 * recorded refusals, as profile LIMBO-14 asks.
 *
 * RESULT (2026-10-02): the re-probe was run on qa.liqd.com and its journal pinned as E21 — the control
 * settled and recomputes, and 100,101.12x, 497,487.44x, 500,000x and 990,000.01x were each refused
 * (HTTP 400, errorCode 3001, "Too big: expected number to be <=10000"), no nonce consumed. Step 25 PASSes.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';
import type { StepResult, VerifyContext } from './context';
import { step, isHex, hundredths, isTwoDecimal, servedResultMatches } from './context';
import { commitHash, limboDraw } from '../../src/rng';
import {
  resultMultiplier, limboWin, isTargetLegal, MIN_MULTIPLIER, EXPECTED_EPOCH_SIZE,
  SUPPLEMENT_DATA_PATH, SUPPLEMENT_DATASET_SHA256, SUPPLEMENT_JOURNAL_PATH, SUPPLEMENT_JOURNAL_SHA256,
  SUPPLEMENT_EXPECTED_BETS, SUPPLEMENT_EXPECTED_SEEDS, SUPPLEMENT_PHASE, SUPPLEMENT_STAKE,
  SUPPLEMENT_DECADES, SUPPLEMENT_DECLARED_RESUMES, PHASE_A_DECADE_FLOOR,
  LIVE_TARGET_CEILING, LIVE_TARGET_CEILING_WITNESSED, CEILING_PROBE_REFUSED_TARGET, CEILING_PROBE_DIR,
  MAX_MULTIPLIER, UI_MAX_TARGET,
  CEILING_PROBE_1_JOURNAL, CEILING_PROBE_1_SHA256, CEILING_PROBE_2_JOURNAL, CEILING_PROBE_2_SHA256,
  CEILING_PROBE_ACCEPTED_AT_CEILING,
  CAP_PROBE_TARGETS, CAP_PROBE_DIR, CAP_PROBE_JOURNAL, CAP_PROBE_SHA256,
} from '../../src/config';
import { legalGrid, ciToTarget, ciRtpPct } from './edge';

export const STEP_NUMBER = 25;
export const STEP_NAME = 'Target-Decade Supplement & Live Target Ceiling (capture v2, 300 rounds)';

type Json = Record<string, any>;
/** How many problem descriptions a failing run prints in the detail (display only; any problem fails the step). */
const PROBLEMS_PRINTED = 12;

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
/** Decade of a target from its exact hundredths (no float log on a boundary value). */
function decadeOf(target: number): number {
  const h = hundredths(target);
  let d = 0;
  while (h >= 100 * 10 ** (d + 1)) d++;
  return d;
}
function readJournal(abs: string): Json[] {
  return fs.readFileSync(abs, 'utf8').split('\n').filter((l) => l.trim().length > 0).map((l) => JSON.parse(l));
}
/** Recompute one settled record from a revealed seed: result, win, credit (integer hundredths^2). */
function settles(rec: Json, serverSeed: string): boolean {
  const target = Number(rec.params?.target);
  const R = resultMultiplier(limboDraw(serverSeed, rec.clientSeed, rec.nonce));
  const win = limboWin(R, target);
  const creditOk = win
    ? Math.round(Number(rec.winningAmount) * 1e4) === hundredths(Number(rec.betAmount)) * hundredths(target)
    : Number(rec.winningAmount) === 0;
  return servedResultMatches(Number(rec.result), R) && rec.win === win && creditOk;
}

/** One probed target as the cap re-probe journal shows it. */
export interface CapProbeRow {
  target: number;
  intents: number;
  /** `reply` events saved for this target's intent(s) — capture-limbo-v2.mjs journals every place-bet reply. */
  replies: number;
  /** HTTP status of the last saved reply (null if none). */
  status: number | null;
  code: string;
  message: string;
  /** From the core's `refusal` event (null if there is none). */
  nonceConsumed: boolean | null;
  settled: boolean;
  refused: boolean;
}
export interface CapProbeJudgement {
  controlSettled: number;
  controlRecomputed: number;
  rows: CapProbeRow[];
  /** Every probed target refused AND the control settled and recomputed. */
  allRefused: boolean;
  accepted: number[];
}
/**
 * The cap re-probe journal (capture/capture-limbo-v2.mjs --cap-probe), judged. Pure: events in, verdict
 * material out (unit-tested in tests/limbo/capProbeTests.ts). A target counts as REFUSED only when the
 * journal holds, for it: exactly one intent at the $0.10 stake, a saved `reply` to that intent that is a
 * refusal (HTTP status >= 400, or an `errors` array in the body), the core's `refusal` event with
 * nonceConsumed false, and no `bet`. The control must settle at the ceiling and recompute from the seed
 * its closing rotation revealed — so a refusal cannot be an expired session or an empty balance.
 */
export function judgeCapProbe(events: Json[], targets: readonly number[], ceiling: number): CapProbeJudgement {
  const h = (x: unknown) => hundredths(Number(x));
  const bets = events.filter((e) => e.t === 'bet').map((e) => e.rec ?? {});
  const reveal = new Map<string, string>();
  for (const e of events) {
    const seed = e.t === 'rotate' ? e.state?.revealedServerSeed : undefined;
    if (typeof seed === 'string') reveal.set(commitHash(seed), seed);
  }
  const control = bets.filter((r) => h(r.params?.target) === h(ceiling));
  const controlRecomputed = control.filter((r) => reveal.has(r.hashedServerSeed) && settles(r, reveal.get(r.hashedServerSeed)!)).length;
  const rows: CapProbeRow[] = targets.map((t) => {
    const intents = events.filter((e) => e.t === 'intent' && h(e.body?.params?.target) === h(t));
    const keys = new Set(intents.map((e) => e.key));
    const replies = events.filter((e) => e.t === 'reply' && keys.has(e.key));
    const last = replies[replies.length - 1];
    const status = last && Number.isFinite(Number(last.status)) && last.status !== null ? Number(last.status) : null;
    const replyRefuses = !!last && ((status !== null && status >= 400) || (Array.isArray(last.body?.errors) && last.body.errors.length > 0));
    const refusal = events.find((e) => e.t === 'refusal' && h(e.spec?.target) === h(t));
    const err = (refusal?.error && typeof refusal.error === 'object') ? refusal.error : {};
    // LIQD's 3001 carries its reasons as an ARRAY of { path, message, code } (E21, 2026-10-02); print those, not the generic description.
    const fieldText = Array.isArray(err.fields) ? err.fields.map((f: Json) => f?.message).filter((m: unknown) => typeof m === 'string' && m).join('; ') : '';
    const settled = bets.some((r) => h(r.params?.target) === h(t));
    const nonceConsumed = refusal ? refusal.nonceConsumed === true : null;
    const stakeOk = intents.every((e) => h(e.body?.stake) === h(SUPPLEMENT_STAKE));
    return {
      target: t, intents: intents.length, replies: replies.length, status,
      code: String(refusal?.code ?? err.errorCode ?? '?'),
      message: String(err.message ?? (fieldText || undefined) ?? err.fields?.message ?? err.description ?? err.name ?? '').slice(0, 240),
      nonceConsumed, settled,
      refused: intents.length === 1 && stakeOk && replyRefuses && !!refusal && nonceConsumed === false && !settled,
    };
  });
  return {
    controlSettled: control.length, controlRecomputed, rows,
    allRefused: rows.length > 0 && rows.every((r) => r.refused) && control.length >= 1 && controlRecomputed === control.length,
    accepted: rows.filter((r) => r.settled).map((r) => r.target),
  };
}

export function run(ctx: VerifyContext): StepResult[] {
  const root = ctx.repoRoot;
  const problems: string[] = [];
  const bad = (msg: string) => { if (problems.length < PROBLEMS_PRINTED) problems.push(msg); };

  // ── (a) integrity ───────────────────────────────────────────────────────────────────────────
  const dsAbs = path.join(root, SUPPLEMENT_DATA_PATH);
  const jrAbs = path.join(root, SUPPLEMENT_JOURNAL_PATH);
  if (!fs.existsSync(dsAbs) || !fs.existsSync(jrAbs)) {
    return [step(STEP_NUMBER, STEP_NAME, 'FAIL', `supplement file absent: ${SUPPLEMENT_DATA_PATH} ${fs.existsSync(dsAbs)}, ${SUPPLEMENT_JOURNAL_PATH} ${fs.existsSync(jrAbs)}`)];
  }
  const dsRaw = fs.readFileSync(dsAbs);
  const jrRaw = fs.readFileSync(jrAbs);
  const dsHash = sha256(dsRaw);
  const jrHash = sha256(jrRaw);
  const pinsOk = dsHash === SUPPLEMENT_DATASET_SHA256 && jrHash === SUPPLEMENT_JOURNAL_SHA256;
  if (!pinsOk) bad(`pin mismatch (dataset ${dsHash.slice(0, 16)}…, journal ${jrHash.slice(0, 16)}…)`);
  const ds = JSON.parse(dsRaw.toString('utf8')) as { meta: Json; seeds: Json[]; bets: Json[] };
  const journal = readJournal(jrAbs);
  const bets = ds.bets;
  const seeds = [...ds.seeds].sort((a, b) => a.epoch - b.epoch);

  const census: Record<string, number> = {};
  for (const e of journal) census[e.t] = (census[e.t] ?? 0) + 1;
  const jBets = journal.filter((e) => e.t === 'bet').map((e) => e.rec);
  const journalRowsMatch = jBets.length === bets.length
    && jBets.every((r, i) => JSON.stringify(r) === JSON.stringify(bets[i]));
  if (!journalRowsMatch) bad(`journal bet records (${jBets.length}) are not the dataset rows (${bets.length}) bet for bet`);
  // every bet preceded by its intent (same idempotency key, same body)
  let intentMissing = 0;
  const seenIntents = new Map<string, Json>();
  for (const e of journal) {
    if (e.t === 'intent') seenIntents.set(e.key, e.body);
    if (e.t === 'bet') {
      const body = seenIntents.get(e.rec.idempotencyKey);
      if (!body || JSON.stringify(body) !== JSON.stringify(e.rec.requestBody)) intentMissing++;
    }
  }
  if (intentMissing) bad(`${intentMissing} bets without a prior matching intent`);
  const forbidden = ['refusal', 'gap', 'recovered', 'skip-group', 'witness'].filter((t) => census[t]);
  if (forbidden.length) bad(`journal carries ${forbidden.map((t) => `${census[t]} ${t}`).join(', ')}`);
  const resumes = journal.filter((e) => e.t === 'resume-check');
  // a resume appends a `resume-check` to the SAME journal; it writes no second `meta` line
  const resumesOk = resumes.length === SUPPLEMENT_DECLARED_RESUMES && census.meta === 1 && census.done === 1;
  if (!resumesOk) bad(`resumes ${resumes.length} (declared ${SUPPLEMENT_DECLARED_RESUMES}), meta lines ${census.meta}, done ${census.done}`);
  // each resume read-back: the active seed's nonce equals the rounds recorded under that seed so far
  let resumeNonceOk = 0;
  const resumeNotes: string[] = [];
  for (const r of resumes) {
    const idx = journal.indexOf(r);
    const recorded = journal.slice(0, idx).filter((e) => e.t === 'bet' && e.rec.hashedServerSeed === r.state?.hashedServerSeed).length;
    const ep = seeds.find((s) => s.hashedServerSeed === r.state?.hashedServerSeed);
    if (r.state?.nonce === recorded && ep) resumeNonceOk++;
    resumeNotes.push(`${r.at}: active seed = epoch ${ep ? ep.epoch : '?'} commitment, operator nonce ${r.state?.nonce}, rounds recorded under it ${recorded}`);
  }
  if (resumeNonceOk !== resumes.length) bad('a resume read-back nonce disagrees with the rounds recorded');

  // ── (b) population ─────────────────────────────────────────────────────────────────────────
  const perEpoch = new Map<number, Set<number>>();
  for (const b of bets) {
    const s = perEpoch.get(b.epoch) ?? new Set<number>();
    s.add(b.nonce);
    perEpoch.set(b.epoch, s);
  }
  let epochsNotClosed = 0;
  for (const [, ns] of perEpoch) {
    let ok = ns.size === EXPECTED_EPOCH_SIZE;
    for (let i = 0; i < EXPECTED_EPOCH_SIZE; i++) if (!ns.has(i)) ok = false;
    if (!ok) epochsNotClosed++;
  }
  const popOk = bets.length === SUPPLEMENT_EXPECTED_BETS && seeds.length === SUPPLEMENT_EXPECTED_SEEDS
    && perEpoch.size === SUPPLEMENT_EXPECTED_SEEDS && epochsNotClosed === 0
    && SUPPLEMENT_EXPECTED_SEEDS * EXPECTED_EPOCH_SIZE === SUPPLEMENT_EXPECTED_BETS
    && new Set(bets.map((b) => b.id)).size === SUPPLEMENT_EXPECTED_BETS
    && bets.every((b) => b.phase === SUPPLEMENT_PHASE && hundredths(Number(b.betAmount)) === hundredths(SUPPLEMENT_STAKE));
  if (!popOk) bad(`population ${bets.length}/${SUPPLEMENT_EXPECTED_BETS} bets, ${seeds.length}/${SUPPLEMENT_EXPECTED_SEEDS} seeds, ${epochsNotClosed} epochs whose nonces do not close 0..${EXPECTED_EPOCH_SIZE - 1}`);

  // ── (c) commitment ─────────────────────────────────────────────────────────────────────────
  let commitFails = 0, shapeFails = 0, linkFails = 0, bindFails = 0, clientAfterFails = 0;
  for (const s of seeds) {
    if (!isHex(s.hashedServerSeed, 64) || !isHex(s.nextHashedServerSeed, 64) || !isHex(s.serverSeed ?? '', 32)) shapeFails++;
    if (!s.serverSeed || commitHash(s.serverSeed) !== s.hashedServerSeed) commitFails++;
    if (s.clientSeedDrawnAfterCommitment !== s.hashedServerSeed) clientAfterFails++;
  }
  for (let i = 0; i + 1 < seeds.length; i++) if (seeds[i].nextHashedServerSeed !== seeds[i + 1].hashedServerSeed) linkFails++;
  const pre = ds.meta.preCapture ?? {};
  const anchorOk = typeof pre.revealedServerSeed === 'string' && commitHash(pre.revealedServerSeed) === pre.hashedServerSeed
    && seeds.length > 0 && pre.nextHashedServerSeed === seeds[0].hashedServerSeed;
  const seedByEpoch = new Map(seeds.map((s) => [s.epoch, s]));
  for (const b of bets) {
    const s = seedByEpoch.get(b.epoch);
    if (!s || s.hashedServerSeed !== b.hashedServerSeed || s.clientSeed !== b.clientSeed) bindFails++;
  }
  const commitOk = commitFails === 0 && shapeFails === 0 && linkFails === 0 && anchorOk && bindFails === 0 && clientAfterFails === 0;
  if (!commitOk) bad(`commitment: ${commitFails} commit, ${shapeFails} shape, ${linkFails} chain, anchor ${anchorOk}, ${bindFails} bet-to-epoch binding, ${clientAfterFails} client seed not set after its commitment`);

  // ── (d) recomputation ─ (e) targets ────────────────────────────────────────────────────────
  let recomputed = 0, resultFails = 0, winFails = 0, creditFails = 0, multFails = 0, walletFails = 0, targetFails = 0, wins = 0;
  const decadeCount = new Map<number, number>();
  for (const b of bets) {
    const target = Number(b.params?.target);
    if (!isTargetLegal(target) || !isTwoDecimal(target) || hundredths(target) > hundredths(LIVE_TARGET_CEILING)) targetFails++;
    decadeCount.set(decadeOf(target), (decadeCount.get(decadeOf(target)) ?? 0) + 1);
    const s = seedByEpoch.get(b.epoch);
    if (!s?.serverSeed) { resultFails++; continue; }
    const R = resultMultiplier(limboDraw(s.serverSeed, b.clientSeed, b.nonce));
    const win = limboWin(R, target);
    if (!servedResultMatches(Number(b.result), R)) resultFails++;
    if (b.win !== win) winFails++;
    const credit = win ? hundredths(Number(b.betAmount)) * hundredths(target) : 0;
    if (Math.round(Number(b.winningAmount) * 1e4) !== credit || !Number.isFinite(Number(b.winningAmount))) creditFails++;
    const outcome = b.raw?.round?.wagers?.[0]?.outcome;
    if (!outcome || Number(outcome.multiplier) !== (win ? target : 0) || Number(outcome.result) !== Number(b.result)) multFails++;
    if (Number(b.stakeWallet) !== Number(b.betAmount) || Number(b.winningAmountWallet) !== Number(b.winningAmount)) walletFails++;
    if (win) wins++;
    recomputed++;
  }
  const recomputeOk = recomputed === SUPPLEMENT_EXPECTED_BETS && resultFails + winFails + creditFails + multFails + walletFails === 0;
  if (!recomputeOk) bad(`recompute: ${recomputed}/${SUPPLEMENT_EXPECTED_BETS}, ${resultFails} result, ${winFails} win, ${creditFails} credit, ${multFails} outcome.multiplier, ${walletFails} wallet`);
  if (targetFails) bad(`${targetFails} targets not a legal 2-dp value at or below ${LIVE_TARGET_CEILING}x`);
  // expected wins from the targets actually played (exact win probability floor(N/ci)/1e8)
  const expectedWins = bets.reduce((acc, b) => acc + Math.floor(9_900_000_000 / hundredths(Number(b.params.target))) / 1e8, 0);

  // ── (f) coverage — profile LIMBO-15 ────────────────────────────────────────────────────────
  const planOk = Object.entries(SUPPLEMENT_DECADES).every(([d, n]) => decadeCount.get(Number(d)) === n)
    && [...decadeCount.keys()].every((d) => d in SUPPLEMENT_DECADES);
  if (!planOk) bad(`supplement decades ${JSON.stringify(Object.fromEntries(decadeCount))} differ from the plan ${JSON.stringify(SUPPLEMENT_DECADES)}`);
  const topDecade = decadeOf(LIVE_TARGET_CEILING);
  const auditedA = new Map<number, number>();
  for (const b of ctx.phaseA) auditedA.set(decadeOf(Number(b.params.target)), (auditedA.get(decadeOf(Number(b.params.target))) ?? 0) + 1);
  const coverage: string[] = [];
  let decadesShort = 0;
  for (let d = 0; d <= topDecade; d++) {
    const a = auditedA.get(d) ?? 0;
    const s = decadeCount.get(d) ?? 0;
    if (a + s < PHASE_A_DECADE_FLOOR) decadesShort++;
    coverage.push(`10^${d} ${a + s} (audited A ${a} + supplement A2 ${s})`);
  }
  const atCeiling = bets.filter((b) => hundredths(Number(b.params.target)) === hundredths(LIVE_TARGET_CEILING)).length;
  const minA = Math.min(...ctx.phaseA.map((b) => Number(b.params.target)));
  const coverageOk = planOk && decadesShort === 0 && minA === MIN_MULTIPLIER;
  if (!coverageOk && decadesShort) bad(`${decadesShort} declared decade(s) below the Phase A floor of ${PHASE_A_DECADE_FLOOR}`);
  const distinctTargets = new Set(bets.map((b) => Number(b.params.target))).size;

  // ── (g) the ceiling witness — evidence/E20 ─────────────────────────────────────────────────
  const p1Abs = path.join(root, CEILING_PROBE_DIR, CEILING_PROBE_1_JOURNAL);
  const p2Abs = path.join(root, CEILING_PROBE_DIR, CEILING_PROBE_2_JOURNAL);
  let witnessOk = false;
  let witnessDetail = 'probe journals absent';
  if (fs.existsSync(p1Abs) && fs.existsSync(p2Abs)) {
    const p1Raw = fs.readFileSync(p1Abs), p2Raw = fs.readFileSync(p2Abs);
    const probePinsOk = sha256(p1Raw) === CEILING_PROBE_1_SHA256 && sha256(p2Raw) === CEILING_PROBE_2_SHA256;
    const p1 = readJournal(p1Abs), p2 = readJournal(p2Abs);
    const p1Bets = p1.filter((e) => e.t === 'bet').map((e) => e.rec);
    const p2Bets = p2.filter((e) => e.t === 'bet').map((e) => e.rec);
    const p1Intents = p1.filter((e) => e.t === 'intent');
    const refusedIntent = p1Intents.find((e) => Number(e.body?.params?.target) === CEILING_PROBE_REFUSED_TARGET);
    const refusedSettled = p1Bets.some((r) => Number(r.params?.target) === CEILING_PROBE_REFUSED_TARGET)
      || p2Bets.some((r) => Number(r.params?.target) === CEILING_PROBE_REFUSED_TARGET);
    const p1Seed = p1Bets[0]?.hashedServerSeed;
    const p2Pre = p2.find((e) => e.t === 'pre')?.state ?? {};
    // probe 1's seed is revealed by probe 2's opening rotation; probe 2's by its closing rotation
    const p2Rot = p2.filter((e) => e.t === 'rotate');
    const reveal = new Map<string, string>();
    for (const r of p2Rot) {
      const seed = r.raw?.revealedServerSeed;
      if (typeof seed === 'string') reveal.set(commitHash(seed), seed);
    }
    const p1Settled = p1Bets.filter((r) => reveal.has(r.hashedServerSeed) && settles(r, reveal.get(r.hashedServerSeed)!)).length;
    const p2Settled = p2Bets.filter((r) => reveal.has(r.hashedServerSeed) && settles(r, reveal.get(r.hashedServerSeed)!)).length;
    const nonceUnconsumed = p2Pre.hashedServerSeed === p1Seed && p2Pre.nonce === p1Bets.filter((r) => r.hashedServerSeed === p1Seed).length;
    const acceptedAtCeiling = [...p1Bets, ...p2Bets].filter((r) => hundredths(Number(r.params?.target)) === hundredths(LIVE_TARGET_CEILING)).length;
    // chain: probe 2's last rotation hands over to the supplement's pre-capture commitment
    const lastP2 = p2Rot[p2Rot.length - 1];
    const chainsToSupplement = lastP2?.state?.hashedServerSeed === pre.hashedServerSeed;
    const p1Done = p1.some((e) => e.t === 'done');
    witnessOk = probePinsOk && !!refusedIntent && !refusedSettled && p1Settled === p1Bets.length && p2Settled === p2Bets.length
      && p1Bets.length > 0 && nonceUnconsumed && acceptedAtCeiling === CEILING_PROBE_ACCEPTED_AT_CEILING && chainsToSupplement;
    witnessDetail = `E20 (${CEILING_PROBE_DIR}/, both journals pinned: ${probePinsOk}): the ${LIVE_TARGET_CEILING_WITNESSED} probe settled ${acceptedAtCeiling} $0.10 bet(s) at exactly ${LIVE_TARGET_CEILING}x across its two runs, `
      + `${p1Settled + p2Settled}/${p1Bets.length + p2Bets.length} probe bets recompute from the seed later revealed for them; `
      + `the request at ${CEILING_PROBE_REFUSED_TARGET}x has a journalled intent (${!!refusedIntent}) and NO settlement in either run (${!refusedSettled}), probe run 1 has no done event (${!p1Done}), `
      + `and probe run 2's opening read of that seed shows nonce ${p2Pre.nonce} = the ${p1Bets.filter((r) => r.hashedServerSeed === p1Seed).length} round(s) settled under it (${nonceUnconsumed}: the request consumed no round); `
      + `probe 2 hands over to this supplement's pre-capture commitment (${chainsToSupplement}). The server's reply to the ${CEILING_PROBE_REFUSED_TARGET}x request is NOT in either journal — its text (errorCode 3001, "<=10000") is a hand-typed note in capture/capture-limbo-v2.mjs; one above-ceiling target was probed`;
  }
  if (!witnessOk) bad('ceiling witness (E20) does not hold');
  const auditedAbove = ctx.bets.filter((b) => hundredths(Number(b.params.target)) > hundredths(LIVE_TARGET_CEILING));
  const auditedAboveMax = auditedAbove.length ? Math.max(...auditedAbove.map((b) => Number(b.params.target))) : 0;

  // ── (h) the cap re-probe — evidence/E21 (prepared 2026-10-02, capture/PROBE-2026-10-02.md) ─────────
  // Consulted ONLY when pinned in src/config.ts. An unpinned file in the evidence directory decides
  // nothing: a refusal journal is easy to write by hand, so the file is held to a pin like every other
  // artifact this step scores, and its rounds are recomputed (the control) from the seed later revealed.
  let capPinProblem = false;
  let capJ: CapProbeJudgement | null = null;
  let capDay = '';
  let capText: string;
  if (CAP_PROBE_JOURNAL === null || CAP_PROBE_SHA256 === null) {
    capText = `the re-probe of ${CAP_PROBE_TARGETS.map((t) => `${t}x`).join(', ')} with every reply saved, prepared in capture/PROBE-2026-10-02.md, has not been run (CAP_PROBE_JOURNAL is null in src/config.ts)`;
  } else {
    const capAbs = path.join(root, CAP_PROBE_DIR, CAP_PROBE_JOURNAL);
    if (!fs.existsSync(capAbs)) {
      capPinProblem = true;
      capText = `the pinned re-probe journal ${CAP_PROBE_DIR}/${CAP_PROBE_JOURNAL} is ABSENT`;
    } else {
      const capPinOk = sha256(fs.readFileSync(capAbs)) === CAP_PROBE_SHA256;
      if (!capPinOk) capPinProblem = true;
      const capEvents = readJournal(capAbs);
      capDay = String(capEvents[0]?.at ?? '').slice(0, 10);
      capJ = judgeCapProbe(capEvents, CAP_PROBE_TARGETS, LIVE_TARGET_CEILING);
      capText = `E21 (${CAP_PROBE_DIR}/${CAP_PROBE_JOURNAL}, pinned: ${capPinOk}): control at ${LIVE_TARGET_CEILING}x settled ${capJ.controlSettled}, recomputed ${capJ.controlRecomputed}; `
        + capJ.rows.map((r) => `${r.target}x ${r.settled ? 'ACCEPTED (settled)'
          : r.refused ? `refused (HTTP ${r.status}, code ${r.code}${r.message ? `, "${r.message}"` : ''}, no nonce consumed)`
            : `NOT SHOWN REFUSED (intents ${r.intents}, saved replies ${r.replies}, status ${r.status}, nonce consumed ${r.nonceConsumed})`}`).join('; ');
    }
  }
  if (capPinProblem) bad(`cap re-probe (E21): ${capText}`);
  const capCleared = !capPinProblem && capJ !== null && capJ.allRefused;

  const ok = pinsOk && journalRowsMatch && intentMissing === 0 && forbidden.length === 0 && resumesOk && resumeNonceOk === resumes.length
    && popOk && commitOk && recomputeOk && targetFails === 0 && coverageOk && witnessOk && !capPinProblem;

  // VERDICT TREATMENT (profile LIMBO-14, policy FLAG): "a client-side target ceiling the server does not
  // enforce, is disclosed". The server accepted targets above the ceiling on 2026-09-11; until a saved
  // server reply shows the targets beyond the RTP-CLAIM band refused, that is the audit's one operator
  // FLAG, worded with dates. A mismatch in any arm is still a FAIL.
  const grid = legalGrid();
  const aboveByTarget = new Map<number, number>();
  for (const b of auditedAbove) aboveByTarget.set(Number(b.params.target), (aboveByTarget.get(Number(b.params.target)) ?? 0) + 1);
  const aboveText = [...aboveByTarget].sort(([a], [z]) => a - z).map(([t, n]) => `${n} at ${t}x`).join(', ') || 'none';
  const flagged = auditedAbove.length > 0 && !capCleared;
  // Which of the audited above-ceiling targets the pinned re-probe asked for and saw refused (none unless it cleared).
  const auditedAboveTargets = [...new Set(auditedAbove.map((b) => Number(b.params.target)))].sort((a, z) => a - z);
  const reprobed = capCleared ? auditedAboveTargets.filter((t) => capJ!.rows.some((r) => r.refused && hundredths(r.target) === hundredths(t))) : [];
  const notReprobed = auditedAboveTargets.filter((t) => !reprobed.includes(t));
  const lead = flagged
    ? `FLAG (profile LIMBO-14, origin operator): the target cap is not evidenced by a saved server reply. On 2026-09-11 the server accepted and settled targets up to ${auditedAboveMax}x (${aboveText}). `
      + `A ${UI_MAX_TARGET}x limit in the UI was observed on 2026-09-23; no record of it was kept. `
      + `The only later probe above ${LIVE_TARGET_CEILING}x (${LIVE_TARGET_CEILING_WITNESSED}, ${CEILING_PROBE_REFUSED_TARGET}x, itself inside the RTP-CLAIM band at RTP ${ciRtpPct(hundredths(CEILING_PROBE_REFUSED_TARGET))}%) did not settle, and the server's reply was not saved. `
      + `The first target outside the band is ${ciToTarget(grid.firstBeyondBandCi)}x (RTP ${ciRtpPct(grid.firstBeyondBandCi)}%, Step 16): the RTP-CLAIM PASS on targets up to ${LIVE_TARGET_CEILING}x holds for the game only if targets from there up are refused. `
      + `The flag clears when a saved server reply shows them refused — ${capText}. `
      + `${[...aboveByTarget.keys()].sort((a, z) => a - z).map((t) => `${t}x`).join(' and ') || 'no audited target'} were not re-probed; at ${MAX_MULTIPLIER}x the 2026-09-11 server refused a $0.10 bet on exposure (errorCode 3138, evidence/E15), not on the target. `
      + `On the 2026-09-11 range the RTP-CLAIM rule would fail (Step 16 prints the count and the worst target). `
    : auditedAbove.length > 0
      ? `TARGET CAP EVIDENCED (profile LIMBO-14): ${capText}. DISCLOSED HISTORY: on 2026-09-11 the server settled ${auditedAbove.length} rounds above ${LIVE_TARGET_CEILING}x (${aboveText}); on the 2026-09-11 range the RTP-CLAIM rule would fail (Step 16). `
      : '';
  return [step(STEP_NUMBER, STEP_NAME, !ok ? 'FAIL' : flagged ? 'FLAG' : 'PASS',
    `${ok ? lead : ''}SUPPLEMENT to the audited dataset, scored here only (${SUPPLEMENT_DATA_PATH}, pinned ${dsHash.slice(0, 16)}… ${dsHash === SUPPLEMENT_DATASET_SHA256 ? 'match' : 'MISMATCH'}; journal ${jrHash.slice(0, 16)}… ${jrHash === SUPPLEMENT_JOURNAL_SHA256 ? 'match' : 'MISMATCH'}). `
    + `(a) journal ${jBets.length} bet records == dataset rows bet for bet (${journalRowsMatch}), ${jBets.length - intentMissing}/${jBets.length} preceded by their intent; event census ${JSON.stringify(census)}; `
    + `DECLARED RESUME: ${resumes.length} resume(s) against SUPPLEMENT_DECLARED_RESUMES ${SUPPLEMENT_DECLARED_RESUMES} (${resumesOk}) — ${resumeNotes.join('; ')}; `
    + `(b) ${bets.length}/${SUPPLEMENT_EXPECTED_BETS} bets in ${perEpoch.size}/${SUPPLEMENT_EXPECTED_SEEDS} epochs x ${EXPECTED_EPOCH_SIZE}, ${epochsNotClosed} epoch(s) whose nonces do not close 0..${EXPECTED_EPOCH_SIZE - 1}, all phase ${SUPPLEMENT_PHASE} at $${SUPPLEMENT_STAKE} (${popOk}); `
    + `(c) ${seeds.length - commitFails}/${seeds.length} seeds revealed and hash to their commitment, ${Math.max(seeds.length - 1, 0) - linkFails}/${Math.max(seeds.length - 1, 0)} chain links, pre-capture anchor ${anchorOk}, ${bindFails} rounds off their epoch's commitment or client seed, ${seeds.length - clientAfterFails}/${seeds.length} client seeds set after the commitment was published; `
    + `(d) ${recomputed}/${SUPPLEMENT_EXPECTED_BETS} rounds recomputed from the revealed seeds: ${resultFails} result, ${winFails} win-flag, ${creditFails} credit, ${multFails} outcome.multiplier and ${walletFails} wallet mismatches; ${wins} wins (${expectedWins.toFixed(4)} expected from the targets played${wins === 0 ? ', so this supplement exercises the credit path on losses only — winning credit is carried by Steps 8-9 on the audited dataset' : ''}); `
    + `(e) ${targetFails} targets off the 2-dp grid or above the live ceiling ${LIVE_TARGET_CEILING}x, ${atCeiling} at exactly ${LIVE_TARGET_CEILING}x, ${distinctTargets} distinct; `
    + `(f) PHASE A COVERAGE per decade up to the declared ceiling ${LIVE_TARGET_CEILING}x (decade 10^${topDecade}) against the floor ${PHASE_A_DECADE_FLOOR}: ${coverage.join(', ')}; minimum legal target ${MIN_MULTIPLIER}x played in Phase A (${minA === MIN_MULTIPLIER}); `
    + `(g) LIVE TARGET CEILING — ${witnessDetail}. `
    + `The audited 2026-09-11 dataset holds ${auditedAbove.length} rounds above ${LIVE_TARGET_CEILING}x (max ${auditedAboveMax}x), settled then; on ${LIVE_TARGET_CEILING_WITNESSED} the one above-ceiling target probed (${CEILING_PROBE_REFUSED_TARGET}x) was not settled`
    + (reprobed.length ? `; on ${capDay} the re-probe (E21) saw ${reprobed.map((t) => `${t}x`).join(', ')} refused` : '')
    + (notReprobed.length
      ? `, and ${reprobed.length ? 'the other ' : 'the '}audited target${notReprobed.length > 1 ? 's' : ''} above the ceiling (${notReprobed.map((t) => `${t}x`).join(', ')}) ${notReprobed.length > 1 ? 'were' : 'was'} not re-probed`
      : ', and every audited target above the ceiling was re-probed')
    + (problems.length ? `. PROBLEMS: ${problems.join(' | ')}` : ''),
    'operator',
  )];
}
