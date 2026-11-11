/**
 * Which ProvablyFair.org Limbo profile check each scored step implements.
 *
 * WHY THIS FILE EXISTS. The framework's Limbo profile declares checks LIMBO-01 … LIMBO-31.
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
export const PROFILE_VERSION = '1.0.4';

/** Scored step number → the profile checks it implements. Every scored step has an entry. */
export const STEP_CLAIMS: Record<number, StepClaims> = {
  1: { claims: [{ id: 'LIMBO-01', coverage: 'full',
    note: 'SHA-256(utf8(serverSeed)) == hashedServerSeed on every revealed seed; the count checked is bound to '
      + 'EXPECTED_SEEDS in src/config.ts, not to the dataset' }] },
  2: { claims: [{ id: 'LIMBO-02', coverage: 'full',
    note: 'next-hash chain recomputed from the raw fields on all 30 transitions inside the three runs, plus each run\'s own '
      + 'pre-capture link (meta.captures[].preCapture); the three runs are separate sessions and no link is asserted between them' }] },
  3: { claims: [{ id: 'LIMBO-03', coverage: 'full' }] },
  4: { claims: [{ id: 'LIMBO-04', coverage: 'full',
    note: 'nonces exactly 0..size-1 per epoch against the epoch\'s planned size in src/config.ts EPOCH_PLAN (200, 100 or 119), '
      + 'no reuse, none out of range; an operator-side or undeclared gap is a HARD FAIL; a gap the capture log attributes to a '
      + 'retry (DECLARED_CAPTURE_GAPS) whose revealed seed reconstructs every recorded bet is returned as FLAG origin = capture, '
      + 'verdict-neutral (verify.ts). The branch does not fire on this gap-free capture; it is shown reachable by '
      + 'tests/forgeries/declared-capture-gap.mjs' }] },
  5: { claims: [
    { id: 'LIMBO-07', coverage: 'full',
      note: 'R recomputed from the revealed seeds equals the served result with strict === on all EXPECTED_BETS bets; '
        + 'an unrevealed epoch is counted and fails' },
    { id: 'LIMBO-10', coverage: 'full',
      note: 'range half: every served and recomputed result lies in [MIN_RESULT 1, MAX_MULTIPLIER 1e6] on the 2-dp '
        + 'lattice; the win-rule half is Step 6' },
    { id: 'LIMBO-17', coverage: 'full',
      note: 'floor half: 116 production rounds served at R = 1, 66 of them with the raw formula below 1 (the clamp fired); the '
        + 'tie half is Step 6; the cap half is Step 25 (production verifier probes; no settled round at the cap, L4)' },
    { id: 'LIMBO-08', coverage: 'full',
      note: 'draw-bias bound computed from the same maxFair rule the draw applies and ASSERTED: maxFair = '
        + '4,200,000,000 = 42 x 1e8, a whole number of ranges, per-value bias exactly 0 (<= 2^-32); rejected tail '
        + '94,967,296 of 2^32 chunk values (2.2111%) printed; rejection census over the production capture: 135 rounds had '
        + 'their first chunk rejected and all reproduce, so the operator applies the guard' },
  ] },
  6: { claims: [
    { id: 'LIMBO-10', coverage: 'full',
      note: 'win == (recomputed R >= target) reproduces the served win flag on every bet; no served result or win '
        + 'field is read while deriving it' },
    { id: 'LIMBO-17', coverage: 'full',
      note: 'tie half: 2 production rounds land exactly on the target (6.78 expected from the bets placed) and both '
        + 'settle as wins (>=), a rule a strict > model would flip on 2 bets; 12 rounds land one tick below their target and '
        + 'all settle as losses; floor half: all 116 recomputed floor rounds settle as losses and '
        + 'MIN_RESULT < MIN_MULTIPLIER is asserted' },
  ] },
  7: { claims: [{ id: 'LIMBO-07', coverage: 'full',
    note: 'determinism half: the full derivation run twice and in reverse order agrees with itself' }] },
  8: { claims: [{ id: 'LIMBO-13', coverage: 'full',
    note: 'on every win the multiplier the casino served in its production place-bet reply (outcome.multiplier, the '
      + 'dataset\'s multiplier column) equals the target, bit-exact (the payout is Step 9); the edge sits in the result numerator '
      + 'N = 9.9e9, which every settled production result confirms (Step 5); '
      + 'the dataset carries no operator win-chance or edge field, so the derivation can read none' }] },
  9: { claims: [{ id: 'LIMBO-11', coverage: 'full',
    note: 'winning credit x 1e8 == hundredths(stake) x hundredths(target) x 1e4, exact integer identity; loss half is Step 10' }] },
  10: { claims: [{ id: 'LIMBO-11', coverage: 'full', note: 'loss half: winningAmount == 0 and multiplier == 0 on every loss' }] },
  11: { claims: [{ id: 'LIMBO-14', coverage: 'full',
    note: 'every target a 2-dp value in [1.01, 10,000], every stake the planned stake of its phase; the largest exposure the '
      + 'casino accepted is measured and printed as a measured maximum; maximum payout and exposure limit are declared '
      + 'undeclared (no bet was refused); the target-bound half is Step 17' }] },
  12: { claims: [
    { id: 'LIMBO-05', coverage: 'full', note: 'bets, seeds, runs and each epoch\'s size bound to src/config.ts (EXPECTED_*, CAPTURE_PLAN); header and record tags reconciled, never the denominator' },
    { id: 'LIMBO-26', coverage: 'full', note: 'dataset SHA-256 equals DATASET_SHA256; the loader aborts before any step on a mismatch' },
  ] },
  13: { claims: [
    { id: 'LIMBO-05', coverage: 'full', note: 'per-phase and per-plan-entry counts and stakes asserted against EXPECTED_PHASES / EXPECTED_PHASE_IDS both ways; the 50-target '
      + 'ladder asserted against PROD_TARGET_LADDER (Phase A each target exactly 100 times, Phase D exactly 10) and reconciled with meta.ladder; '
      + 'the top-up asserted as 50 rounds in [1000, 10000) and 50 at exactly 10,000x' },
    { id: 'LIMBO-12', coverage: 'full',
      note: 'Phase C: 238 production rounds at 10.00 USDT (100 times the base stake) on the fixed target 2.00x; every one '
        + 'recomputes from its revealed seed and settles by the base-stake rule (win == R >= target, credit == stake x target, '
        + 'multiplier == target); 114 wins went through the payout path (floor 100). 2.00x is not on the 0.10 ladder, so the '
        + 'comparison is rule against rule, not round against round' },
    { id: 'LIMBO-15', coverage: 'full',
      note: 'Phase A coverage asserted against PLANNED_TARGET_DECADES with the 50-per-decade floor: 10^0 2,500, 10^1 2,400, '
        + '10^2 100, 10^3 50, 10^4 50 (all at exactly 10,000x, the one target of that decade inside the audited range); minimum '
        + 'target 1.01x played; highest target 10,000x, 0 rounds above it; 102 distinct targets. Disclosed: none of the 100 '
        + 'rounds at 1,000x and above won, so no production win was paid above 100x' },
  ] },
  14: { claims: [{ id: 'LIMBO-18', coverage: 'full',
    note: 'negative control (rejects a result one 2-dp tick away, NaN, Infinity) + boundary anchor over all captured targets from the grid alone' }] },
  15: { claims: [
    { id: 'LIMBO-18', coverage: 'full',
      note: 'winning draws on the 1e8 grid == floor(N/ci) for every captured target, plus four literal full-grid tallies (1.01x, 2x, 100x, 10,000x)' },
    { id: 'LIMBO-13', coverage: 'full',
      note: 'the win chance of the formula equals the probability the result formula delivers, integer identity; the '
        + 'production game page states two of these figures (49.5% at 2x, 0.0099% at 10,000x) and both match' },
  ] },
  16: { claims: [{ id: 'LIMBO-19', coverage: 'full',
    note: 'the edge is derived in exact integers at every 2-dp target of the audited range, 1.01x to 10,000x (the lowest and '
      + 'highest target settled on production; the range the RTP-CLAIM rule is scored on), and min/max/where/count off 1.00% '
      + 'are printed: 0 of 999,900 targets beyond the 0.1 pp band, so PASS; inside it 999,618 are off 1.00%, always on the '
      + 'house side, by at most 0.009982 pp (1.009982% at 9,989.91x). A target more than the band from the claim would be a '
      + 'FLAG (origin operator). The floor edge >= 1.00% is also asserted at all 99,999,900 2-dp values up to the result cap, '
      + 'printed as arithmetic about the formula: whether a target above 10,000x can be played is not established' }] },
  17: { claims: [{ id: 'LIMBO-14', coverage: 'full',
    note: 'target-bound half, stated from production only: every target played lies in [1.01, 10,000]; 50 rounds were '
      + 'accepted and settled at exactly 10,000x and none was placed above it; whether a higher target is accepted is NOT '
      + 'established (no refused bet is held; the one record is a production verifier reply, HTTP 400 on target 100000, '
      + 'evidence/E03, read by the step); the game page\'s own text uses 10,000x as its top example; the result cap is '
      + '1,000,000x (Step 25); maximum payout and exposure are undeclared' }] },
  18: { claims: [{ id: 'LIMBO-06', coverage: 'full',
    note: 'every one of the 5,838 rounds settled under a client seed the auditor submitted and recomputes; Phase D: 500 '
      + 'rounds in 5 epochs under 5 distinct player-set seeds (\'pfaudit-prod-limbo-d<k>-\' + 12 hex), each round under its '
      + 'epoch\'s seed, none outside Phase D; the Phase D seeds are not predictable (6 CSPRNG bytes each), which the step '
      + 'prints; model-rate gate over all 5,838 (wrong seed and EMPTY-SEED control each leave 0 draws unchanged against '
      + 'floor(E + 5 sqrt(E)) = 0, E = n/1e8); the generators of both seed shapes as the runs\' headers describe them '
      + '(crypto.getRandomValues); every epoch\'s commitment published before the rotation that submitted its seed' }] },
  19: { claims: [
    { id: 'LIMBO-26', coverage: 'full', note: 'dataset pin restated in the artifact of record' },
    { id: 'LIMBO-27', coverage: 'full',
      note: 'every artifact of record pinned in src/config.ts and recorded in artifactHashes (the dataset, '
        + 'the verifier probe records, the simulation artifacts), un-ignored by name in .gitignore, free of run '
        + 'metadata, never written by verify (outputs/run/ only); every numeric leaf of the two pinned JSON artifacts carries a '
        + 'declared value domain (src/domains.ts); Pass-1 grid half is Step 23' },
  ] },
  20: { claims: [
    { id: 'LIMBO-11', coverage: 'full',
      note: 'outcome and credit fully determined by (seeds, nonce, target, stake), no served outcome field read' },
    { id: 'LIMBO-12', coverage: 'full',
      note: 'both stakes (0.10 and 10.00 USDT) go through the same determined-settlement chain; the Phase C counts are Step 13' },
  ] },
  22: { claims: [{ id: 'LIMBO-22', coverage: 'full',
    note: 'recomputed draws in capture order: 100-bin chi-squared and KS against U(0,1) (the fit of P(R >= x), R being '
      + 'monotone in k), point mass at R = 1 counted separately as a binomial z, lag-1 z and runs test; thresholds '
      + 'fixed in code on 2026-09-26; informational (policy INFORMATIONAL): a deviation is INFO — reported, never '
      + 'counted, verdict unchanged — shown able to fire by the sorted-draws mutation' }] },
  23: { claims: [
    { id: 'LIMBO-20', coverage: 'full',
      note: '2,000,000 uniformity draws (100-bin chi-squared) + lag-1 and runs from stored integer sums, family-wise '
        + 'alpha 0.01; RTP convergence at 9 targets (1.01x..10,000x, decades 10^0..10^4) x 1,000,000 rounds against '
        + 'the EXACT win probability floor(N/ci)/1e8, band 5 sd + 1 count; every statistic re-derived here from the artifact\'s integer rows; '
        + 'the experiment is seeded from a recorded master seed, its prefixes replayed on every run, and all 11,000,000 '
        + 'draws replayed byte for byte by npm run pass1:check (test:full)' },
    { id: 'LIMBO-27', coverage: 'full', note: 'pass1-grid.json pinned (PASS1_GRID_SHA256) and rejected if it carries run metadata' },
  ] },
  24: { claims: [{ id: 'LIMBO-21', coverage: 'full',
    note: 'every revealed production seed (33) x 10,000 nonces re-derived in verify from the dataset (src/pass2.ts, deterministic, '
      + 'no random number); early window = the captured nonces of the epoch, reference = the other full windows of the same '
      + 'size (49 of 200, 99 of 100 or 83 of 119); statistic = the unit-stake return of the targets the casino served in that '
      + 'epoch, standardised by the exact per-target mean and variance (floor(N/ci)/RANGE); exact permutation null for the '
      + 'captured window\'s rank; one-sided rule fixed in code on 2026-09-26, before any production capture (the window '
      + 'follows each epoch\'s planned size, set on 2026-11-10, after the captures), Z < -3.090 (alpha 0.001); direction '
      + 'split and detection power printed; window 0 replays every captured result. The early/late chi-squared screen '
      + '(first 50 captured nonces vs the first 50 after the epoch) is counted against its EXACT multinomial null (p0 '
      + 'computed, not assumed) and its binomial rule is scored too; the committed pass2 block must equal the re-derivation' }] },
  25: { claims: [
    { id: 'LIMBO-17', coverage: 'full',
      note: 'cap half, by operator-verifier probes: six logged-out production verifier requests of 9 November 2026 on five unsettled '
        + 'draws of revealed seeds (evidence/E02, pinned) are recomputed from src/; on the four requests (three distinct draws) whose raw value is above '
        + '1,000,000 the verifier reports 1,000,000, on the one at exactly 1,000,000 it reports 1,000,000, and on the control '
        + 'just under it reports the uncapped value. No settled round is at the cap (L4). Tie and floor: the verifier says WIN '
        + 'on the 2 tie rounds and LOSS on the 116 floor rounds. The same step holds the verifier\'s result, win flag and '
        + 'multiplier equal to the settled round and to this package\'s recomputation on 5,838 of 5,838 rounds' },
  ] },
  21: { claims: [], reason: 're-checks L1-L5 against the dataset on every run and fails if one stops being true (L1: the capture host is liqd.com); '
    + 'recomputes the figures quoted for L7 and L8; L6 is restated, not measured; the register itself is '
    + 'LIMBO-30, a package check' },
};

/** Checks this casino's design makes inapplicable, each the false `applies` predicate in the profile. */
export const NOT_APPLICABLE: Array<{ id: string; reason: string }> = [
  { id: 'LIMBO-16',
    reason: 'applies={path: money.balanceField, notNull: true} is false — money.balanceField is null: the capture '
      + 'carries no running wallet-balance ledger (L3). The stakeWallet / winningAmountWallet settle-response fields '
      + 'are reconciled against the game fields in Step 11, which the profile does not count as a balance ledger' },
  { id: 'LIMBO-31',
    reason: 'applies={path: gameModel.scalingEdge.presentAtCapture, eq: true} is false — no stake- or exposure-'
      + 'dependent edge was seen: 238 rounds at 10.00 USDT settle by the rule of the 0.10 rounds (Step 13), the win chance '
      + 'has no stake input, and the edge dispersion Step 16 measures is a function of the target, not of the stake. The '
      + 'casino\'s configuration is not held by this audit, so this rests on the settled rounds at two stakes' },
];

/** Checks a package artifact answers rather than a scored step. `none` = the artifact does not exist. */
export const PACKAGE_CHECKS: Array<{ id: string; artifact: string; coverage: Coverage | 'none'; note: string }> = [
  { id: 'LIMBO-09', artifact: 'docs/ALGORITHM.md + tests/limbo/RngSpecTests.ts + tests/limbo/rngTests.ts + tests/limbo/resultFloorTests.ts', coverage: 'partial',
    note: 'src/rng.ts is built from the written specification docs/ALGORITHM.md, and RngSpecTests.ts runs the spec\'s '
      + 'vectors against it; every vector is a settled production round of the dataset or a production verifier reply '
      + '(evidence/E02), including first-chunk-rejected rounds, result-floor rounds and the result-cap probes. PARTIAL: the '
      + 'package ports no operator source file, so there is no operator source line to cite; the anchor is the casino\'s own '
      + 'verifier and settled rounds' },
  { id: 'LIMBO-23', artifact: 'exploit-testing.md', coverage: 'full',
    note: 'the standardized framework matrix S5-1..S5-8 (seed substitution, client-seed manipulation, stake-conditional '
      + 'outcome, cherry-picking, rotation race, multiplier tampering, nonce manipulation, modulo bias), each row one '
      + 'verdict tied to a step or disclosed as not tested' },
  { id: 'LIMBO-24', artifact: 'none', coverage: 'none',
    note: 'LIQD publishes a verifier (POST /api/v1/originals/limbo/verify), so the check applies; Step 25 holds this package to '
      + 'that verifier on every settled round. The ProvablyFair.org verifier at provablyfair.org/verify-bets/liqd covers limbo '
      + '(README and MANIFEST "Verify a bet" name it first); this package does not record a hash of that verifier\'s code '
      + 'against computeResult, which is what the check asks for' },
  { id: 'LIMBO-25', artifact: 'MANIFEST.md#verify-a-bet', coverage: 'full',
    note: 'MANIFEST "Verify a bet" states, in order and in the declaration\'s field names: where the seed is revealed, the fields to '
      + 'paste (hashedServerSeed, serverSeed, clientSeed, nonce, params.target, betAmount), the commitment encoding '
      + 'SHA-256(utf8(serverSeed)), the draw and result formula, the >= win rule, and the credit; worked production rounds in '
      + 'the same section' },
  { id: 'LIMBO-28', artifact: 'package.json + .nvmrc + verify.js/test.js + src/simulate.ts', coverage: 'full',
    note: 'npm test reproduces the verdict with the runtime pinned and the audit ID assigned; test:full writes every '
      + 'regeneration to outputs/run/ and requires each to equal the committed artifact: the Pass-1 grid (pass1:check), '
      + 'the Pass-2 block (pass2:check) and the whole outputs/simulation-results.json and rtp-convergence.html '
      + '(simulate:check, byte for byte, seeds from the recorded SIM_MASTER_SEED); verify\'s own reproduction diff is '
      + 'outputs/run/diff.json' },
  { id: 'LIMBO-29', artifact: 'tests/mutations.json + tests/structural-forgeries.json + tests/mutation-survivors.json', coverage: 'full',
    note: '100 entries: 64 single-file mutations, 36 structural forgeries and other non-step kills, 0 declared survivors, '
      + 'run by tests/mutate.ts in a disposable copy (npm run mutate); the result of the run of record is in '
      + 'exploit-testing.md. Dataset forgeries re-pin the production dataset as a forger would; the runner restores it between entries' },
  { id: 'LIMBO-30', artifact: 'MANIFEST.md#limitations-and-trust + evidence.md', coverage: 'full',
    note: 'MANIFEST carries the limitations register with magnitudes and the Load-Bearing Premises table; '
      + 'evidence.md numbers exhibits from E01' },
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
