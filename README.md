# LIQD Limbo — Provably Fair Audit

**Auditor:** [ProvablyFair.org](https://www.provablyfair.org) · **Audit ID:** `PF-2026-LQ05` · **Release:** `v1.0.1` (errata to `v1.0.0`, the first public release) · **Capture:** 11 September 2026, `qa.liqd.com` (pre-production)

**Result: PROVABLY FAIR — Full Pass** *(provisional — pre-launch capture)*. 25 of 25 scored steps pass: no flag, no hard fail. Every one of the 6,700 captured rounds recomputes bit-for-bit from its `(serverSeed, clientSeed, nonce)` inputs; the commit-reveal chain is intact across all 134 seed epochs; every winning credit is the exact decimal product of stake and chosen target; and the house edge is a closed-form floor at or above 1.00% on every legal target, with no player-favourable target. Until 2 October 2026 the verdict was a Conditional Pass on one operator FLAG (Step 25, the target cap); the cap re-probe that day (E21) saved the server's refusal of four targets above the RTP-CLAIM band edge, and Step 25 passes on it.

**Scope:** This certification applies to the game as capped at 10,000×, as observed on `qa.liqd.com` on 26 September and 2 October 2026. That `liqd.com` production serves the same game build is not established by this capture, and no claim in this package extends to it (L1). The 6,700 audited rounds were captured on 11 September, before the cap; after the cap the package holds 304 settled rounds, all 304 recompute and all 304 lost (L18). LIQD's stated 99% RTP passes the RTP-CLAIM rule on every target up to 10,000×; on the range the 11 September build accepted (targets up to 500,000×) the same rule fails on 23,885,381 of 49,999,900 targets, so **this result depends on the cap**. The live sample return (100.4475%) is a variance illustration only (L7).

## What was verified

| Check | Captured evidence |
|---|---|
| Results | 6,700 of 6,700 results recomputed from server seed, client seed and nonce under strict `===`, no tolerance |
| RNG source | `src/rng.ts` rebuilt from the written specification [docs/ALGORITHM.md](docs/ALGORITHM.md) by an implementer who never opened LIQD's code; it reproduces 7,004 of 7,004 captured rounds (the 6,700 plus 300 supplement and 4 probe rounds). LIQD's own output is a second check, not the source: 4 of 4 Verify-calculator values, 2 of 2 `/verify` replies |
| Commitments | 134 of 134 revealed seeds hash to their commitment; 133 of 133 next-seed links, plus a pre-capture link naming epoch 0's commitment |
| Win rule | 6,700 of 6,700 win flags reproduced under `R >= target`; 20 rounds landed exactly on their target and all 20 settled as wins |
| Payouts | 2,822 wins credit `stake × target` as an exact integer identity; 3,878 losses pay 0; no win above 100× was captured (L16) |
| House edge | ≥ 1.00% at all 99,999,900 legal targets in exact integers, 0 player-favourable; not flat: at most 1.009982% on targets up to 10,000×, 1.497487% at the worst target playable on 11 September |
| RTP claim | RTP-CLAIM 1.2.0 PASS: 999,900 settings from 1.01× to 10,000×, true RTP 98.990018% to 99.000000%, 0 beyond the 0.10-point band |
| Target cap | 2 October 2026: 100,101.12×, 497,487.44×, 500,000× and 990,000.01× each refused, HTTP 400, errorCode 3001, reply saved, no nonce consumed (E21) |
| Simulation | Pass 1 on a pinned master seed re-derived by Step 23; Pass 2 cherry-pick screen **not rejected**: rank-sum Z −0.1711, exact-method recount 10 flags vs 5.8712 expected, P 0.0708 |
| Falsifiability | 117 declared counterexamples: 116 killed, 1 declared survivor (run 2026-10-20 on the rebuilt tree, one entry retargeted and rerun on its own) |

Matching hashes and an intact chain establish which seed goes with which round and in what order the records sit; they do not establish when a commitment came into being (L6). Production parity, the 1,000,000× result ceiling, the wallet balance and the other open items are in the [overview's limitations](MANIFEST.md#limitations-and-trust).

## Run the audit

Open a terminal in the package directory. Use **Node 22.x**, as declared in [.nvmrc](.nvmrc) and [package.json](package.json); the committed run was produced on v22.23.1.

```sh
npm ci
npm test
```

Expected: **release check OK; 27 unit tests pass; 25/25 PASS, 0 FLAG, 0 hard fails; PROVABLY FAIR — Full Pass; REPRODUCED; exit 0.** `npm test` runs the standalone staleness gate, `node scripts/release-manifest.mjs --check`, then the single-file bundles `test.js` (27 unit tests) and `verify.js` (25 scored steps). It needs no install, scores the committed artifacts and writes only to `outputs/run/`.

```sh
npm run test:full                 # unit tests, three byte-identical regenerations, then verification
npm run mutate                    # the falsifiability battery: 117 counterexamples in a sandbox copy
node scripts/release-manifest.mjs --check
```

On an Apple M2 Max (Node 22.23.1, 2026-10-03, fresh clone) `npm run verify` took about 18 s and `npm run mutate` about 27 minutes (1,640 s). See [reproduction details](MANIFEST.md#reproduce-the-audit) for exit codes, tolerances, the mutation battery and the deliberate artifact-refresh procedure.

## Verify a bet

Save `hashedServerSeed` before betting. The `serverSeed` is revealed only after that seed epoch rotates. Check that `SHA-256` of the server-seed hex string, as text, equals the commitment; key HMAC-SHA256 with the hex-decoded seed over `clientSeed:nonce:0`; take the first 4-byte chunk below 4,200,000,000 modulo 100,000,000 as the draw `k`; then `R = max(100, floor(9900000000 / (k + 1))) / 100`. The round wins if `R >= target`, and a win pays `stake × target`. These steps are the written specification, [docs/ALGORITHM.md](docs/ALGORITHM.md). The [complete instructions and worked real rounds](MANIFEST.md#verify-a-bet) give every field name and step.

## Files and evidence

- [Captured rounds](data/limbo-master-6700bets.json) — 6,700 rounds, 134 epochs, SHA-256 `8e3ce5b5e1494d1fcc3a783965d3ba7b6a7099f120a64d61e21a577098c07334`.
- [2026-09-26 supplement](data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json), SHA-256 `a2dee374cfd48c62736cf5958fd67f42b1cb7c622ab0883c3f84278d8429ab1e`, and [its journal](data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.journal.ndjson), SHA-256 `bcacab9c674df62a3b2219cba008542f2e798e9c81559c6321489e1a43949c32` — scored by Step 25 only.
- [Cap re-probe journal, E21](evidence/E21-target-cap-probe/liqd-limbo-cap-probe-2026-10-02T18-22-46-633Z.journal.ndjson), SHA-256 `14f9880eff8294a5a7d8b0ce3fe715093eda5061899713ff87d3c9c098719809`, run as [capture/PROBE-2026-10-02.md](capture/PROBE-2026-10-02.md) describes.
- Limbo has no multiplier-table config file: the payout is `stake × target`, so there is no config artifact to pin.
- [Verification results](outputs/verification-results.json), [RTP claim table](outputs/rtp-claim-table.json) and [release manifest](RELEASE-MANIFEST.json).
- [Audit report](https://audit.provablyfair.org/casino/liqd/games/limbo/overview) · [Public repository](https://github.com/ProvablyFair-org/liqd-limbo) · [MIT license](LICENSE).

This tree is `v1.0.1`, an errata release on `v1.0.0`, the first public release, which was published as one commit on 21 October 2026. The release commit and tag are signed with the ProvablyFair.org release key (SSH, `SHA256:gEujiJm2pRyq7lQsfYQfQ1r97H/J7GdaKHbOW8GtikY`), which the release manifest records. The 4 October 2026 consolidation is recorded in the [release history](MANIFEST.md#release-history).

There are two documentation files: this README and [MANIFEST.md — consolidated audit overview](MANIFEST.md), which holds the game rules, algorithm, RTP analysis, verification results, evidence register, limitations and release history. The written specification the RNG module is rebuilt from is [docs/ALGORITHM.md](docs/ALGORITHM.md).
