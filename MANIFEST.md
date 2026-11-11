# LIQD Limbo — Consolidated Audit Overview

**Audit ID:** `PF-2026-LQ05` · **Auditor:** ProvablyFair.org · **Release:** `v1.1.0` · **Framework:** 1.1

Limbo (`gameId` `originals-limbo`) on LIQD.com. **Every check of LIQD's behaviour rests on production data: `liqd.com`, 7 and 10 November 2026.** 5,838 rounds were placed from one logged-in account in USDT in three runs, and after each run every round was sent to LIQD's own verifier. This document holds the dataset description, the algorithm, the RTP analysis, the verification results, the evidence register, the limitations and the release history. [README.md](README.md) is the short version.

## Conclusion and scope

**PROVABLY FAIR — Full Pass** — 25/25 scored steps pass, 0 FLAG, 0 hard fails; 25/25 unit tests. Every one of the 5,838 production rounds recomputes bit-for-bit from its `(serverSeed, clientSeed, nonce)` inputs; the commit-reveal chain is intact inside each of the three runs across 33 seed epochs; every client seed was submitted by the auditor, 5 of them player-set seeds of a different shape (Phase D); LIQD's bet replies settle 1,318 of 1,318 winning rounds at the exact decimal product of stake and chosen target, at 0.10 USDT and at 10.00 USDT; and LIQD's production verifier returns the same result, win flag and multiplier as the settled round on all 5,838.

**What the production capture covers.**

| Phase | Rounds | Stake (USDT) | Targets | Date (UTC) | What it is for |
|---|---:|---:|---|---|---|
| A | 5,000 | 0.10 | 50-target ladder `1.01 × (100/1.01)^(i/49)`, 1.01× to 100×, 100 rounds each | 7 Nov 2026 | recomputation, win rule, payout, edge on the ladder |
| A (top-up, plan id `A+`) | 100 | 0.10 | 50 rounds on 50 targets in [1,000×, 10,000×), 50 rounds at exactly 10,000× | 10 Nov 2026 | target coverage up to the highest target played |
| D | 500 | 0.10 | the same ladder, 10 rounds per target | 10 Nov 2026 | 5 player-set client seeds, one per epoch |
| C | 238 | 10.00 | fixed 2.00× | 10 Nov 2026 | the same rule at 100 times the stake |

**The highest target played is 10,000×.** Fifty rounds were accepted and settled at exactly 10,000× and none was placed above it. Whether `liqd.com` accepts a bet on a target above 10,000× is **not established**: this audit holds no refused bet. The one record on the question is a production verifier reply: on 3 November 2026 a logged-out request to `POST /api/v1/originals/limbo/verify` with target 100000 was answered HTTP 400, a validation error on the target (E09; the reply body was not retained). That is a verifier reply to one request, not a refused bet (**L1**, DL-1).

**No production win was settled above 100×.** None of the 100 rounds at 1,000× and above won (their win chances run from 0.0099% to 0.099% per round). Those rounds settled as losses exactly as the rule says and the verifier agrees on each, but the payout of a win above 100× was not exercised by settled money (**L13**, DL-13). This is a limit of the capture, not a finding about the casino.

**RTP claim.** LIQD's Limbo page shows "Edge: 1.00%" and RTP "99%", and says "2x lands 49.5% of the time, 10,000x lands 0.0099% of the time, and every target in between returns 99%" (read logged out on 1 October 2026, E08, and again on 10 November 2026 with every figure identical, E14). The RTP-CLAIM rule (1.2.0) requires every setting scored to return within 0.10 percentage points of the stated figure. On every 2-dp target from 1.01× to 10,000× — 999,900 settings, the range the capture spans and the page names — the exact RTP runs from 98.990018% (at 9,989.91×) to 99.000000%, so the claim holds (**PASS**). The edge is a proved floor of 1.00% and is not flat: it is off 1.00% on 999,618 of those 999,900 targets, always on the house side, by at most 0.009982 percentage points.

**The result cap is a verifier observation.** No settled round reached 1,000,000× (the highest result is 28,181.04×). On 9 November 2026 the auditor sent six logged-out requests to the production verifier on five draws the capture never played; on the four requests, on three distinct draws, whose uncapped value is above 1,000,000 it reports 1,000,000 (E07, Step 25). That a bet settling on such a draw is paid by the same rule is not shown (**L4**, DL-4).

Matching hashes and an intact chain establish *which* seed goes with which round and in what order the records sit, never *when* a commitment came into being; LIQD's Date headers order the commitment, the client seed and the first bet of each epoch on LIQD's own clock, not an independent one (Step 2). Every non-alteration claim here is conditional on the auditor's attested capture chronology (**L6**, DL-6). The live return of the 5,838 rounds is a variance illustration only (**L7**, DL-7); the RTP evidence is the closed-form edge of Step 16, anchored by the full-grid tally of Step 15 and the simulation of Step 23.

**In scope:** the RNG algorithm and the result map with both clamps; the commit-reveal protocol; result recomputation and the win rule, including results landing exactly on the target; payout on every winning production round at two stakes; player-set client seeds; return to player as a closed-form edge held to the RTP-CLAIM rule; parity with LIQD's production verifier; and integrity checks against the S5 categories. **Out of scope:** LIQD's server code and configuration, which this audit does not hold; any game other than Limbo; any account, currency or stake other than the ones captured.

## Contents

- [Dataset and capture](#dataset-and-capture)
- [Game and algorithm](#game-and-algorithm)
- [Payouts and RTP](#payouts-and-rtp)
- [Verification results](#verification-results)
- [Reproduce the audit](#reproduce-the-audit)
- [Verify a bet](#verify-a-bet)
- [Evidence](#evidence)
- [Limitations and trust](#limitations-and-trust)
- [Terms](#terms)
- [Release history](#release-history)

## Dataset and capture

The scored dataset is [data/limbo-prod-full-5838bets.json](data/limbo-prod-full-5838bets.json) (E01): `{ meta, seeds[], bets[] }`, 5,838 rounds in 33 seed epochs, every seed revealed. It was built from three exports of the in-page capture runner, in the order the rounds were played:

| Run | Epochs (dataset) | Rounds | Phases | Rounds placed (UTC) | Verifier replies fetched (UTC) | Export SHA-256 |
|---|---|---:|---|---|---|---|
| 1 | 0–24 (25 × 200) | 5,000 | A | 7 Nov 2026, 13:03:09 to 14:55:59 | until 16:20:10 | `4e29b73dd91c585a9fb60e680038880169b2dc2504bbbaa451fb300a77000754` |
| 2 | 25–30 (5 × 100, 1 × 100) | 600 | D, then A top-up | 10 Nov 2026, 03:48:28 to 04:01:31 | until 04:11:26 | `9fe56a69dad19e938f23cd0e4875c5478dcbd43d9a8051d4fe7c9735c8eb6393` |
| 3 | 31–32 (2 × 119) | 238 | C | 10 Nov 2026, 10:38:35 to 10:43:48 | until 10:47:42 | `cd5d8acd26234e7d15f4a8d80dbb35d6c6b2d5b7c6b121bc6d7c33defa339080` |

The three exports ship in `capture/captures/` (E25 to E27). The SHA-256 in the table above are the exports as the runner wrote them; the shipped copies differ from them on the first line only, the runner's meta event, which no reply digest covers: the browser's user-agent string is removed and, in one plan note of runs 2 and 3, a person's name is replaced by "the auditor" (`capture/redact-export.mjs`, E29). Every other line is byte for byte, and the shipped copies' own SHA-256, sizes and runner builds are in `meta.captures`. The workshop's offline checker printed "ALL CHECKS PASS" on each original (printouts under `capture/`, E10 to E12). Also shipped: the runner source of both builds (`capture/runner/`, E15 and E16), the converter that turned the exports into E01 (`capture/converter/`, E17 to E20, with E28, a one-function stand-in for the workshop module it imports), and a record of every reply LIQD sent (`capture/replies/`, E22 to E24, built by `capture/build-reply-record.mjs`, E21). Step 19 reruns the converter on the shipped exports and requires E01 byte for byte, reruns the record builder and requires the record byte for byte, and re-hashes every reply body in the exports against the digest the runner recorded.

**An epoch** is the set of rounds between two seed rotations. At each rotation the runner submits a client seed and the casino reveals the previous server seed. The three runs are separate sessions on the same account, with other games played between them, so the seed chain is asserted inside each run and each run carries its own pre-capture anchor (Step 2).

**Client seeds.** In Phases A and C each epoch's seed is `audit` plus 12 hex characters from the browser CSPRNG, drawn at the rotation that opens the epoch. In Phase D each of the 5 epochs runs under a player-set seed `pfaudit-prod-limbo-d<k>-` plus 12 hex characters, drawn when the run's plan was built and sent to the casino at the rotation opening its epoch (Step 18). No seed is predictable.

**Run record.** Each run's checker printout reports 0 refusals, 0 lost replies, 0 re-sent requests, 0 skipped rounds and 0 gaps.

**Population pins.** `EXPECTED_BETS 5838`, `EXPECTED_SEEDS 33`, the per-epoch sizes and the phase plan are constants in `src/config.ts` (`CAPTURE_PLAN`), typed from the runs' plans. The dataset header is reconciled against them and is never the denominator (G-BIND).

## Game and algorithm

The full specification is [docs/ALGORITHM.md](docs/ALGORITHM.md); `src/rng.ts` is built from it and `src/config.ts` carries the result map and the pricing.

1. **Commitment.** `hashedServerSeed = SHA-256(serverSeed as ASCII text)`. The server seed is 32 hex characters; the hash is over the text, not over the 16 decoded bytes.
2. **Draw.** `digest = HMAC-SHA256(key = hex-decoded serverSeed, message = clientSeed:nonce:0)`. The digest is read as 4-byte big-endian chunks; the first chunk below 4,200,000,000 gives `k = chunk mod 100,000,000`. 4,200,000,000 is 42 whole ranges, so `k` is exactly uniform.
3. **Result.** `R = min(1,000,000, max(1, floor(9,900,000,000 / (k + 1)) / 100))`.
4. **Win rule.** The round wins iff `R >= target`. A result exactly on the target wins.
5. **Payout.** A win pays `stake × target`; a loss pays 0.

What production shows for each (the step that measures it is named):

| Property | Measured on production | Step |
|---|---|---|
| Commitment | 33 of 33 revealed seeds hash to their commitment | 1 |
| Chain | 30 of 30 transitions inside the runs; 3 of 3 run anchors | 2 |
| Result | 5,838 of 5,838 recomputed results equal the served result, strict equality | 5 |
| Rejection rule | 135 rounds had their first chunk rejected (138 chunks); all recompute | 5 |
| Result floor | 116 rounds served at 1; on 66 the raw value was 0.99 | 5 |
| Result cap | 0 settled rounds; 6 verifier requests on 5 unsettled draws, 4 of them (3 draws) above the cap (E07) | 25 |
| Win rule | 5,838 of 5,838 win flags; 2 rounds exactly on target, both won; 12 one tick below, all lost | 6 |
| Payout | on 1,318 wins the payout in LIQD's bet replies is `stake × target` exactly; 4,520 losses settled at 0 | 8–10 |
| Elevated stake | 238 rounds at 10.00 USDT settle by the same rule; 114 wins | 13 |
| Player-set seed | 500 of 500 Phase D rounds recompute under 5 player-set seeds | 18 |
| Verifier | LIQD's production verifier equals the settled round on 5,838 of 5,838 | 25 |

## Payouts and RTP

### Settlement

Stakes and targets are 2-dp decimals, so `stake × target` is exact in 4 decimals and no rounding rule is exercised. Step 9 asserts the payout in LIQD's bet replies as an integer identity (`winningAmount × 1e8 == hundredths(stake) × hundredths(target) × 1e4`) with zero tolerance on all 1,318 wins, and Step 10 asserts a zero payout on all 4,520 losses. The largest payout is 20 USDT (10.00 at 2×); the largest potential payout the casino accepted is 1,000 USDT (0.10 at 10,000×). These are measured maxima, not limits (**L5**).

### Pricing and the win-chance identity

With `ci = round(100 × target)`, exactly `floor(9,900,000,000 / ci)` of the 100,000,000 draws win. Step 15 asserts that count as an integer identity on all 102 distinct targets played and checks it against a literal tally over every one of the 100,000,000 draws at four targets (1.01×, 2×, 100×, 10,000×). The two win chances LIQD's page states, 49.5% at 2× and 0.0099% at 10,000×, are the formula's.

### The effective edge is a floor, not a flat rate

`RTP = floor(9,900,000,000 / ci) × ci / 10,000,000,000`, at most 99%. The flooring only lowers the figure, so the edge is at least 1.00% at every target and exactly 1.00% where `ci` divides 9,900,000,000. Step 16 enumerates it in exact integers:

| Range | Targets | Exactly 1.00% | Largest edge | Beyond the 0.10-point band |
|---|---:|---:|---|---:|
| Audited range, 1.01× to 10,000× | 999,900 | 282 | 1.009982% at 9,989.91× | 0 |
| Formula grid up to the result cap, 1.01× to 1,000,000× | 99,999,900 | 410 | 1.989999% at 990,000.01× | not scored |

The second row is arithmetic about the formula. It is not a statement that those targets can be played (**L1**). On it the first value whose edge exceeds 1.01% is 10,009.10× and the first value beyond the RTP-CLAIM band is 100,101.12×.

Targets sharing one value of `floor(9,900,000,000 / ci)` have the same win chance and are each paid their own multiplier, so within such a group only the largest target is priced as well as those odds allow; 188,997 of the 999,900 audited targets are the best-priced member of their group.

### The RTP claim and the rule it is held to

The claim is the figure on LIQD's game page (E08): edge 1.00%, RTP 99%. The RTP-CLAIM rule 1.2.0 is enforced in this package (`src/rtp-claim-switch.ts`); the per-setting table is [outputs/rtp-claim-table.json](outputs/rtp-claim-table.json) (E06), pinned. Outcome: **PASS**, 999,900 settings, 0 beyond the band on the house side, 0 player-favourable.

### Simulation

| Pass | What | Result | Step |
|---|---|---|---|
| 1 | 2,000,000 uniformity draws and 9 targets × 1,000,000 rounds from a pinned master seed, re-derived from integer rows | chi-squared p 0.6122; lag-1 z 0.937; runs p 0.8679; worst target 1.56 standard deviations at 10×, band 5 standard deviations plus one count | 23 |
| 2 | every revealed seed × 10,000 nonces, the targets the casino served replayed in windows the size of the captured epoch | rank-sum Z −1.4316 (rule: Z < −3.090), 0 flags against 1.4459 expected, exact binomial P 1: **not rejected** | 24 |

Pass 2 is a screen, not a clearance: with 33 seeds it would detect, with at least 50% probability, a cherry-pick that puts 34.9% or more of the epochs' captured windows in their worst decile. Its rule was fixed in code on 26 September 2026, before any production capture; the window follows each epoch's own size, set after the captures. The convergence chart [outputs/rtp-convergence.html](outputs/rtp-convergence.html) plots the standard error of the simulated RTP.

### Live-round statistics (informational only)

| Sample | Rounds | Wagered (USDT) | Returned (USDT) | Wins |
|---|---:|---:|---:|---:|
| Phase A | 5,100 | 510.00 | 496.85 | 1,108 |
| Phase C | 238 | 2,380.00 | 2,280.00 | 114 |
| Phase D | 500 | 50.00 | 31.90 | 96 |
| All | 5,838 | 2,940.00 | 2,808.75 | 1,318 |

A sample of this size cannot establish an RTP; these figures illustrate variance and are never cited as RTP evidence (**L7**). The live-sample fit (Step 22, informational policy) meets every threshold.

## Verification results

`tests/verify.ts` scores **25 steps over `tests/steps/*`: 25 PASS, 0 FLAG, 0 hard fails — PROVABLY FAIR — Full Pass**, read from `outputs/verification-results.json`. A FLAG carries an origin, and only an operator-origin FLAG changes the verdict class. `npm run verify` is deterministic: the scored path has no random input.

| # | Step | Result | Finding |
|---|---|---|---|
| 1 | Seed Hash Integrity | ✅ Pass | 33/33 revealed seeds hash to their commitment; 33 distinct seeds |
| 2 | Next-Seed Pre-Commitment Chain | ✅ Pass | 30/30 transitions inside the three runs; 3/3 pre-capture anchors name their run's first commitment; on LIQD's Date headers commitment, client seed and first bet come in that order on 33/33 epochs (L6) |
| 3 | Hash Consistency & Epoch Coverage | ✅ Pass | 33 epochs covering 0..32; settled and revealed commitment sets identical |
| 4 | Nonce Audit | ✅ Pass | contiguous nonces from 0 in every epoch (25 of 200, 6 of 100, 2 of 119), sizes from `src/config.ts`; trailing bound auditor-recorded (L2) |
| 5 | Draw & Result Recomputation | ✅ Pass | 5,838/5,838 under strict equality; 116 rounds at the floor, 66 clamped; 0 at the cap (L4); 135 first-chunk rejections, all reproduce |
| 6 | Win-Rule Reproduction | ✅ Pass | 5,838/5,838 win flags; 2 ties, both won; 12 one tick below, all lost |
| 7 | Recomputation Determinism | ✅ Pass | two forward passes and a reverse pass agree on every round |
| 8 | Paid-Multiplier Derivation | ✅ Pass | served multiplier equals the target on 1,318/1,318 wins |
| 9 | Credit Arithmetic | ✅ Pass | the payout in LIQD's bet replies is the exact decimal product on 1,318 wins, 0 on losses |
| 10 | Loss Settlement | ✅ Pass | 4,520 losses settled at 0 and each failed the rule |
| 11 | Wallet Fields, Stakes & Exposure As Played | ✅ Pass | wallet fields equal game fields on 5,838 (no balances captured, L3); every stake its phase's planned stake; measured maxima printed, no limit claimed (L5) |
| 12 | Dataset Integrity & Population Identity | ✅ Pass | pin match; 5,838 rounds, 33 seeds, 3 runs bound to `src/config.ts`; 5,838 distinct ids |
| 13 | Phase Plan Conformance | ✅ Pass | phases A 5,100, C 238, D 500 at their stakes; ladder exact; top-up 50 + 50; Phase C 114 wins (floor 100); decades 2,500 / 2,400 / 100 / 50 / 50 |
| 14 | Anti-Circularity | ✅ Pass | negative control rejects a one-tick error; boundary anchor on 102 targets |
| 15 | Win-Chance vs Result-Distribution Identity | ✅ Pass | integer identity on 102 targets; 4 full-grid tallies agree |
| 16 | Effective-Edge Curve | ✅ Pass | 0 of 999,900 audited targets beyond the band; floor 1.00% at all 99,999,900 grid values |
| 17 | Target Bounds & Maximum Payout | ✅ Pass | targets in [1.01, 10,000]; 50 rounds settled at 10,000×; above it not established (L1) |
| 18 | Client-Seed Control & Phase D | ✅ Pass | 5,838 rounds under auditor-submitted seeds; 5 player-set seeds, 500/500; commitment published before each seed on 33/33 |
| 19 | Artifact Integrity | ✅ Pass | dataset, verifier probe records and simulation artifacts match their pins; the converter rerun on the shipped exports reproduces the dataset byte for byte; every reply body in the exports re-hashes; the runner source's code matches each build's; no session identifier, user agent or Cloudflare ray id in `capture/`, `data/`, `evidence/` |
| 20 | Settlement Determinism | ✅ Pass | outcome and payout determined by the inputs on 5,838; two stakes, three phases |
| 21 | Scope & Declared Limitations | ✅ Pass | the measured limitations re-checked on this run |
| 22 | Live-Sample Fit | ✅ Pass | informational; every threshold met |
| 23 | Simulation Pass 1 | ✅ Pass | re-derived from the pinned grid; prefixes replayed |
| 24 | Simulation Pass 2 | ✅ Pass | 33 seeds × 10,000 nonces; not rejected |
| 25 | Production Verifier Parity & Result Cap | ✅ Pass | verifier equals the settled round and the recomputation on 5,838/5,838; 7/7 probe records reproduce |

### Baseline-deviation review

Re-derivation proves the game behaves as the model says; it cannot notice that the model departs from what a player would assume. The left column is a standard commit-reveal Limbo baseline written independently of LIQD; the middle column is what production shows.

| Standard-Limbo baseline | LIQD observed on production | Disposition |
|---|---|---|
| A single target; win iff the result reaches it | Confirmed: the bet carries `target` alone; `win = R >= target` on 5,838 rounds | Conforms |
| Result from one bias-free draw through a reciprocal map | Confirmed: one HMAC draw at cursor 0 on a 100,000,000-point domain, rejection sampling | Conforms |
| Win rule inclusive at the target | Confirmed by settled money: 2 ties, both won | Conforms |
| Result floor at 1× | Confirmed: 116 rounds served at 1, 66 of them clamped | Conforms; not stated on the game page (P2) |
| Result cap | 1,000,000× in LIQD's verifier on 4 requests (3 distinct draws) above the cap and 1 at it; 0 settled rounds | Conforms in the verifier; not witnessed by settled money (L4) |
| Payout = stake × target | Confirmed exactly on 1,318 wins, at two stakes | Conforms; a win above 100× was not exercised by the capture (**L13**) |
| Edge at least the stated rate | A proved floor of 1.00%, 0 player-favourable targets | Conforms |
| Edge flat at the stated rate | Departs: exactly 1.00% at 282 of 999,900 audited targets, at most 1.009982% | Inside the RTP-CLAIM band; printed, not flagged (Step 16) |
| A stated maximum target | The game page names 10,000× as its top example; the highest target settled is 10,000× | Whether a higher target is accepted is not established (L1) |
| Commit-reveal, client seed after commitment, nonce per round | Confirmed, including 5 player-set seeds | Conforms |
| The casino's verifier agrees with settlement | Confirmed on 5,838 of 5,838 rounds | Conforms |
| No selection bias in the committed server seeds | Not rejected: Z −1.4316; 0 flags | A non-rejection, not a clearance |
| An operator-sourced trailing bet counter per epoch | None | Disclosed as L2 |
| A wallet balance per round | None in the replies captured | Disclosed as L3 |

There is no operator FLAG. The open items are limits of the capture (L1, L4, L13) and of what a client-side capture can see (L2, L3, L6).

### Integrity matrix and falsifiability battery

All integrity checks held in the 7 tested categories. The S5 fairness-integrity matrix (S5-1 to S5-8; S5-5 not tested in this package), the forged-artifact and population gates and the mutation battery, with the counts of the runs of record, are in [exploit-testing.md](exploit-testing.md). The battery has 110 declared counterexamples: 65 single-file mutations, 45 structural forgeries and other non-step kills, and 0 declared survivors.

## Reproduce the audit

Runtime **Node.js 22.18.0 or later in 22.x** (`package.json` `engines`, `.nvmrc`; Step 19's converter rerun needs the type stripping Node turns on by default from 22.18.0). The committed run was produced on v22.23.1; each run writes its runtime to `outputs/run/diff.json`. Other majors have not been tested.

```sh
npm ci
npm test
```

`npm test` runs `scripts/check-standalone.mjs` (a dependency-free staleness gate), `node scripts/release-manifest.mjs --check`, `node scripts/check-docs.mjs`, then `node test.js` (25 unit tests) and `node verify.js` (25 scored steps), single-file bundles generated from this package's sources. Expected: release check OK; 25 unit tests pass; 25/25 PASS, 0 FLAG, 0 hard fails; PROVABLY FAIR — Full Pass; REPRODUCED; exit 0.

| Command | Purpose |
|---|---|
| `npx mocha` | the 25 unit tests: `RngSpecTests.ts` (1 test running 78 specification checks), `rngTests.ts` (14), `resultFloorTests.ts` (8), `diffTests.ts` (2). Every vector is a production round or a production verifier reply |
| `npm run verify` | the 25 scored steps against the hash-pinned capture; writes only `outputs/run/` |
| `npm run test:toolchain` | `npm run check:build`, then mocha and verify from the TypeScript sources |
| `npm run test:full` | mocha, then `simulate:check`, `pass1:check` and `pass2:check` (each must be byte-identical to the committed file), then verify |
| `npm run mutate` | the falsifiability battery in a sandbox copy |
| `node scripts/check-docs.mjs` | holds the hashes in `evidence.md` and the counts in `exploit-testing.md`, README and MANIFEST to the files they describe |
| `npm run report` | `PF_EMIT=1`, the only command that rewrites `outputs/verification-results.json` |

| Exit | Meaning |
|---:|---|
| 0 | Full Pass, committed evidence reproduced |
| 1 | any FAIL, a reproduction beyond tolerance, or an RTP-CLAIM table mismatch |
| 2 | an operator FLAG — Conditional Pass |
| 3 | suite-integrity failure: not every step was scored; no verdict |
| 5 | RTP FIGURE OVERSTATED under the enforced RTP-CLAIM rule |

**Verification does not write the evidence it scores.** `npm run verify` writes only `outputs/run/`. **The verdict is unreachable unless every step ran (G-EXEC):** `EXPECTED_STEPS = 25` is a constant, never `results.length`. **The reproduction gate:** every leaf of this run's result document is compared with `outputs/verification-results.json`; strings and integers must be identical and non-integer numbers agree within `1e-14 + 1e-12·max(|a|,|b|)`.

### Artifacts of record

| Artifact | Pinned in | Enforced by |
|---|---|---|
| `data/limbo-prod-full-5838bets.json` | `src/config.ts` `DATASET_SHA256` | the loader, before any step |
| `evidence/E02-prod-verifier-result-cap-2026-11-09/probes-limbo.jsonl` | `src/config.ts` `CAP_PROBE_RECORDS_SHA256` | Steps 19, 25 |
| `outputs/simulation-results.json`, `outputs/rtp-convergence.html` | `src/config.ts` | Step 19; Pass-2 block re-derived by Step 24 |
| `outputs/pass1-grid.json` | `src/config.ts` `PASS1_GRID_SHA256` | Step 23 |
| `outputs/rtp-claim-table.json` | `src/rtp-settings.ts` | the RTP-CLAIM gate |

## Verify a bet

**First way: the ProvablyFair.org verifier.** [provablyfair.org/verify-bets/liqd](https://www.provablyfair.org/verify-bets/liqd), Limbo: enter the revealed server seed, the client seed, the nonce and the target; it returns the result and whether the bet wins.

**By hand.** Any player can reproduce a past Limbo round with a standard crypto library and no LIQD software. The field names are the ones in the bet record and the provably-fair panel.

1. **Get the inputs.** `hashedServerSeed` (the commitment, shown before the round), `clientSeed`, `nonce`, the chosen target `params.target` and `betAmount`. The `serverSeed` is revealed only after that seed pair is rotated.
2. **Check the commitment.** `SHA-256` of the `serverSeed` hex string **as text** must equal `hashedServerSeed`.
3. **Compute the draw.** `key = hex_decode(serverSeed)` (16 bytes); `digest = HMAC_SHA256(key, "{clientSeed}:{nonce}:0")`; read the digest in 4-byte big-endian chunks and take the first chunk below 4,200,000,000 as `k = chunk mod 100000000`.
4. **Compute the result.** `R = max(100, floor(9900000000 / (k + 1))) / 100`, capped at 1,000,000. It must equal the recorded `result`.
5. **Apply the win rule.** The round wins iff `R >= params.target`. This must agree with the recorded `win`.
6. **Check the payout.** On a win `winningAmount = betAmount × params.target` and `multiplier = params.target`; on a loss both are 0.

LIQD's own verifier does steps 3 to 5: `POST https://liqd.com/api/v1/originals/limbo/verify` with `serverSeed`, `clientSeed`, `nonce` and `params.target`.

### Representative production rounds

| Bet id | Epoch, nonce | Phase | Target | `k` | Result | Outcome |
|---|---|---|---:|---:|---:|---|
| `3G5Wm6eniZ8jXrzab4IJd` | 0, 0 | A | 1.01 | 11265120 | 8.78 | win, 0.10 → 0.101 |
| `G0bAcxPQ57qsF4ZWi3YJE` | 21, 76 | A | 11.57 | 8555954 | 11.57 | win on a tie, 0.10 → 1.157 |
| `4thzOegbI0ipF1HbnCn0O` | 1, 86 | A | 29.55 | 99966308 | 1 | loss; raw value 0.99, served 1 |
| `hiPVRKoU-wdPXn0YtH9sl` | 0, 2 | A | 1.22 | 30920117 | 3.2 | win; first chunk rejected |
| `YmgcFyv-0a7mdbhgH7qA3` | 5, 49 | A | 100 | 942101 | 105.08 | win, 0.10 → 10: the highest target won |
| `rTMFeZcZ1T7_oH6WHzDu0` | 25, 0 | D | 1.01 | 69732708 | 1.41 | win under player-set seed `pfaudit-prod-limbo-d1-6fa0b0094142` |
| `WIthFiUFeWouUsnxxnhOw` | 31, 2 | C | 2 | 8193866 | 12.08 | win, 10.00 → 20 |
| `ct9wPmzE0Gd5PtJVI20Ph` | 30, 1 | A top-up | 10000 | 43468269 | 2.27 | loss at the highest target played |

**Worked round `3G5Wm6eniZ8jXrzab4IJd`.** `serverSeed` `ea7c5163f5e0ac12ffe0efd8b6cd5dd7`, `clientSeed` `audit395ae5c90a74`, nonce 0, target 1.01. SHA-256 of the seed text is `c391eb4f199b95d18aceafbb8f4794a08eba2ac78a7b85e22c38552061a09a65`, the round's commitment. HMAC of `audit395ae5c90a74:0:0` is `7dd759603abdd8d8feaf4aa93fa2e368a478b86d6cf572bb2cc4abcaac72061f`; its first chunk 2,111,265,120 is below 4,200,000,000, so `k` = 11,265,120 and the result is `floor(9,900,000,000 / 11,265,121) / 100`, which is the served result in the table. The target is below it, so the round wins and pays stake × target.

A matching recomputation verifies that round against the supplied inputs; it does not, by itself, establish that the commitment was published before the bet (L6).

## Evidence

The evidence register, every exhibit E01 to E14 with its origin and SHA-256, is [evidence.md](evidence.md). The scored dataset and the code are this audit's evidence of record; every exhibit is production: a file produced by `liqd.com` replies, or a record the auditor wrote of one.

## Limitations and trust

The verdict is a Full Pass on 25 scored steps, not a claim that nothing is left open. No account balance was read: payouts are the amounts in LIQD's bet replies, not observed balance changes (DL-3). Everything in the register below is a limitation this audit found in its own work, measured where a size can be put on it. Step 21 re-checks L1 to L5 on every run and fails if one stops being true.

### Load-Bearing Premises

A premise the data cannot contradict must carry a witness from outside the repository's own pipeline, or be marked ASSUMED.

| Premise | Witness artifact | Could the captured data contradict it? |
|---|---|---|
| Win rule is `R >= target`, inclusive | `data/limbo-prod-full-5838bets.json` (E01): 2 rounds with result equal to the target, both settled as wins; 12 one tick below, all lost | *yes*: 2 rounds landed exactly on the target and were paid; a strict rule would have lost both |
| Result map over a uniform draw on `[0, 1e8)` at cursor 0 | `data/limbo-prod-full-5838bets.json` (E01) | **yes** — all 5,838 recompute under strict equality |
| Result floor at 1 | `data/limbo-prod-full-5838bets.json` (E01) | **yes** — 66 rounds have a raw value below 1 and were served at exactly 1 |
| Commitment is SHA-256 of the seed text | `data/limbo-prod-full-5838bets.json` (E01) | **yes** — another convention fails the 33 seeds |
| The server applies the rejection rule | `data/limbo-prod-full-5838bets.json` (E01): 135 rounds have their first chunk rejected | **yes** — an unguarded server gives a different result on 134 of the 135; on bet `QVa47RZmz6DTZoHGxY2GM` it gives the same 2.22× (Step 5) |
| A client seed chosen by the player is the seed used | `data/limbo-prod-full-5838bets.json` (E01): 500 Phase D rounds under 5 player-set seeds | **yes** — a substituted seed breaks the recomputation |
| The same rule settles a larger stake | `data/limbo-prod-full-5838bets.json` (E01): 238 rounds at 10.00 USDT | **yes, at the two stakes played** |
| The result is capped at 1,000,000× | `evidence/E02-prod-verifier-result-cap-2026-11-09/probes-limbo.jsonl` (E07): the production verifier's replies to six requests on five unsettled draws, four of them (three distinct draws) with an uncapped value above the cap | **partially** — the verifier's replies could have contradicted it and did not; no settled round reached the cap, so settlement at the cap is ASSUMED (L4) |
| A win above 100× is settled at stake × target | ASSUMED — the rule is witnessed on wins up to 100× and on 100 losses from 1,000× to 10,000×; the verifier reports multiplier 10,000 on the cap probes at target 10,000 (E07) | **no** — 0 wins above 100× in the capture (L13) |
| Client seeds were unpredictable and sent after the commitment | `data/limbo-prod-full-5838bets.json` (E01), the runner source (E15, E16) and the reply record (E22 to E24) | **partially** — on LIQD's Date headers the commitment, the client-seed submission and the first bet come in that order on 33 of 33 epochs (Step 2); the runner source draws each `audit` seed from 6 bytes of `crypto.getRandomValues`, and Step 19 holds its code to the code digest of the build each run names; that the browser's `crypto.getRandomValues` is a CSPRNG is the platform's property, not tested here |
| Each commitment existed BEFORE the rounds it covers | ASSUMED — the auditor's capture record | *no*: a digest carries no time (L6) |

### Declared limitations register

| ID | Framework id | Not established | Magnitude and measurement | Remedy |
|---|---|---|---|---|
| **L1** | DL-1 | Whether a target above 10,000× can be played | highest target settled 10,000× (50 rounds), 0 above; no refused bet held; one verifier reply, HTTP 400 on target 100000 (E09), body not retained; the game page's top example is 10,000× (E08). Step 17 | a bet attempt above 10,000× with the reply saved |
| **L2** | DL-2 | Trailing withholding | no operator bet counter on 0/33 epochs, so bets withheld after an epoch's last recorded round are not observable; the leading bound is operator-sourced and the epoch size is fixed by the plan. Step 21 | an operator-sourced bet count |
| **L3** | DL-3 | What the wallet received | no balances captured: 0/5,838 rounds carry a wallet balance, so the payout is confirmed against LIQD's bet replies (game and wallet fields), not a balance. Step 21 | capture the balance per round |
| **L4** | DL-4 | The 1,000,000× result cap in settlement | 0 of 5,838 settled rounds at the cap (99 in 100,000,000 per round); witnessed by the production verifier only: 4 requests on 3 distinct draws above the cap and 1 at it (E07). Steps 21, 25 | not worth closing deliberately |
| **L5** | DL-5 | The casino's limits | no bet was refused in the three runs: minimum stake, maximum stake, maximum payout and exposure limit are not established; stakes played 0.10 and 10.00 USDT; one account, one currency. Steps 11, 21 | probes at the limits |
| **L6** | DL-6 | When each commitment came into being | a hash chain orders records and does not date them; LIQD's own Date headers (one-second resolution) put the reply publishing each commitment, the client-seed submission and the first bet in that order on 33 of 33 epochs (a second or more apart on 32 and 10 of them); they are LIQD's clock as the auditor's runner recorded it, not an independent timestamp. Step 2 | commitments in an independently timestamped log |
| **L7** | DL-7 | An RTP from live play | 5,838 rounds returned 95.5357% of 2,940.00 USDT wagered; variance illustration only | none needed: the RTP evidence is closed-form |
| **L8** | DL-8 | Independence of the dataset's converter-computed fields | `localDraw`, `localResult`, `localWin`, `verified` on 5,838 rounds were written with this package's source and are ignored by every step | none needed |
| **L9** | DL-9 | The legacy Pass-1 statistics inside `outputs/simulation-results.json` | no scored step re-derives them; a forged and re-pinned copy is caught by byte identity only (the reproduction gate and `simulate:check`). The Pass-1 claims rest on `outputs/pass1-grid.json`, re-derived by Step 23 | none needed |
| **L10** | DL-10 | What the exports alone cannot show | the three exports ship (E25 to E27) and the converter rerun reproduces E01 from them byte for byte (Step 19); 11,715 of 11,715 reply bodies in them re-hash to the SHA-256 the runner recorded when it received them. A recorded digest shows the bytes the runner received; LIQD signs no reply, so nothing in the package ties the replies to LIQD's own records. The shipped exports differ from the runner's files on their first line (user-agent removed, a name in a plan note replaced), so the SHA-256 of the files as written (the table under Dataset and capture, E10 to E12) cannot be recomputed from the package. The runner source (E15, E16) ships with its comments edited (the sentences that named a person or described pre-production test runs removed or shortened) and the name replaced by "the auditor" in two plan-note strings of build 7e33ea9cd02d; a build id is the first 12 hex of the SHA-256 of the original source, so it is not recomputed from the package: Step 19 holds the shipped code, every full-line `//` comment removed, to the SHA-256 the auditor took from the original build the same way after the same two string replacements. The Cloudflare request id (`cf-ray`, which names the serving data centre) was removed from the 7 records of E07; their reply bodies are unchanged and Step 25 recomputes them | LIQD-signed replies |
| **L11** | DL-11 | The page text behind the algorithm description | `liqd.com/provably-fair/technical-implementation` was read logged out on 3 November 2026 and describes the same seed scheme; its text is not retained in this package and is context, not evidence | retain a copy |
| **L12** | DL-12 | Cross-account behaviour | one account; correlation of seeds across accounts was not studied | a multi-account study |
| **L13** | DL-13 | The payout of a win above 100× | 0 of the 100 rounds at 1,000× and above won (0.02 wins expected); highest winning target 100× (1 win). Step 13 | a longer capture at high targets |

### Model anchors

| Modelled figure | Anchor method | Tolerance | Enforcing step |
|---|---|---|---|
| Result recomputation | bit-for-bit re-derivation of all 5,838 settled production results under an intact chain (`tests/steps/determinism.ts`) | exact equality | Step 5 |
| The same results, independently | LIQD's production verifier reply for each round (`tests/steps/verifier.ts`) | exact equality | Step 25 |
| Win chance per target | literal tally over the entire 100,000,000-point grid (`tests/steps/anti-circularity.ts`) | exact integer equality | Step 15 |
| Effective edge per target | `floor(N/ci)·ci ≤ N` at every 2-dp value up to the result cap (`tests/steps/edge.ts`) | exact integers | Step 16 |
| Boundary behaviour | 2 settled ties, 12 one-tick-below losses, 116 floor rounds; the verifier agrees on each (`tests/steps/determinism.ts`) | exact | Steps 6 and 25 |
| Result cap | 6 production verifier requests on 5 unsettled draws (`tests/steps/verifier.ts`) | exact equality | Step 25 |
| Pass-1 statistics | re-derived from the integer rows of `outputs/pass1-grid.json` | 5 standard deviations plus one count | Step 23 |
| Pass-2 statistics | re-derived from the dataset; committed block in `outputs/simulation-results.json` | reproduction bound | Step 24 |

**Residual (declared).** The model and the checks share one reading of the rules, so a misreading would move both together; three anchors do not share it: the casino's own verifier (Step 25), the literal grid tally (Step 15) and the settled boundary rounds (Step 6). The result cap is anchored by the verifier only (L4), and the legacy simulation's Pass-1 statistics have no anchor (L9).

### Operator trust

The verifier proves that every captured production round was consistent with a pre-committed hash and an auditor-supplied client seed, that its result recomputes bit-for-bit, and that LIQD's bet reply settled it at stake × target. **Entropy model:** client seed plus server seed; one draw per round at cursor 0; no external entropy.

| Entropy component | Source | Player-observable? | Player-controllable? |
|---|---|---|---|
| Server seed (secret) | LIQD | No (until reveal) | No |
| Server seed hash (commitment) | SHA-256 of the seed text | Yes (before any round) | No |
| Next server seed hash | same convention | Yes (during the previous epoch) | No |
| Client seed | Player | Yes | **Yes — supplied at rotation** (500 rounds under player-set seeds) |
| Nonce | LIQD state | Yes | Only via ordering |

- **R-CHERRY, server-seed cherry-picking.** Contained structurally: each client seed was unpredictable and was sent after its epoch's commitment was published (33 of 33). The statistical screen is not rejected and is not a clearance at 33 seeds.
- **R-EDGE, the edge is a closed form, not a measurement.** It is as true as the result formula, which every settled round and every verifier reply confirms up to 10,000×.
- **R-ORPHAN, selective withholding of rounds.** Not detectable from a client-side capture (L2). Disclosed.
- **R-CREDIT.** The payout is confirmed against the fields of LIQD's bet replies, not a balance; no balances captured (L3). Disclosed.
- **R-SCOPE.** Targets to 10,000×, two stakes, one currency, one account (L1, L5, L12, L13). Disclosed.

### Recommendations

Nothing here is a security fix: all integrity checks held in the 7 tested categories, no captured round is player-favourable, and the house edge is a proved floor.

- **P1. State the maximum target next to the 99% figure**, and keep the accepted range inside the one the figure is true for: the claim holds on every target up to 100,101.11×.
- **P2. Publish the result floor and cap**: `min(1,000,000, max(1, floor(9,900,000,000 / (k + 1)) / 100))`.
- **P3. Publish commitments to an independently timestamped append-only log** (L6).
- **A1. Open on the audit side:** a bet attempt above 10,000× with the reply saved (L1); wins at high targets (L13); an operator bet count and the wallet balance per round (L2, L3); replies LIQD signs (L10).

## Terms

**Provably fair / commit-reveal:** the server publishes `hashedServerSeed` before any round and reveals `serverSeed` after rotation. **Server seed:** a 32-character hex string, the HMAC key in hex-decoded form. **Client seed:** player-controlled text, supplied at rotation. **Nonce:** a round's position under one seed pair, from 0. **Epoch:** the rounds between two rotations. **Target:** the multiplier the player chooses. **Result:** the multiplier the round produces. **Run:** one session of the capture runner; this audit has three.

**Guard codes used in the code comments.** **G-BIND:** a count is not an identity; every population assertion binds to constants in `src/config.ts`, never to a count the dataset states about itself. **G-EXEC:** no verdict is printed unless every defined step ran. **G-RANGE:** every scalar read from the dataset is bounded by what is physically possible, from constants and not from the dataset. **G-VALID:** an exact or round value is never treated as suspicious. **G-SCOPE:** the declared scope (host, range, limitations) is measured on every run, not only written down.

## Release history

**`v1.1.0`** (11 November 2026, tag v1.1.0). The scored population is the `liqd.com` capture of 7 and 10 November 2026 (E01: 5,838 rounds, 33 epochs, Phases A, D and C); every step, pin, unit vector, evidence exhibit and limitation is derived from production. Step 25 is the production verifier (parity on every round, result-cap probes); Step 17 states the target bounds from production; Step 18 covers player-set seeds; Step 13 covers the elevated stake and the target decades up to 10,000×. The capture chain ships with it: the three exports, the converter (rerun by Step 19, which requires the dataset byte for byte), the runner source of both builds and a record of every reply LIQD sent, and LIQD's Date headers order commitment, client seed and first bet (Step 2).
