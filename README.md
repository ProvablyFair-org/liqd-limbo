# LIQD Limbo — Provably Fair Audit

**Auditor:** [ProvablyFair.org](https://www.provablyfair.org) · **Audit ID:** `PF-2026-LQ05` · **Release:** `v1.1.0` · **Capture:** 7 and 10 November 2026, `liqd.com` (production)

**Result: PROVABLY FAIR — Full Pass.** 25 of 25 scored steps pass: no flag, no hard fail. Every check of LIQD's behaviour rests on production data: 5,838 rounds played on `liqd.com` in 33 seed epochs, and LIQD's production verifier's reply for every one of them. Every round recomputes bit-for-bit from its `(serverSeed, clientSeed, nonce)` inputs; the commit-reveal chain is intact inside each of the three capture runs; LIQD's bet replies settle 1,318 of 1,318 winning rounds at exactly stake × target.

| Phase | Rounds | Stake (USDT) | Targets |
|---|---:|---:|---|
| A | 5,000 | 0.10 | 50 targets from 1.01× to 100×, 100 rounds each |
| A top-up | 100 | 0.10 | 50 rounds in [1,000×, 10,000×) and 50 at exactly 10,000× |
| D | 500 | 0.10 | the same 50 targets, under 5 player-set client seeds |
| C | 238 | 10.00 | fixed 2.00× |

**Scope:** the highest target played is 10,000×. Whether `liqd.com` accepts a bet above 10,000× is not established: no refused bet is held, and the one record on the question is a production verifier reply (HTTP 400 on target 100000, 3 November 2026). No production win was paid above 100×: none of the 100 rounds at 1,000× and above won. The 1,000,000× result cap is shown by LIQD's verifier on four requests (three distinct draws) whose uncapped value is above it, not by a settled round. LIQD's stated 99% RTP passes the RTP-CLAIM rule on every target from 1.01× to 10,000×.

## What was verified

| Check | Production evidence |
|---|---|
| Results | 5,838 of 5,838 results recomputed from server seed, client seed and nonce under strict equality, no tolerance |
| Commitments | 33 of 33 revealed seeds hash to their commitment; 30 of 30 next-seed links inside the runs; each run anchored by the pair read before its first bet |
| Client seeds | every epoch's seed submitted by the auditor after the epoch's commitment was published; 500 rounds under 5 player-set seeds recompute |
| Win rule | 5,838 of 5,838 win flags under `R >= target`; 2 rounds landed exactly on their target and both settled as wins; 12 landed one tick below and all lost |
| Payouts | on 1,318 wins the payout in LIQD's bet reply is `stake × target` as an exact integer identity; 4,520 losses pay 0; 238 rounds at 10.00 USDT settle by the same rule (114 wins) |
| LIQD's verifier | result, win flag and multiplier equal the settled round on 5,838 of 5,838; the 7 cap-probe replies reproduce (4 requests, on 3 distinct draws, above the cap) |
| House edge | at least 1.00% at every 2-dp value up to the result cap, in exact integers; not flat: at most 1.009982% on targets up to 10,000× |
| RTP claim | RTP-CLAIM 1.2.0 PASS: 999,900 settings from 1.01× to 10,000×, exact RTP 98.990018% to 99.000000%, 0 beyond the 0.10-point band |
| Simulation | Pass 1 on a pinned master seed re-derived by Step 23; Pass 2 cherry-pick screen on the 33 production seeds **not rejected** (rank-sum Z −1.4316, 0 flags against 1.4459 expected) |
| Falsifiability | 110 declared counterexamples run in a sandbox copy; the result of the run of record is in [exploit-testing.md](exploit-testing.md) |

**Declared residual.** Three things are anchored by something other than settled money and are stated as such: the 1,000,000× result cap (LIQD's verifier only, **L4**), the payout of a win above 100× (not exercised: no such win in the capture, **L13**) and whether a target above 10,000× can be played (not established, **L1**).

Matching hashes and an intact chain establish which seed goes with which round and in what order the records sit; they do not establish when a commitment came into being. LIQD's own Date headers put the commitment, the client seed and the first bet of every epoch in that order, on LIQD's clock as the runner recorded it (L6). No account balance was read: payouts are the amounts in LIQD's bet replies, not observed balance changes (DL-3). That, the casino's limits and the other open items are in the [overview's limitations](MANIFEST.md#limitations-and-trust).

## Run the audit

Open a terminal in the package directory. Use **Node 22.18.0 or later in 22.x** ([.nvmrc](.nvmrc) pins 22.23.1, the version the committed run was produced on). It requires Node >= 22.18.0 because Step 19 reruns the converter, which loads `src/*.ts` through Node's built-in type stripping, on by default from 22.18.0; on 22.17.1 the converter stops with ERR_UNKNOWN_FILE_EXTENSION and Step 19 fails.

```sh
npm ci
npm test
```

Expected: **release check OK; 25 unit tests pass; 25/25 PASS, 0 FLAG, 0 hard fails; PROVABLY FAIR — Full Pass; REPRODUCED; exit 0.** `npm test` runs the standalone staleness gate, `node scripts/release-manifest.mjs --check`, then `scripts/check-docs.mjs`, then the single-file bundles `test.js` (25 unit tests) and `verify.js` (25 scored steps). It scores the committed artifacts and writes only to `outputs/run/`.

```sh
npm run test:full                 # unit tests, three byte-identical regenerations, then verification
npm run mutate                    # the falsifiability battery in a sandbox copy
node scripts/release-manifest.mjs --check
```

See [reproduction details](MANIFEST.md#reproduce-the-audit) for exit codes and tolerances.

## Verify a bet

The quickest way: the ProvablyFair.org verifier at [provablyfair.org/verify-bets/liqd](https://www.provablyfair.org/verify-bets/liqd) (choose Limbo), which takes the revealed server seed, the client seed, the nonce and the target and returns the result and whether the bet wins.

By hand: Save `hashedServerSeed` before betting. The `serverSeed` is revealed only after that seed pair is rotated. Check that `SHA-256` of the server-seed hex string, as text, equals the commitment; key HMAC-SHA256 with the hex-decoded seed over `clientSeed:nonce:0`; take the first 4-byte chunk below 4,200,000,000 modulo 100,000,000 as the draw `k`; then `R = max(100, floor(9900000000 / (k + 1))) / 100`, capped at 1,000,000. The round wins if `R >= target` and pays `betAmount × target`. LIQD's verifier (`POST https://liqd.com/api/v1/originals/limbo/verify`) returns the same result. [Step by step, with worked production rounds](MANIFEST.md#verify-a-bet).

## Files and evidence

- [Captured rounds](data/limbo-prod-full-5838bets.json): 5,838 production rounds, 33 epochs, SHA-256 `65c7a472b503bbcd9db9f26caee28d51d6536427f286fb9d3d9ec038ab17e101`, converted from the three runner exports (provenance in the file's `meta.conversion` and `meta.captures`).
- The offline checker's printouts on the three raw exports: [7 November](capture/prod-2026-11-07/limbo-5k-check.txt), [10 November, Phases D and A top-up](capture/prod-2026-11-10/limbo-phases-2026-11-10-check.txt), [10 November, Phase C](capture/prod-2026-11-10/limbo-C-2026-11-10-check.txt).
- From the capture: [the three exports](capture/captures/) (first line edited, [what and why](evidence.md)), [the converter](capture/converter/full-limbo.mjs), which Step 19 reruns on them to reproduce the dataset byte for byte, the runner source of [build 6fd6576d4561](capture/runner/limbo-prod-capture-runner-build-6fd6576d4561.js) (run 1) and [build 7e33ea9cd02d](capture/runner/limbo-prod-capture-runner-build-7e33ea9cd02d.js) (runs 2 and 3), and a record of every reply LIQD sent in [run 1](capture/replies/liqd-limbo-prod-replies-capture-1.jsonl), [run 2](capture/replies/liqd-limbo-prod-replies-capture-2.jsonl) and [run 3](capture/replies/liqd-limbo-prod-replies-capture-3.jsonl).
- [Production verifier probes at the result cap](evidence/E02-prod-verifier-result-cap-2026-11-09/probes-limbo.jsonl), [the verifier reply on target 100000](evidence/E03-prod-verifier-target-100000.json) and [the figures on LIQD's game page](evidence/rtp-page-labels-2026-10-01.json).
- Limbo has no multiplier-table file: the payout is `stake × target`.
- [Verification results](outputs/verification-results.json), [RTP claim table](outputs/rtp-claim-table.json) and [release manifest](RELEASE-MANIFEST.json).
- [The algorithm specification](docs/ALGORITHM.md) the RNG module is built from.
- [Audit report](https://audit.provablyfair.org/casino/liqd/games/limbo/overview) · [Public repository](https://github.com/ProvablyFair-org/liqd-limbo/tree/v1.1.0) · [MIT license](LICENSE).

This tree is `v1.1.0`. The [release history](MANIFEST.md#release-history) records what changed.

Documents: this README; [MANIFEST.md](MANIFEST.md), the consolidated audit overview (dataset, algorithm, RTP analysis, verification results, limitations, release history); [evidence.md](evidence.md), the evidence register; [exploit-testing.md](exploit-testing.md), the integrity, forgery and mutation matrix; [SUMMARY.md](SUMMARY.md), the table of contents. `npm test` runs `scripts/check-docs.mjs`, which holds the hashes and counts in these documents to the files they describe.
