/**
 * LIQD Limbo game math.
 *
 * Limbo is a single-draw "crash target" game. The player picks a TARGET multiplier m (a 2-decimal
 * value, minimum 1.01); the round produces a RESULT multiplier R from one bias-free draw; the bet
 * WINS iff R >= m and pays stake x m, else pays 0.
 *
 * ── What every constant and formula in this file rests on ─────────────────────────────────────
 * The model is the one written in docs/ALGORITHM.md. Its evidence is production only (liqd.com):
 *   - 5,838 settled rounds (7 and 10 November 2026) whose served result and win flag recompute
 *     exactly from the revealed seed (verify Steps 5-6), and whose credit is stake x target (Step 9);
 *   - the production verifier's reply for each of those 5,838 rounds, equal to the served round and
 *     to this model (Step 25);
 *   - logged-out production verifier probes of 9 November 2026 on unsettled draws at and around the
 *     result cap (evidence/E02-prod-verifier-result-cap-2026-11-09, Step 25, which counts them).
 * The seed scheme (16-byte seed, commitment = SHA-256 of the hex string, HMAC-SHA256 keyed by the
 * hex-decoded seed over `clientSeed:nonce:cursor`, 4-byte big-endian chunks with rejection) is also
 * the one LIQD describes on liqd.com/provably-fair/technical-implementation (read logged out on
 * 2026-11-03; the page text is not retained in this package, so it is context, not evidence).
 *
 *     ci(m) = round(100 x m)                      target in integer hundredths
 *     cr(m) = floor(9.9e9 / ci(m))                winning draws out of 1e8 (the win chance in 1e-8 units)
 *
 * ── House edge is a CLOSED-FORM identity, not a measured average ────────────────────────
 * Because a target m is a 2-dp value, ci(m) = 100 x m exactly, so the win chance is
 *     p(m) = floor(N / (100 x m)) / RANGE          with N = (1 - edge) x SCALE x RANGE = 9.9e9
 * and the return to player is
 *     RTP(m) = p(m) x m = floor(9.9e7 / m) x m / 1e8  <=  0.99.
 * The floor can only LOWER the payout, never raise it, so RTP(m) <= 0.99 for EVERY target: the
 * house edge is >= 1.00% on every bet, and exactly 1.00% when ci(m) divides 9.9e9 evenly
 * (m = 2.00 -> p = 0.495, RTP = 0.99).
 *
 * ── The edge is not flat above 1.00% ───────────────────────────────────────────────────
 * edge(ci) = (RANGE x SCALE - N + (N mod ci)) / (RANGE x SCALE), so the excess over 1.00% is
 * (N mod ci) / 1e10 and grows with ci. Step 16 enumerates it on every run: over the audited target
 * range (1.01x to 10,000x, the highest target settled on production) and, as arithmetic about the
 * formula only, over every 2-dp value up to the 1,000,000x result cap. Targets sharing one value of
 * cr(m) share an identical win chance and are each paid their own multiplier, so within such a
 * group only the largest member is priced as well as those odds allow.
 *
 * No stake-dependent or scaling edge: the win chance has no stake input, and Phase C (238 rounds at
 * 10.00 USDT) settles by the same rule as the 0.10 USDT rounds (Steps 13 and 20).
 */

// ── Draw domain ────────────────────────────────────────────────────────────────────────
// k is a bias-free uniform integer in [0, RANGE) from the shared LIQD fast-games RNG
// (HMAC-SHA256 keyed by the hex-decoded server seed over `clientSeed:nonce:cursor`), cursor 0.
export const RANGE = 100_000_000;   // draw domain 0 .. 99_999_999  (1e8)
export const CURSOR = 0;            // fixed HMAC cursor for the single limbo draw

// ── Game constants (docs/ALGORITHM.md; evidenced on production by Steps 5, 6, 9 and 25) ────────────────
export const HOUSE_EDGE = 0.01;
export const MULTIPLIER_DECIMALS = 2;
export const MULTIPLIER_SCALE = 100;             // 10 ** MULTIPLIER_DECIMALS
export const MIN_MULTIPLIER = 1.01;              // minimum target: the lowest target played on production (Step 13); a lower one was not attempted
export const MAX_MULTIPLIER = 1_000_000;         // RESULT cap (the production verifier reports 1,000,000 where the raw value is higher: E02, Step 25). NOT a statement about the highest target that can be played: see PROD_TOP_TARGET

/**
 * RESULT floor: the smallest multiplier the casino serves. NOT the same number as MIN_MULTIPLIER
 * (1.01), which is the smallest target. The raw formula falls below 1 for every k > 98,999,999
 * (1,000,000 of the 100,000,000 draws); on those the casino serves R = 1. Step 5 counts the
 * production rounds served at R = 1 and the ones on which the clamp changed the value.
 * It changes the reported RESULT, never the outcome: R = 1 loses against every target (>= 1.01),
 * exactly as an unclamped 0.99 would.
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
// Every seed of the producer src/simulate.ts is sha256(SIM_MASTER_SEED|stream|n) (32 hex, the casino's
// seed format); the artifact records this value as pass1.masterSeed and Step 19 requires it to equal this
// constant; `npm run simulate:check` (in test:full) regenerates the whole artifact into outputs/run/ and
// requires it byte for byte (profile LIMBO-28). The master seeds are labels fixed in code; they are inputs to
// a simulation and carry no capture data.
export const SIM_MASTER_SEED = 'pf.org/liqd-limbo/simulate/2026-09-26';
// ── Pass 1 on a pinned master seed (src/pass1-grid.ts → outputs/pass1-grid.json, scored by Step 23) ──
// Every seed is sha256(PASS1_MASTER_SEED|stream|block), so the experiment is replayable byte for byte.
// Depths meet the profile floor (LIMBO-20): >= 2,000,000 uniformity draws and >= 1,000,000 rounds on
// each of >= 9 targets spanning the low and high decades. Step 23 binds the artifact to these.
export const PASS1_MASTER_SEED = 'pf.org/liqd-limbo/pass1/2026-09-26';
export const PASS1_UNIFORMITY_DRAWS = 2_000_000;
export const PASS1_ROUNDS_PER_TARGET = 1_000_000;
export const PASS1_TARGETS: readonly number[] = [1.01, 1.5, 2, 5, 10, 50, 100, 1_000, 10_000];   // nine targets across the audited range, 1.01x..10,000x
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
export const PASS1_GRID_SHA256 = 'd4284dc5260c43180c2ec7e2fa3d31c23331f0660b581a1fc968f14a4d205caf';

// ── Captured dataset: PRODUCTION, liqd.com, 7 and 10 November 2026 ──────────────────────────
// The artifact of record. Every scored step reads this file; the loader recomputes the hash and refuses
// to run on a mismatch, so a hand-edit fails before a single step is scored.
// 5,838 rounds placed on liqd.com in three runs of the in-page capture runner (the dataset records each
// run's runner build in meta.captures; its source is under capture/runner/), exported as three .ndjson files (shipped
// under capture/captures/ with their first line edited, see CAPTURE CHAIN below; their SHA-256 are in meta.captures) and
// converted to this { meta, seeds, bets } file by the converter under capture/converter/, which Step 19 reruns.
export const DATA_PATH = 'data/limbo-prod-full-5838bets.json';
export const DATASET_SHA256 = '65c7a472b503bbcd9db9f26caee28d51d6536427f286fb9d3d9ec038ab17e101';

/**
 * THE CAPTURE PLAN AS EXECUTED, typed here from the three runs' plans and NOT read from the dataset
 * (G-BIND: a count a forger supplies is a count a forger chooses). One entry per block of epochs, in the
 * order the rounds were played; an epoch is the set of rounds between two seed rotations.
 *   capture 1, 2026-11-07: Phase A, 25 epochs x 200 rounds, 0.10 USDT, the 50-target ladder x 100.
 *   capture 2, 2026-11-10: Phase D, 5 epochs x 100 rounds, 0.10 USDT, the same ladder (2 rounds per
 *                          target per epoch), each epoch under its own player-set client seed;
 *                          then the Phase A top-up (plan id A+), 1 epoch x 100 rounds, 0.10 USDT:
 *                          50 targets drawn in [1000, 10000) and 50 rounds at exactly 10,000x.
 *   capture 3, 2026-11-10: Phase C, 2 epochs x 119 rounds, 10.00 USDT, fixed target 2.00x.
 */
export interface PlanBlock { capture: number; phase: 'A' | 'C' | 'D'; phaseId: 'A' | 'A+' | 'C' | 'D'; epochs: number; size: number; stake: number; seedTag: 'audit' | 'player' }
export const CAPTURE_PLAN: readonly PlanBlock[] = [
  { capture: 1, phase: 'A', phaseId: 'A',  epochs: 25, size: 200, stake: 0.10, seedTag: 'audit' },
  { capture: 2, phase: 'D', phaseId: 'D',  epochs: 5,  size: 100, stake: 0.10, seedTag: 'player' },
  { capture: 2, phase: 'A', phaseId: 'A+', epochs: 1,  size: 100, stake: 0.10, seedTag: 'audit' },
  { capture: 3, phase: 'C', phaseId: 'C',  epochs: 2,  size: 119, stake: 10.00, seedTag: 'audit' },
];
/** One entry per epoch, 0..32, in dataset order: the plan block the epoch belongs to. */
export const EPOCH_PLAN: readonly PlanBlock[] = CAPTURE_PLAN.flatMap((b) => Array.from({ length: b.epochs }, () => b));
/** The planned number of rounds in epoch e (200, 100 or 119). Bound here, never read from the dataset header. */
export const epochSize = (epoch: number): number => EPOCH_PLAN[epoch]?.size ?? NaN;
export const EXPECTED_CAPTURES = 3;

// Population pins, typed (not summed from CAPTURE_PLAN: Step 12 requires the plan to add up to them, so
// neither can move alone).
export const EXPECTED_BETS = 5_838;
export const EXPECTED_SEEDS = 33;
/** The largest planned epoch (Phase A, 200 rounds): the upper bound of any nonce in the capture. */
export const MAX_EPOCH_SIZE = 200;
/**
 * Nonce gaps the CAPTURE LOG attributes to an auditor-side retry (profile LIMBO-04): a round the runner
 * placed but failed to record. Each entry is disclosed by Step 4 as a FLAG with origin = capture, never a
 * PASS, never a fail against the operator, provided the revealed seed still reconstructs every recorded
 * round of that epoch. A gap NOT listed here is unexplained and HARD-FAILS. The three runs record no
 * lost reply, no retry and no skipped round (the "run record" line of the three checker printouts under capture/), so this is empty.
 */
export const DECLARED_CAPTURE_GAPS: ReadonlyArray<{ epoch: number; nonce: number }> = [];

/** Rounds and stake per phase letter, as executed (USDT, currencyId 3). */
export const EXPECTED_PHASES = {
  A: { bets: 5_100, stake: 0.10 },
  C: { bets: 238, stake: 10.00 },
  D: { bets: 500, stake: 0.10 },
} as const;
/** Rounds per plan entry: Phase A is the 7 November ladder (A) plus the 10 November top-up (A+). */
export const EXPECTED_PHASE_IDS: Readonly<Record<string, number>> = { 'A': 5_000, 'A+': 100, 'C': 238, 'D': 500 };

/**
 * THE TARGET LADDER: the 50 targets the runner plays in Phase A (each exactly PROD_ROUNDS_PER_TARGET
 * times) and in Phase D (each exactly PHASE_D_ROUNDS_PER_TARGET times): 1.01 x (100 / 1.01)^(i / 49),
 * i = 0..49, rounded to 0.01. Typed here from the plan, not read from the dataset (G-BIND); Step 13 requires
 * the dataset to hold exactly these targets at exactly these counts and reconciles meta.ladder against them.
 */
export const PROD_TARGET_LADDER: readonly number[] = [
  1.01, 1.11, 1.22, 1.34, 1.47, 1.61, 1.77, 1.95, 2.14, 2.35, 2.58, 2.83, 3.11, 3.42, 3.75, 4.12, 4.53, 4.97, 5.46, 6,
  6.59, 7.24, 7.95, 8.73, 9.59, 10.53, 11.57, 12.71, 13.95, 15.33, 16.83, 18.49, 20.31, 22.3, 24.5, 26.9, 29.55, 32.45,
  35.64, 39.15, 43, 47.23, 51.87, 56.97, 62.57, 68.72, 75.48, 82.9, 91.05, 100,
];
export const PROD_ROUNDS_PER_TARGET = 100;
export const PHASE_D_ROUNDS_PER_TARGET = 10;
export const PROD_LADDER_TOP = 100;
/** The Phase A top-up (plan id A+): rounds on targets in [TOPUP_LOW, TOPUP_HIGH) and rounds at exactly TOPUP_HIGH. */
export const TOPUP_LOW = 1_000;
export const TOPUP_HIGH: number = 10_000;
export const TOPUP_ROUNDS_BELOW = 50;
export const TOPUP_ROUNDS_AT_TOP = 50;
/** Phase C: one fixed target, and the profile floor of elevated-stake WINS that must go through the payout path (LIMBO-12). */
export const PHASE_C_TARGET = 2;
export const PHASE_C_MIN_WINS = 100;
/** Phase D: the number of distinct player-set client seeds (one per epoch); profile LIMBO-06 floor is 2. */
export const PHASE_D_SEEDS = 5;

/**
 * THE HIGHEST TARGET SETTLED ON PRODUCTION: 10,000x (50 rounds of the Phase A top-up, 10 November 2026).
 * It is the top of the audited target range: Step 16 and the RTP-CLAIM rule are scored on 1.01x..10,000x.
 *
 * WHAT IS AND IS NOT ESTABLISHED ABOVE IT. No production round was placed above 10,000x and this audit
 * holds no refused bet, so whether liqd.com accepts a bet on a target above 10,000x is NOT established.
 * The one record on the question: on 2026-11-03 a logged-out request to the production verifier
 * (POST /api/v1/originals/limbo/verify) with target 100000 was answered HTTP 400 with a validation
 * error on the target (evidence/E03-prod-verifier-target-100000.json; the reply body was not retained).
 * That is a verifier reply to one request, not a refused bet. The runner's own plan constant
 * (`ceiling: 10000`) is the auditor's setting and is not evidence about the casino.
 */
export const PROD_TOP_TARGET: number = 10_000;

/**
 * TARGET COVERAGE PLAN BY DECADE (profile LIMBO-15), Phase A rounds (A and A+), from the plan:
 * 25 ladder targets (1.01x..9.59x) in decade 10^0, 24 (10.53x..91.05x) in 10^1 and one, 100x, in 10^2,
 * at 100 rounds each; the top-up puts 50 rounds in 10^3 and 50 at exactly 10,000x (decade 10^4, which
 * holds one target inside the audited range). Step 13 requires these counts and the profile floor.
 */
export const PLANNED_TARGET_DECADES: Readonly<Record<number, number>> = { 0: 2_500, 1: 2_400, 2: 100, 3: 50, 4: 50 };
/** Profile LIMBO-15 floor: Phase A bets per declared decade. */
export const PHASE_A_DECADE_FLOOR = 50;

/**
 * THE RUNNER BUILD OF EACH RUN, as the run's own header records it (meta.captures[].runner). Typed here from
 * the capture log; Step 19 requires the dataset header to carry exactly these, and holds the shipped runner
 * source of each build (CAPTURE_RUNNER_FILES) to the code digest of the original build.
 */
export const RUNNER_BUILDS: readonly { capture: number; build: string }[] = [
  { capture: 1, build: 'limbo-prod-capture-runner 2026-11-03 build 6fd6576d4561' },
  { capture: 2, build: 'limbo-prod-capture-runner 2026-11-03 build 7e33ea9cd02d' },
  { capture: 3, build: 'limbo-prod-capture-runner 2026-11-03 build 7e33ea9cd02d' },
];

/**
 * THE CAPTURE CHAIN SHIPPED WITH THE PACKAGE (Step 19; Step 2 reads LIQD's Date headers from the reply record).
 *  - the three exports (capture/captures/), as the runner wrote them except on their first line (the runner's meta
 *    event, which no reply's SHA-256 covers): the browser's user-agent string removed, and a person's name in one plan
 *    note of runs 2 and 3 replaced by "the auditor" (capture/redact-export.mjs). Every reply body is byte for byte;
 *  - the converter source (workshop liqd-prod-2026-11-03, convert/) byte for byte, its input list naming the shipped
 *    exports, and a one-export stand-in for the workshop module it imports (capture/runners/_shared/check-core.mjs).
 *    Step 19 RERUNS the converter on the shipped exports and requires the dataset byte for byte;
 *  - the reply record (capture/replies/), built from the exports by capture/build-reply-record.mjs, which Step 19
 *    reruns and requires byte for byte;
 *  - the runner source of each build, with the comment lines that named a person removed and the same name replaced
 *    in two plan-note strings of build 7e33ea9cd02d (the text the exports carry). A build id is the first 12 hex of the
 *    SHA-256 of the ORIGINAL source, which this package therefore cannot recompute; Step 19 instead requires the
 *    SHA-256 of the shipped source with every full-line `//` comment removed to equal `codeSha256`, which the auditor
 *    computed from the original build file with the same comment removal and the two string replacements.
 */
export const CAPTURE_RUNNER_FILES: readonly { build: string; file: string; sha256: string; codeSha256: string }[] = [
  { build: '6fd6576d4561', file: 'capture/runner/limbo-prod-capture-runner-build-6fd6576d4561.js', sha256: 'c1d18dbbceff2698367c45adf5b893c4124e8ebe3902af6b7cc09f6fd112e725', codeSha256: 'a780478f9274bf79d7b2de4fe83604c4debd5baf59674359551ef2e2e03afaf6' },
  { build: '7e33ea9cd02d', file: 'capture/runner/limbo-prod-capture-runner-build-7e33ea9cd02d.js', sha256: 'b1c0ef28b0eda03a4f23c513a090d1a2cee7d3b514c71751cc4ed0d36a5827ad', codeSha256: '7aca96cc43830a63edf05f46f95ad9d909fe99f2163b3f89cb959b0aebc85e64' },
];
export const RUNNER_VERSION_TAG = 'limbo-prod-capture-runner 2026-11-03';
export const EXPORT_FILES: readonly { capture: number; file: string; sha256: string; originalSha256: string }[] = [
  { capture: 1, file: 'capture/captures/liqd-limbo-prod-capture-2026-11-07T16-28-43-825Z.ndjson', sha256: '88490b8e821085d8c1b28cc9b47de1dc4c0984251c77de41df39b81fb69611c5', originalSha256: '4e29b73dd91c585a9fb60e680038880169b2dc2504bbbaa451fb300a77000754' },
  { capture: 2, file: 'capture/captures/liqd-limbo-prod-capture-2026-11-10T04-11-27-073Z.ndjson', sha256: 'af84273906c85b57f778df01fb9d986dc875a2768346b89d5ace20f961daa833', originalSha256: '9fe56a69dad19e938f23cd0e4875c5478dcbd43d9a8051d4fe7c9735c8eb6393' },
  { capture: 3, file: 'capture/captures/liqd-limbo-prod-capture-2026-11-10T10-47-42-943Z.ndjson', sha256: '1dfd38dee0f4a1f68f3626f1fbd04189d7a59fae73779517dbda0a3c38bda3f2', originalSha256: 'cd5d8acd26234e7d15f4a8d80dbb35d6c6b2d5b7c6b121bc6d7c33defa339080' },
];
export const CONVERTER_ENTRY = 'capture/converter/full-limbo.mjs';
export const CONVERTER_FILES: readonly { file: string; sha256: string }[] = [
  { file: 'capture/converter/full-limbo.mjs', sha256: '695f481c3fb98ee69a313972ddfc9a0ec569f92625c6e68d7b3f7ada2279fc2c' },
  { file: 'capture/converter/adapters/limbo.mjs', sha256: '619ac8258ec79633284723e8d6ae6fa4fed4bed41c9420117110c6e2081d3454' },
  { file: 'capture/converter/lib/events.mjs', sha256: '90ee59ce5c05dbaf657cf11cfd99313cf0cd383fd2f0a17adb98db7fd7187293' },
  { file: 'capture/converter/inputs.limbo.json', sha256: '7056d47e54487c8a51c956c5cbd851b1f912935f900768689a79a11c1d874e7e' },
  { file: 'capture/runners/_shared/check-core.mjs', sha256: '7753627f08b9461f3121db81be1064403f3b33fa7785a36bb895d99c43c43e18' },
];
export const REPLY_RECORD_BUILDER = 'capture/build-reply-record.mjs';
export const REPLY_RECORD_FILES: readonly { capture: number; file: string; sha256: string }[] = [
  { capture: 1, file: 'capture/replies/liqd-limbo-prod-replies-capture-1.jsonl', sha256: 'aa0c912ad3d385e47f043ff7a21221a0c958f80f27353d9279785a6499c3e3ee' },
  { capture: 2, file: 'capture/replies/liqd-limbo-prod-replies-capture-2.jsonl', sha256: '892371efb84a8627c23277df5ca25a226a1e307866f9f6f00346db51bf36efd9' },
  { capture: 3, file: 'capture/replies/liqd-limbo-prod-replies-capture-3.jsonl', sha256: '2316072267717c53601fc2ad8a2ab7b0f527daab97b2ab25c1de977602a20c0d' },
];
/** Directories the identifier scan of Step 19 reads, every file in them. */
export const IDENTIFIER_SCAN_DIRS: readonly string[] = ['capture', 'data', 'evidence'];

/**
 * PRODUCTION VERIFIER PROBES AT THE RESULT CAP (9 November 2026, logged out, no bet): the records as
 * received, byte for byte, and pinned. Step 25 recomputes every probe from src/ and requires the
 * casino's reply to equal it. A verifier observation: no settled production round reached the cap.
 */
export const CAP_PROBE_DIR = 'evidence/E02-prod-verifier-result-cap-2026-11-09';
export const CAP_PROBE_RECORDS = 'probes-limbo.jsonl';
export const CAP_PROBE_RECORDS_SHA256 = '4c5769e29a680be30998e4fd2748a2b9f58285e3542d265ec94971fbf18077c3';
/** Requests in the file: one transport check on a settled round and six on unsettled nonces at and around the cap (Step 25 counts the distinct draws they cover). */
export const CAP_PROBE_EXPECTED = 7;
/** Of the six, the REQUESTS whose raw (uncapped) value is ABOVE the cap, so only a capped model reproduces the reply (two of them share one draw). */
export const CAP_PROBE_DISCRIMINATING = 4;
/** The distinct draws (seed, client seed, nonce) those requests cover. */
export const CAP_PROBE_DISCRIMINATING_DRAWS = 3;

// ── Simulation artifacts ──────────────────────────────────
// ENFORCED by Step 19, which recomputes both digests and fails on a mismatch, on an absent file and
// on one it cannot parse. A hash pin establishes that the shipped bytes are the bytes this audit read.
// The Pass-2 block is re-derived from the dataset by Step 24 and the Pass-1 claims are carried by
// outputs/pass1-grid.json, which Step 23 re-derives; the legacy Pass-1 figures inside this file stay
// producer-attested (limitation L9). `npm run simulate:check` reproduces both files byte for byte.
export const SIMULATION_SHA256 = 'b4e529119b24e1845d01a00e97d2cf7d4d895f0ef6cb1a34566928d591552c36';
export const SIMULATION_HTML_SHA256 = 'efd121156f8255f391eb9c1b3c6f9f06c008d35807cef9a69b1e82be33fd0d69';

/**
 * PASS-2 CHERRY-PICK SCREEN: the rule and its constants (src/pass2.ts, re-derived by Step 24). The
 * rule (rank-sum Z, alpha, bins) was fixed in code on 2026-09-26, before any production capture existed.
 * The window follows each epoch's own planned size (200, 100 or 119 rounds): that was set on 2026-11-10,
 * after the captures, and is stated wherever the rule is quoted. Observed figures do not live here: they
 * are emitted by the deterministic producer into outputs/simulation-results.json (pass2) and re-derived
 * from the dataset by Step 24 on every run.
 */
/** Nonces replayed per revealed seed (profile LIMBO-21 floor: 10,000). */
export const PASS2_NONCES = 10_000;
/**
 * Early/late screen window: 50 draws, the size its exact multinomial null is computed for (src/pass2.ts). Early =
 * the first 50 captured nonces (0..49), late = the first 50 nonces after the captured epoch.
 */
export const PASS2_SCREEN_WINDOW = 50;
/** Served-target rank-sum rule: cherry-pick indicated when Z < this (one-sided alpha 0.001). */
export const PASS2_Z_CRIT = -3.0902323061678132;
/** Early/late chi-squared screen: per-window level and the level the flag count is tested at. */
export const PASS2_SCREEN_ALPHA = 0.05;
/** Early/late chi-squared screen: equiprobable bins over [0, RANGE) (RANGE/20 = 5,000,000 exactly). */
export const PASS2_BINS = 20;


/** Target → integer hundredths (ci). */
export function targetToHundredths(target: number): number {
  return Math.round(target * MULTIPLIER_SCALE);
}

/**
 * Is a target on the game's grid? A 2-dp value within [MIN_MULTIPLIER, MAX_MULTIPLIER] (a target above the result
 * cap could never win). Whether the casino accepts every such target is a separate question: see PROD_TOP_TARGET.
 */
export function isTargetLegal(target: number): boolean {
  if (!Number.isFinite(target)) return false;
  const h = targetToHundredths(target);
  if (Math.abs(target * MULTIPLIER_SCALE - h) > 1e-6) return false;   // must be a 2-dp value
  return target >= MIN_MULTIPLIER && target <= MAX_MULTIPLIER;
}

/**
 * Win chance for a target (cr / RANGE):
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

/** Maximum win chance = winChance(MIN_MULTIPLIER) → 98.019801%. */
export const MAX_WIN_CHANCE_PERCENT = winChancePct(MIN_MULTIPLIER);

/**
 * RESULT multiplier from a draw k in [0, RANGE): the round's crash point.
 *     R = min(MAX_MULTIPLIER, max(MIN_RESULT, floor(N / (k + 1)) / SCALE))
 * Pure arithmetic over the draw grid; it never reads a captured multiplier. Checked against every
 * production round in verify Step 5 and against the production verifier in Step 25.
 * 99 draws give MAX_MULTIPLIER (k <= 98, probability 99/RANGE); the upper clamp changes the value on 98
 * of them (at k = 98 the raw value is already 1,000,000.00). The lower clamp fires for every
 * k > 98,999,999 (probability 1%). src/rng.ts limboResult keeps its own copy of the formula without the upper
 * cap; tests/limbo/resultFloorTests.ts holds the two equal for every draw below the cap (k > 97) and checks
 * where they differ. The scored steps use this function.
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
 * Theoretical RTP for a target = winChance(m) · m. Derived from the win-chance formula, NOT from any
 * captured return. ≤ 0.99 for every target (see the closed-form proof in the header); equals 0.99
 * exactly when 9.9e7 / m is an integer.
 */
export function theoreticalRTP(target: number): number {
  return winChance(target) * target;
}

/** Effective house edge for a target = 1 − RTP(m). ≥ 0.01 for every target. */
export function effectiveEdge(target: number): number {
  return 1 - theoreticalRTP(target);
}

/** Round to 8 decimal places (nearest; strips IEEE-754 dust from an already-8-dp value). */
export function round8(x: number): number {
  return Math.round(x * 1e8) / 1e8;
}

