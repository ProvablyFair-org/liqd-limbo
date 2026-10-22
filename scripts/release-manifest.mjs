#!/usr/bin/env node
/**
 * LIQD Limbo — generator for RELEASE-MANIFEST.json (same generator as LIQD Plinko's; only
 * the package block below differs).
 *
 * NOTHING MEASURABLE IS TYPED. Artifact hashes are computed from the bytes on disk; the verdict
 * and the scored counts are read out of outputs/verification-results.json; the capture window and
 * the host come out of the headers of every scored capture; the runtime of the second-machine job comes out
 * of .nvmrc. What remains typed is what no file can supply — the audit's identity and the release
 * it is being cut as — and those live in `DECLARED`, a visible source edit. The audit ID is
 * cross-checked against every document that publishes it.
 *
 * `--check` also runs the release bar (scripts/release-bar.mjs: LICENSE, second-machine workflow,
 * self-contained pinned pages, one summary shape), so the gate fails without any of them.
 *
 * Usage:
 *   node scripts/release-manifest.mjs            write RELEASE-MANIFEST.json
 *   node scripts/release-manifest.mjs --check     exit 1 if the committed file is stale or the bar fails
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkReleaseBar, WORKFLOW } from './release-bar.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = path.join(ROOT, 'RELEASE-MANIFEST.json');
const CHECK = process.argv.includes('--check');

// ── Package block ─────────────────────────────────────────────────────────────

/**
 * The facts no file in this package can supply. `signature` stays null until the release is
 * signed. `auditIdStatus` records that ProvablyFair.org, which assigns the audit ID, has confirmed
 * it. `v1.0.1` is an errata release on `v1.0.0`, the first public release (ProvablyFair-org/liqd-limbo, one commit); `v1.0.1` supersedes
 * `v1.0.0`. `signature` is the fingerprint of the SSH key that signs the release commit and tag.
 */
const DECLARED = {
  auditId: 'PF-2026-LQ05',
  auditIdStatus: 'confirmed by ProvablyFair.org',
  game: 'limbo',
  casino: 'liqd',
  release: 'v1.0.1',
  framework: '1.1',
  environmentStage: 'pre-production',
  environmentQualifier: 'provisional',
  supersedes: 'v1.0.0',
  signature: 'SHA256:gEujiJm2pRyq7lQsfYQfQ1r97H/J7GdaKHbOW8GtikY',
};

/** The dataset the audit scores. */
const DATASET = 'data/limbo-master-6700bets.json';

/** Every file whose bytes the release is a claim about. Order is the manifest's order. */
const ARTIFACTS = [
  'outputs/pass1-grid.json',
  'outputs/rtp-convergence.html',
  'outputs/simulation-results.json',
  'outputs/verification-results.json',
  'outputs/rtp-claim-table.json',   // RTP-CLAIM per-setting table (src/rtp-settings.ts pins it)
  'data/limbo-master-6700bets.json',
  'data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json',
  'data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.journal.ndjson',
];

/** Documents that publish the audit ID. If any disagrees, the release is incoherent. Since 2026-10-04 the
 * package ships two documentation files, README.md and the consolidated MANIFEST.md; listing them here also
 * fails the check if either is absent. */
const AUDIT_ID_DOCS = ['README.md', 'MANIFEST.md'];

/**
 * Every other capture whose rounds are scored: the supplement of 2026-09-26 (Step 25). The capture window spans all
 * scored captures, not only DATASET (2026-10-15: it read 11 September only, while the 300 scored supplement rounds
 * were placed on 26 September).
 */
const SCORED_SUPPLEMENTS = ['data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json'];
/**
 * Capture window and host, read from the headers of every scored capture: `from` the earliest `startedAt`,
 * `to` the latest `finishedAt`. The host must be the same in every header.
 */
const captureOf = (dataset) => {
  const metas = [dataset, ...SCORED_SUPPLEMENTS.map(readJson)].map((d) => d?.meta ?? {});
  const at = (k) => metas.map((m) => m[k]).filter((v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)));
  const starts = at('startedAt'); const ends = at('finishedAt');
  const hosts = [...new Set(metas.map((m) => m.platform ?? null))];
  if (hosts.length !== 1) fail(`the scored captures do not agree on the host: ${JSON.stringify(hosts)}`);
  return {
    from: starts.length === metas.length ? starts.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a)) : null,
    to: ends.length === metas.length ? ends.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a)) : null,
    host: hosts.length === 1 ? hosts[0] : null,
  };
};

// ── Generator (identical in every package) ────────────────────────────────────

const problems = [];
const fail = (msg) => problems.push(msg);

const sha256 = (rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail(`${rel} is missing — cannot hash an artifact that is not there`); return null; }
  return createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
};
const readJson = (rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail(`${rel} is missing`); return null; }
  try { return JSON.parse(fs.readFileSync(abs, 'utf8')); } catch (e) { fail(`${rel} is not valid JSON: ${e.message}`); return null; }
};

for (const p of checkReleaseBar(ROOT)) fail(`release bar: ${p}`);

const results = readJson('outputs/verification-results.json');
const dataset = readJson(DATASET);

const artifacts = {};
for (const rel of ARTIFACTS) { const h = sha256(rel); if (h) artifacts[rel] = h; }

const summary = results?.summary ?? {};
const verdict = summary.verdict;
const scored = { passed: summary.passed, flags: summary.flags, hardFail: summary.hardFail, of: Array.isArray(results?.steps) ? results.steps.length : null };
if (typeof verdict !== 'string' || !verdict) fail('outputs/verification-results.json has no summary.verdict');
if (summary.hardFail !== 0) fail(`the committed run has hardFail ${JSON.stringify(summary.hardFail)} — a release manifest may only describe a run with no hard fail`);

const datasetSha256 = artifacts[DATASET] ?? sha256(DATASET);
if (datasetSha256 && results?.datasetSha256 && results.datasetSha256 !== datasetSha256) {
  fail(`dataset on disk hashes to ${datasetSha256} but the verification run recorded ${results.datasetSha256}`);
}

const capture = captureOf(dataset);
if (!capture.from || !capture.to) fail('the dataset header does not give the capture window');
if (!capture.host) fail('the dataset header does not give the host');

for (const doc of AUDIT_ID_DOCS) {
  const abs = path.join(ROOT, doc);
  if (!fs.existsSync(abs)) { fail(`${doc} is missing`); continue; }
  if (!fs.readFileSync(abs, 'utf8').includes(DECLARED.auditId)) fail(`${doc} does not carry the declared audit ID ${DECLARED.auditId}`);
}

const nvmrc = fs.existsSync(path.join(ROOT, '.nvmrc')) ? fs.readFileSync(path.join(ROOT, '.nvmrc'), 'utf8').trim() : null;

const manifest = {
  auditId: DECLARED.auditId,
  auditIdStatus: DECLARED.auditIdStatus,
  game: DECLARED.game,
  casino: DECLARED.casino,
  release: DECLARED.release,
  framework: DECLARED.framework,
  datasetSha256,
  artifacts,
  verdict,
  scored,
  capturedAt: { from: capture.from, to: capture.to },
  environment: { host: capture.host, stage: DECLARED.environmentStage, qualifier: DECLARED.environmentQualifier },
  // The second-machine run the release bar requires: what runs, where, on which runtime. The run's
  // own result is written by that job, never typed here.
  reproduction: { workflow: WORKFLOW, runner: 'ubuntu-latest', node: nvmrc, command: 'npm ci && npm test' },
  supersedes: DECLARED.supersedes,
  signature: DECLARED.signature,
};

if (problems.length > 0) {
  console.error('  [release-manifest] cannot produce a manifest:');
  for (const p of problems) console.error(`    - ${p}`);
  process.exit(1);
}

const rendered = `${JSON.stringify(manifest, null, 2)}\n`;

if (CHECK) {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('  [release-manifest] RELEASE-MANIFEST.json is missing — run `node scripts/release-manifest.mjs`');
    process.exit(1);
  }
  const committed = fs.readFileSync(MANIFEST_PATH, 'utf8');
  if (committed !== rendered) {
    console.error('  [release-manifest] RELEASE-MANIFEST.json is STALE — it does not match the files in the working tree.');
    let before; try { before = JSON.parse(committed); } catch { before = null; }
    if (before) {
      const walk = (a, b, prefix) => {
        for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
          const va = a?.[k]; const vb = b?.[k]; const p = prefix ? `${prefix}.${k}` : k;
          if (va && vb && typeof va === 'object' && typeof vb === 'object' && !Array.isArray(va)) walk(va, vb, p);
          else if (JSON.stringify(va) !== JSON.stringify(vb)) console.error(`    ${p}: committed ${JSON.stringify(va)} vs working tree ${JSON.stringify(vb)}`);
        }
      };
      walk(before, manifest, '');
    }
    console.error('  Regenerate with `node scripts/release-manifest.mjs`.');
    process.exit(1);
  }
  console.log(`  [release-manifest] OK: release bar met; ${Object.keys(artifacts).length} artifact hashes match disk, verdict "${verdict}", scored ${scored.passed}/${scored.of}`);
  process.exit(0);
}

fs.writeFileSync(MANIFEST_PATH, rendered);
console.log(`  [release-manifest] wrote RELEASE-MANIFEST.json — ${Object.keys(artifacts).length} artifacts, verdict "${verdict}", scored ${scored.passed}/${scored.of}`);
