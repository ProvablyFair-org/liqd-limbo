/**
 * RTP-CLAIM wiring — LIQD Limbo: the per-setting exact RTP table and the claim it is held to.
 *
 * The rule is src/rtp-claim.ts, a byte-identical copy of the framework's core/rtp-claim.ts (its
 * SHA-256 is compared by conformance C-13), and the enforcement switch RTP_CLAIM_RULE_ENFORCED is
 * this package's src/rtp-claim-switch.ts, read by that copy. Rule 1.2.0 (Methodology v1.1) 2026-10-14: the claim
 * source names the game page, one of the rule's six places; an enforced miss would be RTP FIGURE OVERSTATED. Rule RTP-CLAIM 1.0.0 agreed
 * 2026-09-29, 1.1.0 agreed 2026-10-01.
 *
 * SETTINGS SCORED. The rule is held over the audited target range: every 2-dp target from
 * MIN_MULTIPLIER 1.01× to PROD_TOP_TARGET 10,000× (src/config.ts) — 999,900 settings. Both ends were
 * settled on production (Step 13), and the game page's own text names the same range ("2x lands 49.5% of
 * the time, 10,000x lands 0.0099% of the time, and every target in between returns 99%").
 * NOT SCORED — INFORMATION ONLY. The 2-dp values 10,000.01× … 1,000,000× (99,000,000) lie between the
 * highest target settled on production and the result cap. Whether production accepts a bet on any of
 * them is not established (src/config.ts PROD_TOP_TARGET; Step 17). They are still computed exactly and
 * kept in the committed table as buckets labelled "not scored", and the verifier prints their totals,
 * so that the arithmetic is on record if such a target is ever shown to be playable.
 * Too many rows to commit: the table carries the buckets, the true min and max rows of the scored
 * space and every scored house-side row up to RETAIN_ROWS; every setting is scored exactly.
 * EXACT RTP. winChance(m)·m = floor(N/ci)·ci / (RANGE·SCALE) with N = 9.9e9, ci = target in
 * hundredths (src/config.ts winChance / theoreticalRTP), integer numerator over 1e10.
 * CLAIM. Flat 1 % house edge = RTP 99/100: the figure the live page shows the player (liqd.com
 * "Edge: 1.00%", RTP 99%, read logged out 2026-10-01, evidence/rtp-page-labels-2026-10-01.json), the same
 * as the dataset header meta.houseEdge 0.01 (declaration gameModel.edge.claimSource).
 *
 *   npm run rtp-claim:write    rewrite outputs/rtp-claim-table.json and print its SHA-256 to pin
 */
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { RtpClaim, RtpClaimAccumulator, RtpClaimResult, rtpClaimTable, rtpClaimGate, RtpClaimGate } from './rtp-claim';
import { RANGE, MULTIPLIER_SCALE, MIN_MULTIPLIER, MAX_MULTIPLIER, RESULT_NUMERATOR, PROD_TOP_TARGET, targetToHundredths } from './config';

export const RTP_CLAIM: RtpClaim = {
  kind: 'flat',
  rtp: '0.99',
  source: 'LIQD Limbo: the game page liqd.com/originals/limbo shows "Released: September 2026 | Edge: 1.00%" and RTP 99% (read logged out 2026-10-01, evidence/rtp-page-labels-2026-10-01.json). Same figure as meta.houseEdge 0.01 in the dataset header (declaration gameModel.edge.claimSource).',
};

/** The scored step that carries LIMBO-19 (src/profile-map.ts). */
export const RTP_CLAIM_STEP = 16;
/** House-side rows kept in the committed table beyond the buckets and the two extremes. */
export const RETAIN_ROWS = 1000;

export const RTP_CLAIM_TABLE = path.join(__dirname, '..', 'outputs', 'rtp-claim-table.json');
/** SHA-256 of the committed table — re-pin with the run that rewrote it (npm run rtp-claim:write). */
export const RTP_CLAIM_TABLE_SHA256 = '92670c4605ba60045ba5348c4022e5241199857f9d3346aa9c2ec3888ebf42a0';

const ceilCi = targetToHundredths(PROD_TOP_TARGET);
const ceilText = `${PROD_TOP_TARGET.toLocaleString('en-US')}.00×`;
const NOT_SCORED = 'above the highest target settled on production — information only, not scored';
type Bucket = [number, number, string];   // [lo, hi] in hundredths, inclusive
/** The audited target range: scored. */
const SCORED_BUCKETS: Bucket[] = [
  [101, 199, '1.01× – 1.99×'], [200, 999, '2.00× – 9.99×'], [1000, 9999, '10.00× – 99.99×'],
  [10000, 99999, '100.00× – 999.99×'], [100000, ceilCi, `1,000.00× – ${ceilText} (≤ highest target settled on production)`],
];
/** On the formula's grid, above the highest target settled on production: computed, never scored. */
const ABOVE_CEILING_BUCKETS: Bucket[] = [
  [ceilCi + 1, 9999999, `${(PROD_TOP_TARGET + 0.01).toLocaleString('en-US')}× – 99,999.99× (${NOT_SCORED})`],
  [10000000, 100000000, `100,000.00× – 1,000,000.00× (${NOT_SCORED})`],
];

export interface RtpClaimParts {
  /** The rule over the audited target range (≤ PROD_TOP_TARGET) — the outcome of record. */
  scored: RtpClaimResult;
  /** The same arithmetic over the 2-dp values above PROD_TOP_TARGET — information only. */
  aboveCeiling: RtpClaimResult;
}

export function computeRtpClaimParts(): RtpClaimParts {
  const N = RESULT_NUMERATOR, D = RANGE * MULTIPLIER_SCALE;
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(D)) throw new Error('RESULT_NUMERATOR / RANGE·SCALE not exact integers');
  const lo = targetToHundredths(MIN_MULTIPLIER), hi = targetToHundredths(MAX_MULTIPLIER);
  if (!(lo < ceilCi && ceilCi < hi)) throw new Error(`top target ${PROD_TOP_TARGET}× is not inside the grid`);
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
  if (scored.settings !== ceilCi - lo + 1) throw new Error(`scored buckets cover ${scored.settings} of ${ceilCi - lo + 1} audited targets`);
  if (aboveCeiling.settings !== hi - ceilCi) throw new Error(`above-ceiling buckets cover ${aboveCeiling.settings} of ${hi - ceilCi} targets`);
  return { scored, aboveCeiling };
}

/**
 * The result of record: the rule over the audited target range. The buckets above it are appended
 * to its bucket list as information only — their settings, extremes and house-side counts are NOT in
 * `settings`, `trueMin`, `houseSideFailures` or `outcome`.
 */
export function computeRtpClaim(parts: RtpClaimParts = computeRtpClaimParts()): RtpClaimResult {
  return { ...parts.scored, buckets: [...parts.scored.buckets, ...parts.aboveCeiling.buckets] };
}

export function rtpClaimTableText(r: RtpClaimResult): string {
  return rtpClaimTable(r, {
    package: 'liqd/limbo', game: 'limbo',
    settingSpace: `scored: every 2-dp target of the audited range, 1.01× … ${ceilText} (${r.settings.toLocaleString('en-US')} settings; both ends settled on production, Step 13). `
      + `Not scored: the ${(targetToHundredths(MAX_MULTIPLIER) - ceilCi).toLocaleString('en-US')} 2-dp values ${(PROD_TOP_TARGET + 0.01).toLocaleString('en-US')}× … 1,000,000× between the highest target settled on production and the result cap; whether production accepts a bet on any of them is not established (Step 17); `
      + `rows = scored extremes + scored house-side rows up to ${RETAIN_ROWS}`,
    rtpMethod: 'exact rational: floor(9.9e9/ci)·ci / 1e10, ci = target in hundredths (win chance × target)',
  });
}

/** One printed line for the values above the audited range: information only, lower case, no step markers. */
function aboveCeilingLine(a: RtpClaimResult): string {
  return `rtp-claim:   not scored (information only): ${a.settings.toLocaleString('en-US')} 2-dp values above ${ceilText}, the highest target settled on production `
    + `(whether a bet on any of them is accepted is not established) — true min ${a.trueMin.rtpPct}% (${a.trueMin.setting}), `
    + `${a.houseSideFailures.toLocaleString('en-US')} below the band; see the table buckets`;
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
