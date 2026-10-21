/**
 * Step 23: Simulation Pass 1 on a pinned master seed — re-derived, not believed (profile LIMBO-20).
 *
 * Reads outputs/pass1-grid.json (src/pass1-grid.ts) and decides every statistic HERE, from the
 * artifact's integer rows — never from a verdict the producer wrote about itself (it writes none):
 *   1. identity: SHA-256 equals PASS1_GRID_SHA256 in src/config.ts; the artifact carries no run
 *      metadata; its master seed, model block and depths equal the constants in src/config.ts (G-BIND);
 *   2. uniformity of the draw on [0, RANGE): chi-squared over the 100-bin histogram of 2,000,000 draws;
 *   3. serial independence of the same stream: lag-1 autocorrelation of the bin index from the stored
 *      integer sums, and a Wald–Wolfowitz runs test about RANGE/2 from the stored run count;
 *      2 and 3 are judged at a family-wise PASS1_ALPHA (Bonferroni over the three tests);
 *   4. RTP convergence at every target: wins out of 1,000,000 rounds against the EXACT win probability
 *      floor(N/ci)/RANGE (so the exact RTP floor(N/ci)·ci/1e10), inside PASS1_SIGMAS·σ + 1 count;
 *   5. REPLAY: the first PASS1_PREFIX_DRAWS draws and PASS1_PREFIX_ROUNDS rounds of every stream are
 *      recomputed from the master seed on every run and must equal the stored prefix counts, so the rows
 *      are bound to the declared seeds. The full stream is replayed by `npm run pass1:check` (byte for byte).
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'node:crypto';

import type { StepResult, VerifyContext } from './context';
import { step } from './context';
import { chiSquaredTest, twoSidedNormalP, inverseCriticalZ } from '../../src/stats';
import { uniformityCounts, targetWins } from '../../src/pass1-grid';
import {
  RANGE, CURSOR, RESULT_NUMERATOR, MAX_MULTIPLIER, MULTIPLIER_SCALE, HOUSE_EDGE, targetToHundredths,
  PASS1_MASTER_SEED, PASS1_UNIFORMITY_DRAWS, PASS1_ROUNDS_PER_TARGET, PASS1_TARGETS, PASS1_MIN_TARGETS,
  PASS1_PREFIX_DRAWS, PASS1_PREFIX_ROUNDS, PASS1_BINS, PASS1_EPOCH, PASS1_ALPHA, PASS1_SIGMAS,
  PASS1_GRID_SHA256,
} from '../../src/config';

const NAME = 'Simulation Pass 1 — Pinned Master Seed, Re-Derived';
const RUN_METADATA = /^(generatedAt|executionTimeMs|hostname|timestamp|runtime)$/;

function metadataKeys(o: unknown, at = ''): string[] {
  if (!o || typeof o !== 'object') return [];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    [...(RUN_METADATA.test(k) ? [`${at}${k}`] : []), ...metadataKeys(v, `${at}${k}.`)]);
}

export function run(ctx: VerifyContext): StepResult[] {
  const file = path.join(ctx.outputsDir, 'pass1-grid.json');
  if (!fs.existsSync(file)) return [step(23, NAME, 'FAIL', 'outputs/pass1-grid.json ABSENT — Pass 1 cannot be re-derived from an artifact that does not exist')];
  const bytes = fs.readFileSync(file);
  const sha = createHash('sha256').update(bytes).digest('hex');
  let a: any;
  try { a = JSON.parse(bytes.toString('utf8')); } catch (e) {
    return [step(23, NAME, 'FAIL', `outputs/pass1-grid.json PARSE ERROR (${(e instanceof Error ? e.message : String(e)).slice(0, 80)})`)];
  }
  const bad: string[] = [];

  // 1. identity and binding
  if (sha !== PASS1_GRID_SHA256) bad.push(`sha256 ${sha.slice(0, 16)}… != pin ${PASS1_GRID_SHA256.slice(0, 16)}…`);
  const meta = metadataKeys(a);
  if (meta.length) bad.push(`run metadata present: ${meta.join(', ')}`);
  if (a?.masterSeed !== PASS1_MASTER_SEED) bad.push(`masterSeed ${a?.masterSeed} != ${PASS1_MASTER_SEED}`);
  if (a?.epoch !== PASS1_EPOCH) bad.push(`epoch ${a?.epoch} != ${PASS1_EPOCH}`);
  const m = a?.model ?? {};
  if (m.range !== RANGE || m.cursor !== CURSOR || m.resultNumerator !== RESULT_NUMERATOR || m.maxMultiplier !== MAX_MULTIPLIER
    || m.scale !== MULTIPLIER_SCALE || m.houseEdge !== HOUSE_EDGE) bad.push('model block differs from src/config.ts');

  // 2. uniformity, re-derived from the histogram
  const u = a?.uniformity ?? {};
  const hist: number[] = Array.isArray(u.hist) ? u.hist : [];
  const n = Number(u.n);
  const histOk = n === PASS1_UNIFORMITY_DRAWS && hist.length === PASS1_BINS && u.bins === PASS1_BINS
    && hist.every((c) => Number.isInteger(c) && c >= 0) && hist.reduce((x, y) => x + y, 0) === n;
  if (!histOk) bad.push(`uniformity rows malformed or not at depth ${PASS1_UNIFORMITY_DRAWS} x ${PASS1_BINS} bins`);
  const chi = chiSquaredTest(hist.length ? hist : [0], new Array(Math.max(1, hist.length)).fill(n / Math.max(1, hist.length)));

  // 3. serial, re-derived from the integer sums
  const mean = Number(u.sumB) / n;
  const varSum = Number(u.sumB2) - n * mean * mean;
  const lagSum = Number(u.sumLag) - (n - 1) * mean * mean;
  const r1 = varSum > 0 ? lagSum / varSum : NaN;
  const lagZ = r1 * Math.sqrt(n);
  const n1 = Number(u.above), n0 = n - n1;
  const muR = (2 * n1 * n0) / n + 1;
  const varR = (2 * n1 * n0 * (2 * n1 * n0 - n)) / (n * n * (n - 1));
  const runsZ = (Number(u.runs) - muR) / Math.sqrt(varR);
  const runsP = twoSidedNormalP(runsZ);
  const perTest = PASS1_ALPHA / 3;
  const zCrit = inverseCriticalZ(perTest);
  const uniformOk = histOk && chi.pValue >= perTest;
  const serialOk = Number.isFinite(lagZ) && Math.abs(lagZ) < zCrit && Number.isFinite(runsP) && runsP >= perTest;
  if (!uniformOk) bad.push(`uniformity chi2 p ${chi.pValue.toFixed(5)} < ${perTest.toFixed(5)}`);
  if (!serialOk) bad.push(`serial lag-1 z ${lagZ.toFixed(3)} / runs p ${runsP.toFixed(5)} outside the family-wise bound`);

  // 4. RTP convergence per target, against the exact win probability
  const rows: any[] = Array.isArray(a?.targets) ? a.targets : [];
  const listed = rows.map((r) => Number(r.target));
  if (rows.length < PASS1_MIN_TARGETS || JSON.stringify(listed) !== JSON.stringify([...PASS1_TARGETS]))
    bad.push(`targets [${listed.join(', ')}] != the ${PASS1_TARGETS.length} declared in src/config.ts (floor ${PASS1_MIN_TARGETS})`);
  const decades = new Set(listed.map((t) => Math.floor(Math.log10(t))));
  if (!decades.has(0) || Math.max(...decades) < 3) bad.push(`targets do not span the low and high decades (${[...decades].join(',')})`);
  let worst = 0, worstAt = 0;
  const rtpNotes: string[] = [];
  for (const r of rows) {
    const t = Number(r.target), ci = targetToHundredths(t);
    const winsExact = Math.floor(RESULT_NUMERATOR / ci);
    const p = winsExact / RANGE;
    const rounds = Number(r.rounds), wins = Number(r.wins);
    if (rounds !== PASS1_ROUNDS_PER_TARGET || r.ci !== ci || !Number.isInteger(wins) || wins < 0 || wins > rounds) {
      bad.push(`target ${t}: row malformed or not at ${PASS1_ROUNDS_PER_TARGET} rounds`); continue;
    }
    const sd = Math.sqrt(rounds * p * (1 - p));
    const dev = Math.abs(wins - rounds * p);
    const inSd = dev / sd;
    if (inSd > worst) { worst = inSd; worstAt = t; }
    if (dev > PASS1_SIGMAS * sd + 1) bad.push(`target ${t}: ${wins} wins vs ${(rounds * p).toFixed(1)} expected (${inSd.toFixed(2)} sd)`);
    const rtpSim = wins * ci / (MULTIPLIER_SCALE * rounds);
    const rtpExact = winsExact * ci / (RANGE * MULTIPLIER_SCALE);
    rtpNotes.push(`${t}x ${(rtpSim * 100).toFixed(3)}% vs ${(rtpExact * 100).toFixed(6)}%`);
  }

  // 5. prefix replay from the master seed
  const pre = a?.uniformityPrefix ?? {};
  const replay = uniformityCounts(PASS1_PREFIX_DRAWS);
  const prefixUniformOk = pre.n === PASS1_PREFIX_DRAWS && JSON.stringify(pre.hist) === JSON.stringify(replay.hist)
    && pre.sumLag === replay.sumLag && pre.runs === replay.runs && pre.above === replay.above;
  if (!prefixUniformOk) bad.push(`uniformity prefix (${PASS1_PREFIX_DRAWS} draws) does not replay from the master seed`);
  let prefixTargetsOk = 0;
  for (const r of rows) {
    if (r.prefixRounds === PASS1_PREFIX_ROUNDS && targetWins(Number(r.target), PASS1_PREFIX_ROUNDS) === r.prefixWins) prefixTargetsOk++;
    else bad.push(`target ${r.target}: prefix wins do not replay from the master seed`);
  }

  const detail = `outputs/pass1-grid.json sha256 ${sha.slice(0, 16)}… ${sha === PASS1_GRID_SHA256 ? 'matches' : 'DOES NOT match'} PASS1_GRID_SHA256; run metadata keys: ${meta.length}; `
    + `master seed "${PASS1_MASTER_SEED}" (every seed = sha256(master|stream|block), replayable byte for byte by npm run pass1:check); `
    + `UNIFORMITY re-derived from the ${hist.length}-bin histogram of ${n} draws: chi2 ${chi.chi2.toFixed(3)} df ${chi.df} p ${chi.pValue.toFixed(4)}; `
    + `SERIAL re-derived from the integer sums: lag-1 r ${r1.toFixed(6)} z ${lagZ.toFixed(3)}, runs ${u.runs} vs ${muR.toFixed(1)} expected z ${runsZ.toFixed(3)} p ${runsP.toFixed(4)}; `
    + `family-wise alpha ${PASS1_ALPHA} (Bonferroni ${perTest.toFixed(5)} per test, |z| < ${zCrit.toFixed(3)}); `
    + `RTP CONVERGENCE at ${rows.length} targets x ${PASS1_ROUNDS_PER_TARGET} rounds (decades 10^${Math.min(...decades)}..10^${Math.max(...decades)}), wins against the EXACT floor(N/ci)/${RANGE}, band ${PASS1_SIGMAS} sd + 1: `
    + `worst ${worst.toFixed(2)} sd at ${worstAt}x; simulated vs exact RTP ${rtpNotes.join(', ')}; `
    + `REPLAY: uniformity prefix ${PASS1_PREFIX_DRAWS} draws ${prefixUniformOk ? 'reproduced' : 'NOT reproduced'}, target prefixes ${prefixTargetsOk}/${rows.length} reproduced (${PASS1_PREFIX_ROUNDS} rounds each)`
    + (bad.length ? ` — FAILURES: ${bad.slice(0, 4).join('; ')}` : '');

  return [step(23, NAME, bad.length === 0 ? 'PASS' : 'FAIL', detail)];
}
