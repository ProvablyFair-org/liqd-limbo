/**
 * Steps 19–21: Standardization-parity steps — the artifact set, the settlement chain end to end,
 * and the declared scope.
 *
 *   19  Artifact Integrity — every artifact of record present, readable and PINNED (the dataset, the
 *       verifier probe records, the simulation artifacts). An artifact that is only
 *       cited is not evidence.
 *   20  Settlement Determinism — outcome and credit fully determined by (serverSeed, clientSeed,
 *       nonce, target, stake), derived without reading a single served outcome field.
 *   21  Scope & Declared Limitations — L1–L4 are re-checked against the dataset on every run and the
 *       step FAILS if one stops being true; the figures quoted for L7 and L8 are recomputed; L5 and L6
 *       are restated, not measured.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';

import type { StepResult, VerifyContext } from './context';
import { step, hundredths } from './context';
import { limboDraw } from '../../src/rng';
import {
  resultMultiplier, limboWin, round8,
  MIN_RESULT, MAX_MULTIPLIER, PROD_TOP_TARGET, RUNNER_BUILDS,
  CAP_PROBE_DIR, CAP_PROBE_RECORDS, CAP_PROBE_RECORDS_SHA256,
  EXPECTED_BETS, EXPECTED_SEEDS, EXPECTED_PHASES, DATA_PATH,
  SIMULATION_SHA256, SIMULATION_HTML_SHA256,
  SIM_UNIFORMITY_DRAWS, SIM_SERIAL_DRAWS, SIM_EDGE_BETS, SIM_MASTER_SEED,
  RANGE, CURSOR, RESULT_NUMERATOR, HOUSE_EDGE,
} from '../../src/config';

import { DOMAINS, checkDomains } from '../../src/domains';
import { captureChain } from './capture-chain';

const sha256File = (p: string) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, seeds, seedMap, meta } = ctx;
  const out: StepResult[] = [];

  // ── Step 19: Artifact integrity & evidence reproduction ────────────────────
  {
    const notes: string[] = [];
    let bad = false;

    // (1) The capture. PINNED: its SHA-256 must equal the pin in src/config.ts. The loader already
    //     aborts on a mismatch before any step is scored, so reaching this line at all means the
    //     bytes are the pinned bytes; the comparison is restated here so the artifact of record
    //     carries it rather than leaving it implicit in an exit code that produced no output.
    const hashOk = ctx.datasetSha256 === ctx.expectedDatasetHash;
    if (!hashOk) bad = true;
    notes.push(`${DATA_PATH} sha256 ${ctx.datasetSha256.slice(0, 16)}… ${hashOk ? 'matches' : '!='} the pin in src/config.ts ${ctx.expectedDatasetHash.slice(0, 16)}… (the loader aborts on a mismatch before any step runs)`);

    // (2) The runner build of each run: the dataset header must name the build the capture log records
    //     (src/config.ts RUNNER_BUILDS). The runner source of each build is shipped and checked in (2b).
    {
      const captures = ((meta as unknown as { captures?: { capture: number; runner?: string }[] }).captures ?? []);
      const ok = RUNNER_BUILDS.filter((r) => captures.find((x) => x.capture === r.capture)?.runner === r.build).length;
      if (ok !== RUNNER_BUILDS.length || captures.length !== RUNNER_BUILDS.length) bad = true;
      notes.push(`RUNNER BUILDS: ${ok}/${RUNNER_BUILDS.length} runs carry the runner build recorded for them in src/config.ts (${[...new Set(RUNNER_BUILDS.map((r) => r.build.split(' ').pop()))].join(', ')})`);
    }

    // (2b) The capture chain: the runner source, the converter source, the reply record of LIQD's replies held to the
    //      dataset, and the identifier scan (tests/steps/capture-chain.ts).
    {
      const c = captureChain(ctx);
      if (!c.ok) bad = true;
      notes.push(`CAPTURE CHAIN: ${c.note}`);
    }

    // (3) The production evidence files. E02 (the verifier probes at the result cap) is PINNED here and
    //     REPRODUCED from src/ in Step 25. E03 (one verifier reply on target 100000) and the game page labels
    //     are read by Steps 17 and 15; they must be present and parse, or those steps would be citing nothing.
    {
      const pins: [string, string][] = [
        [`${CAP_PROBE_DIR}/${CAP_PROBE_RECORDS}`, CAP_PROBE_RECORDS_SHA256],
      ];
      const parts: string[] = [];
      for (const [rel, pin] of pins) {
        const fp = path.join(ctx.repoRoot, rel);
        if (!fs.existsSync(fp)) { bad = true; parts.push(`${rel} ABSENT`); continue; }
        const h = sha256File(fp);
        if (h !== pin) bad = true;
        parts.push(`${rel} sha256 ${h.slice(0, 16)}… ${h === pin ? 'matches' : '!='} its pin`);
      }
      for (const rel of ['evidence/E03-prod-verifier-target-100000.json', 'evidence/rtp-page-labels-2026-10-01.json']) {
        const fp = path.join(ctx.repoRoot, rel);
        let state = 'ABSENT';
        if (fs.existsSync(fp)) { try { JSON.parse(fs.readFileSync(fp, 'utf8')); state = `present, parses, sha256 ${sha256File(fp).slice(0, 16)}… (recorded, not pinned: a transcription the auditor wrote; Steps 17 and 15 read its content)`; } catch { state = 'PARSE ERROR'; } }
        if (!state.startsWith('present')) bad = true;
        parts.push(`${rel} ${state}`);
      }
      notes.push(`EVIDENCE FILES: ${parts.join('; ')}`);
    }

    // (4) The simulation artifacts — PINNED, and ENFORCED here.
    //
    //     WHAT THIS DOES NOT CLAIM, first, because it is the part that matters. `npm run simulate` is
    //     a SEPARATE PRODUCER and THIS block re-derives no statistic. Of the artifact's three parts, the
    //     Pass-2 block is re-derived from the dataset by Step 24, the Pass-1 claims are carried by the
    //     separate replayable grid Step 23 re-derives, and only the LEGACY Pass-1 figures in this file
    //     stay producer-attested (limitation L9, narrowed). Re-pinning defeats everything below — a
    //     fabricating auditor edits the artifact and the constant in one commit — and that remains a
    //     DECLARED SURVIVOR.
    //
    //     WHAT A PIN CAN FIX is narrower, and is mechanically detectable. SIMULATION_SHA256 and
    //     SIMULATION_HTML_SHA256 declared in src/config.ts and read by NOTHING would let the shipped
    //     artifact be emptied, truncated, filled with self-consistent nonsense, or DELETED
    //     OUTRIGHT, with this suite still returning 21/21 Full Pass. Both have been executed against
    //     this package: a degenerate artifact survived, and so did an ABSENT one. A file the
    //     report quotes on every page must not be removable without a scored step noticing.
    //
    //     So this block enforces precisely what a hash pin CAN enforce — that the bytes shipped are the
    //     bytes this audit read — plus the DECLARED SAMPLE DEPTHS, which bind SIM_UNIFORMITY_DRAWS,
    //     SIM_SERIAL_DRAWS and SIM_EDGE_BETS to the artifact that claims to have been produced at them
    //     (G-BIND), and the producer's model constants to the model this audit verified. A depth is
    //     read from the artifact and compared against the code constant; the serial depth, which the
    //     artifact does not record, is recovered from the identity z = r1 * sqrt(n) at the precision
    //     the artifact stores. None of this is a re-derivation of a statistic and none of it is
    //     presented as one.
    const simPath = path.join(ctx.outputsDir, 'simulation-results.json');
    const htmlPath = path.join(ctx.outputsDir, 'rtp-convergence.html');
    if (!fs.existsSync(simPath)) {
      bad = true;
      notes.push('outputs/simulation-results.json ABSENT — every Pass-1 and Pass-2 figure in this report is quoted from that file, so its absence is a hard FAIL and not a skip; a guard whose evidence can be deleted is not a guard');
    } else if (!fs.existsSync(htmlPath)) {
      bad = true;
      notes.push('outputs/rtp-convergence.html ABSENT — the convergence chart is the twin output of the same producer run and is an artifact of record');
    } else {
      const simHash = sha256File(simPath);
      const htmlHash = sha256File(htmlPath);
      const simHashOk = simHash === SIMULATION_SHA256;
      const htmlHashOk = htmlHash === SIMULATION_HTML_SHA256;
      if (!simHashOk || !htmlHashOk) bad = true;

      let sim: Record<string, unknown> | null = null;
      try { sim = JSON.parse(fs.readFileSync(simPath, 'utf8')) as Record<string, unknown>; } catch (e) {
        bad = true;
        notes.push(`outputs/simulation-results.json PARSE ERROR (${(e instanceof Error ? e.message : String(e)).slice(0, 100)}) — a verifier must not approve an artifact it could not read`);
      }

      let depthNote = 'shape not read (parse failed)';
      if (sim) {
        const p1 = sim.pass1 as {
          masterSeed?: unknown;
          draws?: unknown;
          serial?: { lag1?: unknown; lag1Z?: unknown };
          effectiveEdge?: { n?: unknown }[];
        } | undefined;
        const model = sim.model as {
          range?: unknown; cursor?: unknown; resultNumerator?: unknown;
          maxMultiplier?: unknown; houseEdge?: unknown;
        } | undefined;
        const edgeRows = Array.isArray(p1?.effectiveEdge) ? p1!.effectiveEdge! : [];
        const lag1 = Number(p1?.serial?.lag1);
        const lag1Z = Number(p1?.serial?.lag1Z);
        const shapeOk = !!p1 && !!model && Number.isFinite(Number(p1.draws))
          && Number.isFinite(lag1) && Number.isFinite(lag1Z) && edgeRows.length > 0;
        if (!shapeOk) {
          bad = true;
          depthNote = 'SHAPE ERROR — pass1.draws, pass1.serial.{lag1,lag1Z}, a non-empty pass1.effectiveEdge[] and the model block are all required, and at least one is missing or non-numeric';
        } else {
          const drawsOk = Number(p1!.draws) === SIM_UNIFORMITY_DRAWS;
          const edgeOk = edgeRows.every((r) => Number(r.n) === SIM_EDGE_BETS);
          // The artifact does not record the serial sample size, so recover it from the identity the
          // producer used: z = r1 * sqrt(n), compared at the 3 decimals the artifact stores.
          const dp = ((String(lag1Z).split('.')[1]) || '').length;
          const q = Math.pow(10, dp);
          const serialOk = Math.round(lag1 * Math.sqrt(SIM_SERIAL_DRAWS) * q) / q === lag1Z;
          const modelOk = Number(model!.range) === RANGE && Number(model!.cursor) === CURSOR
            && Number(model!.resultNumerator) === RESULT_NUMERATOR
            && Number(model!.maxMultiplier) === MAX_MULTIPLIER
            && Number(model!.houseEdge) === HOUSE_EDGE;
          // The recorded seed (since 2026-09-26): the artifact must name the SIM_MASTER_SEED it was drawn from.
          const seedOk = p1!.masterSeed === SIM_MASTER_SEED;
          if (!(drawsOk && edgeOk && serialOk && modelOk && seedOk)) bad = true;
          depthNote = `recorded seed pass1.masterSeed ${JSON.stringify(p1!.masterSeed)} == SIM_MASTER_SEED (${seedOk ? 'ok' : 'DISAGREES'}); declared depths bind to src/config.ts — uniformity ${p1!.draws} == SIM_UNIFORMITY_DRAWS ${SIM_UNIFORMITY_DRAWS} (${drawsOk ? 'ok' : 'DISAGREES'}); `
            + `all ${edgeRows.length} effective-edge samples at n == SIM_EDGE_BETS ${SIM_EDGE_BETS} (${edgeOk ? 'ok' : 'DISAGREES'}); `
            + `the serial screen's stored lag-1 Z ${lag1Z} is recovered as r1 x sqrt(SIM_SERIAL_DRAWS ${SIM_SERIAL_DRAWS}) at the artifact's own precision (${serialOk ? 'ok' : 'DISAGREES'}); `
            + `the producer's model block equals the model this audit verified — range ${model!.range}, cursor ${model!.cursor}, numerator ${model!.resultNumerator}, ceiling ${model!.maxMultiplier}x, edge ${model!.houseEdge} (${modelOk ? 'ok' : 'DISAGREES'})`;
        }
      }

      notes.push(
        `outputs/simulation-results.json sha256 ${simHash.slice(0, 16)}… ${simHashOk ? 'matches' : '!='} SIMULATION_SHA256 ${SIMULATION_SHA256.slice(0, 16)}… and outputs/rtp-convergence.html sha256 ${htmlHash.slice(0, 16)}… ${htmlHashOk ? 'matches' : '!='} SIMULATION_HTML_SHA256; `
        + `${depthNote}. `
        + 'READ THIS FOR EXACTLY WHAT IT IS: the pin establishes that the shipped bytes are the bytes this audit read and that the artifact is present and well formed. It does NOT establish that the legacy Pass-1 statistics inside THIS artifact were measured, because no scored step re-derives them (L9): the Pass-1 claims are carried by outputs/pass1-grid.json, re-derived by Step 23, and the Pass-2 block is re-derived from the dataset by Step 24',
      );
    }

    // (5) VALUE DOMAINS (profile LIMBO-27): every numeric leaf of every pinned JSON artifact of record
    //     has a declared physically-possible domain in src/domains.ts, and a leaf with none fails.
    {
      const dn: string[] = [];
      let leaves = 0;
      for (const rel of Object.keys(DOMAINS)) {
        const fp = path.join(ctx.repoRoot, rel);
        let doc: unknown = null;
        try { doc = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch { dn.push(`${rel} unreadable`); continue; }
        const r = checkDomains(rel, doc);
        leaves += r.leaves;
        dn.push(...r.violations);
      }
      if (dn.length) bad = true;
      notes.push(`VALUE DOMAINS: ${leaves} numeric leaves across ${Object.keys(DOMAINS).length} pinned JSON artifacts checked against src/domains.ts — ${dn.length} without a domain or outside it${dn.length ? ` (${dn.slice(0, 3).join('; ')})` : ''}`);
    }

    out.push(step(19, 'Artifact Integrity', bad ? 'FAIL' : 'PASS', notes.join('; ')));
  }

  // ── Step 20: Settlement determinism ─────────────────────────────────────────
  // The whole chain, end to end, from inputs a player controls or can check:
  //     (serverSeed, clientSeed, nonce) -> k -> R -> win -> credit
  // and NOTHING served is read on the way. `b.result`, `b.multiplier`, `b.win` and `b.resultLabel`
  // are all excluded here; they are only compared at the end. Steps 5/6/8/9 each pin one link
  // against its served field — this step asserts the whole chain is determined, so there is no
  // degree of freedom left for an operator to exercise after seeing the draw.
  {
    let chk = 0;
    let bad = 0;
    const fails: string[] = [];
    let wins = 0;
    let losses = 0;
    let flooredCovered = 0;
    let boundaryCovered = 0;
    const stakesSeen = new Set<number>();
    const phasesSeen = new Set<string>();
    for (const b of bets) {
      const ss = seedMap.get(b.hashedServerSeed);
      if (!ss) { bad++; fails.push(`epoch ${b.epoch} nonce ${b.nonce}: no revealed seed`); continue; }
      chk++;
      stakesSeen.add(Number(b.betAmount));
      phasesSeen.add(b.phase);
      const target = Number(b.params.target);
      const stake = Number(b.betAmount);
      const R = resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce));
      const win = limboWin(R, target);
      if (win) wins++; else losses++;
      if (R === MIN_RESULT) flooredCovered++;
      if (R === target) boundaryCovered++;
      // determined credit, in the operator's own decimal number system
      const determinedCreditH8 = win ? hundredths(stake) * hundredths(target) * 1e4 : 0;
      const creditedH8 = Math.round(Number(b.winningAmount) * 1e8);
      const determinedMultiplier = win ? target : 0;
      if (win !== !!b.win || creditedH8 !== determinedCreditH8 || Number(b.multiplier) !== determinedMultiplier) {
        bad++;
        if (fails.length < 3) fails.push(`epoch ${b.epoch} nonce ${b.nonce}: determined (win=${win}, credit=${determinedCreditH8 / 1e8}, mult=${determinedMultiplier}) vs served (win=${b.win}, credit=${b.winningAmount}, mult=${b.multiplier})`);
      }
      // the binary64 route a re-implementer would take must land on the same credit
      if (win && round8(stake * target) !== Number(b.winningAmount)) {
        bad++;
        if (fails.length < 3) fails.push(`epoch ${b.epoch} nonce ${b.nonce}: ROUND_8(stake x target) != credited`);
      }
    }
    const coverOk = chk === EXPECTED_BETS && wins > 0 && losses > 0
      && stakesSeen.size === new Set(Object.values(EXPECTED_PHASES).map((p) => p.stake)).size && phasesSeen.size === Object.keys(EXPECTED_PHASES).length && flooredCovered > 0 && boundaryCovered > 0;
    out.push(step(20, 'Settlement Determinism', bad === 0 && coverOk ? 'PASS' : 'FAIL',
      `${chk}/${EXPECTED_BETS} bets: outcome AND credited amount are fully determined by (serverSeed, clientSeed, nonce, target, stake) — ${bad} disagreement(s) with the served settlement`
      + (fails.length ? ` (e.g. ${fails.join('; ')})` : '')
      + `. No served outcome field is read while deriving: the served result, win, multiplier and resultLabel are all recomputed and only then compared, so a settlement chosen after the draw has nowhere to hide; `
      + `coverage — ${wins} wins / ${losses} losses, ${stakesSeen.size} distinct stakes (${[...stakesSeen].sort((a, z) => a - z).join(', ')} ${meta.currency}), ${phasesSeen.size}/${Object.keys(EXPECTED_PHASES).length} planned phases, `
      + `${flooredCovered} rounds at the R = ${MIN_RESULT} floor and ${boundaryCovered} landing exactly on the target (the two cases a naive model gets wrong) `
      + `(${coverOk ? 'ok' : 'COVERAGE FAIL'})`));
  }

  // ── Step 21: Scope & declared limitations ───────────────────────────────────
  // G-SCOPE. L1–L5 are MEASURED properties of the artifact, re-checked on every run: if one of them
  // stops being true — the capture host changes, an operator bet counter appears, a balance ledger
  // is recorded, a settled round reaches the result cap, a round above the audited range appears — this
  // step FAILS, and the prose has to be updated. L7 and L8 are recomputed figures, printed. L6 is restated.
  {
    const notes: string[] = [];
    let bad = false;

    // (a) the scored capture is against production, and the scope of the targets it played
    const hostOk = meta.platform === ctx.captureHost;
    if (!hostOk) bad = true;
    const topPlayed = Math.max(...bets.map((b) => Number(b.params.target)));
    const captures = ((meta as unknown as { captures?: { firstRoundAt?: string; lastRoundAt?: string }[] }).captures ?? []);
    const days = [...new Set(captures.flatMap((c) => [String(c.firstRoundAt).slice(0, 10), String(c.lastRoundAt).slice(0, 10)]))].sort();
    if (topPlayed !== PROD_TOP_TARGET) bad = true;
    notes.push(`L1 capture host and scope: the scored dataset was captured against ${meta.platform} and this suite declares ${ctx.captureHost} (${hostOk ? 'agree' : 'DISAGREE'}): production, rounds dated ${days.join(' and ')} (UTC), one account, one currency (${meta.currency}). `
      + `Production rounds were placed on targets from ${Math.min(...bets.map((b) => Number(b.params.target)))}x to ${topPlayed}x at two stakes; nothing above ${topPlayed}x was played, and whether a higher target is accepted is not established (Step 17)`);

    // (b) trailing withholding — no operator bet counter was captured
    const withCounter = seeds.filter((s) => s.operatorBetCount != null).length;
    if (withCounter !== 0) bad = true;
    notes.push(`L2 trailing bound: ${withCounter}/${EXPECTED_SEEDS} epochs carry an operator-sourced bet counter. `
      + (withCounter === 0
        ? 'With none, the last nonce in each epoch is the auditor\'s own last recorded bet — bets withheld AFTER it are not observable client-side. The leading bound IS operator-sourced (nonceStart) and the epoch size is fixed by the capture plan, so withholding could only occur at the tail of an epoch'
        : 'An operator-sourced counter is present, so this limitation no longer holds as declared — FAIL until the prose and this step are updated'));

    // (c) no wallet balance ledger
    const withBalance = bets.filter((b) => (b as unknown as { balanceOk?: unknown }).balanceOk != null).length;
    if (withBalance !== 0) bad = true;
    notes.push(`L3 wallet credit: ${withBalance}/${EXPECTED_BETS} bets carry a before/after wallet BALANCE. `
      + (withBalance === 0
        ? 'stakeWallet and winningAmountWallet are settle-RESPONSE fields, so Steps 9/11/20 establish that the operator\'s reported credit follows the rule — not that the wallet was actually credited that amount'
        : 'A balance ledger is present, so this limitation no longer holds as declared — FAIL until the prose and this step are updated'));

    // (d) the upper clamp is unreached by a settled round
    const atCeiling = bets.filter((b) => Number(b.result) === MAX_MULTIPLIER).length;
    if (atCeiling !== 0) bad = true;
    const maxResult = Math.max(...bets.map((b) => Number(b.result)));
    let atFloor = 0, floorClamped = 0;
    for (const b of bets) {
      if (Number(b.result) !== MIN_RESULT) continue;
      atFloor++;
      const ss = seedMap.get(b.hashedServerSeed);
      if (ss && Math.floor(RESULT_NUMERATOR / (limboDraw(ss, b.clientSeed, b.nonce) + 1)) / 100 < MIN_RESULT) floorClamped++;
    }
    notes.push(`L4 result cap: ${atCeiling} settled rounds reached the ${MAX_MULTIPLIER}x result cap (highest result in the capture ${maxResult}x, probability of a cap round 99/1e8 per bet). `
      + (atCeiling === 0
        ? `The cap is therefore witnessed by the production VERIFIER only (Step 25, which counts the verifier probes of 9 November 2026) and exercised by arithmetic over the draw grid (Step 14); it is not witnessed by settled money. At the LOWER clamp ${atFloor} rounds were served at ${MIN_RESULT}x and the clamp changed the value on ${floorClamped} of them`
        : 'A cap round is in the capture, so this limitation no longer holds as declared — FAIL until the prose and this step are updated'));

    // (e) limits: none established
    const above = bets.filter((b) => hundredths(Number(b.params.target)) > hundredths(PROD_TOP_TARGET)).length;
    if (above !== 0) bad = true;
    notes.push(`L5 limits: no bet was refused in the three runs and none was placed above ${PROD_TOP_TARGET}x (${above} rounds above it), so the casino's minimum stake, maximum stake, maximum payout, exposure ceiling and highest accepted target are NOT established by this audit; `
      + `the stakes played are ${[...new Set(bets.map((b) => Number(b.betAmount)))].sort((a, z) => a - z).join(' and ')} ${meta.currency}`);

    // (f) commitment chronology
    notes.push('L6 commitment chronology: the pre-capture chain links (Step 2) place each run\'s first commitment earlier IN THE CHAIN than that run\'s first bet, as recorded by the auditor\'s own capture. '
      + 'A hash chain orders records, it does not date them; there is no independently authenticated timestamp, so the no-post-hoc-choice reading is conditional on that attested chronology');

    // (g) RTP evidence provenance — stated here so the number is never quoted as evidence
    const wagered = bets.reduce((s, b) => s + Number(b.betAmount), 0);
    const returned = bets.reduce((s, b) => s + Number(b.winningAmount), 0);
    notes.push(`L7 live RTP: the ${bets.length}-bet sample returned ${(returned / wagered * 100).toFixed(4)}% (${wagered.toFixed(2)} ${meta.currency} wagered, ${returned.toFixed(2)} returned). `
      + 'That is VARIANCE ILLUSTRATION ONLY and is never cited as RTP evidence: the RTP result in this audit is the closed-form edge identity of Step 16, anchored by the grid tally of Step 15 and the simulation of Step 23');

    // (h) capture-side self-check fields are present and ignored
    const selfChecked = bets.filter((b) => b.verified != null).length;
    notes.push(`L8 capture-side fields: localDraw / localResult / localWin / verified are present on ${selfChecked}/${bets.length} bets and are IGNORED by every scored step — each figure above is re-derived from primitives. `
      + 'They were written by the converter from this package\'s own src (meta.conversion)');

    out.push(step(21, 'Scope & Declared Limitations', bad ? 'FAIL' : 'PASS', notes.join(' | ')));
  }

  return out;
}
