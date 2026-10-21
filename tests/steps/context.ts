/**
 * Shared context + the scored-step contract for the LIQD Limbo verification suite.
 *
 * One `step(num, name, status, detail)` call per scored step, in the same shape the other LIQD
 * audits use, so the reports read side by side.
 *
 * ── THE RULES THIS FILE EXISTS TO ENFORCE ────────────────────────────────────────────────────
 * G-BIND   a count is not an identity. Every population assertion binds to SOURCE records and to
 *          `src/config.ts` constants; never to a count the artifact supplies about itself.
 * G-EXEC   a verdict is unreachable unless every step ran — `EXPECTED_STEPS` is asserted in
 *          verify.ts before the verdict is printed, and a throw exits non-zero with no verdict.
 * G-RANGE  every scalar read from the artifact gets a physical-possibility bound derived from
 *          config or from the draw grid, never from the artifact being checked.
 * G-VALID  do NOT reject the merely surprising. A statistic landing on expectation is legal.
 *          Nothing in this suite treats exactness, a zero deviation or a round number as evidence
 *          of fabrication — Mines and Dice both shipped that defect and both had to remove it.
 * G-SCOPE  the capture is against qa.liqd.com. Production parity is NOT established; anything the
 *          data cannot witness is a declared limitation (Step 21), not a claim.
 */

import type { Bet, Seed, Dataset } from '../../src/types';

export interface StepResult {
  step: number;
  name: string;
  /**
   * INFO: an informational step's deviation (profile policy INFORMATIONAL — the live-sample fit,
   * 2026-09-29): reported, never counted as a flag, never affects the verdict.
   * OVERSTATED: the step carrying LIMBO-19 when the enforced RTP-CLAIM rule (1.2.0) finds the published figure
   * overstated — not a draw FAIL, not counted in hardFail; verdict RTP FIGURE OVERSTATED, exit 5.
   */
  status: 'PASS' | 'FLAG' | 'FAIL' | 'INFO' | 'OVERSTATED';
  detail: string;
  /**
   * Present ONLY on a FLAG. Profile policy FLAG (decided 2026-09-17): an `operator` flag (the residual
   * is about the game) downgrades the verdict to a Conditional Pass; a `capture` flag (an auditor-side
   * artefact such as a capture-retry nonce gap the revealed seed reconstructs) is disclosed and counted
   * but verdict-neutral. A flag with no origin is treated as operator, so an unclassified flag can only
   * err toward disclosure. (The `informational` origin is gone: the 2026-09-29 profile made the live-sample fit
   * policy INFORMATIONAL, so it reports INFO and is not a flag at all.)
   */
  origin?: 'capture' | 'operator';
}

export interface InfoItem {
  label: string;
  detail: string;
}

export interface VerifyContext {
  bets: Bet[];
  seeds: Seed[];
  /** hashedServerSeed → revealed serverSeed (only for revealed epochs). */
  seedMap: Map<string, string>;
  /** hashedServerSeed → the Seed record itself. */
  seedByHash: Map<string, Seed>;
  /** hashedServerSeed → bets in that epoch. */
  byHash: Map<string, Bet[]>;
  phaseA: Bet[];   // 5,000 — random target across the playable range, $0.10
  phaseB: Bet[];   // 1,000 — high-multiplier tranches 100 / 1,000 / 100,000 / 500,000
  phaseC: Bet[];   //   200 — $10 stake at target 2.00 (stake independence)
  phaseD: Bet[];   //   500 — auditor-chosen `pfaudit-` client seeds
  /** Absolute path of the repo root (the directory holding package.json). */
  repoRoot: string;
  outputsDir: string;
  evidenceDir: string;
  /** Recomputed SHA-256 of the loaded dataset file. */
  datasetSha256: string;
  /** The dataset hash pinned in src/config.ts (the integrity anchor). */
  expectedDatasetHash: string;
  /** Declared capture host, asserted against the dataset header in Step 21 (G-SCOPE). */
  captureHost: string;
  /** Declared phase config as the capture recorded it — reconciled against config, never trusted. */
  meta: Dataset['meta'];
  /** Every distinct target present in the capture, ascending. Derived once, used by several steps. */
  distinctTargets: number[];
}

export function step(
  num: number,
  name: string,
  status: 'PASS' | 'FLAG' | 'FAIL' | 'INFO',
  detail: string,
  origin?: 'capture' | 'operator',
): StepResult {
  const tag = status === 'PASS' ? '[PASS]' : status === 'INFO' ? '[INFO]' : status === 'FLAG' ? '[FLAG]' : '[FAIL]';
  const originTag = status === 'FLAG' && origin ? ` (origin=${origin})` : '';
  console.log(`  ${tag} Step ${num} — ${name}${originTag}`);
  if (status !== 'PASS') console.log(`         ${detail}`);
  // `origin` is emitted ONLY on a FLAG, so a PASS/FAIL record is byte-identical to before it existed.
  return status === 'FLAG' && origin ? { step: num, name, status, detail, origin } : { step: num, name, status, detail };
}

/**
 * Finiteness-guarded equality for a served RESULT multiplier against the locally recomputed one.
 *
 * Written as a named predicate rather than `a === b` inline because the dice audit shipped
 * `Math.abs(local - served) > 1e-9`, which is FALSE when `served` is NaN — a non-numeric served
 * field passed silently. The result grid is `floor(9.9e9/(k+1))/100`, an exact 2-dp binary64, so
 * the comparison is exact equality with no tolerance at all; a tolerance here would be a mask.
 */
export function servedResultMatches(served: number, local: number): boolean {
  return Number.isFinite(served) && Number.isFinite(local) && served === local;
}

/** Lowercase hex string of exactly `len` characters — used for commitment/seed shape checks. */
export function isHex(value: unknown, len: number): boolean {
  return typeof value === 'string' && new RegExp(`^[0-9a-f]{${len}}$`).test(value);
}

/**
 * Exact decimal value in hundredths. Both stakes and targets are 2-dp decimals in this game, so
 * every money and multiplier comparison in this suite is done on INTEGERS rather than on binary64
 * products, so a result never depends on floating-point rounding: for 427 of the capture's 1,105
 * distinct stake x target pairs the binary64 product is not the decimal answer (e.g. 0.1 * 1.07 =
 * 0.10700000000000001; Step 11 recounts it). Integers do not have that problem.
 */
export function hundredths(x: number): number {
  return Math.round(x * 100);
}

/**
 * Is `x` an exact 2-dp decimal? EXACT, with no tolerance (was `|x·100 − round(x·100)| < 1e-6` until
 * 2026-09-26). IEEE division is correctly rounded, so hundredths(x) / 100 is the nearest binary64 to
 * the decimal h/100 — the very double a JSON parser produces for that 2-dp literal — and it equals x
 * iff x is that 2-dp value. A 3-dp value such as 2.475 is rejected rather than absorbed by a band.
 */
export function isTwoDecimal(x: number): boolean {
  return Number.isFinite(x) && hundredths(x) / 100 === x;
}
