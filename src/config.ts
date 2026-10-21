/**
 * LIQD Limbo game math.
 *
 * Limbo is a single-draw "crash target" game. The player picks a TARGET multiplier m
 * (a 2-decimal value in [1.01, 1,000,000]); the round produces a RESULT multiplier R from
 * one bias-free draw; the bet WINS iff R >= m and pays stake·m, else pays 0.
 *
 * ── Provenance of every constant and formula in this file ──────────────────────────────
 * These are NOT assumed. They were read directly out of the operator's own client bundle
 * (the Limbo constants module, chunk `2zi3lf-yv26no.js`, functions `ci`/`cr` and the
 * `LIMBO_*` exports) during the 2026-09-07 recon session, and the result formula was then
 * confirmed against FOUR live values produced by LIQD's own Provably-Fair "Verify"
 * calculator (evidence/E12) for a fixed seed pair:
 *     serverSeed 000…0001, clientSeed "abc":  nonce 0 → 1.71×, 1 → 2.65×, 2 → 1.04×, 3 → 20.14×
 * All four reproduce bit-for-bit under resultMultiplier() below (tests/limbo/rngTests.ts).
 * The audit's binding RNG anchor is the money-settled dataset: every captured bet's served
 * R must equal resultMultiplier(k) recomputed from the revealed serverSeed (verify Step 5–6).
 *
 * The operator's source, decoded:
 *     ci(e) = Math.round(100 * e)                 // target → integer hundredths
 *     cr(e) = Math.floor(99e8 / ci(e))            // WIN-CHANCE in 1e-8 units  (99e8 = 9.9e9)
 *     LIMBO_MAX_MULTIPLIER          = 1e6
 *     LIMBO_MAX_WIN_CHANCE_PERCENT  = floor(99e8 / ci(1.01)) / 1e8 * 100 = 98.019801
 *     LIMBO_MIN_MULTIPLIER          = 1.01
 *     LIMBO_MULTIPLIER_DECIMALS     = log10(100) = 2
 *
 * ── House edge is a CLOSED-FORM identity, not a measured average ────────────────────────
 * Because a legal target m is a 2-dp value, ci(m) = round(100·m) = 100·m exactly, so the
 * served win chance is
 *     p(m) = floor(N / (100·m)) / RANGE            with N = (1 − edge)·SCALE·RANGE = 9.9e9
 *          = floor(9.9e7 / m) / 1e8
 * and the return to player is
 *     RTP(m) = p(m) · m = floor(9.9e7 / m) · m / 1e8  ≤  9.9e7 · m / (m · 1e8)  =  0.99.
 * The floor can only LOWER the payout, never raise it, so RTP(m) ≤ 0.99 for EVERY legal
 * target — the house edge is provably ≥ 1.00% on every bet, and exactly 1.00% when ci(m)
 * divides 9.9e9 evenly (e.g. m = 2.00 → p = 0.495, RTP = 0.99).
 *
 * ── The edge is NOT flat above the operator's UI cap — CORRECTED 2026-09-23 ─────────────
 * An earlier version of this header said the edge was "marginally more otherwise" and that
 * "the edge is flat". Both were wrong, and wrong in the direction that flatters the
 * operator. `edge(ci) = (RANGE·SCALE − N + (N mod ci)) / (RANGE·SCALE)`, so the excess over
 * 1.00% is driven by `N mod ci` and grows with ci. Enumerating ALL 99,999,900 legal targets
 * (Step 16 now does this on every run, ~1s):
 *     worst legal target      990,000.01× → 1.989999%   (not playable, see MAX_PLAYABLE_TARGET)
 *     worst PLAYABLE target   497,487.44× → 1.497487%
 *     at or below UI_MAX_TARGET              ≤ 1.009982% (at 9,989.91×)
 *     first target above 1.01%  10,009.10×
 *     94,389,859 of 99,999,900 legal targets carry an edge above 1.01%; only 410 are exactly 1.00%.
 * The reason the original capture never saw this: every high target it used (100×, 1,000×,
 * 100,000×, 500,000×) happens to divide 9.9e9 evenly, so the curve read flat across the
 * 1,104 captured targets (max witnessed 1.000041% at 43.86×).
 *
 * Mechanically this is a SAME-ODDS / DIFFERENT-PAYOUT effect: targets sharing one value of
 * cr(m) = floor(9.9e9/ci) share an IDENTICAL win chance but are each paid their own
 * multiplier. Within such a group RTP = cr·ci / 1e10 rises with ci, so only the LARGEST
 * member is priced as well as those odds allow and every smaller member is strictly
 * dominated — same win chance, strictly lower payout. Only 198,798 of 99,999,900 legal
 * targets (0.199%) are the best-priced member of their group.
 *
 * CORRECTED 2026-09-23: an earlier version of this paragraph said the largest member is
 * "priced at 99.00%". It is not, and the two figures in this header disprove it on their own
 * — there are 198,798 group maxima but only 410 targets at an exact 1.00% edge. Measured
 * directly: of 193,947 group maxima with ci in [101, 2,000,101], just 305 land on 1.00%.
 * Being the group maximum buys the best RTP available at those odds, not a 99.00% one.
 *
 * The effect is visible in the operator's own UI. Observed in a browser session on
 * 2026-09-23: 9,999× and 10,000× are both quoted at win chance 0.009900%, paying 9,999.00×
 * and 10,000.00× respectively — identical odds, a 1× difference in payout, and the edge is
 * 1.009900% at 9,999× against 1.000000% at 10,000×. (Those two edge figures are arithmetic
 * on the formula above, not a live measurement.)
 *
 * NOT RETAINED, AND THEREFORE NOT CITED AS EVIDENCE: there is no `evidence/E16` artifact in
 * this repository, and no bet at 9,999× exists in the shipped dataset or in
 * capture/outputs/ — checked 2026-09-23. An earlier draft of this header said a settled
 * $0.10 bet at 9,999× had confirmed the server does not snap the target up. Nothing in this
 * package backs that, so the claim is withdrawn rather than left standing: whether the
 * server accepts a target the UI would have clamped is UNVERIFIED here. The same-odds/
 * different-payout arithmetic above stands on its own — it is a property of the pricing
 * formula, enumerated by Step 16, and needs no live witness.
 *
 * Still NO stake-dependent / scaling edge here — the
 * dispersion is a function of the TARGET, not of the stake.
 */

// ── Draw domain ────────────────────────────────────────────────────────────────────────
// k is a bias-free uniform integer in [0, RANGE) from the shared LIQD fast-games RNG
// (HMAC-SHA256 keyed by the hex-decoded server seed over `clientSeed:nonce:cursor`), cursor 0.
export const RANGE = 100_000_000;   // draw domain 0 .. 99_999_999  (1e8)
export const CURSOR = 0;            // fixed HMAC cursor for the single limbo draw

// ── Operator constants (from the client bundle) ────────────────────────────────────────
export const HOUSE_EDGE = 0.01;
export const MULTIPLIER_DECIMALS = 2;
export const MULTIPLIER_SCALE = 100;             // 10 ** MULTIPLIER_DECIMALS
export const MIN_MULTIPLIER = 1.01;              // minimum LEGAL target (LIMBO_MIN_MULTIPLIER)
export const MAX_MULTIPLIER = 1_000_000;         // maximum target AND result cap (LIMBO_MAX_MULTIPLIER)

/**
 * RESULT floor — the smallest multiplier the operator will serve. NOT the same number as
 * MIN_MULTIPLIER (1.01), which is the smallest legal TARGET.
 *
 * WITNESSED on 2026-09-11 in an earlier capture run that is not shipped (serverSeed 5d8a6efd…,
 * nonce 49, k = 99,588,964): the raw formula gives floor(9.9e9 / 99,588,965) / 100 = 0.99, and the
 * operator served R = 1 (tests/limbo/resultFloorTests.ts). The first clamped round in the SHIPPED
 * dataset is epoch 3 nonce 29 (k = 99,762,668). A limbo multiplier below 1.00 has no meaning — a round
 * pays stake x target or nothing.
 *
 * Not an edge case: the raw value falls below 1 for every k > 98,999,999, i.e. 1,000,000 of the
 * 100,000,000 possible draws — ~1% of any capture. In the shipped dataset 147 rounds were served at
 * R = 1 and the clamp changed the value on 78 of them (Step 5).
 *
 * It changes the reported RESULT, never the outcome: R = 1 loses against every legal target
 * (>= 1.01), exactly as the unclamped 0.99 would have, so no win chance or edge figure moves.
 */
export const MIN_RESULT = 1;

/**
 * N = (1 − HOUSE_EDGE) · MULTIPLIER_SCALE · RANGE = 0.99 · 100 · 1e8 = 9.9e9.
 * The SAME constant drives BOTH the win chance (cr) and the result multiplier — the two are
 * two faces of one identity, which is why P(R ≥ m) equals the served win chance exactly.
 * Kept as an assertion rather than the literal 9.9e9 so the tie to (edge, scale, range) is
 * explicit and a future edge change would flow through consistently.
 */
export const RESULT_NUMERATOR = (1 - HOUSE_EDGE) * MULTIPLIER_SCALE * RANGE;   // 9_900_000_000

// Simulation sample depths. Read by src/simulate.ts (the producer) AND by Step 19, which binds
// them to the depths the artifact records rather than trusting the artifact's own header (G-BIND):
// pass1.draws must equal SIM_UNIFORMITY_DRAWS, every effective-edge sample must carry
// n == SIM_EDGE_BETS, and the stored lag-1 Z must be recoverable as r1 * sqrt(SIM_SERIAL_DRAWS)
// at the artifact's own precision. Exported constants that no test reads would let a cheap run be
// presented as the deep one.
export const SIM_UNIFORMITY_DRAWS = 2_000_000;
export const SIM_SERIAL_DRAWS = 200_000;
export const SIM_EDGE_BETS = 2_000_000;
// The legacy producer (src/simulate.ts) drew its Pass-1 seeds from crypto.randomBytes until 2026-09-26,
// so `npm run simulate -- --run` could never reproduce the committed artifact. Every one of its seeds is
// now sha256(SIM_MASTER_SEED|stream|n) (32 hex, operator format), the artifact records this value as
// pass1.masterSeed and Step 19 requires it to equal this constant; `npm run simulate:check` (in test:full)
// regenerates the whole artifact into outputs/run/ and requires it byte for byte (profile LIMBO-28).
export const SIM_MASTER_SEED = 'pf.org/liqd-limbo/simulate/2026-09-26';
// ── Pass 1 on a pinned master seed (src/pass1-grid.ts → outputs/pass1-grid.json, scored by Step 23) ──
// Every seed is sha256(PASS1_MASTER_SEED|stream|block), so the experiment is replayable byte for byte.
// Depths meet the profile floor (LIMBO-20): >= 2,000,000 uniformity draws and >= 1,000,000 rounds on
// each of >= 9 targets spanning the low and high decades. Step 23 binds the artifact to these.
export const PASS1_MASTER_SEED = 'pf.org/liqd-limbo/pass1/2026-09-26';
export const PASS1_UNIFORMITY_DRAWS = 2_000_000;
export const PASS1_ROUNDS_PER_TARGET = 1_000_000;
export const PASS1_TARGETS: readonly number[] = [1.01, 1.5, 2, 5, 10, 50, 100, 1_000, 10_000, 100_000];
export const PASS1_MIN_TARGETS = 9;
export const PASS1_PREFIX_DRAWS = 50_000;
export const PASS1_PREFIX_ROUNDS = 20_000;
export const PASS1_BINS = 100;
export const PASS1_EPOCH = 50;
/** Family-wise level for the three uniformity/serial tests (Bonferroni inside Step 23). */
export const PASS1_ALPHA = 0.01;
/** Per-target convergence band: |wins − n·p| <= PASS1_SIGMAS·sqrt(n·p·(1−p)) + 1 (one-count buffer). */
export const PASS1_SIGMAS = 5;
/** Pin of outputs/pass1-grid.json, enforced by Step 23. Regenerate only with `npm run pass1` and re-pin here. */
export const PASS1_GRID_SHA256 = '9999f98ba17fe534b5350274da8e423aa6c1c096f4e136d40daec60a0cbdcae7';

// ── Captured dataset — FROZEN 2026-09-11 ──────────────────────────────────────
// The artifact of record. Every scored step reads this file and nothing else; the loader recomputes
// the hash and refuses to run on a mismatch, so a hand-edit fails before a single step is scored.
export const DATA_PATH = 'data/limbo-master-6700bets.json';
export const DATASET_SHA256 = '8e3ce5b5e1494d1fcc3a783965d3ba7b6a7099f120a64d61e21a577098c07334';

// Population pins. These come from the CAPTURE PLAN, not from the dataset's own header — a count a
// forger supplies is a count a forger chooses (G-BIND: a row count is not an identity).
export const EXPECTED_BETS = 6_700;
export const EXPECTED_SEEDS = 134;
export const EXPECTED_EPOCH_SIZE = 50;
/**
 * Nonce gaps the CAPTURE LOG attributes to an auditor-side retry (profile LIMBO-04): a round the rig
 * placed but failed to record. Each entry is disclosed by Step 4 as a FLAG with origin = capture —
 * never a PASS, never a fail against the operator — provided the revealed seed still reconstructs
 * every recorded round of that epoch. A gap NOT listed here is unexplained and HARD-FAILS. This
 * capture has none: every epoch is contiguous 0..49 (Step 4).
 */
export const DECLARED_CAPTURE_GAPS: ReadonlyArray<{ epoch: number; nonce: number }> = [];

// Phase plan as executed. Phase B's fourth tranche targets 500,000x, NOT the 1,000,000x maximum target
// in LIQD's client code: at the $0.10 minimum bet a 1,000,000x bet needs $100,000 of exposure against a
// $50,000 ceiling, so on 2026-09-11 that maximum could not be played at any legal stake (E15, Step 17).
export const EXPECTED_PHASES = {
  A: { bets: 5_000, stake: 0.10 },
  B: { bets: 1_000, stake: 0.10, targets: [100, 1_000, 100_000, 500_000] },
  C: { bets: 200, stake: 10 },
  D: { bets: 500, stake: 0.10 },
} as const;

// Operator limits. maxExposure is a WITNESSED enforcement (3138). minBet is INFERRED, not probed —
// see the note on MIN_BET_USDC below; an earlier version of this comment claimed both were
// witnessed and it was wrong.
// maxBetUsdc is a client config field we never saw enforced. Keep them apart — the dice audit's
// central finding was a config field that was not the ceiling.
/**
 * INFERRED, not witnessed. The client config field is $0.10, and a bet at the 1,000,000x target
 * was refused with BetAmountIsNotInLimitError (3113) — but `evidence/E15` records `requestedStake:
 * 0.1` on BOTH refusals, so the $0.05 retry the rig computed was never actually recorded landing.
 * What we have is: $0.10 at 1,000,000x refused by the exposure rule (3138), and a refusal carrying
 * 3113 whose stake we cannot evidence.
 *
 * "Witnessed: $0.05 refused, errorCode 3113" would overstate what the evidence file holds, and
 * that is precisely the class of claim this audit exists to catch — a limit read off a config
 * field and narrated as an observed enforcement. A standalone below-minimum probe is on the
 * recapture list.
 */
export const MIN_BET_USDC = 0.1;
export const MAX_EXPOSURE_USDC = 50_000;          // DERIVED from one refusal: maxAllowedBetUsdc 0.05 at 1e6
export const MAX_PLAYABLE_TARGET = 500_000;       // MAX_EXPOSURE_USDC / MIN_BET_USDC

/**
 * The operator's CLIENT-SIDE target ceiling — OBSERVED in the browser 2026-09-23 on
 * qa.liqd.com/originals/limbo: typing 400000 into the Multiplier field rewrote it to 10000.00
 * (win chance 0.009900%, "Payout on Win: 10000.00x").
 *
 * EVIDENCE GRADE, stated because it is weaker than everything around it: this is a session
 * observation with NO RETAINED ARTIFACT in this repository. There is no evidence/E16 — the
 * evidence directory holds E13, E15, E20 (the 2026-09-26 probe journals) and the 2026-10-01 page-labels
 * file, none of which records this UI observation. Do not cite an E16; it does not exist.
 *
 * This is a UI-layer limit ONLY, and the distinction is load-bearing for the edge finding:
 * the first target whose edge exceeds 1.01% is 10,009.10x, i.e. just ABOVE this cap, so a
 * player entering a target in that field does not reach an edge above 1.009982%. On
 * 2026-09-11 the SERVER did not enforce the same ceiling — that capture placed and settled 500
 * bets above it through POST /originals/limbo/place-bet (250 at 100,000x, 250 at 500,000x, all at
 * the $0.10 minimum; re-counted from the shipped dataset 2026-09-23), which is where the
 * material dispersion lives.
 *
 * 2026-09-26: the API did not settle the one target probed above 10,000x (93,830.94x;
 * LIVE_TARGET_CEILING below, evidence/E20, Step 25) and the server's reply was not saved.
 * 2026-10-02: the cap re-probe (evidence/E21, CAP_PROBE_* below) saved the server's replies — four requests
 * from 100,101.12x to 990,000.01x refused, HTTP 400, errorCode 3001, "Too big: expected number to be
 * <=10000" — so the server ceiling and this UI ceiling coincide on qa.liqd.com on those two days. Still NOT established: whether any OTHER
 * input path in the UI (slider, win-chance field) enforces the same clamp. Nothing in the scored
 * path depends on this constant being the operator's true ceiling — Step 16 reports the
 * sub-cap worst case as one figure among several and would still be correct if the cap moved.
 */
export const UI_MAX_TARGET = 10_000;
/**
 * TARGET COVERAGE PLAN BY DECADE (profile LIMBO-15), read from the capture plan, not from the data:
 * Phases A and D draw a win chance uniformly in [2%, 98%] (capture/capture-limbo.reference.mjs
 * randTarget), i.e. targets 1.01x..49.5x — decades 10^0 and 10^1; Phase B places fixed tranches at
 * 100x, 1,000x, 100,000x and 500,000x — decades 10^2, 10^3 and 10^5. The value is the minimum number of
 * bets the plan puts in that decade. Decade 10^4 (10,000x..99,999.99x) is NOT in the plan: a
 * capture-origin coverage gap, disclosed by Step 13, never scored against the operator.
 */
export const PLANNED_TARGET_DECADES: Readonly<Record<number, number>> = { 0: 50, 1: 50, 2: 250, 3: 250, 5: 500 };
/** Phase C must put at least this many ELEVATED-STAKE WINS through the payout path (profile LIMBO-12). */
export const PHASE_C_MIN_WINS = 100;

/**
 * ══════════════════════════════════════════════════════════════════════════════════════
 *  THE TARGET-DECADE SUPPLEMENT — capture v2, 2026-09-26 (R10). A SUPPLEMENT, NOT A REPLACEMENT.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * data/limbo-master-6700bets.json stays the population Steps 1–24 score. The supplement is 300
 * Phase-A rounds (phase label `A2`) captured by capture/capture-limbo-v2.mjs on 2026-09-26 to close
 * profile LIMBO-15 (Phase A >= 50 bets per decade the plan declares): 100 in decade 10^2, 100 in
 * 10^3, 100 at exactly 10,000x (decade 10^4 holds ONE legal target under the live ceiling below).
 * It is scored by Step 25 alone; no figure from it enters Steps 1–24, the simulations or the RTP.
 * Both files are vendored byte-identical from capture/out/ and pinned here. The journal is the
 * capture's append-only record: the dataset JSON is a view rebuilt from it, and Step 25 requires
 * the two to agree bet for bet.
 *
 * The population is bound in source, never read from the file's own `meta` (G-BIND).
 */
export const SUPPLEMENT_DATA_PATH = 'data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json';
export const SUPPLEMENT_DATASET_SHA256 = 'a2dee374cfd48c62736cf5958fd67f42b1cb7c622ab0883c3f84278d8429ab1e';
export const SUPPLEMENT_JOURNAL_PATH = 'data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.journal.ndjson';
export const SUPPLEMENT_JOURNAL_SHA256 = 'bcacab9c674df62a3b2219cba008542f2e798e9c81559c6321489e1a43949c32';
export const SUPPLEMENT_EXPECTED_BETS = 300;
export const SUPPLEMENT_EXPECTED_SEEDS = 6;
export const SUPPLEMENT_PHASE = 'A2';
export const SUPPLEMENT_STAKE = 0.1;
/** Decade → rounds the v2 plan places in it (capture/capture-limbo-v2.mjs, 100 per decade). */
export const SUPPLEMENT_DECADES: Readonly<Record<number, number>> = { 2: 100, 3: 100, 4: 100 };
/**
 * The run was paused ONCE and resumed (after epoch 0's 50 bets, before its rotation; reported by the capture
 * operator as a rate limit — the journal records only the stop and the resume).
 * The capture core journals a `resume-check` — the operator's active seed and nonce read back before
 * anything else is sent — and a second `meta` line. Declared here so Step 25 asserts the count both
 * ways: an undeclared resume, or a declared one that is not in the journal, fails.
 */
export const SUPPLEMENT_DECLARED_RESUMES = 1;
/** Profile LIMBO-15 floor: Phase A bets per declared decade. */
export const PHASE_A_DECADE_FLOOR = 50;

/**
 * THE LIVE TARGET CEILING — 10,000x, from the 2026-09-26 probe (evidence/E20) and the 2026-10-02 cap
 * re-probe (evidence/E21). Step 25 judges it (profile LIMBO-14), worded with dates: on 2026-09-11 the
 * server accepted and settled targets up to 500,000x; the 2026-09-26 probe above 10,000x did not settle
 * and its reply was not saved; on 2026-10-02 the re-probe (capture/PROBE-2026-10-02.md, CAP_PROBE_* below)
 * saved the server's refusal of four targets above the RTP-CLAIM band edge (~100,100x). Until that journal
 * was pinned (2026-10-02) Step 25 carried the audit's one operator FLAG here; with it pinned the step
 * PASSes and prints the 2026-09-11 rounds as history.
 *
 * The audited 2026-09-11 capture placed and settled 500 bets ABOVE 10,000x (250 at 100,000x, 250 at
 * 500,000x) through the same place-bet endpoint. On 2026-09-26 the capture-v2 probe placed a $0.10
 * bet at 10,000x (accepted and settled) and then one at 93,830.94x, which was NOT settled: the probe
 * journal (evidence/E20, 17:43:21 run) records the request intent and no bet, and the next probe's
 * opening read of the same seed shows its nonce at 1 — one round consumed, not two. The error text
 * "Too big: expected number to be <=10000" (errorCode 3001) is a hand-typed note in the header comment
 * of capture/capture-limbo-v2.mjs, copied from the run's terminal output; neither probe journal holds
 * the server's reply. Until 2026-10-02 that one request was the only probe above 10,000x, and 93,830.94x is
 * itself inside the RTP-CLAIM band (98.991642%), so no retained record showed a target outside the band
 * refused; the 2026-10-02 re-probe (E21, CAP_PROBE_* below) is that record.
 *
 * What moved: the server-side ceiling. Of the targets in (10,000x, 500,000x] the audited capture played,
 * 500,000x was re-probed on 2026-10-02 and refused (E21); 100,000x was not re-probed. The audited rounds stay valid
 * records of what the operator settled on 2026-09-11. What is not shown to have moved: the pricing
 * formula (every supplement round recomputes under it, Step 25). MAX_MULTIPLIER as the RESULT cap is not
 * witnessed after the cap (L18).
 */
export const LIVE_TARGET_CEILING = 10_000;
export const LIVE_TARGET_CEILING_WITNESSED = '2026-09-26';
/** The above-ceiling target the 2026-09-26 probe requested and the operator did not settle. */
export const CEILING_PROBE_REFUSED_TARGET = 93_830.94;
/** Probe bets settled at exactly LIVE_TARGET_CEILING across the two 2026-09-26 probe runs (one per run). */
export const CEILING_PROBE_ACCEPTED_AT_CEILING = 2;
export const CEILING_PROBE_DIR = 'evidence/E20-target-ceiling-probe-2026-09-26';
export const CEILING_PROBE_1_JOURNAL = 'liqd-limbo-capture-v2-probe-2026-09-26T17-43-21-558Z.journal.ndjson';
export const CEILING_PROBE_1_SHA256 = 'c2401ee1fe468557585a053377b92e88d0ed7f45ef321a7cec86966abbedd836';
export const CEILING_PROBE_2_JOURNAL = 'liqd-limbo-capture-v2-probe-2026-09-26T17-47-53-359Z.journal.ndjson';
export const CEILING_PROBE_2_SHA256 = '58822ffa99740859c22bf7bae95e6504f1ee4dbaf8bf2f007c4bd5f8e26c53bc';

/**
 * THE CAP RE-PROBE (prepared and RUN 2026-10-02 on qa.liqd.com — capture/PROBE-2026-10-02.md). One $0.10
 * control bet at LIVE_TARGET_CEILING, then one $0.10 request at each CAP_PROBE_TARGETS value, run by
 * `node capture/capture-limbo-v2.mjs --cap-probe`, which journals the server's raw reply (HTTP status
 * and body) to every place-bet request, accepted or refused.
 *
 * RESULT (run 2026-10-02T18:22:46Z, vendored byte for byte from capture/out/ and pinned below): the control
 * settled (served R 5.96, recomputed from the seed its closing rotation revealed); each of the four targets
 * was refused, HTTP 400, errorCode 3001, fields "Too big: expected number to be <=10000" and "must be a
 * multiple of 0.01 between 1.01 and 10000 (win chance 0.009900%–98.019801%)", no nonce consumed, no
 * settlement. A first run at 18:20:11Z placed no bet: the server refused the control on a missing
 * body.stakeCurrency (errorCode 3001; the field was added to the capture script). Its journal sits beside
 * the pinned one in CAP_PROBE_DIR, recorded and not scored.
 *
 * Every target is above the RTP-CLAIM band edge (100,101.12x, the first target more than 0.1 pp below
 * the claim — Step 16) and at most $50,000 of exposure at $0.10 except the last, so a refusal of the
 * first three cannot be the 2026-09-11 exposure rule:
 *   100,101.12x  the first target outside the band (RTP 98.899907%)
 *   497,487.44x  the worst target up to 500,000x (RTP 98.502513%)
 *   500,000x     the exact request settled 250 times on 2026-09-11 (RTP 99%, inside the band) — before/after
 *   990,000.01x  the worst legal target (RTP 98.010001%); $99,000 exposure, so its code says which rule refused it
 *
 * Step 25 reads the journal ONLY when it is vendored into CAP_PROBE_DIR and pinned here: with the two
 * values below null it is not consulted and the FLAG stands. Pinned, every target must show an intent,
 * a saved reply, a journalled refusal that consumed no nonce and no settlement, and the control must
 * settle and recompute — then the FLAG clears and the 2026-09-11 rounds print as history. A pinned file
 * that is absent or does not match its pin FAILs Step 25.
 */
export const CAP_PROBE_TARGETS: readonly number[] = [100_101.12, 497_487.44, 500_000, 990_000.01];
export const CAP_PROBE_DIR = 'evidence/E21-target-cap-probe';
export const CAP_PROBE_JOURNAL: string | null = 'liqd-limbo-cap-probe-2026-10-02T18-22-46-633Z.journal.ndjson';
export const CAP_PROBE_SHA256: string | null = '14f9880eff8294a5a7d8b0ce3fe715093eda5061899713ff87d3c9c098719809';

// ── Simulation artifacts — FROZEN 2026-09-11 ──────────────────────────────────
// ENFORCED by Step 19, which recomputes both digests and fails on a mismatch, on an absent file and
// on one it cannot parse. Read this for what a hash pin is: it establishes that the shipped bytes are
// the bytes this audit read. It does NOT establish that the statistics inside were measured — no
// scored step re-derives one (L9), and a forger re-pins in the same commit (declared survivor).
// RE-PINNED 2026-09-26 (was 9ce82a70…): the generatedAt run-metadata field was removed with the
// producer's own JSON.stringify(…, null, 2) call — 0 values changed (profile LIMBO-27).
// RE-PINNED again 2026-09-26 (was 19aa5314…): the `pass2` block was replaced by the deterministic
// Pass-2 rebuild (src/pass2.ts via `npm run pass2:emit`); the model and pass1 blocks are
// unchanged value for value. Step 24 re-derives the whole pass2 block from the dataset on every run.
// RE-PINNED a third time 2026-09-26 (was 66fa63e0… / html b06dca16…): the Pass-1 half was regenerated from the
// recorded SIM_MASTER_SEED with the producer's own call (`npm run simulate`), replacing the crypto.randomBytes
// draw; every Pass-1 figure moved, the model and pass2 blocks are unchanged value for value. `npm run
// simulate:check` reproduces both files byte for byte (profile LIMBO-28).
export const SIMULATION_SHA256 = '2d609344650eac723c262449fb8929b05c68b75f149ceee708b89ad4ade670cc';
export const SIMULATION_HTML_SHA256 = 'efd121156f8255f391eb9c1b3c6f9f06c008d35807cef9a69b1e82be33fd0d69';

/**
 * PASS-2 CHERRY-PICK SCREEN — CONSTANTS FIXED IN CODE ON 2026-09-26 (src/pass2.ts, re-derived by Step 24),
 * 15 days after the capture and after an earlier screen had run on the same data; no dated registration
 * ships with the package.
 *
 * REBUILT 2026-09-26. This block used to hold the OBSERVED figures of the old screen —
 * 11 flags, an expected 6.365 under an ASSUMED p0 = 0.05 x 0.95 = 0.0475, exact binomial P 0.0550393485 —
 * next to a null drawn from an unseeded bootstrap. Both parts broke audit-rules RULE 22a/22b: the flag
 * count moved between 9 and 11 across re-runs, and the 11th flag (epoch 87) was a 7.1e-15 float wobble.
 * Observed figures no longer live here: they are emitted by the deterministic producer into
 * outputs/simulation-results.json (pass2) and re-derived from the dataset by Step 24 on every run.
 * What stays in code is the rule and its constants:
 */
/** Nonces replayed per revealed seed (profile LIMBO-21 floor: 10,000). */
export const PASS2_NONCES = 10_000;
/** Window = the captured nonce range 0..49, so 200 disjoint windows per seed. */
export const PASS2_WINDOW = 50;
/** Served-target rank-sum rule: cherry-pick indicated when Z < this (one-sided alpha 0.001). */
export const PASS2_Z_CRIT = -3.0902323061678132;
/** Early/late chi-squared screen: per-window level and the level the flag count is tested at. */
export const PASS2_SCREEN_ALPHA = 0.05;
/** Early/late chi-squared screen: equiprobable bins over [0, RANGE) (RANGE/20 = 5,000,000 exactly). */
export const PASS2_BINS = 20;


/** Target → integer hundredths. Operator `ci`. */
export function targetToHundredths(target: number): number {
  return Math.round(target * MULTIPLIER_SCALE);
}

/** Is a target a legal bet? A 2-dp value within [MIN_MULTIPLIER, MAX_MULTIPLIER]. Operator `isLimboTargetLegal`. */
export function isTargetLegal(target: number): boolean {
  if (!Number.isFinite(target)) return false;
  const h = targetToHundredths(target);
  if (Math.abs(target * MULTIPLIER_SCALE - h) > 1e-6) return false;   // must be a 2-dp value
  return target >= MIN_MULTIPLIER && target <= MAX_MULTIPLIER;
}

/**
 * Served win chance for a target, EXACTLY as the operator prices it (operator `cr`):
 *     winChance(m) = floor(N / ci(m)) / RANGE   ( = 0.99/m up to the flooring )
 * Returned as a probability in [0, 1]. At m = 2.00 this is 0.495 (49.50%), matching the UI.
 */
export function winChance(target: number): number {
  return Math.floor(RESULT_NUMERATOR / targetToHundredths(target)) / RANGE;
}

/** Served win chance in PERCENT (the figure the UI shows next to the target). */
export function winChancePct(target: number): number {
  return winChance(target) * 100;
}

/** Maximum win chance = winChance(MIN_MULTIPLIER) → 98.019801% (LIMBO_MAX_WIN_CHANCE_PERCENT). */
export const MAX_WIN_CHANCE_PERCENT = winChancePct(MIN_MULTIPLIER);

/**
 * RESULT multiplier from a draw k ∈ [0, RANGE) — the round's crash point.
 *     R = min(MAX_MULTIPLIER, floor(N / (k + 1)) / SCALE)
 * ANTI-CIRCULAR w.r.t. the payout question: this is pure arithmetic over the draw grid and the
 * operator's own published constants; it never reads a captured multiplier. Confirmed against
 * the four live Verify vectors above and re-checked against every captured R in verify Step 5.
 * R ranges over [MIN_RESULT, MAX_MULTIPLIER]. 99 draws give MAX_MULTIPLIER (k <= 98, probability
 * 99/RANGE); the upper clamp changes the value on 98 of them (at k = 98 the raw value is already
 * 1,000,000.00). The lower clamp fires for every k > 98,999,999 (probability 1%).
 *
 * Without the lower clamp the range would read "[~0.99, ...]" — documenting a defect in the
 * reimplementation rather than the operator. Witnessed on 2026-09-11 in an earlier capture run that is
 * not shipped (serverSeed 5d8a6efd…, nonce 49, k = 99,588,964, raw 0.99, operator served 1); the first
 * clamped round in the shipped dataset is epoch 3 nonce 29 (k = 99,762,668). This is the ONLY implementation of the formula;
 * src/rng.ts delegates here, because a second copy is how a fix lands in one and leaves the
 * other wrong.
 */
export function resultMultiplier(k: number): number {
  if (!Number.isInteger(k) || k < 0 || k >= RANGE) {
    throw new Error(`draw out of domain [0, ${RANGE}): ${k}`);
  }
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_RESULT, Math.floor(RESULT_NUMERATOR / (k + 1)) / MULTIPLIER_SCALE));
}

/** Win rule: the bet wins iff the served result reaches the chosen target. */
export function limboWin(result: number, target: number): boolean {
  return result >= target;
}

/**
 * Theoretical RTP for a target = winChance(m) · m. Derived from the operator's own win-chance
 * pricing, NOT from any captured return. ≤ 0.99 for every legal target (see the closed-form
 * proof in the header); equals 0.99 exactly when 9.9e7 / m is an integer.
 */
export function theoreticalRTP(target: number): number {
  return winChance(target) * target;
}

/** Effective house edge for a target = 1 − RTP(m). ≥ 0.01 for every legal target. */
export function effectiveEdge(target: number): number {
  return 1 - theoreticalRTP(target);
}

/** Round to 8 decimal places (nearest; strips IEEE-754 dust from an already-8-dp value). */
export function round8(x: number): number {
  return Math.round(x * 1e8) / 1e8;
}

/**
 * Credited amount on a WIN. The nominal payout is stake · target. The EXACT settlement-rounding
 * rule (e.g. the two-stage 8-dp half-even rule characterised on LIQD Dice) is NOT assumed here:
 * it is CHARACTERISED from the captured winningAmount field and pinned in verify Step "payouts"
 * once the dataset exists. Until then this returns the un-rounded nominal payout; the payout
 * step will confirm the operator's actual rounding against every captured credit and update
 * this function if a rounding rule is observed (never the other way round).
 */
export function nominalPayout(stake: number, target: number): number {
  return stake * target;
}
