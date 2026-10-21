/**
 * Falsifiability battery — `npm run mutate`.
 *
 * Runs every mutation declared in `tests/mutations.json` against a SANDBOX COPY of this repo and
 * checks that the suite breaks in exactly the way the mutation's `guard` says it must. The repo
 * being audited is never modified: the copy lives under the OS temp directory and `node_modules`
 * is symlinked, so a run costs about half a minute per entry (measured on the machines that ran it) and leaves no residue. (That residue is
 * a real failure mode, not a hypothetical: a mutation runner that edits the working tree can
 * overwrite `data/` or `outputs/*.json` — the artifacts of record — and leave the repo quietly
 * inconsistent with its own report. This runner also PROVES it did not: it hashes every artifact of
 * record before and after the run and prints the manifest.)
 *
 * WHY A RUNNER AT ALL. A registry with no runner is an inert file: nothing executes it, so it
 * documents a falsifiability property nobody has ever observed. A declared guard that is never run
 * is prose. Without a runner, this repo's chapters make 133 enforcement claims against 0 executed
 * mutations.
 *
 * What each entry asserts:
 *   • `runner: "verify"` — `npm run verify` must exit non-zero AND the NAMED step must be the one
 *     that fails or flags. "The verdict flipped" is not enough: the point of naming a step is that
 *     the named guard is the one doing the work. A registry that names one step for a mutation
 *     four other steps are in fact catching reads as a guard and is decoration.
 *   • `runner: "mocha"` — `npx mocha` must fail (unit vectors carry no step numbers).
 *   • `marker: "…"` — for the entries that are killed by something OTHER than a scored step, and so
 *     have no `[FAIL] Step N` line to match. Two shapes qualify, and both must still exit non-zero:
 *       – the hash PIN is the guard under test. A dataset edited without re-pinning aborts inside the
 *         loader, before any step is scored; requiring a step line would force the entry to re-pin
 *         and thereby delete the only demonstration that the pin does anything.
 *       – the RUN-VS-COMMITTED-ARTIFACT reproduction gate is the guard. `fieldDiff`
 *         (src/diff.ts), called in tests/verify.ts, compares every leaf of this run's document —
 *         the dataset digest and every step's detail string included — to
 *         `outputs/verification-results.json` (strings exactly; numbers at 1e-14 + 1e-12 rel), and
 *         exits 1 on any difference beyond that. A
 *         forgery that moves a hash-pinned artifact's bytes and re-pins them in the same edit leaves
 *         every other step at its baseline status and the verdict of record unchanged, yet still exits 1 because a
 *         recomputed digest printed in a detail string no longer matches the record. That is a real
 *         kill and it is declared as one — but it is a kill by BYTE IDENTITY, not by any step
 *         re-deriving the forged content, which is why those entries' guards say so at length and
 *         why L9 is not closed by them.
 *     Either way the entry declares the line that must appear instead of naming a step.
 *   • `survivor: true` — the mutation must SURVIVE, and the entry must say why the audit cannot see
 *     it. A survivor declared as a survivor is evidence; a survivor quietly left out of the registry
 *     is a hole (S-MUTREG).
 *
 * Exit code 0 only if every entry behaved as declared AND every artifact of record is byte-identical
 * to how the run found it.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

interface Mutation {
  name: string;
  /** Single-file find/replace form. Omitted when `script` is used. */
  file?: string;
  find?: string;
  replace?: string;
  find2?: string;
  replace2?: string;
  /**
   * Structural form: a committed .mjs under `tests/forgeries/` run as `node <script> <sandbox>
   * [...args]`. Some counterexamples cannot be expressed as a find/replace — a coherent population
   * shrink deletes 2,680 records and doctors four header fields, and every dataset edit has to
   * RE-PIN `DATASET_SHA256` in the same breath or the loader stops it before a single step is
   * scored. `args` selects one documented case inside a multi-case script, so twelve near-identical
   * one-field forgeries are one reviewable file rather than twelve.
   */
  script?: string;
  args?: string[];
  runner?: 'verify' | 'mocha';
  /** See the header: the pin-is-the-guard entry, which has no step line to match. */
  marker?: string;
  expect?: string;
  survivor?: boolean;
  /**
   * RTP FIGURE OVERSTATED route (FIXPASS2 C3, 2026-10-14). `regen: true` does, in the sandbox, what an
   * auditor does after a change to the paytable or to the published figure: re-write
   * outputs/rtp-claim-table.json (`ts-node src/rtp-settings.ts`), re-pin RTP_CLAIM_TABLE_SHA256, and
   * re-emit the scored record (`PF_EMIT=1`), so the run that is judged reproduces its own committed
   * artifacts and nothing but the rule can decide it. `expectExit` / `expectVerdict` are then the
   * judgement: the verify run must exit with exactly that code, print that VERDICT, and mark the step
   * named in the guard `[RTP FIGURE OVERSTATED]`. Without `regen` the same edit stops at the table pin
   * (Step N FAIL, exit 1), which is what the external find/replace harness sees, and the runner checks
   * that too: a `regen` entry first runs the edited tree as it is (STALE layer: exit 1 and `[FAIL] Step N`
   * required — a stale RTP table is a reproduction failure even under a miss), then regenerates.
   */
  regen?: boolean;
  expectExit?: number;
  expectVerdict?: string;
  guard: string;
}

const REPO = path.join(__dirname, '..');
// THREE registries, deliberately separate files, for one reason: an external mutation harness
// reads `tests/mutations.json`, applies each entry ITSELF as a single-file find/replace with NO
// re-pinning, and requires every entry there to name a step and fail. Anything that contract
// cannot express has to live elsewhere or it reads as a broken guard.
//
//   tests/mutations.json            — single-file find/replace mutations the suite must KILL.
//                                     Read and executed by the framework check as well as by this
//                                     runner. Every entry here edits a file that is NOT hash-pinned
//                                     (src/, tests/steps/, evidence/), so the two runners agree.
//   tests/structural-forgeries.json — counterexamples that CANNOT be a static find/replace: anything
//                                     touching `data/limbo-master-6700bets.json` has to recompute
//                                     and re-pin its SHA-256, a deletion has no `replace`, and the
//                                     pin-guard entry must deliberately NOT re-pin. Each is a
//                                     committed script under `tests/forgeries/`. `npm run mutate` is
//                                     the runner of record for them.
//   tests/mutation-survivors.json   — mutations the suite provably CANNOT see, each with the reason
//                                     it survives BY CONSTRUCTION. A survivor in mutations.json
//                                     would read as a broken guard.
const registry: Mutation[] = [
  ...JSON.parse(fs.readFileSync(path.join(REPO, 'tests/mutations.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(REPO, 'tests/structural-forgeries.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(REPO, 'tests/mutation-survivors.json'), 'utf8'))
    .map((m: Mutation) => ({ ...m, survivor: true })),
];

/**
 * RESTORATION MANIFEST. Every artifact of record in the REAL repo, hashed before the battery and
 * again after it. The sandbox design means none of these should ever move — this is the proof, not
 * the hope. A gate run that quietly rewrote `outputs/verification-results.json` is a documented
 * failure mode in this family of repos, and "the runner works on a copy" is exactly the sort of
 * claim this whole battery exists to stop taking on trust.
 */
const MANIFEST = [
  'data/limbo-master-6700bets.json',
  'evidence/E13-limbo-boundary-probes.json',
  'evidence/E15-limbo-max-exposure.json',
  'outputs/verification-results.json',
  'outputs/simulation-results.json',
  'outputs/rtp-convergence.html',
  'outputs/pass1-grid.json',
  // Added 2026-09-26: Step 25's pinned supplement and the E20 target-ceiling probe journals.
  'data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json',
  'data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.journal.ndjson',
  'evidence/E20-target-ceiling-probe-2026-09-26/liqd-limbo-capture-v2-probe-2026-09-26T17-43-21-558Z.journal.ndjson',
  'evidence/E20-target-ceiling-probe-2026-09-26/liqd-limbo-capture-v2-probe-2026-09-26T17-47-53-359Z.journal.ndjson',
  // Added 2026-10-02: Step 25's pinned cap re-probe journal (E21).
  'evidence/E21-target-cap-probe/liqd-limbo-cap-probe-2026-10-02T18-22-46-633Z.journal.ndjson',
  'src/config.ts',
  'src/rng.ts',
  'src/bias.ts',   // added 2026-10-20: the draw-bias bound moved here from src/rng.ts
  'tests/verify.ts',
  'tests/steps/context.ts',
];
const hashFile = (abs: string) =>
  (fs.existsSync(abs) ? createHash('sha256').update(fs.readFileSync(abs)).digest('hex') : 'ABSENT');
const manifestBefore = new Map(MANIFEST.map((rel) => [rel, hashFile(path.join(REPO, rel))]));

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'limbo-mutate-'));
fs.cpSync(REPO, sandbox, {
  recursive: true,
  filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(`${path.sep}.git${path.sep}`),
});
fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(sandbox, 'node_modules'), 'dir');

/**
 * Files a mutation may touch, snapshotted before and restored after every entry — INSIDE the
 * sandbox. `src/config.ts` is on the list because of RE-PINNING, below; the dataset and the
 * evidence records are on it because a forgery script targets them directly, and `outputs/` because
 * a verify run writes under it.
 */
const MUTABLE = [
  'src/config.ts',
  // Added 2026-10-14 (C3 regen entries): the rule table, its pin, and every record a PF_EMIT run writes.
  'src/rtp-settings.ts',
  'outputs/rtp-claim-table.json',
  'src/rng.ts',
  'src/bias.ts',   // added 2026-10-20: mutation target since the bound moved out of src/rng.ts
  'tests/steps/context.ts',
  'data/limbo-master-6700bets.json',
  'evidence/E13-limbo-boundary-probes.json',
  'evidence/E15-limbo-max-exposure.json',
  'outputs/simulation-results.json',
  'outputs/rtp-convergence.html',
  'outputs/verification-results.json',
  // Added 2026-09-26: Step 23's artifact. Without it here a Pass-1-grid forgery left its edit in the
  // sandbox and every later entry was scored against the forged grid (measured: the declared
  // survivor was then "caught" by Step 23).
  'outputs/pass1-grid.json',
  // Added 2026-09-26: Step 25's inputs. The supplement forgeries edit these and re-pin in src/config.ts.
  'data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json',
  'data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.journal.ndjson',
  'evidence/E20-target-ceiling-probe-2026-09-26/liqd-limbo-capture-v2-probe-2026-09-26T17-43-21-558Z.journal.ndjson',
  'evidence/E20-target-ceiling-probe-2026-09-26/liqd-limbo-capture-v2-probe-2026-09-26T17-47-53-359Z.journal.ndjson',
  // Added 2026-10-02: the pinned cap re-probe journal (E21), which tests/forgeries/cap-probe-forgeries.mjs
  // deletes or edits. The restore writes it back, so the next entry sees the pinned bytes.
  'evidence/E21-target-cap-probe/liqd-limbo-cap-probe-2026-10-02T18-22-46-633Z.journal.ndjson',
];

/**
 * RE-PIN every hash-pinned artifact after mutating it.
 *
 * WHY. `DATASET_SHA256` is checked by the loader before any step is scored. Without re-pinning,
 * every dataset mutation in the registry would be stopped by the hash instead of by the guard it
 * names — turning a dozen declared guards into decoration, which is the precise failure this runner
 * exists to detect. A real forger re-pins in the same commit; so does this runner. The hash is then
 * proving nothing and the semantic guards have to do the work. The single entry where the PIN
 * ITSELF is under test declares that in its `guard` and does not re-pin (see `marker`).
 */
function repin(): void {
  const cfgPath = path.join(sandbox, 'src/config.ts');
  let cfg = fs.readFileSync(cfgPath, 'utf8');
  const pins: [RegExp, string][] = [
    [/(export const DATASET_SHA256 = ')[0-9a-f]{64}(')/, 'data/limbo-master-6700bets.json'],
    [/(export const SIMULATION_SHA256 = ')[0-9a-f]{64}(')/, 'outputs/simulation-results.json'],
    [/(export const SIMULATION_HTML_SHA256 = ')[0-9a-f]{64}(')/, 'outputs/rtp-convergence.html'],
    [/(export const PASS1_GRID_SHA256 = ')[0-9a-f]{64}(')/, 'outputs/pass1-grid.json'],
  ];
  for (const [re, rel] of pins) {
    const f = path.join(sandbox, rel);
    if (!fs.existsSync(f)) continue;
    const h = createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    cfg = cfg.replace(re, `$1${h}$2`);
  }
  fs.writeFileSync(cfgPath, cfg);
}

function run(cmd: string, args: string[], env: Record<string, string> = {}): { code: number; out: string } {
  try {
    const out = execFileSync(cmd, args, {
      env: { ...process.env, ...env },
      cwd: sandbox, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    });
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}
const runVerify = () => run('npx', ['ts-node', 'tests/verify.ts']);
const runMocha = () => run('npx', ['mocha']);

/** C3 `regen`: re-write and re-pin the rule table, then re-emit the scored record. Returns an error or null. */
function regenerate(): string | null {
  const w = run('npx', ['ts-node', 'src/rtp-settings.ts']);
  const h = w.out.match(/sha256 ([0-9a-f]{64})/);
  if (w.code !== 0 || !h) return `rtp-claim:write exited ${w.code}`;
  const rs = path.join(sandbox, 'src/rtp-settings.ts');
  const src = fs.readFileSync(rs, 'utf8');
  const next = src.replace(/(export const RTP_CLAIM_TABLE_SHA256 = ')[0-9a-f]{64}(')/, `$1${h[1]}$2`);
  if (next === src && !src.includes(h[1])) return 'RTP_CLAIM_TABLE_SHA256 not found in src/rtp-settings.ts';
  fs.writeFileSync(rs, next);
  const e = run('npx', ['ts-node', 'tests/verify.ts'], { PF_EMIT: '1' });
  if (!/VERDICT:/.test(e.out)) return `PF_EMIT=1 verify exited ${e.code} without a VERDICT line`;
  return null;
}

console.log('\n══ Falsifiability battery — LIQD Limbo ══');
console.log(`  sandbox: ${sandbox}`);

/**
 * Per-step statuses as printed by verify (`[PASS] Step N`, `[FLAG] Step N`, …).
 *
 * THE BASELINE IS NOT NECESSARILY A FULL PASS. From 2026-10-01 until the cap re-probe (evidence/E21) was
 * pinned on 2026-10-02 the verdict of record was a Conditional Pass and verify exited 2 — Step 25 FLAGged
 * (origin operator, profile LIMBO-14, the target cap not evidenced by a saved server reply); before that
 * Step 16 (LIMBO-19) and, earlier on 2026-10-02, Steps 16, 17 and 25. With E21 pinned the baseline is a
 * Full Pass, exit 0. Every judgement below is made RELATIVE TO THE BASELINE either way: a mutation is killed only
 * when the run differs from it (exit code or a step status) AND the named step's status differs from
 * its baseline status — a step that already FLAGs at baseline counts only when it moves (e.g. to
 * FAIL). A survivor must reproduce the baseline exactly (same exit code, same status on every step).
 */
const statusesOf = (out: string): Map<number, string> => {
  const m = new Map<number, string>();
  for (const x of out.matchAll(/\[(PASS|FAIL|FLAG|INFO)\] Step (\d+)\b/g)) m.set(Number(x[2]), x[1]);
  return m;
};
const sameStatuses = (a: Map<number, string>, b: Map<number, string>) =>
  a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);

// The baseline must reproduce the verdict of record (exit 0 Full Pass, or exit 2 Conditional Pass with
// no FAIL), or every mutation below is vacuous.
const baseline = runVerify();
const baselineStatuses = statusesOf(baseline.out);
const baselineFlagged = [...baselineStatuses].filter(([, v]) => v === 'FLAG').map(([k]) => k);
if (![0, 2].includes(baseline.code) || !/PROVABLY FAIR/.test(baseline.out) || /NOT PROVABLY FAIR/.test(baseline.out)
    || [...baselineStatuses.values()].includes('FAIL') || baselineStatuses.size === 0) {
  console.error('  BASELINE DOES NOT REPRODUCE THE VERDICT OF RECORD — every mutation would be vacuous. Aborting.');
  console.error(baseline.out.split('\n').slice(-25).join('\n'));
  process.exit(2);
}
console.log(`  baseline: verify exits ${baseline.code}, ${baseline.code === 0 ? 'Full Pass' : 'Conditional Pass'} ✓  `
  + `(FLAG at baseline: ${baselineFlagged.length ? baselineFlagged.map((n) => `Step ${n}`).join(', ') : 'none'}; ${registry.length} mutations declared)\n`);

/**
 * `npm run mutate -- <name prefix> …` runs only the entries whose name starts with one of the prefixes
 * (e.g. M-C3i M-C3ii). A PARTIAL RUN, labelled as such, exit 3 when every selected entry behaved as
 * declared; it never stands in for the battery (added 2026-10-14).
 */
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('-'));
let selected = 0;
let failures = 0;
let killed = 0;
let survivorsAsDeclared = 0;

registry.forEach((m, i) => {
  if (ONLY.length && !ONLY.some((o) => m.name === o || m.name.startsWith(`${o} `))) return;
  selected++;
  const label = `M${String(i).padStart(2, '0')} ${m.name}`;
  const snapshot = new Map<string, string | null>();
  const files = [...new Set([...MUTABLE, ...(m.file ? [m.file] : [])])];
  for (const rel of files) {
    const f = path.join(sandbox, rel);
    snapshot.set(rel, fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
  }
  const restore = () => {
    for (const [rel, body] of snapshot) {
      const f = path.join(sandbox, rel);
      if (body === null) { if (fs.existsSync(f)) fs.rmSync(f); } else fs.writeFileSync(f, body);
    }
  };

  if (m.script) {
    const scriptPath = path.join(sandbox, m.script);
    if (!fs.existsSync(scriptPath)) {
      console.log(`  ${label} — NOT RUN: forgery script ${m.script} absent ✗`);
      failures++;
      return;
    }
    const applied = run('node', [scriptPath, sandbox, ...(m.args ?? [])]);
    if (applied.code !== 0) {
      console.log(`  ${label} — NOT RUN: forgery script exited ${applied.code} ✗`);
      console.log(indent(applied.out.split('\n').slice(-6).join('\n')));
      failures++;
      restore();
      return;
    }
  } else {
    const target = path.join(sandbox, m.file!);
    if (!fs.existsSync(target)) {
      console.log(`  ${label} — NOT RUN: target file ${m.file} absent ✗`);
      failures++;
      return;
    }
    const original = fs.readFileSync(target, 'utf8');
    if (!original.includes(m.find!)) {
      console.log(`  ${label} — NOT RUN: find string absent from ${m.file} ✗`);
      failures++;
      return;
    }
    let mutated = original.replace(m.find!, m.replace!);
    if (m.find2 !== undefined) {
      if (!mutated.includes(m.find2)) {
        console.log(`  ${label} — NOT RUN: find2 string absent from ${m.file} ✗`);
        failures++;
        return;
      }
      mutated = mutated.replace(m.find2, m.replace2!);
    }
    if (mutated === original) {
      console.log(`  ${label} — NOT RUN: find == replace, nothing mutated ✗`);
      failures++;
      return;
    }
    fs.writeFileSync(target, mutated);
    // Re-pin AFTER the edit, so an artifact mutation is judged by its declared guard rather than by
    // the SHA pin it happens to move. Scripts re-pin themselves (they model a forger who does).
    repin();
  }
  // STALE layer (framework rule: a committed table that no longer matches is a reproduction failure,
  // exit 1, even under a miss): the same edit WITHOUT regenerating must exit 1 with the named step FAIL.
  let staleNote = '';
  let staleOk = true;
  if (m.regen) {
    const stale = runVerify();
    const named = (m.guard.match(/Step\s+(\d+)/i) || [])[1];
    staleOk = stale.code === 1 && named !== undefined && new RegExp(`\\[FAIL\\] Step ${named}\\b`).test(stale.out);
    staleNote = `without regen: exit ${stale.code} (expected 1), [FAIL] Step ${named ?? '?'} ${staleOk ? 'printed' : 'NOT printed'}; `;
    const err = regenerate();
    if (err) {
      console.log(`  ${label} — NOT RUN: regen failed — ${err} ✗`);
      failures++;
      restore();
      return;
    }
  }
  try {
    const result = m.runner === 'mocha' ? runMocha() : runVerify();

    if (m.expectExit !== undefined) {
      // C3: judged by the exact exit code, the VERDICT line and the named step's re-scored marker.
      const named = (m.guard.match(/Step\s+(\d+)/i) || [])[1];
      const verdictLine = (result.out.match(/VERDICT: (.*)/) || [])[1]?.trim() ?? '(none)';
      const marker = named !== undefined && new RegExp(`\\[RTP FIGURE OVERSTATED\\] Step ${named}\\b`).test(result.out);
      const ok = staleOk && result.code === m.expectExit && (!m.expectVerdict || verdictLine === m.expectVerdict) && marker;
      console.log(`  ${label} — ${ok ? 'ends as declared ✓' : 'DID NOT END AS DECLARED ✗'}  ${staleNote}${m.regen ? 'with regen: ' : ''}exit ${result.code} (expected ${m.expectExit}), VERDICT: ${verdictLine}, [RTP FIGURE OVERSTATED] Step ${named ?? '?'} ${marker ? 'printed' : 'NOT printed'}`);
      if (ok) killed++; else { failures++; console.log(indent(stepLines(result.out))); }
      return;
    }

    const resultStatuses = statusesOf(result.out);
    const asBaseline = result.code === baseline.code && sameStatuses(resultStatuses, baselineStatuses);
    if (m.survivor) {
      if (asBaseline) {
        console.log(`  ${label} — SURVIVES as declared ✓`);
        survivorsAsDeclared++;
      } else {
        console.log(`  ${label} — declared a survivor but the suite CAUGHT it ✗ — the registry is out of date`);
        console.log(indent(stepLines(result.out)));
        failures++;
      }
      return;
    }

    if (result.code === 0 || (asBaseline && !m.marker && m.runner !== 'mocha')) {
      console.log(`  ${label} — MUTATION SURVIVED ✗  run identical to the baseline`);
      failures++;
      return;
    }
    if (m.marker) {
      // Killed by something other than a scored step — the loader's pin check, or the
      // run-vs-committed-artifact reproduction gate. There is no step line to match; see the header.
      if (result.out.includes(m.marker)) {
        console.log(`  ${label} — exits non-zero with the declared marker ✓  ("${m.marker}")`);
        killed++;
      } else {
        console.log(`  ${label} — exited non-zero but the declared marker never appeared ✗`);
        console.log(indent(result.out.split('\n').slice(-6).join('\n')));
        failures++;
      }
      return;
    }
    if (m.runner === 'mocha') {
      console.log(`  ${label} — mocha fails as declared ✓`);
      killed++;
      return;
    }
    const named = (m.guard.match(/Step\s+(\d+)/i) || [])[1];
    if (!named) {
      console.log(`  ${label} — NO STEP NAMED in the guard ✗  (say which step must fail)`);
      failures++;
      return;
    }
    // INFO: an informational step's deviation (profile policy INFORMATIONAL, 2026-09-29) — the
    // step fired, and the run is rejected by the reproduction gate, not by the verdict.
    // The named step must fire AND differ from its baseline status (a baseline FLAG counts only if it moves).
    const namedNow = resultStatuses.get(Number(named));
    if (namedNow !== undefined && namedNow !== 'PASS' && namedNow !== baselineStatuses.get(Number(named))) {
      console.log(`  ${label} — Step ${named} fails as declared ✓`);
      killed++;
    } else {
      console.log(`  ${label} — DECLARED GUARD IS DECORATION ✗  verdict flipped, but Step ${named} did not fire:`);
      console.log(indent(stepLines(result.out)));
      failures++;
    }
  } finally {
    restore();
  }
});

function stepLines(out: string): string {
  return out.split('\n').filter((l) => /\[(FAIL|FLAG|INFO)\]/.test(l)).slice(0, 6).join('\n')
    || out.split('\n').filter((l) => l.trim().length > 0).slice(-4).join('\n')
    || '(no output)';
}
function indent(s: string): string {
  return s.split('\n').map((l) => `        ${l}`).join('\n');
}

fs.rmSync(sandbox, { recursive: true, force: true });

// ── Restoration manifest ────────────────────────────────────────────────────────────────────────
console.log('\n  Restoration manifest (artifacts of record in the REAL repo, before → after):');
let moved = 0;
for (const rel of MANIFEST) {
  const after = hashFile(path.join(REPO, rel));
  const before = manifestBefore.get(rel)!;
  const same = before === after;
  if (!same) moved++;
  console.log(`    ${same ? '=' : '≠'} ${before.slice(0, 16)}…  ${rel}${same ? '' : `  → ${after.slice(0, 16)}…`}`);
}
if (moved > 0) {
  console.log(`  ${moved} ARTIFACT(S) OF RECORD MOVED — the battery mutated the repo it was scoring ✗`);
  failures += moved;
} else {
  console.log(`  ${MANIFEST.length}/${MANIFEST.length} unchanged — the battery ran entirely in the sandbox ✓`);
}

console.log(`\n  ${killed} killed, ${survivorsAsDeclared} survivors as declared, ${failures} not as declared`);
if (failures > 0) {
  console.log('  FALSIFIABILITY BATTERY FAILED\n');
  process.exit(1);
}
if (ONLY.length) {
  console.log(`  PARTIAL RUN (${ONLY.join(', ')}): ${selected} of ${registry.length} registered entries — this is not the battery result\n`);
  process.exit(selected === 0 ? 2 : 3);
}
console.log('  FALSIFIABILITY BATTERY PASSED — every declared mutation behaved as declared\n');
export {};
