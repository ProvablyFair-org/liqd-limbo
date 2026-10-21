/**
 * RTP-CLAIM wiring — LIQD Limbo: the per-setting exact RTP table and the claim it is held to.
 *
 * The rule is src/rtp-claim.ts, a byte-identical copy of the framework's core/rtp-claim.ts (its
 * SHA-256 is compared by conformance C-13), and the enforcement switch RTP_CLAIM_RULE_ENFORCED is
 * this package's src/rtp-claim-switch.ts, read by that copy. Rule 1.2.0 (Methodology v1.1) 2026-10-14: the claim
 * source names the game page, one of the rule's six places (decision D3); an enforced miss would be RTP FIGURE OVERSTATED. Rule RTP-CLAIM 1.0.0 agreed
 * 2026-09-29, 1.1.0 agreed 2026-10-01.
 *
 * SETTINGS SCORED. The rule is held over the settings a player can actually play: every 2-dp
 * target MIN_MULTIPLIER 1.01× … LIVE_TARGET_CEILING 10,000× (src/config.ts) — 999,900 settings.
 * The upper bound is the live target ceiling witnessed 2026-09-26 — evidence/E20-target-ceiling-
 * probe-2026-09-26/, two pinned probe journals (CEILING_PROBE_1_SHA256 / CEILING_PROBE_2_SHA256,
 * reproduced by Step 25): bets at 10,000× settled; a request at 93,830.94× has an intent, no
 * settlement and consumed no nonce (MANIFEST.md#live-target-ceiling; F-CEILING in MANIFEST.md#verification-results).
 * NOT SCORED — INFORMATION ONLY. Targets 10,000.01× … MAX_MULTIPLIER 1,000,000× (99,000,000) are
 * legal under the operator client-bundle constants (src/config.ts:95-96, read 2026-09-07); on
 * 2026-09-26 the live API did not settle the one request above 10,000× (93,830.94×), and on 2026-10-02
 * it refused 100,101.12×, 497,487.44×, 500,000× and 990,000.01× with a saved reply (evidence/E21,
 * Step 25). They are still computed exactly and kept in the committed table as buckets labelled "not
 * scored", and the verifier prints their totals, because the bound is dated: the audited 2026-09-11
 * capture settled 500 bets above it (250 at 100,000×, 250 at 500,000×), 100,000× was not re-probed, and
 * the ceiling is witnessed on qa.liqd.com on two days (L15). On the 2026-09-11 range (≤ 500,000×)
 * the rule would FAIL; Step 16 prints the count and the worst target. If the server accepts those
 * targets again they are playable settings and belong in the scored space.
 * Too many rows to commit: the table carries the buckets, the true min and max rows of the scored
 * space and every scored house-side row up to RETAIN_ROWS; every setting is scored exactly.
 * EXACT RTP. winChance(m)·m = floor(N/ci)·ci / (RANGE·SCALE) with N = 9.9e9, ci = target in
 * hundredths (src/config.ts winChance / theoreticalRTP), integer numerator over 1e10.
 * CLAIM. Flat 1 % house edge = RTP 99/100: the figure the live page shows the player (liqd.com
 * "Edge: 1.00%", RTP 99%, read 2026-10-01, evidence/rtp-page-labels-2026-10-01.json), the same as
 * HOUSE_EDGE = 0.01 in the operator client-bundle constants (src/config.ts:92) and the dataset header
 * meta.houseEdge 0.01 (declaration gameModel.edge.claimSource).
 *
 *   npm run rtp-claim:write    rewrite outputs/rtp-claim-table.json and print its SHA-256 to pin
 */
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { RtpClaim, RtpClaimAccumulator, RtpClaimResult, rtpClaimTable, rtpClaimGate, RtpClaimGate } from './rtp-claim';
import { RANGE, MULTIPLIER_SCALE, MIN_MULTIPLIER, MAX_MULTIPLIER, RESULT_NUMERATOR, LIVE_TARGET_CEILING, LIVE_TARGET_CEILING_WITNESSED, CEILING_PROBE_REFUSED_TARGET, CAP_PROBE_TARGETS, targetToHundredths } from './config';

export const RTP_CLAIM: RtpClaim = {
  kind: 'flat',
  rtp: '0.99',
  source: 'LIQD Limbo: the game page liqd.com/originals/limbo shows "Released: September 2026 | Edge: 1.00%" and RTP 99% (read 2026-10-01, evidence/rtp-page-labels-2026-10-01.json). Same figure as HOUSE_EDGE = 0.01 in the operator client-bundle constants and meta.houseEdge 0.01 in the dataset header (src/config.ts:92; declaration gameModel.edge.claimSource)',
};

/** The scored step that carries LIMBO-19 (src/profile-map.ts). */
export const RTP_CLAIM_STEP = 16;
/** House-side rows kept in the committed table beyond the buckets and the two extremes. */
export const RETAIN_ROWS = 1000;

export const RTP_CLAIM_TABLE = path.join(__dirname, '..', 'outputs', 'rtp-claim-table.json');
/** SHA-256 of the committed table — re-pin with the run that rewrote it (npm run rtp-claim:write).
 * Re-pinned 2026-10-02 (was 02a61eb4…): only `settingSpace` moved — the above-ceiling text now cites the
 * E21 refusals; every bucket, row and count is unchanged. */
export const RTP_CLAIM_TABLE_SHA256 = 'cdfbf600e0713b822acf00b420c10d12b7af7fca73cce96c395099f49634ba34';

const ceilCi = targetToHundredths(LIVE_TARGET_CEILING);
const ceilText = `${LIVE_TARGET_CEILING.toLocaleString('en-US')}.00×`;
const NOT_SCORED = 'above live ceiling — information only, not scored';
type Bucket = [number, number, string];   // [lo, hi] in hundredths, inclusive
/** Targets a player can play: scored. */
const SCORED_BUCKETS: Bucket[] = [
  [101, 199, '1.01× – 1.99×'], [200, 999, '2.00× – 9.99×'], [1000, 9999, '10.00× – 99.99×'],
  [10000, 99999, '100.00× – 999.99×'], [100000, ceilCi, `1,000.00× – ${ceilText} (≤ live ceiling)`],
];
/** Legal in the client constants, above the live ceiling witnessed by one probe (E20): computed, never scored. */
const ABOVE_CEILING_BUCKETS: Bucket[] = [
  [ceilCi + 1, 9999999, `${(LIVE_TARGET_CEILING + 0.01).toLocaleString('en-US')}× – 99,999.99× (${NOT_SCORED})`],
  [10000000, 100000000, `100,000.00× – 1,000,000.00× (${NOT_SCORED})`],
];

export interface RtpClaimParts {
  /** The rule over the playable targets (≤ LIVE_TARGET_CEILING) — the outcome of record. */
  scored: RtpClaimResult;
  /** The same arithmetic over the legal targets above the live ceiling — information only. */
  aboveCeiling: RtpClaimResult;
}

export function computeRtpClaimParts(): RtpClaimParts {
  const N = RESULT_NUMERATOR, D = RANGE * MULTIPLIER_SCALE;
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(D)) throw new Error('RESULT_NUMERATOR / RANGE·SCALE not exact integers');
  const lo = targetToHundredths(MIN_MULTIPLIER), hi = targetToHundredths(MAX_MULTIPLIER);
  if (!(lo < ceilCi && ceilCi < hi)) throw new Error(`live ceiling ${LIVE_TARGET_CEILING}× is not inside the legal range`);
  const fill = (acc: RtpClaimAccumulator, buckets: Bucket[]): void => {
    for (const [b0, b1, name] of buckets) {
      for (let ci = Math.max(b0, lo); ci <= Math.min(b1, hi); ci++) {
        acc.add(() => `target=${(ci / 100).toFixed(2)}`, Math.floor(N / ci) * ci, D, name);
      }
    }
  };
  const scoredAcc = new RtpClaimAccumulator(RTP_CLAIM, { retainRows: RETAIN_ROWS });
  fill(scoredAcc, SCORED_BUCKETS);
  const aboveAcc = new RtpClaimAccumulator(RTP_CLAIM, { retainRows: 0 });
  fill(aboveAcc, ABOVE_CEILING_BUCKETS);
  const scored = scoredAcc.result(), aboveCeiling = aboveAcc.result();
  if (scored.settings !== ceilCi - lo + 1) throw new Error(`scored buckets cover ${scored.settings} of ${ceilCi - lo + 1} playable targets`);
  if (aboveCeiling.settings !== hi - ceilCi) throw new Error(`above-ceiling buckets cover ${aboveCeiling.settings} of ${hi - ceilCi} targets`);
  return { scored, aboveCeiling };
}

/**
 * The result of record: the rule over the playable targets. The above-ceiling buckets are appended
 * to its bucket list as information only — their settings, extremes and house-side counts are NOT in
 * `settings`, `trueMin`, `houseSideFailures` or `outcome`.
 */
export function computeRtpClaim(parts: RtpClaimParts = computeRtpClaimParts()): RtpClaimResult {
  return { ...parts.scored, buckets: [...parts.scored.buckets, ...parts.aboveCeiling.buckets] };
}

export function rtpClaimTableText(r: RtpClaimResult): string {
  return rtpClaimTable(r, {
    package: 'liqd/limbo', game: 'limbo',
    settingSpace: `scored: every 2-dp target a player can play, 1.01× … ${ceilText} (${r.settings.toLocaleString('en-US')} settings; the live target ceiling witnessed ${LIVE_TARGET_CEILING_WITNESSED}, evidence/E20-target-ceiling-probe-2026-09-26, Step 25). `
      + `Not scored: the ${(targetToHundredths(MAX_MULTIPLIER) - ceilCi).toLocaleString('en-US')} targets ${(LIVE_TARGET_CEILING + 0.01).toLocaleString('en-US')}× … 1,000,000× that are legal in the operator client constants and lie above the live ceiling (${CEILING_PROBE_REFUSED_TARGET.toLocaleString('en-US')}×, not settled on ${LIVE_TARGET_CEILING_WITNESSED}; ${CAP_PROBE_TARGETS.map((t) => `${t.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}×`).join(', ')}, refused on 2026-10-02 with "Too big: expected number to be <=10000", evidence/E21-target-cap-probe, Step 25; 100,000×, settled on 2026-09-11, not re-probed) — carried as buckets marked "information only, not scored". `
      + `rows = scored extremes + scored house-side rows up to ${RETAIN_ROWS}`,
    rtpMethod: 'exact rational: floor(9.9e9/ci)·ci / 1e10, ci = target in hundredths (the operator win-chance pricing × target)',
  });
}

/** One printed line for the above-ceiling targets: information only, lower case, no step markers. */
function aboveCeilingLine(a: RtpClaimResult): string {
  return `rtp-claim:   not scored (information only): ${a.settings.toLocaleString('en-US')} legal targets above the ${ceilText} live ceiling `
    + `(E20, ${LIVE_TARGET_CEILING_WITNESSED}: one request above it, ${CEILING_PROBE_REFUSED_TARGET.toLocaleString('en-US')}×, not settled) — true min ${a.trueMin.rtpPct}% (${a.trueMin.setting}), `
    + `${a.houseSideFailures.toLocaleString('en-US')} below the band; see the table buckets; the 2026-09-11 range (≤ 500,000×) is in Step 16`;
}

export function runRtpClaimGate(): RtpClaimGate {
  const parts = computeRtpClaimParts();
  const r = computeRtpClaim(parts);
  const g = rtpClaimGate(r, rtpClaimTableText(r), RTP_CLAIM_TABLE, RTP_CLAIM_TABLE_SHA256);
  const at = g.lines.findIndex(l => l.startsWith('rtp-claim:   outcome '));
  g.lines.splice(at < 0 ? g.lines.length : at, 0, aboveCeilingLine(parts.aboveCeiling));
  return g;
}

if (require.main === module) {
  const text = rtpClaimTableText(computeRtpClaim());
  fs.writeFileSync(RTP_CLAIM_TABLE, text);
  console.log(`wrote outputs/rtp-claim-table.json sha256 ${createHash('sha256').update(text).digest('hex')}`);
}
