/**
 * LIQD Limbo — Verification suite
 * Run: npm run verify      (scores the frozen capture; writes only under outputs/run/)
 *      npm run report      (the same run with PF_EMIT=1: rewrites the committed artifact)
 *
 * Loads the captured master dataset through the SHA-256-guarded loader, runs every scored step, and
 * writes THIS RUN's results — pass or fail — under `outputs/run/`, leaving every committed artifact
 * byte-identical.
 *
 * ── VERIFICATION DOES NOT WRITE THE EVIDENCE IT SCORES ──────────────────────────────────────────
 * The sibling dice audit shipped a verify script whose last statements overwrote
 * `outputs/verification-results.json` on EVERY run, including a failing one. A reviewer got a FAIL,
 * re-ran, got a PASS, and nothing on disk remembered the disagreement. Repeated testing must not be
 * able to erase an original disagreement, so there are two commands here and only one of them
 * writes a committed artifact:
 *   • `npm run verify` — reads the committed artifacts, writes ONLY `outputs/run/` (this run's
 *     results plus a field-level diff against the committed copy). Run it twice on unchanged input
 *     and you get the same outcome twice.
 *   • `npm run report` — the same run with `PF_EMIT=1`, an EXPLICIT regeneration of the committed
 *     artifact, to be reviewed as a diff before publishing.
 *
 * ── THE VERDICT IS UNREACHABLE UNLESS THE STEPS RAN (G-EXEC) ────────────────────────────────────
 * `EXPECTED_STEPS` is a constant in this file, not `results.length`. Before a verdict is printed,
 * the run asserts that exactly that many steps were scored and that their numbers are exactly
 * 1..EXPECTED_STEPS with no duplicates. A step module that throws takes the process down with a
 * non-zero exit and NO verdict line — a half-run suite cannot report a Full Pass.
 *
 * ── WHAT IS PINNED, AND WHAT IS NOT ─────────────────────────────────────────────────────────────
 * The dataset is pinned by SHA-256 in `src/config.ts` and the loader refuses to run on a mismatch.
 * The evidence records (E13, E15) are NOT pinned by hash and deliberately so: a hash proves a file
 * has not changed since we pinned it, which is worth little for a file we wrote ourselves. They are
 * REPRODUCED instead — Step 19 recomputes E13's result from its own seed triple and re-derives
 * E15's ceiling from the operator's own stated maximum stake.
 *
 * The 2026-09-26 target-decade supplement (data/liqd-limbo-capture-v2-…json + .journal.ndjson) and the two
 * target-ceiling probe journals (evidence/E20-…/) ARE pinned in src/config.ts: Step 25 recomputes all four
 * digests and scores them; nothing from them reaches Steps 1–24. Since 2026-10-02 so is the cap re-probe
 * journal (evidence/E21-target-cap-probe/, CAP_PROBE_SHA256), the fifth digest Step 25 recomputes.
 *
 * The legacy simulation artifacts ARE pinned, and Step 19 enforces those pins: it recomputes both
 * SHA-256s, fails on an absent, unreadable or degenerate file, binds the recorded sample depths to the
 * SIM_* constants in `src/config.ts`, and checks every numeric leaf against its declared value domain
 * (src/domains.ts). `npm run simulate` remains a SEPARATE PRODUCER; Step 24 re-derives the Pass-2 block
 * of its artifact from the dataset, and only the legacy Pass-1 figures in it stay producer-attested
 * (limitation L9, narrowed). Since 2026-09-26 the Pass-1 claims are carried by a
 * second, replayable experiment — `outputs/pass1-grid.json`, seeded from a recorded master seed and
 * storing counts rather than verdicts — which Step 23 re-derives from its rows on every run.
 *
 * ── PROFILE LABELS ─────────────────────────────────────────────────────────────────────────────
 * Each emitted step carries the proposed Framework 1.0 Limbo profile checks it implements
 * (src/profile-map.ts). Labels are attached to the emitted record only; they cannot change what a
 * step asserts. The reproduction diff below compares every leaf, labels included.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';

import { loadDataset } from '../src/loader';
import { DATASET_SHA256, DATA_PATH, EXPECTED_BETS, EXPECTED_SEEDS, EXPECTED_EPOCH_SIZE, SIMULATION_SHA256, SIMULATION_HTML_SHA256, PASS1_GRID_SHA256,
  SUPPLEMENT_DATA_PATH, SUPPLEMENT_DATASET_SHA256, SUPPLEMENT_JOURNAL_PATH, SUPPLEMENT_JOURNAL_SHA256,
  CEILING_PROBE_DIR, CEILING_PROBE_1_JOURNAL, CEILING_PROBE_1_SHA256, CEILING_PROBE_2_JOURNAL, CEILING_PROBE_2_SHA256,
  CAP_PROBE_DIR, CAP_PROBE_JOURNAL, CAP_PROBE_SHA256,
  MIN_MULTIPLIER, LIVE_TARGET_CEILING } from '../src/config';
import type { Bet, Seed } from '../src/types';
import type { VerifyContext, InfoItem, StepResult } from './steps/context';

import * as commitment      from './steps/commitment';
import * as determinism     from './steps/determinism';
import * as payouts         from './steps/payouts';
import * as dataset         from './steps/dataset';
import * as antiCirc        from './steps/anti-circularity';
import * as edge            from './steps/edge';
import * as phaseD          from './steps/phase-d';
import * as standardization from './steps/standardization';
import * as statistical     from './steps/statistical';
import * as liveFit         from './steps/live-fit';
import * as pass1           from './steps/pass1';
import * as pass2           from './steps/pass2';
import * as supplement      from './steps/supplement';
import { labelFor, profileCoverageBlock } from '../src/profile-map';
import { runRtpClaimGate, RTP_CLAIM_STEP, RTP_CLAIM_TABLE_SHA256 } from '../src/rtp-settings';
import { rtpClaimVerdict, RTP_FIGURE_OVERSTATED } from '../src/rtp-claim';
import { fieldDiff, beyondTolerance, maxima, DIFF_ATOL, DIFF_RTOL } from '../src/diff';

/** G-EXEC: the number of scored steps this suite is defined to run. Never `results.length`. */
const EXPECTED_STEPS = 25;

/** G-SCOPE: the host this capture was taken against. Production parity is NOT established. */
const CAPTURE_HOST = 'qa.liqd.com';

const REPO_ROOT    = path.join(__dirname, '..');
const DATASET_PATH = path.join(REPO_ROOT, DATA_PATH);
const OUTPUTS_DIR  = path.join(REPO_ROOT, 'outputs');
const EVIDENCE_DIR = path.join(REPO_ROOT, 'evidence');
/** This run's results. Never a committed artifact; gitignored. */
const RUN_DIR      = path.join(OUTPUTS_DIR, 'run');
/** PF_EMIT=1 (npm run report) is the ONLY thing that rewrites a committed artifact. */
const EMIT         = process.env.PF_EMIT === '1';
/** SHA-256 of a committed file ('<absent>' if it does not exist) — for the machine-readable pin set. */
const sha256Of = (rel: string): string => {
  const p = path.join(REPO_ROOT, rel);
  return fs.existsSync(p) ? createHash('sha256').update(fs.readFileSync(p)).digest('hex') : '<absent>';
};

console.log('\n══════════════════════════════════════════════════════════');
console.log('  LIQD LIMBO — VERIFICATION SUITE');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Runtime: Node ${process.version}`);
console.log(EMIT
  ? '  MODE: REPORT GENERATION (PF_EMIT=1) — the committed artifact WILL be rewritten'
  : '  MODE: verification — committed artifacts are read-only; results go to outputs/run/');

// ── Dataset presence guard (graceful) ─────────────────────────────────────────
if (!fs.existsSync(DATASET_PATH)) {
  console.log(`\n  [ERROR] Dataset not found at ${DATA_PATH}`);
  console.log('  Cannot run verification without the captured master dataset.');
  console.log('\n══════════════════════════════════════════════════════════\n');
  process.exit(1);
}

// ── Load dataset (the SHA-256 guard exits(1) on mismatch, before any step is scored) ──
const ds = loadDataset(DATASET_PATH, DATASET_SHA256);
const bets: Bet[]   = ds.bets;
const seeds: Seed[] = ds.seeds;

// hashedServerSeed → revealed serverSeed
const seedMap = new Map<string, string>();
for (const s of seeds) if (s.serverSeed) seedMap.set(s.hashedServerSeed, s.serverSeed);

// hashedServerSeed → the Seed record
const seedByHash = new Map<string, Seed>();
for (const s of seeds) seedByHash.set(s.hashedServerSeed, s);

// hashedServerSeed → bets in that epoch
const byHash = new Map<string, Bet[]>();
for (const b of bets) {
  const arr = byHash.get(b.hashedServerSeed) ?? [];
  arr.push(b);
  byHash.set(b.hashedServerSeed, arr);
}

const distinctTargets = [...new Set(bets.map((b) => Number(b.params.target)))].sort((a, z) => a - z);

if (!fs.existsSync(OUTPUTS_DIR)) fs.mkdirSync(OUTPUTS_DIR, { recursive: true });

// Population figures printed against the CODE constants, not against the file's own header — the
// banner is the first place a coherent shrink would otherwise look convincing (G-BIND).
console.log(`  Dataset: ${bets.length}/${EXPECTED_BETS} bets | Seeds: ${seeds.length}/${EXPECTED_SEEDS} | epoch size ${EXPECTED_EPOCH_SIZE} | SHA-256 pin verified`);
console.log(`  Phases  A:${bets.filter((b) => b.phase === 'A').length} B:${bets.filter((b) => b.phase === 'B').length} C:${bets.filter((b) => b.phase === 'C').length} D:${bets.filter((b) => b.phase === 'D').length}`);
console.log(`  Capture host: ${ds.meta.platform} (declared scope ${CAPTURE_HOST} — production parity NOT established)\n`);

const ctx: VerifyContext = {
  bets, seeds, seedMap, seedByHash, byHash,
  phaseA: bets.filter((b) => b.phase === 'A'),
  phaseB: bets.filter((b) => b.phase === 'B'),
  phaseC: bets.filter((b) => b.phase === 'C'),
  phaseD: bets.filter((b) => b.phase === 'D'),
  repoRoot: REPO_ROOT,
  outputsDir: OUTPUTS_DIR,
  evidenceDir: EVIDENCE_DIR,
  datasetSha256: ds.sha256,
  expectedDatasetHash: DATASET_SHA256,
  captureHost: CAPTURE_HOST,
  meta: ds.meta,
  distinctTargets,
};

// ── Run scored steps ──────────────────────────────────────────────────────────
// A throw anywhere below propagates: the process exits non-zero and no verdict is printed.

const results: StepResult[] = [
  ...commitment.run(ctx),        // Steps  1– 4  commit-reveal integrity
  ...determinism.run(ctx),       // Steps  5– 7  draw/result recomputation, win rule, determinism
  ...payouts.run(ctx),           // Steps  8–11  payout integrity
  ...dataset.run(ctx),           // Steps 12–13  population identity, phase plan
  ...antiCirc.run(ctx),          // Steps 14–15  falsifiability, pricing vs physics
  ...edge.run(ctx),              // Steps 16–17  effective edge, client-code maximum unplayable on 2026-09-11
  ...phaseD.run(ctx),            // Step  18     custom client-seed control
  ...standardization.run(ctx),   // Steps 19–21  artifacts, settlement chain, declared scope
  ...liveFit.run(ctx),           // Step  22     live-sample fit (policy INFORMATIONAL: a miss returns INFO, never a FLAG)
  ...pass1.run(ctx),             // Step  23     Pass 1 on a pinned master seed, re-derived
  ...pass2.run(ctx),             // Step  24     Pass 2 cherry-pick screen, 10,000 nonces/seed, deterministic
  ...supplement.run(ctx),        // Step  25     target-decade SUPPLEMENT (its own pinned dataset) + live target ceiling (E20)
];

// ── Informational items (not scored) ──────────────────────────────────────────
const infoItems: InfoItem[] = statistical.run(ctx);

// ── G-EXEC: no verdict unless every defined step actually ran ─────────────────
const numbers = results.map((r) => r.step);
const expectedNumbers = Array.from({ length: EXPECTED_STEPS }, (_, i) => i + 1);
const countOk = results.length === EXPECTED_STEPS;
const numbersOk = JSON.stringify([...numbers].sort((a, b) => a - b)) === JSON.stringify(expectedNumbers);
if (!countOk || !numbersOk) {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  SUITE INTEGRITY FAILURE — NO VERDICT');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Scored ${results.length} steps; this suite is defined to score ${EXPECTED_STEPS}.`);
  console.log(`  Step numbers seen: [${numbers.join(', ')}]`);
  console.log('  A verdict is not reachable from a partial run — fix the suite, do not read the steps that did run.');
  console.log('══════════════════════════════════════════════════════════\n');
  process.exit(3);
}

// ── RTP-CLAIM rule (1.2.0, Methodology v1.1; agreed 2026-09-29, 1.2.0 2026-10-14) ──────────────
// The per-setting exact RTP table held to the published claim (src/rtp-settings.ts). The package switch
// RTP_CLAIM_RULE_ENFORCED (src/rtp-claim-switch.ts) is TRUE in this package: a miss (gate status OVERSTATED)
// marks the step carrying LIMBO-19 (Step 16) OVERSTATED — not a draw FAIL, not counted in hardFail — and the
// verdict is RTP FIGURE OVERSTATED, exit 5 (decision D3, 2026-10-14). (Were it false, the outcome would be
// printed only and no step would move.) A committed table that no longer equals this run (or its pin) is a
// reproduction failure either way (gate status FAIL → step FAIL, exit 1).
const rtpClaim = runRtpClaimGate();
console.log('');
for (const line of rtpClaim.lines) console.log(`  ${line}`);
if (rtpClaim.status === 'FAIL' || rtpClaim.status === 'OVERSTATED') {
  const status = rtpClaim.status;
  const s = (results as any[]).find(r => r.step === RTP_CLAIM_STEP);
  if (s) {
    s.status = status;
    s.detail += status === 'FAIL' ? ' — RTP-CLAIM: the committed table does not match this run or its pin (reproduction failure)'
      : ` — ${RTP_FIGURE_OVERSTATED} (RTP-CLAIM 1.2.0, enforced): ${rtpClaim.result.minimalFix}`;
  }
  console.log(`  [${status === 'FAIL' ? 'FAIL' : RTP_FIGURE_OVERSTATED}] Step ${RTP_CLAIM_STEP} — re-scored by the enforced RTP-CLAIM rule (outcome ${rtpClaim.result.outcome})`);
}

// ── Summary ───────────────────────────────────────────────────────────────────
const passed   = results.filter((r) => r.status === 'PASS').length;
const flags    = results.filter((r) => r.status === 'FLAG').length;
const hardFail = results.filter((r) => r.status === 'FAIL').length;
const overstated = results.filter((r) => r.status === 'OVERSTATED').length;
// A FLAG's ORIGIN decides whether it bears on the verdict (profile policy FLAG, decided 2026-09-17):
// operator → Conditional Pass (exit 2); capture → disclosed and counted, verdict class unchanged (Full
// Pass, exit 0). A flag with no origin counts as operator, so it can only err toward disclosure.
// INFO (profile policy INFORMATIONAL — the live-sample fit, 2026-09-29): reported, never counted
// as a flag, never enters the verdict or the exit code.
const informational = results.filter((r) => r.status === 'INFO').length;
const captureFlags  = results.filter((r) => r.status === 'FLAG' && r.origin === 'capture').length;
const operatorFlags = flags - captureFlags;
// The rule's ranking (src/rtp-claim.ts rtpClaimVerdict): draw fail 1 > INCOMPLETE 3 > RTP FIGURE OVERSTATED 5 >
// Conditional Pass 2 > Full Pass 0. G-EXEC above already exited 3 on an incomplete run, so the run is complete here.
const { verdict, exit: verdictExit } = rtpClaimVerdict({ fails: hardFail, complete: true, overstated: overstated > 0, opFlags: operatorFlags });

if (infoItems.length > 0) {
  console.log('');
  console.log('  ┌── Informational Context (not scored) ──');
  for (const item of infoItems) console.log(`  │ ${item.label}: ${item.detail}`);
  console.log('  └──');
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  RESULTS SUMMARY');
console.log('══════════════════════════════════════════════════════════');
console.log(`  Passed:     ${passed}/${EXPECTED_STEPS}`);
console.log(`  Hard fails: ${hardFail}`);
if (overstated) console.log(`  RTP figure overstated: Step ${RTP_CLAIM_STEP} (RTP-CLAIM 1.2.0, enforced; not a draw fail)`);
console.log(`  Flags:      ${flags}${captureFlags ? ` (${captureFlags} capture-origin — verdict-neutral, disclosed)` : ''}`);
if (informational) console.log(`  Informational deviations: ${informational} (reported, not counted, verdict unchanged)`);
console.log(`\n  VERDICT: ${verdict}`);
console.log('══════════════════════════════════════════════════════════\n');

// NO run metadata (no generatedAt, no runtime): this body is the artifact of record, and a field
// that differs by construction on every run is removed from it, not excluded from the diff
// (Framework 1.0: run metadata absent, not excluded). The runtime is recorded in outputs/run/diff.json.
const verificationBody = {
  audit: 'LIQD Limbo',
  captureHost: CAPTURE_HOST,
  expectedSteps: EXPECTED_STEPS,
  totalBets: bets.length,
  totalSeeds: seeds.length,
  datasetSha256: ds.sha256,
  artifactHashes: {
    // The PINNED artifacts, each with `expected` = its pin (src/config.ts; the RTP-CLAIM table in
    // src/rtp-settings.ts) and `actual` = the recomputed hash. The dataset's loader already exits(1) on a
    // mismatch, so for it a written file always matches; the others are enforced by their steps.
    dataset: {
      file: DATA_PATH,
      expected: DATASET_SHA256,
      actual: ds.sha256,
      match: ds.sha256 === DATASET_SHA256,
    },
    // The simulation artifacts and the Pass-1 grid are PINNED in src/config.ts and enforced by
    // Steps 19 and 23; recorded here so the pin set is machine-readable next to the results.
    simulation: { file: 'outputs/simulation-results.json', expected: SIMULATION_SHA256, actual: sha256Of('outputs/simulation-results.json'), match: sha256Of('outputs/simulation-results.json') === SIMULATION_SHA256 },
    simulationChart: { file: 'outputs/rtp-convergence.html', expected: SIMULATION_HTML_SHA256, actual: sha256Of('outputs/rtp-convergence.html'), match: sha256Of('outputs/rtp-convergence.html') === SIMULATION_HTML_SHA256 },
    pass1Grid: { file: 'outputs/pass1-grid.json', expected: PASS1_GRID_SHA256, actual: sha256Of('outputs/pass1-grid.json'), match: sha256Of('outputs/pass1-grid.json') === PASS1_GRID_SHA256 },
    // The 2026-09-26 target-decade SUPPLEMENT and the target-ceiling probe journals (E20) are PINNED
    // in src/config.ts and enforced by Step 25, which scores them and nothing else.
    supplementDataset: { file: SUPPLEMENT_DATA_PATH, expected: SUPPLEMENT_DATASET_SHA256, actual: sha256Of(SUPPLEMENT_DATA_PATH), match: sha256Of(SUPPLEMENT_DATA_PATH) === SUPPLEMENT_DATASET_SHA256 },
    supplementJournal: { file: SUPPLEMENT_JOURNAL_PATH, expected: SUPPLEMENT_JOURNAL_SHA256, actual: sha256Of(SUPPLEMENT_JOURNAL_PATH), match: sha256Of(SUPPLEMENT_JOURNAL_PATH) === SUPPLEMENT_JOURNAL_SHA256 },
    ceilingProbe1: { file: `${CEILING_PROBE_DIR}/${CEILING_PROBE_1_JOURNAL}`, expected: CEILING_PROBE_1_SHA256, actual: sha256Of(`${CEILING_PROBE_DIR}/${CEILING_PROBE_1_JOURNAL}`), match: sha256Of(`${CEILING_PROBE_DIR}/${CEILING_PROBE_1_JOURNAL}`) === CEILING_PROBE_1_SHA256 },
    ceilingProbe2: { file: `${CEILING_PROBE_DIR}/${CEILING_PROBE_2_JOURNAL}`, expected: CEILING_PROBE_2_SHA256, actual: sha256Of(`${CEILING_PROBE_DIR}/${CEILING_PROBE_2_JOURNAL}`), match: sha256Of(`${CEILING_PROBE_DIR}/${CEILING_PROBE_2_JOURNAL}`) === CEILING_PROBE_2_SHA256 },
    // The cap re-probe journal (E21), pinned in src/config.ts on 2026-10-02 and enforced by Step 25 (null while unpinned).
    capProbe: CAP_PROBE_JOURNAL === null || CAP_PROBE_SHA256 === null ? null
      : { file: `${CAP_PROBE_DIR}/${CAP_PROBE_JOURNAL}`, expected: CAP_PROBE_SHA256, actual: sha256Of(`${CAP_PROBE_DIR}/${CAP_PROBE_JOURNAL}`), match: sha256Of(`${CAP_PROBE_DIR}/${CAP_PROBE_JOURNAL}`) === CAP_PROBE_SHA256 },
    // The RTP-CLAIM per-setting table (pinned in src/rtp-settings.ts, held to this run by the gate above).
    rtpClaimTable: { file: 'outputs/rtp-claim-table.json', expected: RTP_CLAIM_TABLE_SHA256, actual: sha256Of('outputs/rtp-claim-table.json'), match: sha256Of('outputs/rtp-claim-table.json') === RTP_CLAIM_TABLE_SHA256 },
    // The evidence records are REPRODUCED rather than pinned — see Step 19 and the header.
    evidence: {
      'evidence/E13-limbo-boundary-probes.json': 'reproduced under the model in Step 19 (not hash-pinned)',
      'evidence/E15-limbo-max-exposure.json': 'reconciled against src/config.ts in Step 19 (not hash-pinned)',
    },
  },
  // Each scored step carries the ProvablyFair.org Limbo profile checks it implements (src/profile-map.ts).
  // The label is attached to the emitted record only: it cannot change what any step asserts.
  steps: results.map((r) => ({ ...r, ...labelFor(r.step) })),
  // The RTP-CLAIM rule's outcome on this run (src/rtp-claim.ts via src/rtp-settings.ts). Whether the rule
  // is enforced is deliberately NOT recorded here: it is policy, not measurement (src/rtp-claim.ts keeps it
  // out of committed evidence), so flipping the switch must not rewrite this artifact.
  rtpClaim: {
    rule: rtpClaim.result.rule,
    ruleVersion: rtpClaim.result.ruleVersion,
    outcome: rtpClaim.result.outcome,
    bandPp: rtpClaim.result.bandPp,
    settingsScored: rtpClaim.result.settings,
    scoredRange: `${MIN_MULTIPLIER}x to ${LIVE_TARGET_CEILING}x, every 2-dp target`,
    trueMin: { setting: rtpClaim.result.trueMin.setting, rtpPct: rtpClaim.result.trueMin.rtpPct },
    trueMax: { setting: rtpClaim.result.trueMax.setting, rtpPct: rtpClaim.result.trueMax.rtpPct },
    houseSideBeyondBand: rtpClaim.result.houseSideFailures,
    table: { file: 'outputs/rtp-claim-table.json', sha256: sha256Of('outputs/rtp-claim-table.json') },
  },
  profileCoverage: profileCoverageBlock(),
  info: infoItems,
  // The one summary shape of every LIQD package (scripts/release-bar.mjs, review of 2026-09-28 F20):
  // captureFlags counts the capture-origin FLAGs; an INFO step is not a flag and is not counted.
  summary: { passed, flags, operatorFlags, captureFlags, hardFail, verdict },
};

const VERIFICATION_FILE = 'verification-results.json';
const write = (dir: string, name: string, body: unknown) =>
  fs.writeFileSync(path.join(dir, name), JSON.stringify(body, null, 2));

/**
 * Field-level diff between the committed artifact and this run, over EVERY leaf of the document
 * (src/diff.ts). Nothing is excluded: the artifact carries no run metadata, so there is no field
 * that differs by construction. Numeric leaves are compared at the Framework 1.0 reproduction
 * tolerance (1e-14 absolute + 1e-12 relative; two distinct integers never agree); every other leaf
 * — hash, count, status, step name, detail string — must be identical. Anything beyond tolerance is
 * a different result, and the run exits 1 on it.
 */
/**
 * Fields on which this run disagrees with the committed artifact. Stays 0 on the emission path,
 * which is regenerating that artifact rather than checking against it.
 */
let reproductionFailures = 0;

if (EMIT) {
  // ── EXPLICIT REPORT GENERATION (`npm run report`) ───────────────────────────
  // The only path that rewrites a committed artifact. It is a separate command precisely so that
  // replacing evidence is something somebody chose and reviewed as a diff, not a side effect of
  // running the tests.
  write(OUTPUTS_DIR, VERIFICATION_FILE, verificationBody);
  console.log(`  REPORT GENERATION: rewrote outputs/${VERIFICATION_FILE}`);
  console.log('  Review the diff before publishing — this is an artifact of record.');
} else {
  // ── VERIFICATION (`npm run verify`) ─────────────────────────────────────────
  fs.mkdirSync(RUN_DIR, { recursive: true });
  write(RUN_DIR, VERIFICATION_FILE, verificationBody);
  let committed: unknown = null;
  try { committed = JSON.parse(fs.readFileSync(path.join(OUTPUTS_DIR, VERIFICATION_FILE), 'utf8')); } catch { committed = null; }
  const allDiffs = fieldDiff(committed, verificationBody);
  const diffs     = beyondTolerance(allDiffs);
  const gap       = maxima(allDiffs);
  write(RUN_DIR, 'diff.json', {
    runtime: process.versions.node,
    verdict,
    tolerance: { atol: DIFF_ATOL, rtol: DIFF_RTOL, rule: '|a-b| <= atol + rtol*max(|a|,|b|); two distinct integers never agree; non-numeric leaves must be identical' },
    note: 'Field-level diff between the COMMITTED artifact and THIS RUN, over every leaf. Nothing is excluded — '
      + 'the committed artifact carries no run metadata; this run\'s runtime is recorded here instead. Entries marked '
      + '`withinTolerance` are the same result computed on different hardware and are recorded, not scored. Any '
      + 'other entry means this run disagrees with the committed evidence — investigate it; do not re-run until it '
      + 'goes away, and do not regenerate the committed artifact to make it go away.',
    reproduced: diffs.length === 0,
    beyondToleranceCount: diffs.length,
    withinToleranceCount: allDiffs.length - diffs.length,
    largestGap: gap,
    committedReadable: committed !== null,
    verificationResultsDiff: allDiffs,
  });
  console.log(`  Output (this run only): outputs/run/${VERIFICATION_FILE}, outputs/run/diff.json`);
  console.log('  Committed artifacts NOT modified. Use `npm run report` to propose a replacement.');
  console.log(`  Reproduction vs the committed artifact on Node ${process.versions.node}: `
    + `${diffs.length === 0 ? 'REPRODUCED' : `${diffs.length} field(s) BEYOND TOLERANCE`}`
    + `${allDiffs.length - diffs.length > 0 ? ` (${allDiffs.length - diffs.length} within tolerance` + (gap ? `, largest ${gap.absDiff.toExponential(2)} at ${gap.path}` : '') + ')' : ''}`);
  if (diffs.length > 0) {
    console.log(`  ⚠ THIS RUN DISAGREES WITH THE COMMITTED EVIDENCE — ${diffs.length} field(s). See outputs/run/diff.json.`);
    for (const d of diffs.slice(0, 6)) console.log(`      ${d.path}: committed ${JSON.stringify(d.committed)} vs this run ${JSON.stringify(d.thisRun)}`);
  }
  reproductionFailures = diffs.length;
}

// Exit non-zero on anything short of a clean Full Pass: a hard fail exits 1, an RTP FIGURE OVERSTATED
// (enforced RTP-CLAIM 1.2.0 miss) exits 5, a Conditional Pass
// (an OPERATOR FLAG; a capture-origin FLAG is verdict-neutral) exits 2, and a suite-integrity failure exited 3 above without printing a verdict — so
// CI cannot mistake a degraded run for the verdict of record.
// A disagreement with the committed evidence is a FAIL, not a warning: a gate that only prints
// is not one.
if (hardFail > 0 || reproductionFailures > 0 || !rtpClaim.tableMatches) process.exit(1);
// 5 RTP FIGURE OVERSTATED, 2 Conditional Pass, 0 Full Pass — the code rtpClaimVerdict ranked above.
if (verdictExit !== 0) process.exit(verdictExit);
export {};
