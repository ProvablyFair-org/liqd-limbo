/**
 * Which ProvablyFair.org Limbo profile check each scored step implements.
 *
 * WHY THIS FILE EXISTS. The framework's (proposed) Limbo profile declares checks LIMBO-01 … LIMBO-31.
 * This suite scores its steps under its own numbering, which every chapter cites by number and which
 * therefore cannot be renumbered to match. The mapping is declared here, emitted into
 * `outputs/verification-results.json` beside the step results, and read back by `pf-audit matrix`,
 * which prints the conformance matrix and exits 1 when a HARD_FAIL check has nothing implementing it.
 *
 * THIS FILE LABELS; IT DOES NOT CHECK. Nothing here can make a step pass or fail. An id claimed for a
 * step the step does not implement is a false statement in a published artifact, so the rule is the
 * profile's own `asserts` text: claim the check only if the step's assertion actually decides it.
 *
 * COVERAGE DESCRIBES THE PACKAGE, NOT THE STEP.
 *   full    — nothing the profile's `asserts` requires is unimplemented; where a check is split across
 *             two steps both say `full` and each note says which half it carries.
 *   partial — something the profile requires is implemented nowhere in this package, and the note
 *             says what. `partial` is a disclosure, never a softer word for `full`.
 */

export type Coverage = 'full' | 'partial';

export interface CheckClaim {
  id: string;
  coverage: Coverage;
  note?: string;
}

export interface StepClaims {
  claims: CheckClaim[];
  /** Required when `claims` is empty: why the step answers no profile check. */
  reason?: string;
}

export const PROFILE_GAME = 'limbo';
export const PROFILE_VERSION = '1.0.2';

/** Scored step number → the profile checks it implements. Every scored step has an entry. */
export const STEP_CLAIMS: Record<number, StepClaims> = {
  1: { claims: [{ id: 'LIMBO-01', coverage: 'full',
    note: 'SHA-256(utf8(serverSeed)) == hashedServerSeed on every revealed seed; the count checked is bound to '
      + 'EXPECTED_SEEDS in src/config.ts, not to the dataset' }] },
  2: { claims: [{ id: 'LIMBO-02', coverage: 'full',
    note: 'next-hash chain recomputed from the raw fields on all 133 transitions plus the meta.preCapture link' }] },
  3: { claims: [{ id: 'LIMBO-03', coverage: 'full' }] },
  4: { claims: [{ id: 'LIMBO-04', coverage: 'full',
    note: 'nonces exactly 0..49 per epoch against EXPECTED_EPOCH_SIZE, no reuse, none out of range; an operator-side or '
      + 'undeclared gap is a HARD FAIL; a gap the capture log attributes to a retry (DECLARED_CAPTURE_GAPS) whose '
      + 'revealed seed reconstructs every recorded bet is returned as FLAG origin = capture, verdict-neutral (verify.ts). '
      + 'The branch does not fire on this gap-free capture; it is shown reachable by tests/forgeries/declared-capture-gap.mjs' }] },
  5: { claims: [
    { id: 'LIMBO-07', coverage: 'full',
      note: 'R recomputed from the revealed seeds equals the served result with strict === on all EXPECTED_BETS bets; '
        + 'an unrevealed epoch is counted and fails' },
    { id: 'LIMBO-10', coverage: 'full',
      note: 'range half: every served and recomputed result lies in [MIN_RESULT 1, MAX_MULTIPLIER 1e6] on the 2-dp '
        + 'lattice; the win-rule half is Step 6' },
    { id: 'LIMBO-17', coverage: 'full',
      note: 'floor half: 147 rounds served at R = 1, 78 of them with the raw formula below 1 (the clamp fired); the '
        + 'tie half is Step 6 + E13 (Step 19); the 1e6 cap is declared UNWITNESSED (L4, Step 21) and exercised by '
        + 'grid arithmetic in Step 14' },
    { id: 'LIMBO-08', coverage: 'full',
      note: 'draw-bias bound computed from the same maxFair rule the draw applies and ASSERTED: maxFair = '
        + '4,200,000,000 = 42 x 1e8, a whole number of ranges, per-value bias exactly 0 (<= 2^-32); rejected tail '
        + '94,967,296 of 2^32 chunk values (2.2111%) printed; rejection census over the capture: 126 rounds had '
        + 'their first chunk rejected and all reproduce, so the operator applies the guard (formerly L11 prose)' },
  ] },
  6: { claims: [
    { id: 'LIMBO-10', coverage: 'full',
      note: 'win == (recomputed R >= target) reproduces the served win flag on every bet; no served result or win '
        + 'field is read while deriving it' },
    { id: 'LIMBO-17', coverage: 'full',
      note: 'tie half: 20 captured rounds land exactly on the target (18.24 expected from the bets placed) and all 20 '
        + 'settle as wins (>=), a rule a strict > model would flip on 20 bets; floor half: all 147 recomputed floor '
        + 'rounds settle as losses and MIN_RESULT < MIN_MULTIPLIER is asserted' },
  ] },
  7: { claims: [{ id: 'LIMBO-07', coverage: 'full',
    note: 'determinism half: the full derivation run twice and in reverse order agrees with itself' }] },
  8: { claims: [{ id: 'LIMBO-13', coverage: 'full',
    note: 'on every win the dataset\'s multiplier column equals the target, bit-exact; the capture script fills that '
      + 'column itself when the casino\'s response has no wager-level multiplier, and none of the 303 raw responses kept '
      + 'has one, so this checks the file, not the casino (the payout is Step 9); the edge sits in the result numerator '
      + 'N = 9.9e9 (client-bundle constants, confirmed by four operator Verify vectors, tests/limbo/rngTests.ts); '
      + 'the dataset carries no operator win-chance or edge field, so the derivation can read none' }] },
  9: { claims: [{ id: 'LIMBO-11', coverage: 'full',
    note: 'winning credit x 1e8 == hundredths(stake) x hundredths(target) x 1e4, exact integer identity; loss half is Step 10' }] },
  10: { claims: [{ id: 'LIMBO-11', coverage: 'full', note: 'loss half: winningAmount == 0 and multiplier == 0 on every loss' }] },
  11: { claims: [{ id: 'LIMBO-14', coverage: 'full',
    note: 'every target a legal 2-dp value <= MAX_PLAYABLE_TARGET, every stake >= the $0.10 minimum, exposure <= the '
      + '$50,000 ceiling compared in integer hundredths; the client-code-maximum half is Step 17, the live-ceiling '
      + 'half is Step 25 and the UI cap is recorded in Step 16' }] },
  12: { claims: [
    { id: 'LIMBO-05', coverage: 'full', note: 'bets, seeds, epochs x epoch size bound to src/config.ts EXPECTED_*; header reconciled, never the denominator' },
    { id: 'LIMBO-26', coverage: 'full', note: 'dataset SHA-256 equals DATASET_SHA256; the loader aborts before any step on a mismatch' },
  ] },
  13: { claims: [
    { id: 'LIMBO-05', coverage: 'full', note: 'per-phase counts and stakes asserted against EXPECTED_PHASES both ways' },
    { id: 'LIMBO-12', coverage: 'full',
      note: 'Phase C: 200/200 bets at $10 on target 2x recomputed from primitives in this step and settled by the '
        + 'base-stake rule (result, win flag, credit = stake x target in integer hundredths); 104 elevated-stake wins '
        + 'against the PHASE_C_MIN_WINS = 100 floor; the price has no stake input' },
    { id: 'LIMBO-15', coverage: 'full',
      note: 'audited-dataset half: per-decade coverage asserted against PLANNED_TARGET_DECADES (10^0 5,245, 10^1 455, '
        + '10^2 250, 10^3 250, 10^5 500), minimum legal target 1.01x played, 6,200 bets at or below the 10,000x UI cap '
        + 'and 500 above it (server-accepted on 2026-09-11); decade 10^4 is unplayed IN THIS DATASET. The Phase A floor '
        + 'of 50 per declared decade up to the declared ceiling (10,000x, live 2026-09-26) is Step 25: Phase A covers '
        + '10^0 and 10^1 here, the 2026-09-26 supplement covers 10^2, 10^3 and 10^4 at 100 each' },
  ] },
  14: { claims: [{ id: 'LIMBO-18', coverage: 'full',
    note: 'negative control (rejects 2.48x, NaN, Infinity) + boundary anchor over all captured targets from the grid alone' }] },
  15: { claims: [
    { id: 'LIMBO-18', coverage: 'full',
      note: 'winning draws on the 1e8 grid == floor(N/ci) for every captured target, plus four literal full-grid tallies' },
    { id: 'LIMBO-13', coverage: 'full',
      note: 'the win chance given by LIQD\'s pricing formula (read from its client code) equals the probability the '
        + 'result formula delivers, integer identity; LIQD\'s page states two of these figures (49.5% at 2x, 0.0099% at '
        + '10,000x) and both match' },
  ] },
  16: { claims: [{ id: 'LIMBO-19', coverage: 'full',
    note: 'the edge is derived in exact integers at all 99,999,900 legal targets and min/max/where/count off 1.00% are '
      + 'printed; LIMBO-19 follows the RTP-CLAIM band (decided 2026-10-02): a target more than the 0.1 pp band from the '
      + 'claim is a FLAG (origin operator, magnitude stated), inside the band the curve is printed, not flagged. Judged on '
      + 'the current build\'s range, 1.01x to the 10,000x live ceiling of 2026-09-26 (the range the RTP-CLAIM rule is '
      + 'scored on): 0 of 999,900 targets beyond the band, so PASS; inside it 999,618 are off 1.00%, by at most 0.009982 pp '
      + '(1.009982% at 9,989.91x). The first target beyond the band is 100,101.12x. Disclosed beside it, not scored: the '
      + '2026-09-11 range (<= 500,000x), worst 1.497487% at 497,487.44x, where the RTP-CLAIM rule would fail on '
      + '23,885,381 of 49,999,900 targets; the whole declared grid, up to 1.989999%' }] },
  17: { claims: [{ id: 'LIMBO-14', coverage: 'full',
    note: 'client-code-maximum half: re-derives the 2026-09-11 evidence that the 1,000,000x maximum target in LIQD\'s '
      + 'client code (read 2026-09-07, not retained) was unplayable at the $0.10 minimum (E15) and prints it as a NOTE, '
      + 'not a FLAG: the player-facing text held (evidence/rtp-page-labels-2026-10-01.json) shows 10,000x as its top '
      + 'example and nothing in the package shows players are told 1,000,000x. The step FAILs if the 2026-09-11 '
      + 'evidence stops reproducing' }] },
  18: { claims: [{ id: 'LIMBO-06', coverage: 'full',
    note: 'Phase D 500/500 recompute under 10 auditor seeds; model-rate gate over all 6,700 bets (wrong seed and '
      + 'EMPTY-SEED control each leave 0 draws unchanged against floor(E + 5 sqrt(E)) = 0, E = n/1e8); Phase A-C '
      + 'seeds are the rig\'s randomBytes(6) CSPRNG, read from the shipped capture script and matched on all 6,200 '
      + 'bets; Phase D seeds are predictable by construction and the 10 exposed epochs (124-133) are enumerated' }] },
  19: { claims: [
    { id: 'LIMBO-26', coverage: 'full', note: 'dataset pin restated in the artifact of record' },
    { id: 'LIMBO-27', coverage: 'full',
      note: 'every artifact of record pinned in src/config.ts and recorded in artifactHashes, un-ignored by name in '
        + '.gitignore, free of run metadata (simulation-results.json generatedAt removed with the producer\'s own '
        + 'serialiser, 0 values changed, re-pinned), never written by verify (outputs/run/ only); 966 numeric leaves '
        + 'across the two pinned JSON artifacts carry a declared value domain (src/domains.ts); Pass-1 grid half is Step 23' },
  ] },
  20: { claims: [{ id: 'LIMBO-11', coverage: 'full',
    note: 'outcome and credit fully determined by (seeds, nonce, target, stake), no served outcome field read' }] },
  22: { claims: [{ id: 'LIMBO-22', coverage: 'full',
    note: 'recomputed draws in capture order: 100-bin chi-squared and KS against U(0,1) (the fit of P(R >= x), R being '
      + 'monotone in k), point mass at R = 1 counted separately as a binomial z, lag-1 z and runs test; thresholds '
      + 'fixed in code on 2026-09-26; informational (policy INFORMATIONAL, 2026-09-29): a deviation is INFO — reported, never '
      + 'counted, verdict unchanged — shown able to fire by the sorted-draws mutation' }] },
  23: { claims: [
    { id: 'LIMBO-20', coverage: 'full',
      note: '2,000,000 uniformity draws (100-bin chi-squared) + lag-1 and runs from stored integer sums, family-wise '
        + 'alpha 0.01; RTP convergence at 10 targets (1.01x..100,000x, decades 10^0..10^5) x 1,000,000 rounds against '
        + 'the EXACT win probability floor(N/ci)/1e8; every statistic re-derived here from the artifact\'s integer rows; '
        + 'the experiment is seeded from a recorded master seed, its prefixes replayed on every run, and all 12,000,000 '
        + 'draws replayed byte for byte by npm run pass1:check (test:full)' },
    { id: 'LIMBO-27', coverage: 'full', note: 'pass1-grid.json pinned (PASS1_GRID_SHA256) and rejected if it carries run metadata' },
  ] },
  24: { claims: [{ id: 'LIMBO-21', coverage: 'full',
    note: 'every revealed seed (134) x 10,000 nonces re-derived in verify from the dataset (src/pass2.ts, deterministic, '
      + 'no random number); early window = the captured nonces 0-49, reference = the other 199 windows of 50; statistic = the '
      + 'unit-stake return of the targets the casino served in that epoch, standardised by the exact per-target mean and '
      + 'variance (floor(N/ci)/RANGE); exact permutation null for the captured window\'s rank; one-sided rule fixed in code on 2026-09-26, after the capture, '
      + 'Z < -3.090 (alpha 0.001); direction split and detection power printed; window 0 replays every captured result. '
      + 'The original early/late chi-squared screen is recounted against its EXACT multinomial null (p0 computed, not the '
      + 'assumed 0.0475) and its binomial rule is scored too; the committed pass2 block must equal the re-derivation' }] },
  25: { claims: [
    { id: 'LIMBO-15', coverage: 'full',
      note: 'Phase A >= PHASE_A_DECADE_FLOOR (50) asserted in every decade from 10^0 up to the declared ceiling '
        + 'LIVE_TARGET_CEILING 10,000x (decade 10^4): 10^0 4,574 and 10^1 426 from the audited Phase A, 10^2 100, 10^3 '
        + '100 and 10^4 100 (all at exactly 10,000x, the one legal point of that decade under the ceiling) from the '
        + '2026-09-26 supplement (SUPPLEMENT_DECADES, bound in src/config.ts); minimum legal target 1.01x played in '
        + 'Phase A; every supplement round recomputed from its revealed seed (result, win, credit), 6/6 commitments, '
        + '5/5 chain links and the pre-capture anchor; the supplement is pinned and scored by this step only' },
    { id: 'LIMBO-14', coverage: 'full',
      note: 'live-ceiling half, worded with dates: on 2026-09-11 '
        + 'the server accepted and settled targets up to 500,000x (250 at 100,000x, 250 at 500,000x); the 2026-09-26 '
        + 'probe above 10,000x (93,830.94x, itself inside the RTP-CLAIM band at 98.991642%) has an intent, no '
        + 'settlement and consumed no nonce, and its reply was not saved (evidence/E20); the first target outside the band '
        + 'is 100,101.12x. Until 2026-10-02 this was the audit\'s one operator FLAG. It cleared on a saved server reply: '
        + 'the cap re-probe (capture/PROBE-2026-10-02.md, capture/capture-limbo-v2.mjs --cap-probe), run on qa.liqd.com on '
        + '2026-10-02 and pinned in src/config.ts as evidence/E21, settled a $0.10 control at 10,000x that recomputes and '
        + 'saw 100,101.12x, 497,487.44x, 500,000x and 990,000.01x each refused (HTTP 400, errorCode 3001, "Too big: '
        + 'expected number to be <=10000"), no nonce consumed. 100,000x was not re-probed. Every supplement '
        + 'target is a legal 2-dp value at or below LIVE_TARGET_CEILING 10,000x' },
  ] },
  21: { claims: [], reason: 're-checks L1-L4 against the dataset on every run and fails if one stops being true; '
    + 'recomputes the figures quoted for L7 and L8; L5 and L6 are restated, not measured; the register itself is '
    + 'LIMBO-30, a package check' },
};

/** Checks this casino's design makes inapplicable, each the false `applies` predicate in the profile. */
export const NOT_APPLICABLE: Array<{ id: string; reason: string }> = [
  { id: 'LIMBO-16',
    reason: 'applies={path: money.balanceField, notNull: true} is false — money.balanceField is null: the capture '
      + 'carries no running wallet-balance ledger (L3). The stakeWallet / winningAmountWallet settle-response fields '
      + 'are reconciled against the game ledger in Step 11, which the profile does not count as a balance ledger' },
  { id: 'LIMBO-31',
    reason: 'applies={path: gameModel.scalingEdge.presentAtCapture, eq: true} is false — no stake- or exposure-'
      + 'dependent edge: the client-bundle constants carry one HOUSE_EDGE = 0.01 (src/config.ts), and the edge '
      + 'dispersion Step 16 measures is a function of the target, not of the stake' },
];

/** Checks a package artifact answers rather than a scored step. `none` = the artifact does not exist. */
export const PACKAGE_CHECKS: Array<{ id: string; artifact: string; coverage: Coverage | 'none'; note: string }> = [
  { id: 'LIMBO-09', artifact: 'docs/ALGORITHM.md + tests/limbo/RngSpecTests.ts + tests/limbo/rngTests.ts + tests/limbo/resultFloorTests.ts', coverage: 'partial',
    note: 'src/rng.ts is rebuilt from the written spec docs/ALGORITHM.md by an implementer who never opened LIQD\'s code '
      + '(20 Oct 2026), and RngSpecTests.ts runs the spec\'s vectors against it; as a second check, not the source, '
      + 'four operator Verify-calculator vectors and a 2026-09-11 session round that is not in the shipped dataset '
      + '(serverSeed 5d8a6efd…, nonce 49, the result-floor witness) reproduce; src/config.ts '
      + 'names the client-bundle functions it ports (ci, cr, LIMBO_* exports) but not line numbers — the bundle is '
      + 'minified and not retained in the package' },
  { id: 'LIMBO-23', artifact: 'MANIFEST.md#verification-results', coverage: 'full',
    note: 'the standardized framework matrix S5-1..S5-8 (seed substitution, client-seed manipulation, stake-conditional '
      + 'outcome, cherry-picking, rotation race, multiplier tampering, nonce manipulation, modulo bias), each row one '
      + 'verdict tied to a step or disclosed as not tested; the limbo-specific target hunt and input-contract probes '
      + 'are carried as supplementary rows S5-L1 / S5-L2' },
  { id: 'LIMBO-24', artifact: 'none', coverage: 'none',
    note: 'LIQD publishes a Verify calculator (E12, E13), so the check applies; no ProvablyFair.org site verifier '
      + 'for limbo exists to hash-match against computeResult' },
  { id: 'LIMBO-25', artifact: 'MANIFEST.md#verify-a-bet', coverage: 'full',
    note: 'MANIFEST "Verify a bet" states, in order and in the declaration\'s field names: where the seed is revealed, the fields to '
      + 'paste (hashedServerSeed, serverSeed, clientSeed, nonce, params.target, betAmount), the commitment encoding '
      + 'SHA-256(utf8(serverSeed)), the draw and result formula, the >= win rule, and the credit; worked real rounds in '
      + 'the same section' },
  { id: 'LIMBO-28', artifact: 'package.json + .nvmrc + verify.js/test.js + src/simulate.ts', coverage: 'full',
    note: 'npm test reproduces the verdict with the runtime pinned and the audit ID assigned; test:full writes every '
      + 'regeneration to outputs/run/ and requires each to equal the committed artifact: the Pass-1 grid (pass1:check), '
      + 'the Pass-2 block (pass2:check) and, since 2026-09-26, the whole legacy outputs/simulation-results.json and '
      + 'rtp-convergence.html (simulate:check) — its Pass-1 seeds are now sha256(SIM_MASTER_SEED|stream|n) from the '
      + 'recorded seed in src/config.ts (was crypto.randomBytes), the artifact records pass1.masterSeed and Step 19 binds '
      + 'it to the constant; the regeneration is compared byte for byte (stricter than field by field) with the runtime '
      + 'written to outputs/run/simulation-diff.json. Regenerating from the recorded seed moved every legacy Pass-1 '
      + 'figure (MANIFEST L9 note); verify\'s own reproduction diff is outputs/run/diff.json' },
  { id: 'LIMBO-29', artifact: 'tests/mutations.json + tests/structural-forgeries.json + tests/mutation-survivors.json', coverage: 'full',
    note: '115 entries — 73 single-file mutations, 41 structural forgeries, 1 declared survivor tied to register row '
      + 'L12 — run by tests/mutate.ts in a disposable copy (npm run mutate, 2026-10-03): 114 killed, 1 survivor as '
      + 'declared, 0 other than as declared; every scored step 1-25 has at least one entry that must move THAT step '
      + 'off its baseline status; 2 entries are killed by mocha and 4 are marker kills (the dataset pin aborting the loader, and '
      + 'three caught only by the run-vs-committed-artifact reproduction gate on byte identity); forgeries that re-pin '
      + 'the hash they invalidate are included. Added 2026-10-02: the Step 16 band arm, the Step 19 casino-result arm '
      + '(E13), the Step 21 L2/L3 arms and the Step 25 cap re-probe pin arm. That count is the run of 2026-10-03 on the '
      + 'release tree, E21 pinned (baseline a Full Pass); the two cap re-probe entries were rewritten for the pinned '
      + 'journal on 2026-10-02 (deleted, and edited without re-pinning). The '
      + 'judge of the cap re-probe is also unit-tested in tests/limbo/capProbeTests.ts on journals the real capture engine writes' },
  { id: 'LIMBO-30', artifact: 'MANIFEST.md#limitations-and-trust + MANIFEST.md#evidence', coverage: 'full',
    note: 'MANIFEST carries the limitations register L1-L18 with magnitudes and the Load-Bearing Premises table; '
      + 'MANIFEST Evidence numbers exhibits from E01' },
];

export function profileCoverageBlock(): Record<string, unknown> {
  return { game: PROFILE_GAME, profileVersion: PROFILE_VERSION, notApplicable: NOT_APPLICABLE, packageChecks: PACKAGE_CHECKS };
}

export function labelFor(step: number): Record<string, unknown> {
  const entry = STEP_CLAIMS[step];
  if (!entry) return { profileIds: [], profileChecks: [], profileNote: 'no mapping declared for this step' };
  return entry.claims.length
    ? { profileIds: entry.claims.map(c => c.id), profileChecks: entry.claims }
    : { profileIds: [], profileChecks: [], profileNote: entry.reason ?? 'no reason given' };
}
