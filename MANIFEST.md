# LIQD Limbo — Consolidated Audit Overview

**Audit ID:** `PF-2026-LQ05` · **Auditor:** ProvablyFair.org · **Release:** `v1.0.1` (errata to `v1.0.0`, the first public release) · **Framework:** 1.1

Limbo (`gameId` `originals-limbo`) on LIQD.com, captured against `qa.liqd.com` (authenticated live session) in USDC. Algorithm recon 7 September 2026. Dataset of record: 11 September 2026, 13:16:45–14:12:05 UTC, with endpoint, boundary and limit probes in the same session. Target-decade supplement and ceiling probe: 26 September 2026. Cap re-probe: 2 October 2026. Report: `https://audit.provablyfair.org/casino/liqd/games/limbo/overview`. Publication date: 21 October 2026 (release `v1.0.0`). This overview consolidates the package documentation; the machine-readable release identity is in [RELEASE-MANIFEST.json](RELEASE-MANIFEST.json).

## Conclusion and scope

**PROVABLY FAIR — Full Pass** *(provisional — pre-launch capture)* — 25/25 scored steps pass, 0 FLAG, 0 hard fails; 27/27 unit tests. Every one of the 6,700 captured rounds recomputes bit-for-bit from its `(serverSeed, clientSeed, nonce)` inputs under the published result formula; the commit-reveal chain is intact across all 134 seed epochs; every credited payout on a winning round is the exact decimal product of stake and chosen target, asserted as an integer identity with zero tolerance (wins were captured on targets from 1.01× to 100×); and the house edge is not a measured average but a **closed-form floor** — the operator's own pricing puts it at or above 1.00% on every legal target, with no player-favourable target anywhere in the legal range. Until 2026-10-02 the verdict was a Conditional Pass on one operator FLAG (Step 25, the target cap).

**The target cap (Step 25, F-CEILING) — evidenced 2026-10-02.** On 2026-09-11 the server accepted and settled targets up to 500,000× (250 rounds at 100,000×, 250 at 500,000×). A 10,000× limit in the UI was observed on 2026-09-23; no record of it was kept. On 2026-09-26 the only probe above 10,000× (93,830.94×, itself inside the RTP-CLAIM band at 98.991642%) did not settle and its reply was not saved. On 2026-10-02 the cap re-probe (**E21**) sent `qa.liqd.com` a $0.10 control at 10,000×, which settled and recomputes from its revealed seed, then one $0.10 request each at 100,101.12× (the first target outside the RTP-CLAIM band), 497,487.44×, 500,000× and 990,000.01×. The server refused all four — HTTP 400, errorCode 3001, `"Too big: expected number to be <=10000"` — consumed no nonce, and every reply is saved in the pinned journal. 100,000× was not re-probed.

**RTP claim.** LIQD's Limbo page shows "Edge: 1.00%" and RTP "99%", and says "2x lands 49.5% of the time, 10,000x lands 0.0099% of the time, and every target in between returns 99%" (read 1 October 2026, E23). The RTP-CLAIM rule (1.2.0) requires every setting a player can bet to return within 0.10 percentage points of the stated figure. On every target up to 10,000× — 999,900 settings — the true RTP runs from 98.990018% (at 9,989.91×) to 99.000000%, so the claim holds (**PASS**). Off the 1.00% edge on 999,618 of those targets, by at most 0.009982 points, is inside the band and is printed, not flagged (Step 16).

**This result depends on the cap.** Scored up to 100,000× the rule still passes (worst 98.900109%); the first target outside the band is 100,101.12×. Scored up to 500,000×, the range the 11 September build accepted, the rule fails: 23,885,381 of the 49,999,900 targets return more than 0.10 points below 99%, the lowest 98.502513% (at 497,487.44×). The evidence for the cap is the unsettled request of 26 September (reply not saved) and the four refusals of 2 October with the reply saved (E21, L15).

**Provisional scope.** All bets were captured against LIQD's pre-production environment. The certification applies to the game as capped at 10,000×, as observed on `qa.liqd.com` on 26 September and 2 October 2026; that `liqd.com` production serves the same game build is not established by this capture, no claim in this package extends to it, and Step 21 asserts the declared host against the dataset header on every run so the claim cannot widen (L1). The 6,700 audited rounds were captured on 11 September, before the cap. After the cap the package holds 304 settled rounds; all 304 recompute and all 304 lost, so no winning payout was captured on the capped game (**L18**). Production parity will be confirmed by an anonymous post-launch capture, and the certification page reflects provisional status until then.

**Four items are not clean ticks.** **F-CEILING** (profile LIMBO-14, Step 25 PASS since 2026-10-02, a FLAG until then) is the dated cap above. **F16** (profile LIMBO-19, Step 16 PASS): the 1.00% house edge is a proved floor but **not flat** — on targets ≤ 10,000× it differs from the claim at 999,618 of 999,900 targets by at most 0.009982 points, inside the band; disclosed: up to 1.497487% on targets playable on 2026-09-11. **F17 / F-MAXMULT** (a note, profile LIMBO-14, Step 17): on 2026-09-11 the 1,000,000× maximum target in LIQD's client code could not be played at any legal stake; the code file is not in this package and nothing in it shows players are told 1,000,000×. **F-PASS2** (Step 24): the cherry-pick screen is a non-rejection with its detection power stated, not a clearance.

Matching hashes and an intact chain establish *which* seed goes with which round and in what order the records sit — never *when* a commitment came into being. Every non-alteration claim here is conditional on the auditor's attested capture chronology (L6). The 6,700-round live return of 100.4475% is a variance illustration only (L7); the RTP evidence is the closed-form edge of Step 16, anchored by the full-grid tally of Step 15 and tied to the operator by Step 5. The eighteen declared limitations (L1–L18, three of them closed) are in [Limitations and trust](#limitations-and-trust).

**In scope:** the RNG algorithm and the result map with both clamps; the commit-reveal protocol; result recomputation and win-rule reproduction, including results landing exactly on the target; payout integrity on every winning round captured; return to player as a closed-form edge held to the RTP-CLAIM rule; the operator's input contract (exposure ceiling witnessed, minimum stake inferred, target ceiling probed); and exploit testing against the S5 categories. The audit follows the ProvablyFair.org standard eight-phase methodology (algorithm discovery, live validation, data capture, independent verification, Monte Carlo simulation, adversarial testing, statistical analysis, reporting). **Out of scope:** platform security; account systems, deposits, withdrawals and KYC; responsible-gambling features; other games on the platform; the server-side entropy source (unauditable without server access, mitigated by the commitment); and production parity (PROVISIONAL, L1). LIQD is a centralized platform with no on-chain record; verifiability rests on the commit-reveal scheme. Outcomes were collected in one 55-minute window from one account, and platform behaviour could change after the audit date.

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

| Property | Value |
|---|---|
| Master file | [data/limbo-master-6700bets.json](data/limbo-master-6700bets.json), schema `liqd-limbo-capture-v1` (`src/types.ts`), top level `{ meta, seeds[134], bets[6700] }` |
| SHA-256 | `8e3ce5b5e1494d1fcc3a783965d3ba7b6a7099f120a64d61e21a577098c07334` |
| Rounds · epochs | 6,700 · 134 of exactly 50, 134 **distinct** server seeds, 134/134 revealed (`seeds[0].serverSeed` present, 100% verifiable) |
| Wins / losses | 2,822 / 3,878 |
| Distinct targets · stakes | 1,104 targets from 1.01× to 500,000× · $0.10 and $10.00 |
| Staked / returned | $2,650.00 / $2,661.86 |
| Draw span · result span | `k` 534 to 99,990,804 of `[0, 100000000)` · 1× to 185,046.72×, median 1.97×, the 1,000,000× ceiling unreached |
| Boundary rounds | 20 landed with `result == target`; the operator settled all 20 as wins |
| Floored rounds | 147 served at `R = 1` (2.19%), of which **78** genuinely clamped (raw value below 1) |
| Collection window | 11 September 2026, 13:16:45–14:12:05 UTC, one session, one account |

| Phase | Rounds | Stake | Epochs | Purpose |
|---|---:|---:|---|---|
| A | 5,000 | $0.10 | 0–99 | Random target from a win chance drawn in [2%, 98%] — targets 1.01× to 49.45× |
| B | 1,000 | $0.10 | 100–119 | High-multiplier tail — 250 each at 100× (epochs 100–104), 1,000× (105–109), 100,000× (110–114), **500,000×** (115–119) |
| C | 200 | $10.00 | 120–123 | Stake independence — fixed 2.00× target at 100× the base stake |
| D | 500 | $0.10 | 124–133 | Custom `pfaudit-` client seeds (client-seed control) |

This is the ProvablyFair.org standard 6,700-round formula-game capture, the same four-phase design as the LIQD Dice audit. **Phase B's top tranche is 500,000× and not the 1,000,000× maximum target in LIQD's client code: that is finding F17, not a coverage choice.** Phase A reaches decades 10^0 and 10^1 only; the 2026-09-26 supplement adds Phase A rounds in 10^2, 10^3 and 10^4.

**Supplement (2026-09-26), scored by Step 25 only.** [data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json](data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json) (SHA-256 `a2dee374cfd48c62736cf5958fd67f42b1cb7c622ab0883c3f84278d8429ab1e`, schema `liqd-limbo-capture-v2`) and its journal (`…journal.ndjson`, SHA-256 `bcacab9c674df62a3b2219cba008542f2e798e9c81559c6321489e1a43949c32`): 300 Phase-A rounds (label `A2`) placed 17:48:02–17:56:42 UTC by `capture/capture-limbo-v2.mjs`, 6 epochs of 50, 6/6 revealed, $0.10 each, 100 targets in each of decades 10^2 and 10^3 (CSPRNG log-uniform within the decade) and 100 at exactly 10,000×. Client seeds are `"audit" + crypto.randomBytes(6)`, each set after its commitment was published. 0 wins against 0.4182 expected. **One declared pause-and-resume** after epoch 0's 50 rounds, before its rotation (reported by the capture operator as a rate limit; the journal records only the stop and the resume): the journal's `resume-check` at 17:53:10 UTC read the operator's active seed back at nonce 50 — the 50 rounds recorded under it — so the pause consumed no unrecorded round. No refusal, capture gap or recovered round is journalled, and no session cookie or token is in either file (searched). It closes the Phase A per-decade floor up to the declared ceiling (profile LIMBO-15) and changes no audited figure.

### Live target ceiling

**2026-09-26 (E20).** Two pinned probe journals in `evidence/E20-target-ceiling-probe-2026-09-26/`: bets at 10,000× settled; a request at 93,830.94× has an intent, no settlement and consumed no nonce. The server's reply is not in either journal; its text (`errorCode 3001`, "<=10000") is a hand-typed note in `capture/capture-limbo-v2.mjs`. One above-ceiling target probed, and it is inside the RTP-CLAIM band.

**2026-10-02 (E21).** `evidence/E21-target-cap-probe/liqd-limbo-cap-probe-2026-10-02T18-22-46-633Z.journal.ndjson` (SHA-256 `14f9880eff8294a5a7d8b0ce3fe715093eda5061899713ff87d3c9c098719809`, pinned as `CAP_PROBE_JOURNAL` / `CAP_PROBE_SHA256`), run on `qa.liqd.com` by the audit as [capture/PROBE-2026-10-02.md](capture/PROBE-2026-10-02.md) describes and vendored byte for byte: a $0.10 control at 10,000× settled (served R 5.96, recomputed 5.96 from the seed its closing rotation revealed); one $0.10 request each at 100,101.12×, 497,487.44×, 500,000× and 990,000.01× refused — HTTP 400, errorCode 3001, field messages "Too big: expected number to be <=10000" and "must be a multiple of 0.01 between 1.01 and 10000 (win chance 0.009900%–98.019801%)" — every reply saved, no nonce consumed, no settlement. Scored by Step 25. Beside it, **recorded, not pinned and not scored:** the first run that day (`…2026-10-02T18-20-11-617Z.journal.ndjson`, SHA-256 `614ef346ecd4366ef4e2bbc1861eeffce320b880868f7baf26896546d527e310`), which placed no bet because the server refused its control for a missing `body.stakeCurrency` (errorCode 3001). The place-bet API now requires that field (first seen 2026-10-02; `capture/capture-limbo-v2.mjs` sends `USDC` since). Its rotation installed the commitment the second run opened on, at nonce 0. Every "playable" figure above 10,000× in this overview describes 2026-09-11.

### Field provenance

Five things look alike and are not. **RECORDED**: a field the operator returned, stored verbatim (`result`, `win`, `winningAmount`, `hashedServerSeed`, `serverSeed`, …). **CAPTURE-COMPUTED**: written by the capture rig, not by LIQD (`multiplier`, `localDraw`, `localResult`, `localWin`, `verified`, `creditedOk`, `walletOk`, `epoch`, `phase`, `at`, `nonceEnd`, `commitVerified`, `chainLinkOk`, and all of `meta`). **RECOMPUTED**: derived by code in this repository from RECORDED inputs — everything `tests/verify.ts` scores. **SAVED SUMMARY**: a stored verdict or statistic from an earlier run (`outputs/verification-results.json`, `outputs/simulation-results.json`, `outputs/pass1-grid.json`); a stored `PASS` records that a run once printed `PASS`, so re-run the check. **ASSUMED / ATTESTED**: asserted with no artifact here that could contradict it — the 1,000,000× result ceiling, production-build parity, commitment chronology and dataset provenance.

| Field | Status | Notes |
|---|---|---|
| `id` | RECORDED | 6,700 distinct |
| `params.target` | RECORDED | the **only** game input, a 2-dp value: [1.01, 1,000,000] under the 2026-09-07 client constants, 1.01 to 500,000 in the dataset, [1.01, 10,000] accepted by the server since the cap (E21) |
| `nonce`, `clientSeed` | RECORDED | nonce 0–49 within the epoch; the client seed enters the HMAC message |
| `hashedServerSeed`, `serverSeedId` | RECORDED | commitment (constant across the epoch) and operator handle |
| `result`, `win`, `resultLabel` | RECORDED | served result multiplier (2 dp), win flag, `won` / `lost` |
| `multiplier` | **CAPTURE-COMPUTED** | the capture script reads a wager-level `multiplier`, then an outcome-level `payoutMultiplier`, and otherwise writes the target on a win and `0` on a loss. None of the 303 raw casino responses kept in this package (the 300 supplement rounds and 3 probe rounds) has either key — the casino's own field is `outcome.multiplier` — and no raw response from 2026-09-11 was kept, so on this dataset the column is the script's fill (Step 8) |
| `betAmount`, `winningAmount` | RECORDED | stake and credited amount; `betAmount` may be a JSON number or a decimal string |
| `stakeWallet`, `winningAmountWallet` | RECORDED | wallet-denominated legs of the same settlement, present on 6,700/6,700, checked by Step 11 with zero tolerance |
| `localDraw`, `localResult`, `localWin`, `verified`, `creditedOk`, `walletOk` | **CAPTURE-COMPUTED** | the rig's inline self-check on 6,700/6,700 rounds; **no scored step reads them**; Step 21 counts them so their exclusion is visible (L8) |

Seed rows: `hashedServerSeed`, `nextHashedServerSeed`, `serverSeed` and `nonceStart` (the operator's own post-rotation nonce) are RECORDED; `nonceEnd`, `epoch`, `phase`, `commitVerified`, `chainLinkOk` are CAPTURE-COMPUTED. `operatorBetCount` is **absent on 134/134** (L2). `meta.preCapture` records the commitment state read before the first round, including a pre-capture reveal whose `nextHashedServerSeed` is epoch 0's commitment.

**The audited population is a code constant, not a header field.** `EXPECTED_BETS = 6700`, `EXPECTED_SEEDS = 134`, `EXPECTED_EPOCH_SIZE = 50` and `EXPECTED_PHASES` live in `src/config.ts`; `meta.plannedTotal`, `meta.epochSize`, the per-phase bet counts in `meta.phases` and `meta.progress` are reconciled *against* them (G-BIND) — only the counts: `meta.phases.B`'s label "100/1000/100k/1M" is a fixed string in the capture script, and the dataset has no bet at 1,000,000×. A reviewer once obtained a clean Full Pass on a sibling package by deleting nonces 30–49 from every epoch, doctoring the header to agree and re-pinning the SHA. A row count is not an identity. Here `134 × 50 == 6,700` is asserted too, so the three constants cannot be satisfied by moving rounds between epochs. The dataset's own `meta.limits` block is read by nothing: the audited limits come from `src/config.ts` and E15.

**What the hash proves.** `shasum -a 256 data/limbo-master-6700bets.json` matching the pin establishes equality to the pin supplied in `src/config.ts`. The pin and the file travel together, so the hash cannot establish that the file is unchanged *since capture*, and it does not authenticate the origin of the capture: a file synthesized from those seeds would recompute just as cleanly (L13). `capture/capture-limbo.reference.mjs` is a sanitized reference record — phase plan, endpoint shapes, seed-rotation discipline and the inline verification performed at capture time. It still reads a session cookie from the environment and sends it; only the cookie's value is absent. It documents the capture; it does not replay it. An `idempotencyKey` is sent on every place-bet call; the rig mints a **new** key on each retry, so a lost response could have double-settled a round — none did (no epoch shows a nonce gap or a duplicate), but the idempotency property itself was not exercised.

## Game and algorithm

- **Bet:** a single **target** multiplier `m`, a 2-decimal value. On the certified build the range is `[1.01, 10,000]` (the server's own message on 2026-10-02, E21). LIQD's client code read on 2026-09-07 allowed up to 1,000,000×, and on 2026-09-11 the server settled targets up to 500,000×. There is no band, no direction and no second parameter — `params` carries `target` alone.
- **Round:** one bias-free draw `k ∈ [0, 100,000,000)` produces a **result** multiplier `R`. The bet **wins iff `R >= m`** and pays `stake × m`; otherwise it pays 0. There is no push and no partial payout.
- **Settlement:** instant — one call places and settles the round. There is no live multiplier, no cash-out and no multi-step round state.

**Where the algorithm comes from.** LIQD publishes no byte-level algorithm. The RNG module, `src/rng.ts` (commitment, HMAC, chunk walk, draw and result), was rebuilt on 20 October 2026 from a written specification, [docs/ALGORITHM.md](docs/ALGORITHM.md), by an implementer who never opened LIQD's code. The specification was written from LIQD's public pages and API replies, the standard provably-fair construction and the 7,000 captured rounds, also without opening LIQD's code; its §8 lists every file read. LIQD's own output, its Verify-calculator values (E12) and `/verify` replies (E13), is run as a second check, not the source. `src/config.ts` still carries the pricing (`ci`/`cr`), the 1,000,000× result cap and the other constants read from LIQD's client bundle on 7 September 2026; its header says so.

```
commit    = SHA-256( utf8_bytes( serverSeed_hex_string ) )   // ASCII text of the seed, spec §1.2
key       = Buffer.from(serverSeed, 'hex')                    // 16 raw bytes
salt      = `${clientSeed}:${nonce}:${cursor}`                // cursor = 0
range     = 100_000_000
maxFair   = floor(2^32 / range) * range                       // = 4_200_000_000
digest    = HMAC_SHA256(key, salt)
scan 4-byte big-endian uint32 chunks of digest:
    if chunk < maxFair:  k = chunk % range;  break
    (if no chunk accepted: not specified by any public source, spec O1; src/rng.ts throws)

N         = (1 - HOUSE_EDGE) * MULTIPLIER_SCALE * RANGE = 9_900_000_000
R         = max(1, floor(N / (k + 1)) / 100)                  // spec §2 Step 3, no upper cap (O3)
R_scored  = min(1_000_000, R)                                 // src/config.ts resultMultiplier; differs only for k <= 97

win       = R >= m                      // INCLUSIVE at the target
credit    = win ? stake * m : 0         // pays the TARGET, never the result

ci(m)         = round(100 * m)          // LIQD's client-code `ci`
winChance(m)  = floor(N / ci(m)) / RANGE  // LIQD's client-code `cr`
RTP(m)        = winChance(m) * m  <=  0.99   for every legal m
```

### Commit-reveal and seed lifecycle

LIQD Limbo runs a standard commit-reveal scheme with no external entropy (no drand, block hash or VRF) — the same provably-fair core (commitment convention, `generateProvablyFairNumber` with its rejection guard) as LIQD Dice, Plinko and Mines. Two things differ: the range (Dice draws on 10,000, Limbo on 100,000,000) and the consumption (Limbo maps the draw through a reciprocal with a clamp at each end).

| Purpose | Primitive | Input | Source |
|---|---|---|---|
| Seed commitment | SHA-256 | UTF-8 bytes of the 32-character server-seed **hex string** | `commitHash()` in `src/rng.ts` |
| Per-round draw | HMAC-SHA256 | key = **hex-decoded** 16 bytes of the server seed; message `${clientSeed}:${nonce}:${cursor}` | `generateProvablyFairNumber()` in `src/rng.ts` |

Keeping the two transformations of the same string apart is the most common re-implementation error in this category. All 134 revealed seeds hash to their commitment under this convention, with 0 mismatches and 0 malformed records (every commitment 64 hex characters, every server seed 32).

| Endpoint | Request | Role |
|---|---|---|
| Provably-fair / active | — | the active commitment (`activeServerSeedHash`), the pre-committed `nextServerSeedHash`, the active client seed and the next nonce |
| Rotate | `{ clientSeed }` | reveals the retiring server seed, promotes the pre-committed next pair, and takes the player's client seed for the new epoch |
| Place bet (`originals-limbo`) | `{ idempotencyKey, stake, currencyId, params: { target } }` (and `stakeCurrency`, required since 2026-10-02) | places and settles one round; returns `result`, `win`, `multiplier`, `winningAmount`, the wallet-denominated pair, `serverSeedId` and the nonce |
| Verify (`/api/v1/originals/limbo/verify`) | `{ serverSeed, clientSeed, nonce, params: { target } }` | the operator's own re-derivation endpoint |

1. **Commitment.** Before an epoch's first bet the server publishes `hashedServerSeed`. Every bet in the epoch carries it (134 epochs, 0 within-epoch violations), and the committed set is the same set, hash for hash, as the revealed seed records: 134 versus 134, 0 orphans either way.
2. **Pre-commitment.** Each seed record carries `nextHashedServerSeed`; across all 133 transitions it equals the next epoch's active hash. The pre-capture pair reveals a seed hashing to its own commitment `6e7ed0a2be10…`, whose `nextHashedServerSeed` is epoch 0's commitment `394004d9c915…`. That is an ordering of records, not a date (L6).
3. **Betting.** 50 rounds under the active pair, nonces 0 → 49. The leading bound is operator-sourced on 134/134 epochs; the trailing bound is auditor-recorded on 134/134 (L2).
4. **Rotation and reveal.** The pre-committed seed becomes active, the player's client seed takes effect, and the retiring seed is revealed; all 134 are revealed and hash-verified.

The client seed is chosen after the next commitment is published, so for an epoch whose client seed is unpredictable the operator had fixed the server seed before it could know the salt. That holds for the 124 Phase A–C epochs; it does **not** hold for the ten Phase-D epochs (R-CHERRY). The mid-round seed-rotation race that concerns multi-step games is not applicable to this named class here: no result is ever pending against a not-yet-revealed seed. That is a statement from the client-visible API shape, not a proof of server-side atomicity in general. The audit does not rely on the operator's verify endpoint for its verdict; it appears in the evidence once (E13), and the settled data independently witnesses the same rule twenty times.

### The result map and both clamps

`RESULT_NUMERATOR = (1 − 0.01) × 100 × 100,000,000 = 9,900,000,000`, kept as that expression so the tie to `(edge, scale, range)` is explicit and an edge change would flow through both the result map and the pricing. The scored steps compute it with `resultMultiplier` in `src/config.ts`. Since 20 October 2026 `src/rng.ts` carries its own `limboResult`, rebuilt from the spec: it has the same 1.00 floor and no upper cap (spec O3), so the two agree on every draw except `k ≤ 97` (98 of 10^8), where `resultMultiplier` returns 1,000,000× and `limboResult` the raw value; no captured round reaches it, either value wins every legal target, and `tests/limbo/resultFloorTests.ts` asserts both the agreement and the boundary. Before the rebuild there were briefly two separately-clamped copies, and a third copy without the 1.00 floor survived in the legacy simulation producer (`src/simulate.ts`) until 2026-10-02; it now calls `resultMultiplier`, and `npm run simulate:check` still regenerates the committed artifacts byte for byte.

| Clamp | Fires when | Share of the draw domain | Witnessed in this capture |
|---|---|---|---|
| Upper — `R = 1,000,000×` | `k ≤ 98` gives 1,000,000× (99 draws); the clamp changes the value on 98 of them (at `k = 98` the raw value is already 1,000,000.00) | 99 / 100,000,000 | **No** — 0 captured rounds; grid arithmetic in Step 14 only (L4) |
| Lower — `R = 1` | `k > 98,999,999` (raw value below 1) | 1,000,000 / 100,000,000 = 1.0000% | **Yes** — 78 rounds genuinely clamped |

| Draw `k` | Result `R` | What it shows |
|---|---|---|
| 0 | 1,000,000× | the ceiling clamp — raw value would be 99,000,000× |
| 98 | 1,000,000× | the last draw giving 1,000,000× |
| 99 | 990,000× | the first draw below the ceiling |
| 98,019,800 | 1.01× | the last draw strictly above 1 |
| 98,019,801 | 1× | the first draw whose raw value is exactly 1 — no clamp needed |
| 98,999,999 | 1× | raw value exactly 1.00 — still no clamp |
| 99,000,000 | 1× | the first genuinely clamped draw (raw 0.99) |
| 99,999,999 | 1× | the bottom of the domain |

`R === 1` for 1,980,199 of the 100,000,000 draws (1.9802%), observed 147 times; the clamp *fires* for 1,000,000 of them (1.0000%), observed 78 times. Both counts sit modestly above their expectations (132.7 and 67.0), about 1.2 and 1.3 Poisson standard deviations — context, not a finding. The clamp changes the reported result, never the outcome: `R = 1` loses against every legal target, exactly as an unclamped 0.99 would have. `MIN_RESULT` is **1**, not the 1.01 minimum legal target; `tests/limbo/resultFloorTests.ts` asserts both constants and that they differ, because conflating them is the obvious wrong fix.

**A defect this audit found in itself.** The model was implemented with only an upper clamp; its comment read `R ranges over [~0.99, ...]`, and a unit test asserted `resultMultiplier(RANGE − 1) ≈ 0.99`. The capture rig verifies each epoch inline, and on the very first epoch of the 2026-09-11 capture session it reported 49 of 50 results matching; the mismatch was a round whose raw value was 0.99 against an operator-served 1. Three changes, in order: the model was corrected to the operator's behaviour (`Math.max(MIN_RESULT, …)`, `MIN_RESULT = 1`); the test was corrected to the witnessed value (`resultMultiplier(RANGE − 1) === 1`), not relaxed; and the two implementations were collapsed into one, with a unit test asserting the entry points agree. Without the inline check the error would have been present on roughly 1% of a 6,700-round dataset and would have survived any verification that compared the repository to itself. **The round that exposed it is not one of the 6,700 shipped rounds** — it is a session record pinned as a regression vector in `tests/limbo/resultFloorTests.ts`:

| Field | Value |
|---|---|
| `serverSeed` · `clientSeed` · `nonce` | `5d8a6efd34122167215b2f41ac797a7f` · `audit5c0e40a9cd8f` · 49 |
| Draw `k` · raw value · served | 99,588,964 · 0.99 · **1** |

No shipped round carries that draw, and the shipped epoch 0 runs under a different pair. The shipped witnesses are the 78 genuinely-clamped rounds, the earliest `yAVLBL0QWD0RVuewVxG_v` (epoch 3, nonce 29, `k = 99,762,668`). A second, smaller correction: an earlier version of the floor test asserted that `k = 98,999,999` gives a result above 1; the raw value there is exactly 1.00, and the test now pins the five measured transitions in the table above.

### Bias-freeness, witnessed

`2³² = 4,294,967,296` is not a multiple of 100,000,000. Unguarded, the last 94,967,296 values of a raw `uint32` would give roughly 95% of the draw domain a 43/42 excess, about +2.38% relative probability. The guard discards any chunk `≥ maxFair = 4,200,000,000 = 42 × 1e8`, so each draw has probability exactly `1/100,000,000`. A chunk is rejected with probability 94,967,296 / 2³² = 2.2111% — about one round in forty-five, against one in six hundred thousand at dice's 10,000-point range, where no captured bet exercised the guard and it had to be declared ASSUMED. **126 of the 6,700 captured rounds have their first chunk in the rejected tail** (128 chunks rejected in all, against 148.15 rounds expected); the guarded model reproduces all 126, and an unguarded server would have produced a different result on every one. Step 5 emits this census and asserts the bias bound (L11, closed); the bound is `src/bias.ts`, which a 4,000-round acceptance probe ties to `src/rng.ts`. Recipe:

```js
const d = createHmac('sha256', Buffer.from(serverSeed, 'hex'))
            .update(`${clientSeed}:${nonce}:0`).digest();
const c0 = d.readUInt32BE(0);   // in the tail iff c0 >= 4_200_000_000
// guarded → first chunk < maxFair, % 1e8 → matches the served result on all 126
// unguarded → c0 % 1e8 → differs from the served result on all 126
```

All eight chunks rejected has probability ≈ 5.7e-14 per round at 2.2111% per chunk and was not observed. What LIQD does then is not stated by any public source (spec O1), so `src/rng.ts` throws rather than guess; the package's earlier code, ported before 20 October 2026, advanced the cursor by 1,000,000.

### Reverse-derivation and reference vectors

LIQD publishes no byte-level algorithm. On 2026-09-07 a model was reconstructed from the client bundle (the Limbo constants module, chunk `2zi3lf-yv26no.js`, functions `ci`/`cr` and the `LIMBO_*` exports), and until 20 October 2026 `src/rng.ts` was a re-implementation of it. Since then `src/rng.ts` is rebuilt from the written specification [docs/ALGORITHM.md](docs/ALGORITHM.md) by an implementer who never opened LIQD's code, with `tests/limbo/RngSpecTests.ts` (72 checks) running the spec's own vectors against it; the constants and pricing in `src/config.ts` are still the ones read from the bundle. Agreement measured on integration, 20 October 2026: the rebuilt module reproduces the commitment and the result of every captured round, 7,004 of 7,004 (the 6,700 dataset rounds, the 300 supplement rounds and the 4 settled probe rounds in E20 and E21, each seed paired to its rounds by hashing), and LIQD's own output 4 of 4 Verify-calculator values and 2 of 2 `/verify` replies. LIQD's code is not shipped in this package and is not run; no ProvablyFair.org site verifier exists for Limbo. In the package it is checked two ways. **(1)** As a second check, against LIQD's own Verify calculator for `serverSeed` `000…0001`, `clientSeed` `abc` — session-recorded, raw responses not retained, hard-coded in `tests/limbo/rngTests.ts` (L14):

| Nonce | Draw `k` | Result |
|---:|---:|---:|
| 0 | 57,877,210 | 1.71× |
| 1 | 37,266,926 | 2.65× |
| 2 | 94,506,499 | 1.04× |
| 3 | 4,913,898 | 20.14× |

**(2)** Against the 6,700 money-settled results, 0 mismatches — the audit's named RNG anchor. The guard is also force-exercised (`serverSeed` `00112233445566778899aabbccddeeff`, `clientSeed` `audittest`); each vector asserts the guarded draw is returned **and** the unguarded one is not, after asserting `chunk₀ ≥ maxFair`:

| Nonce | chunk₀ | Guarded draw | Unguarded draw |
|---:|---:|---:|---:|
| 11 | 4,290,586,986 | 49,476,266 | 90,586,986 |
| 79 | 4,265,982,121 | 75,872,224 | 65,982,121 |
| 134 | 4,290,596,458 | 35,655,243 | 90,596,458 |

## Payouts and RTP

Limbo has **no multiplier-table config file** — the payout is `stake × target` — so there is no config artifact to pin. The credited multiplier on a win is the target the player chose, never the result: the 185,046.72× round on a 1.17× target paid 1.17×.

### Settlement

Step 9 asserts `Math.round(winningAmount * 1e8) === hundredths(stake) * hundredths(target) * 1e4` on 6,700/6,700 rounds, zero tolerance, 0 violations — the whole comparison in the operator's own decimal system. A 2-dp stake times a 2-dp target is already exact in four decimal places, so **no rounding rule is assumed, and none is exhibited**. The audit went looking for a settlement rounding rule of the kind LIQD Dice required (a two-stage 8-dp half-even rule) and measured that none is needed. LIQD Dice once computed its residual in the auditor's binary64 representation, concluded every win had been rounded, published the figure and retracted it against the client's own QA list, including 150 wins credited at the exact product; here the comparison is integral from the start. The float route is measured beside it and scored nowhere:

| Measure | Value |
|---|---|
| Wins satisfying `credit == ROUND_8(stake × target)` in binary64 | 2,822 / 2,822 |
| Wins landing exactly on the raw binary64 product | 1,472 / 2,822 |
| Maximum `\|credit − stake × target\|` in binary64 | 4.44e-16 |
| Net across the capture | −2.33e-14 USDC |

The 1,350 wins that do not land on the raw product are a property of IEEE-754 (`0.1 × 1.72` is not exactly `0.172` in binary64), not of LIQD's settlement. Losses pay `winningAmount == 0` and `multiplier == 0` on all 3,878, and all 3,878 genuinely had `R < target`. The 2,822 wins are on targets from 1.01× to 100×, the largest credit $20: the payout on a higher target is not witnessed (L16).

### Pricing and the win-chance identity

LIQD's pricing formula (read from its client code on 2026-09-07; the code is not in this package) and its result map use the same numerator `N = 9.9e9`, re-implemented in `src/config.ts` (`targetToHundredths`, `winChance`, `theoreticalRTP`, `effectiveEdge`):

```
R ≥ m   ⟺   floor(N/(k+1)) ≥ ci(m)   ⟺   k + 1 ≤ N/ci(m)   ⟺   k ≤ floor(N/ci(m)) − 1
```

so exactly `floor(N/ci(m))` of the 100,000,000 draws win, which is `winChance(m) × 100,000,000`. Step 15 asserts this as an integer equality on all 1,104 distinct captured targets. It is a property of the model — no dataset can falsify it — and two things tie it to the operator: Step 5's reproduction of all 6,700 settled results, and a literal tally over the whole draw grid running the real formula and rule, which cannot share a flooring, clamping or off-by-one error with the closed form. Step 14 adds the knife's edge: for every captured target, `k = floor(N/ci(m)) − 1` must win and `k = floor(N/ci(m))` must lose. LIQD's page states 49.5% at 2× and 0.0099% at 10,000×, and both match.

| Target | Tallied winning draws | Closed form |
|---|---:|---:|
| 1.01× | 98,019,801 | 98,019,801 |
| 2.00× | 49,500,000 | 49,500,000 |
| 100.00× | 990,000 | 990,000 |
| 500,000× | 198 | 198 |

| Target | Win chance | RTP | Effective edge |
|---|---:|---:|---:|
| 1.01× (minimum legal target) | 98.019801% | 98.999999% | 1.000001% |
| 1.10× | 90.000000% | 99.000000% | 1.000000% |
| 2.00× | 49.500000% | 99.000000% | 1.000000% |
| 10.00× | 9.900000% | 99.000000% | 1.000000% |
| 100.00× | 0.990000% | 99.000000% | 1.000000% |
| 500,000× (maximum playable on 2026-09-11) | 0.000198% | 99.000000% | 1.000000% |
| 1,000,000× (client-code maximum, unplayable on 2026-09-11) | 0.000099% | 99.000000% | 1.000000% |

The maximum win chance, 98.019801% at 1.01×, is the operator's own `LIMBO_MAX_WIN_CHANCE_PERCENT`, re-derived from the closed form.

### The effective edge — a floor, not a flat rate (F16)

Because a legal target is a 2-decimal value, `ci(m) = 100·m` exactly, and

```
RTP(m) = winChance(m) · m = floor(9.9e7 / m) · m / 1e8  ≤  9.9e7 · m / (m · 1e8)  =  0.99
edge(ci) = ( 1e10 − 9.9e9 + (9.9e9 mod ci) ) / 1e10  =  ( 1e8 + (N mod ci) ) / 1e10
```

The flooring can only lower the payout. Step 16 asserts `floor(N/ci)·ci ≤ N` in exact integers (products bounded by `N = 9.9e9`, far inside 2⁵³) at every legal target, enumerated on every run (about 1 s) since 2026-09-23:

| Measure | Value |
|---|---|
| Legal 2-dp targets enumerated, `[1.01×, 1,000,000×]` | **99,999,900** |
| Violations of `edge ≥ 1.00%` · player-favourable targets | **0** · **0** |
| Targets pricing to exactly 1.00% | **410** (the `ci(m)` that divide 9.9e9 evenly) |
| Targets with edge above 1.01% | **94,389,859**; the first is 10,009.10× (1.010001%) |
| Worst edge at or below the 10,000× cap | 1.009982% at 9,989.91× |
| Worst edge on targets playable on 2026-09-11 (≤ 500,000×) | **1.497487%** at 497,487.44× |
| Worst edge across the legal range | 1.989999% at 990,000.01× (unplayable — F17) |
| Legal-range extremes 1.01×, 500,000×, 1,000,000× | all satisfy the identity |

`floor(N/ci)·ci ≤ N` is true for every `ci` by the definition of floor: it establishes the 1% floor and can never bound how far above it the edge travels. The first draft paired it with a min/max span over the captured targets and read that span as the curve. **Captured-target sub-measurement, not the curve:**

| Measure (1,104 captured targets, 1.01× to 500,000×) | Value |
|---|---|
| Minimum · maximum edge | 1.000000% (at 1.10×) · 1.000041% (at 43.86×) |
| Mean across distinct targets · stake-weighted mean | 1.000005% · 1.000000% |
| Exactly 1.00% | 57 of 1,104 |

That span reads flat only because every high tranche the capture played (100×, 1,000×, 100,000×, 500,000×) divides 9.9e9 evenly. Exactness is the arithmetic working, not an anomaly (G-VALID): the sibling Mines and Dice audits shipped a "perfection proves fabrication" rule and both removed it. No tolerance is used: the largest captured edge is 1.00004134% at 43.86× (`9.9e9 mod 4386 = 4134`, over `1e10`), a real difference — the binary64 error at that target is about 9e-17.

The excess over 1% is `N mod ci`, which can reach `ci − 1`, so its ceiling grows linearly with the target: a few parts per million at small targets (all the capture sampled), almost doubling the edge near `ci = 100` million. Read another way, targets sharing one value of `floor(N/ci)` share an identical win chance but are each paid their own multiplier, so every member below the largest is strictly dominated. Just **198,798** targets (0.199%) are the best-priced member of their group — not the same as priced at 99.00%: only 410 are. Measured on 2026-09-23, of the 193,947 group maxima with `ci` in `[101, 2,000,101]`, only 305 land on exactly 1.00%. The player always pays at least the stated 1% and never less. The operator's web UI clamps the Multiplier field to **10,000×** — a session observation on 2026-09-23 (typing `400000` into that field on `qa.liqd.com/originals/limbo` rewrote it to `10000.00`) with no retained artifact (`UI_MAX_TARGET` in `src/config.ts` carries the note); only that field on that page was witnessed. "The house edge is 1%" is not an accurate description above 10,009.10×, and from 100,101.12× the 99% claim fails the tolerance — which is why the cap matters.

### The RTP claim and the rule it is held to

The claim is E23 (above). The rule is RTP-CLAIM 1.2.0 (`src/rtp-claim.ts`, a byte-identical copy of the framework's rule; Methodology v1.1, 14 October 2026): a single published figure means every setting a player can bet must return within **0.10 percentage points** of it; past that on the house side is a fail, and a player-favourable setting never fails. It is **enforced** in this package (`src/rtp-claim-switch.ts`): a miss would mark Step 16 RTP FIGURE OVERSTATED and make the verdict RTP FIGURE OVERSTATED (exit 5), not a hard fail (until 14 October 2026, under 1.1.0, it would have been scored as a hard fail). The claim's source names the game page, one of the six places the rule recognises. Every 2-dp target from 1.01× to 10,000× is scored — **999,900 settings** — because 10,000× is the highest target the API settled on 26 September and the server refused four targets above it on 2 October. The exact RTP of each is `floor(9.9e9/ci)·ci / 1e10`; the table is `outputs/rtp-claim-table.json` (E22), pinned in `src/rtp-settings.ts`, recomputed on every run, exit 1 if the committed file differs.

| Range scored | Targets beyond the band | Worst RTP | Rule result |
|---|---|---|---|
| Up to 10,000× (**what the package scores**) | 0 of 999,900 | 98.990018% (at 9,989.91×) | **PASS** |
| Up to 100,000× | 0 of 9,999,900 | 98.900109% | PASS |
| Up to 500,000× (what the 11 September build accepted) | 23,885,381 of 49,999,900 | 98.502513% (at 497,487.44×) | FAIL |
| Every legal target (to 1,000,000×) | 66,928,582 of 99,999,900 | 98.010001% (at 990,000.01×) | FAIL |

The first target outside the band is **100,101.12×** (RTP 98.899907%), so the result needs targets above about 100,100× refused, not a cap at exactly 10,000×. The 11 September build settled 100,000× and 500,000×, both of which return exactly 99%, so no captured bet sits outside the band. The first and last rows are printed by the verifier on every run, the ≤ 500,000× row by Step 16; the 100,000× row was computed with the same exact formula and is not printed by a step. Targets above 10,000× stay in the committed table as buckets labelled "information only, not scored", because the bound is dated: if the server accepts those targets again they are playable settings and belong in the scored space.

### Limits

| Parameter | Value | Evidence class |
|---|---|---|
| Result domain | `[1, 1,000,000]`, 2 decimals | Derived — 6,700/6,700 served results inside it, 0 not 2-dp (G-RANGE) |
| `minMultiplier` (minimum target) | 1.01 | Config-attested and unviolated (24 bets at 1.01×); no below-minimum target probed |
| `maxMultiplier` (maximum target) | 1,000,000 | Client code (read 2026-09-07, not in this package); on 2026-09-11 not playable at any legal stake (F17) |
| `minBet` | $0.10 USDC | **Inferred, not probed** — see E15 |
| Maximum exposure (`stake × target`) | $50,000 USDC | **Enforcement-witnessed** — `errorCode 3138` with the operator's own `maxAllowedBetUsdc` (E15); one refusal, one currency (L5) |
| Maximum **playable** target (2026-09-11) | 500,000× | Derived: $50,000 / $0.10; 250 bets at exactly this target, each at exactly $50,000 of exposure |
| Live target ceiling (2026-09-26, 2026-10-02) | 10,000× | E20 and E21, Step 25; `qa.liqd.com` only (L15) |
| `maxBet` | 9,898 USDC | Config-attested only — Phase C reached $10.00 |
| `houseEdge` | 1.00% | Derived as a floor over all legal targets (Step 16), not taken from the client field; the page shows "Edge: 1.00%" and RTP 99% (E23) |

The exposure comparison is made in whole hundredths: for 427 of the capture's 1,105 distinct stake × target pairs, floating-point multiplication does not give the decimal answer (`0.1 × 1.07 = 0.10700000000000001`; Step 11 recounts it). The operator accepted $50,000 of exposure 250 times and refused $100,000 once. **The client-code maximum was unreachable (2026-09-11, F17):** `$0.10 × 1,000,000 = $100,000` of exposure against a $50,000 ceiling, so there was no legal bet at the client-code maximum; the pricing at 1,000,000× is identical to 500,000×. The same $50,000 ceiling and the same `maxAllowedBetUsdc = floor(50000 / multiplier)` shape were independently confirmed on LIQD Dice by the game-integrity-test suite — corroboration from a sibling engagement, not a second probe here.

### Simulation

**Pass 1, scored (Step 23)** — `outputs/pass1-grid.json`, pinned as `PASS1_GRID_SHA256`, every seed `sha256(masterSeed|stream|block)` from the recorded master seed `pf.org/liqd-limbo/pass1/2026-09-26`, stored as counts not verdicts: 2,000,000 draws over 100 bins, χ² 94.393, df 99, p 0.6122; lag-1 r 0.000663, z 0.937; runs 1,000,117 against 999,999.4 expected, z 0.166, p 0.8679 (family-wise α 0.01, Bonferroni 0.00333 per test); 10 targets × 1,000,000 rounds (1.01×, 1.5×, 2×, 5×, 10×, 50×, 100×, 1,000×, 10,000×, 100,000×) against the exact `floor(9.9e9/ci)/1e8`, band 5 sd + 1, worst 1.56 sd at 10×. Every run replays the first 50,000 draws and 20,000 rounds of every stream; `npm run pass1:check` replays all 12,000,000 byte for byte.

**Legacy Pass 1, not scored** (`npm run simulate` → `outputs/simulation-results.json` and `outputs/rtp-convergence.html`; seeds `sha256(SIM_MASTER_SEED|stream|n)`, `SIM_MASTER_SEED = pf.org/liqd-limbo/simulate/2026-09-26`; Step 19 enforces pins, depths, recorded seed and value domains; no step re-derives these figures, L9). It characterises the reference implementation, not LIQD's server; it transfers because Step 5 reproduces all 6,700 served results from the same code.

| Metric | Value |
|---|---|
| Uniformity, 2,000,000 draws, 100 bins | χ² 110.884, df 99, p 0.1949 |
| Serial screen, first 200,000 draws | lag-1 −0.0013871416349734164, Z −0.62 (critical 2.576, α 0.01); runs Z −0.898, p 0.3694 |

| Bets (n), target 2.00× | Simulated RTP | SE |
|---:|---:|---:|
| 1,000 | 107.200% | 3.154% |
| 10,000 | 99.400% | 1.000% |
| 100,000 | 98.920% | 0.316% |
| 1,000,000 | 99.022% | 0.100% |
| 5,000,000 | 98.975% | 0.045% |
| 10,000,000 | 98.982% | 0.032% |
| 20,000,000 | **99.013%** | 0.022% |

Final 0.990128 against 0.99 at SE 0.00022359590064648322: **0.57·SE**. The chart plots `SE = σ/√n` with a ±5·SE ribbon on a log-scaled bet axis.

| Target | Priced win chance | Theoretical RTP | Simulated RTP | Δ (SE) |
|---|---:|---:|---:|---:|
| 1.10× | 90.0000% | 0.990000 | 0.990163 | 0.70 |
| 1.50× | 66.0000% | 0.990000 | 0.990135 | 0.27 |
| 2.00× | 49.5000% | 0.990000 | 0.989224 | 1.10 |
| 5.00× | 19.8000% | 0.990000 | 0.989073 | 0.66 |
| 10.00× | 9.9000% | 0.990000 | 0.992695 | 1.28 |
| 20.14× | 4.9156% | 0.990000 | 0.992348 | 0.76 |
| 100.00× | 0.9900% | 0.990000 | 0.985650 | 0.62 |
| 1,000.00× | 0.0990% | 0.990000 | 0.975000 | 0.67 |

8/8 within 5·SE + 1e-4 at 2,000,000 bets each — a gross-error check, a band of roughly ±0.12 to ±11 percentage points depending on the target. Until 2026-09-26 the seeds were `crypto.randomBytes` and the figures were χ² 83.004 / p 0.8763, lag-1 0.0006883385492178551 / Z 0.308, runs Z −0.843 / p 0.3995, final RTP 0.989839 (0.72·SE), per-target simulated RTP 0.990011 · 0.989878 · 0.989374 · 0.988302 · 0.987140 · 0.989347 · 0.996650 · 0.967500. A non-rejection bounds the size of a departure these tests could have seen; it is not proof of independence.

### Live-round statistics (informational only)

| Figure | Value |
|---|---|
| Realized live RTP | **100.4475%** — $2,650.00 wagered, $2,661.86 returned, net +$11.86 to the player |
| Live win rate | 2,822 / 6,700 = 42.12%, against 2,831.0 expected from each round's own priced win chance |
| Phase A · B · C · D return | $496.23 on $500.00 = 99.245% (2,470 wins) · $40.00 on $100.00 = 40.000% (**4 wins**) · $2,080.00 on $2,000.00 = 104.000% (104 wins) · $45.63 on $50.00 = 91.266% (244 wins) |

All four Phase-B wins fell in the 100× tranche; the 1,000×, 100,000× and 500,000× tranches produced zero wins across 750 rounds, against roughly 0.25, 0.0025 and 0.0005 expected. Nothing about that is a finding about the operator. Step 21 re-derives the live figure on every run (L7).

## Verification results

`tests/verify.ts` scores **25 steps over `tests/steps/*`: 25 PASS, 0 FLAG, 0 hard fails — PROVABLY FAIR — Full Pass**, read from `outputs/verification-results.json`. Steps 22, 23 and 24 were added on 2026-09-26 for the proposed Framework 1.0 Limbo profile, and Step 25 the same day; a FLAG carries an origin, and only an operator-origin FLAG changes the verdict class. Step 25 was a FLAG, origin operator, until the E21 journal was pinned on 2026-10-02. `npm run verify` is deterministic: the scored path has no random input.

| # | Step | Result | Finding |
|---|---|---|---|
| 1 | Seed Hash Integrity | ✅ Pass | 134/134 revealed seeds hash to their commitment; 0 mismatches; 134 distinct seeds |
| 2 | Next-Seed Pre-Commitment Chain | ✅ Pass | 133/133 transitions link, plus the pre-capture link naming epoch 0's commitment — an ordering of records, not a date (L6) |
| 3 | Hash Consistency & Epoch Coverage | ✅ Pass | 134 epochs covering 0..133, 0 missing; settled and revealed commitment sets identical hash-for-hash |
| 4 | Nonce Audit | ✅ Pass | 50 contiguous nonces 0..49 per epoch; leading bound operator-sourced 134/134, trailing bound auditor-recorded 134/134 (L2); a declared capture-retry gap would be a capture-origin FLAG, an undeclared one a HARD FAIL |
| 5 | Draw & Result Recomputation | ✅ Pass | 6,700/6,700 results under strict `===`, no tolerance; 147 rounds at the `R = 1` floor, 0 at the 1,000,000× ceiling (L4); bias bound asserted (`maxFair` = 42 × 1e8, bias 0); rejection census: 126 rounds had their first chunk rejected, all reproduce |
| 6 | Win-Rule Reproduction | ✅ Pass | 6,700/6,700 win flags; 20 rounds land exactly on target and all 20 settled as wins, against 18.24 expected |
| 7 | Recomputation Determinism | ✅ Pass | two forward passes and one reverse-order pass agree on 6,700/6,700; 204 sampled bets recomputed 5× each, 0 unstable |
| 8 | Paid-Multiplier Derivation | ✅ Pass | 2,822 wins: the dataset's `multiplier` column equals the target, bit-exact. The column is the capture script's fill, so this checks the file, not the casino; the payout is Step 9 |
| 9 | Credit Arithmetic | ✅ Pass | 6,700/6,700: `credit × 1e8 == hundredths(stake) × hundredths(target) × 1e4`, zero tolerance, 0 violations |
| 10 | Loss Settlement | ✅ Pass | 3,878 losses pay 0 at multiplier 0, and `R < target` on all 3,878 |
| 11 | Wallet Ledger, Stake Floor & Exposure Ceiling | ✅ Pass | wallet and game ledgers agree on 6,700/6,700; max exposure $50,000 against the $50,000 witnessed ceiling, 0 over. **No balance ledger** (L3) |
| 12 | Dataset Integrity & Population Identity | ✅ Pass | SHA-256 pin match; population bound to `src/config.ts`, not to the header (G-BIND); 6,700 distinct bet ids |
| 13 | Phase Plan Conformance | ✅ Pass | A 5,000 · B 1,000 · C 200 · D 500 at planned stakes; Phase B tranches 250 each at 100×/1,000×/100,000×/500,000×; Phase C 200/200 settle by the base-stake rule, 104 elevated-stake wins (floor 100); decades 10^0–10^3 and 10^5 covered, **10^4 unplayed in this dataset** (capture-origin gap, disclosed; Phase A coverage to the ceiling is Step 25) |
| 14 | Anti-Circularity (Negative Control + Grid Boundary Anchor) | ✅ Pass | the Step 5 predicate rejects a result one 2-dp tick away, `NaN` and `Infinity`; boundary anchor holds on 1,104/1,104 distinct targets |
| 15 | Win-Chance vs Result-Distribution Identity | ✅ Pass | integer equality on 1,104 targets, anchored by four full 100,000,000-draw tallies; the page's 49.5% at 2× and 0.0099% at 10,000× both match |
| 16 | Effective-Edge Curve | ✅ Pass | profile LIMBO-19 follows the RTP-CLAIM band: 0 of the 999,900 targets up to 10,000× sit more than 0.10 points from the 1.00% claim; printed, not flagged: off 1.00% at 999,618 of them, by at most 0.009982 points; first target beyond the band 100,101.12×; edge ≥ 1.00% at all 99,999,900 legal targets, 0 violations, 0 player-favourable, 0 targets where the reference formula returned a non-finite value; **not flat**; disclosed, not scored: up to 1.497487% on targets playable on 2026-09-11, where the RTP-CLAIM rule would fail on 23,885,381 of 49,999,900 targets |
| 17 | Client-Code Maximum Multiplier (2026-09-11 state, note) | ✅ Pass (note) | profile LIMBO-14; the 1,000,000× client-code maximum (read 2026-09-07, not in this package) could not be played at any legal stake on 2026-09-11 (F-MAXMULT, E15) |
| 18 | Custom Client-Seed Control (Phase D) | ✅ Pass | 500/500 bets under auditor-chosen `pfaudit-` seeds recompute exactly; model-rate gate over all 6,700 (wrong and empty client seed: 0 draws unchanged, allowance 0); Phase A–C seeds from the rig's CSPRNG; the 10 predictable Phase D epochs enumerated |
| 19 | Artifact Integrity & Evidence Reproduction | ✅ Pass | dataset matches its pin; E13 agrees with the model and with itself on both probes (it cannot show the file came from the casino, L17); E15 reconciled against `src/config.ts`; 966 numeric leaves of the pinned JSON artifacts inside their declared domains |
| 20 | Settlement Determinism | ✅ Pass | 6,700/6,700: outcome *and* credit fully determined by `(serverSeed, clientSeed, nonce, target, stake)`, without reading a served outcome field |
| 21 | Scope & Declared Limitations | ✅ Pass | L1–L4 re-checked against the dataset on every run (fails if one stops being true); L7 and L8 figures recomputed; L5 and L6 restated, not measured; lower clamp 147 rounds at 1×, changed on 78 |
| 22 | Live-Sample Fit | ✅ Pass (informational) | χ² p 0.2315, KS p 0.6985, floor mass 147 vs 132.67 (z 1.256), lag-1 z −0.348, runs p 0.6423 — never verdict-bearing |
| 23 | Simulation Pass 1 — Pinned Master Seed, Re-Derived | ✅ Pass | 2,000,000 draws χ² p 0.6122; lag-1 z 0.937, runs p 0.8679; 10 targets × 1,000,000 rounds, worst 1.56 sd; prefixes replayed every run |
| 24 | Simulation Pass 2 — Cherry-Pick Screen, 10,000 Nonces per Revealed Seed | ✅ Pass | 134 seeds × 10,000 nonces, window 0 replays all 6,700 results; rank-sum Z −0.1711 (rule Z < −3.090); exact-method 10 flags vs 5.8712, P 0.0708; committed `pass2` block equals the re-derivation (floats at 1e-14 abs + 1e-12 rel) |
| 25 | Target-Decade Supplement & Live Target Ceiling (capture v2, 300 rounds) | ✅ Pass | profile LIMBO-14, target cap evidenced by E21; 300/300 supplement rounds recompute from 6/6 revealed seeds (0 wins against 0.4182 expected); journal = dataset bet for bet, one declared resume; Phase A ≥ 50 in every decade to the ceiling (10^0 4,574 · 10^1 426 · 10^2 100 · 10^3 100 · 10^4 100); ceiling witness E20 reproduced. FLAG until E21 was pinned |
| — | **F-CEILING** — on 2026-09-11 the server settled targets up to 500,000×; on 2026-09-26 it did not settle a request at 93,830.94× (reply not saved); on 2026-10-02 it refused 100,101.12×, 497,487.44×, 500,000× and 990,000.01× with errorCode 3001 (reply saved, E21) | ✅ Evidenced (Step 25) | dates every "playable" figure; the 10,000× cap rests on E20 and E21, both on `qa.liqd.com` |
| — | **F-MAXMULT** — on 2026-09-11 the 1,000,000× client-code maximum was unplayable at any legal stake | Note (Step 17) | minimum stake $0.10 × 1,000,000× = $100,000 of exposure against a $50,000 ceiling |
| — | **F-PASS2** — rank-sum Z −0.1711; exact-method recount 10 flags vs 5.8712, P 0.0708 | ⚠ Not rejected | a non-rejection, not a clearance; detection power printed; supersedes the unseeded-bootstrap figure (11 flags, P 0.0550393485) |

### Step notes

Findings F1–F25 map one-to-one to the scored steps; the named findings are carried by steps: F-MAXMULT (F17) is Step 17, F-PASS2 is Step 24, F-CEILING is Step 25.

- **Steps 1–4.** The seed denominator comes from `EXPECTED_SEEDS = 134`, not the header; the distinctness check matters because a repeated seed would replay an entire 50-round draw stream under a different commitment. The set-identity half of Step 3 catches a forged seed table: a count match is not a set match. The shared `hashedServerSeed` within an epoch witnesses the capture's bookkeeping; that no seed was swapped mid-epoch rests on Step 5, where all 50 results of every epoch recompute from its one revealed seed. Step 4 also requires a single client seed per epoch and no reuse or out-of-range nonce.
- **Step 5.** 0 rounds whose epoch seed was never revealed; 0 served results outside `[1, 1000000]` or not 2-dp. The comparison is finiteness-guarded (`Number.isFinite(served) && Number.isFinite(local) && served === local`), because the sibling dice audit's `Math.abs(local − served) > 1e-9` is **false** when `served` is `NaN`.
- **Step 6.** Under a strict `R > target` rule, 20 of the 6,700 settled rounds would flip; the 20 span nineteen distinct targets from 1.03× to 3.70× (1.03×, 1.05×, 1.06×, 1.09×, 1.14×, 1.16×, 1.25×, 1.27×, 1.28×, 1.34×, 1.38×, 1.43× twice, 1.46×, 1.50×, 1.73×, 1.80×, 2.28×, 2.66×, 3.70×). The expectation is `Σ_bets [floor(N/ci(m)) − floor(N/(ci(m)+1))] / 1e8` = 18.24. In the sibling LIQD Dice capture the two candidate rules disagreed on zero of 6,700 bets. At 1.03× the winning region covers 96.116504% of the draw domain and one tick is worth roughly 0.9 percentage points of it; at 500,000× the winning region is 198 draws.
- **Step 7** reads no served result field, so a replayed stored answer could not pass it.
- **Step 8.** Step 25 checks the casino's own `outcome.multiplier` on the 300 supplement responses (all losses).
- **Step 11.** Every stake clears the $0.10 minimum (0 below, 0 not 2-dp) and every target is a legal 2-dp value at or below the 500,000× playable maximum. `stakeWallet` and `winningAmountWallet` are settle-response fields: this establishes internal consistency, not what the wallet was credited (L3).
- **Step 12.** 0 epochs whose nonce window fails to close; G-RANGE sweep: 0 bet-field and 0 seed-field values outside physically possible bounds.
- **Step 14.** The control runs on epoch 0 nonce 0: accepts 2.47×, rejects 2.48×. `+0.01` is one tick of the result grid, the smallest wrong answer, rather than the tautological `x + 1 !== x` control the dice audit shipped and replaced. No operator payout, odds or win-chance field is read.
- **Step 15** is a model identity — it holds by algebra, so no dataset can falsify it. A float comparison at 1e-12 would repeat the dice audit's Step 15 mistake, a threshold under twice the binary64 noise of the quantity thresholded.
- **Step 16** follows the RTP-CLAIM band since 2026-10-02; until then any difference from 1.00% was a FLAG, which flagged 999,618 targets while the RTP-CLAIM rule in the same run said the claim holds on every one.
- **Step 17** asserts the derivation (`MAX_EXPOSURE_USDC / MIN_BET_USDC == MAX_PLAYABLE_TARGET`), that the client-code maximum exceeds the ceiling, that the capture plan names the playable maximum, and that 0 rounds were placed at 1,000,000×. Profile LIMBO-14 discloses "an advertised maximum target that no legal stake can play"; the only player-facing text the package holds (E23) shows 10,000× as its top example, so it is a note. The pricing was unaffected — 1.000000% at both 500,000× and 1,000,000×.
- **Step 18.** 10 distinct `pfaudit-` seeds across 10 epochs, none operator-generated. Altering one character changes the draw `k` on 64/64 probed rounds and the multiplier on 63/64 — `R` is a coarse function of `k`, so the claim rests on the draw. Consecutive nonces give different draws on 64/64 pairs. The model-rate allowance is `E = 6,700/1e8`. Phase D demonstrates that the operator honours a supplied seed, not the unpredictability mitigation (R-CHERRY).
- **Step 19.** E13 is recomputed from its own triple (`serverSeed` `76bb5f88…`, `clientSeed` `audit53bafd211bdd`, nonce 0 → `R = 7.5×`) and must equal the file's `R` and the casino's `serverResult` on both probes (the casino-result comparison was added 2026-10-02); `target = 7.5` settled as a win and `target = 7.51` as a loss, both re-derived under our rule; the probe targets must be exactly one tick apart. E15: the recorded ceiling equals `MAX_EXPOSURE_USDC`, the 3138 refusal's `maxAllowedBetUsdc` × target re-derives it, and that stake is below the minimum. It also recomputes both simulation pins, binds `pass1.masterSeed` to `SIM_MASTER_SEED` and the declared depths to the `SIM_*` constants. Absence, unparseable content or a schema violation each fail with a named message: a sibling package once scored a clean 21/21 on a file containing the literal bytes `{not JSON`.
- **Step 20.** Coverage is part of the verdict: wins and losses (2,822 / 3,878), at least two stakes ($0.10, $10.00), all four phases, at least one floored round (147) and one boundary round (20) — "the two cases a naive model gets wrong".
- **Step 21.** L1: the dataset declares `qa.liqd.com` and so does the suite. L2: 0/134 epochs carry an operator bet counter. L3: 0/6,700 rounds carry a before/after balance. L4: 0 rounds at the 1,000,000× ceiling; highest result 185,046.72×. L5 and L6: fixed sentences. L7: 100.4475% recomputed. L8: the self-check fields counted. Until 2026-10-02 the L2–L4 arms printed "no longer applies" and passed; they now fail.
- **Step 22** runs on the draw `k` in capture order — KS D 0.00863, lag-1 r −0.004247, runs z 0.465 — with thresholds fixed in code on 26 September 2026; policy INFORMATIONAL since 2026-09-29 (a miss returns `INFO`, never a flag). Sorting the draws into value order drives lag-1 to +1 and the step reaches `[INFO]`, which is registered in `tests/mutations.json`.
- **Step 23** proves uniformity and serial independence of the reference draw at depth and each target's exact win probability. It says nothing about the operator's own seeds (Step 24) or the legacy artifact (L9).

### F-PASS2 — the cherry-pick screen (Step 24)

Rebuilt 2026-09-26 and scored: `src/pass2.ts` draws no random number, and Step 24 re-derives the whole `pass2` block of `outputs/simulation-results.json` from the dataset on every run, failing if any leaf differs. Every revealed seed is replayed over 10,000 nonces; window 0 is the captured nonces 0–49 (0 mismatches of 6,700). Each of the 200 windows of 50 bets the 50 targets the casino served in that epoch at unit stake, standardised by the exact per-target mean and variance; under "no cherry-pick" the captured window is exchangeable with the other 199, so its rank has an exact permutation null. The original early/late screen is kept and recounted by the exact method: the 20-bin χ² of 50 draws takes 832 values, its multinomial null is computed exactly (integer dynamic programme, total 20^50), and scores are compared on the integer `Q = Σh²` so equal scores compare equal.

| Metric | Value |
|---|---|
| Seeds × nonces | 134 × 10,000 = 1,340,000 draws; window 0 replay: 0 mismatches |
| Served-target rank-sum Z | **−0.1711** (one-sided p 0.4321); rule Z < −3.090 (α 0.001), fixed in code on 2026-09-26 — **not indicated** |
| Direction | captured window below its epoch median in 63 epochs, above in 62, tied in 9 |
| Captured-window return vs expectation (unit stakes) | 6026.59 vs 6632.9999 |
| Power | detects, with ≥ 50% probability, a selection putting ≥ 16.1% of epochs' captured windows in their worst decile |
| Early/late screen, exact null | critical χ² ≥ 30.8 (Q ≥ 202), attained size 0.045924, `p₀ = a(1−a) = 0.043815` (computed, not the assumed 0.0475) |
| Early/late flags | **10** vs **5.8712** expected — epochs 21, 55, 71, 91, 94, 98, 99, 117, 123, 130 |
| Exact binomial P(X ≥ 10 \| n = 134, p₀) | **0.0708** — not rejected at 0.05 |
| Pooled real-draw uniformity (6,700 draws, 100 bins) | χ² 108.985, df 99, p 0.2315 |

Neither rule fires. Both were fixed in code on 26 September 2026 — 15 days after the capture and after an earlier screen had run on the same data — and no dated registration ships with the package. That is a **non-rejection, not a clearance**: a gentler selection would pass unseen. It is not re-rollable in either direction. **What it replaces:** the figure published until 2026-09-26 — 11 flags of 134 against 6.365 expected, exact P(X ≥ 11 | n = 134, p = 0.0475) = 0.0550393485, "not rejected by 0.0050393485" — rested on a 10,000-replicate bootstrap null redrawn with `crypto.randomBytes` on every run (re-rolled twelve times on 2026-09-23 it gave 9, 10 or 11) and an assumed rate `p₀ = 0.05 × 0.95`. Its 11th flag, epoch 87, had exactly the same early score as epoch 29 (both Q = 200, χ² 30.0) and was flagged only by a 7.1e-15 floating-point wobble. That broke audit-rules RULE 22a (compute the null, never assume the rate) and RULE 22b (scored predicates are deterministic). Correcting only the rate would have given 11 flags at P 0.0341, a false rejection; the comparison and the rate were fixed together (L10, closed).

**Independent recount (external reviewer, 23 Sep 2026), checked against the data.** "10 flags vs 5.87 expected, P = 0.071" — agrees. "6 of the 10 flagged batches went the player's way" — the data gives 5 of 10: the player came out ahead in epochs 71, 91, 94, 98 and 123 and behind in 21, 55, 99, 117 and 130; counting the withdrawn 11th flag (epoch 87, also ahead) gives 6 of 11, the likely source. "Cherry-picking impossible for 124 of 134 batches" — agrees on the count and the mechanism: 124 epochs carry `audit` + 12-hex client seeds the rig drew with `randomBytes` at rotation (`capture/capture-limbo.reference.mjs:226-228`, `:327`), after the operator had published that epoch's commitment as the previous epoch's next hash; the other 10 (Phase D) could be anticipated.

### F-CEILING and the supplement (Step 25)

Step 25 carries LIMBO-14 (profile policy FLAG): "a client-side target ceiling the server does not enforce, is disclosed". The RTP-CLAIM PASS on targets up to 10,000× holds for the game only if targets from 100,101.12× up are refused, so Step 25 was a FLAG (decided 2026-10-02; before that its condition was "the audited dataset holds rounds above 10,000×", which this dataset always will) until a saved reply showed them refused. E21 holds the server's own replies for the first target outside the band (100,101.12×, RTP 98.899907%), the worst target up to 500,000× (497,487.44×, RTP 98.502513%), the 500,000× the server settled 250 times on 2026-09-11, and the worst legal target (990,000.01×) — refused on the target rule (3001), not the exposure rule (3138). E20, reproduced: the 2026-09-26 probe settled two $0.10 bets at exactly 10,000× across its two runs and 3/3 probe bets recompute; probe run 2's opening read of the 93,830.94× seed shows nonce 1 = the 1 round settled under it; probe 2 hands over to the supplement's pre-capture commitment, so the three runs form one chain. The cap is witnessed on `qa.liqd.com` only, on two days; a refusal has no commitment behind it (L15, L17). The audited rounds above 10,000× remain valid records of what the operator settled on 2026-09-11.

The supplement's journal holds 300 `bet` records equal to the dataset rows bet for bet, each preceded by its intent; event census meta 1, pre 1, rotate 7, epoch 6, intent 300, bet 300, resume-check 1, done 1. 300/300 rounds in 6/6 epochs × 50, nonces 0..49 closed, all phase `A2` at $0.10; 6/6 seeds revealed and hash to their commitments, 5/5 chain links, pre-capture anchor holds, 6/6 client seeds set after the commitment was published; 0 result, 0 win-flag, 0 credit, 0 `outcome.multiplier` and 0 wallet mismatches; 0 targets off the 2-dp grid or above 10,000×; 100 at exactly 10,000×; 201 distinct. Decade 10^4 holds one legal target under the live ceiling, so "decade 10^4 covered" means 100 rounds at 10,000.00×. No supplement round enters Steps 1–24, the simulations or any RTP figure; with 0 wins it exercises the credit rule on losses only.

### Baseline-deviation review

Re-derivation proves the game behaves as the operator's model says; it cannot notice that the model departs from what a player would assume. The left column is a standard commit-reveal Limbo baseline written independently of LIQD.

| Standard-Limbo baseline | LIQD observed | Disposition |
|---|---|---|
| A single target; win iff the result reaches it | Confirmed — `params` carries `target` alone; `win = R >= target` | Conforms |
| Result from one bias-free draw through a reciprocal map | Confirmed — one HMAC draw at cursor 0 on a 1e8 domain | Conforms |
| Win rule inclusive at the target | Confirmed and witnessed by settled money (20 rounds) | Conforms; stronger evidence than the sibling dice audit had |
| Result floor at 1× | Confirmed — fires on 1% of the draw domain, 78 witnessed rounds | Conforms. **Undocumented by the operator** — P2 |
| Result ceiling at the client-code maximum | Confirmed arithmetically at 1,000,000×; 0 rounds witnessed | Conforms in the model; not witnessed live (L4) |
| Payout = stake × target | Confirmed exactly, as an integer identity | Conforms |
| Edge at least the stated rate | A proved floor at ≥ 1.00%, 0 violations, 0 player-favourable | Conforms, and provably so |
| Edge **flat** at the stated rate | **Departs** — on the current build exactly 1.00% at 282 of 999,900 targets, up to 1.009982%, inside the band; on 2026-09-11, 1.497487% at 497,487.44× | Printed, not flagged (Step 16 PASS) |
| The client-code maximum target is purchasable | **2026-09-11: departed** — 1,000,000× refused at every legal stake | Note, Step 17 |
| The server enforces the ceiling its UI shows | 2026-09-11: no. 2026-09-26: one request inside the band not settled, reply not saved. **2026-10-02: yes**, four refusals, reply saved | Conforms since 2026-10-02 on `qa.liqd.com` (Step 25 PASS); a FLAG until then |
| Commit-reveal, client seed after commitment, nonce per round | Confirmed, with the Phase-D caveat | Conforms |
| Instant settlement | Confirmed — no live multiplier, no cash-out | Conforms |
| No selection bias in the committed server seeds | Not rejected — Z −0.1711; 10 flags vs 5.8712, P 0.0708 | A non-rejection, not a clearance |
| A public byte-level algorithm and payout specification | None — no `/fairness`, `/provably-fair` or `/how-it-works` page for this game | Deviation, disclosed: no third-party reference to anchor against — P3 |
| An operator-sourced trailing bet counter per epoch | None | Disclosed as L2 |

There is no operator FLAG: one dated finding (F-CEILING), one note (F17), one printed curve (F16) and one unresolved statistical question (F-PASS2). The remaining disclosures are scope-level.

### Exploit matrix (framework layer S5)

Offline analysis and replay against the capture, not attempted manipulation of the live API. That is "no exploit found in the paths tested", not "no exploit exists".

<!-- S5-MATRIX:START -->

| ID | Category | Result | Evidence and limit |
|---|---|---|---|
| S5-1 | Seed substitution | Blocked | 134/134 seeds hash to their commitment; 134 distinct; 133/133 links; set identity 134 vs 134 (Steps 1–3) |
| S5-2 | Client-seed manipulation | Blocked | one changed character changes the draw on 64/64; Phase D 500/500; wrong and empty client seed each leave the draw unchanged on 0 of 6,700 (Step 18) |
| S5-3 | Stake-conditional outcome | Blocked | Phase C (200 rounds at $10.00) recomputes identically; `limboDraw` takes no wager argument; Step 20 requires ≥ 2 stakes (Steps 13, 20) |
| S5-4 | Server-seed cherry-picking | **Contained structurally; screen not rejected** | client-seed-after-commitment holds by construction for 124 of 134 epochs; Pass 2 Z −0.1711, 10 flags vs 5.8712, P 0.0708; not a clearance (Step 24) |
| S5-5 | Seed-rotation race (TOCTOU) | Not tested — disclosed | instant-settle archetype: the named class does not arise; server-side atomicity in general is not testable client-side (R-RACE) |
| S5-6 | Multiplier tampering | Pass | 2,822 credits are stake × target (Step 9); the `multiplier` column is the capture script's fill (Step 8); win chance equals the grid count on 1,104 targets (Step 15) |
| S5-7 | Nonce manipulation | Pass | 134/134 epochs contiguous 0–49 under one client seed; trailing withholding not observable (L2) (Step 4) |
| S5-8 | Modulo bias | Pass | `maxFair = 42 × 1e8`, per-value bias 0; 126 rounds exercise the guard, all reproduce (Step 5) |
| S5-L1 | Player-favourable-target hunt (supplementary) | Blocked | edge ≥ 1.00% at all 99,999,900 legal targets; the dispersion runs against the player only (Step 16) |
| S5-L2 | Input-contract probing (supplementary) | Exposure ceiling enforced; client-code maximum unreachable (note); target cap evidenced 2026-10-02 | E15, E20, E21 (Steps 17, 25) |

<!-- S5-MATRIX:END -->

S5: fairness-integrity matrix; game-integrity testing not commissioned.

S5-L1 and S5-L2 were numbered S5-5 and S5-6 until 2026-09-26, which the framework assigns to other categories. **S5-4 in detail.** The 124 Phase A–C client seeds are `'audit' + randHex(6)` — 48 bits of fresh CSPRNG material per epoch. The ten Phase-D seeds are `pfaudit-<stamp>-<epoch>`, and the same `<stamp>` had been sent to the operator inside the idempotency key (`limbo-${STAMP}-${randHex(8)}`) of every round since epoch 0, so the whole Phase-D sequence was derivable before Phase D began; those epochs rest on recomputation and their statistics (500 rounds, $50.00 staked, $45.63 returned, 244 wins). **S5-L2 probes:**

| Probe | Operator response | What it establishes |
|---|---|---|
| $0.10 at 1,000,000× | `errorCode 3138` `MaxExposureExceededError`, `maxAllowedBetUsdc = 0.05` | a maximum exposure ceiling of $0.05 × 1,000,000 = $50,000 |
| a second request (E15 records $0.10) | `errorCode 3113` `BetAmountIsNotInLimitError` | with the 3138, no legal stake at 1,000,000×; as a minimum-stake witness, an inference |
| $0.10 × 500,000× = $50,000 exposure | accepted and settled, 250 times (2026-09-11) | the $50,000 ceiling is the real boundary |
| $0.10 at 93,830.94× (2026-09-26) | not settled; no nonce consumed; reply not saved | until 2026-10-02 the only evidence of the cap |
| $0.10 at 100,101.12×, 497,487.44×, 500,000×, 990,000.01× (2026-10-02) | HTTP 400, errorCode 3001, "Too big: expected number to be <=10000", each; no nonce consumed; reply saved | the server refuses the first target outside the band and the worst targets, on the target rule; Step 25 PASS |

**Not tested:** server-side selective orphaning (R-ORPHAN); cross-account seed correlation (L13); exposure refusals in other currencies or tiers (L5); any behaviour on `liqd.com` production (L1); the legacy simulation artifact's contents (L9).

## Reproduce the audit

Runtime **Node.js 22.x** (`package.json` `engines`, `.nvmrc` 22). The committed run was produced on **v22.23.1 / npm 10.9.8**; each run writes its runtime to `outputs/run/diff.json` (the committed `outputs/verification-results.json` carries no run metadata). Other majors have not been tested: the sibling LIQD Dice package was run by a reviewer on Node v24.13.1 and failed where v22.23.1 passed, over a single-ULP difference in one chi-squared probability (ECMAScript leaves `Math.exp` and `Math.log` implementation-defined), and widening a tolerance to absorb that is what lets a forged artifact through.

```sh
npm ci
npm test
```

`npm test` needs no install: it runs `scripts/check-standalone.mjs` (a dependency-free staleness gate that re-hashes every TypeScript source, the tsconfig, the lockfile and the build scripts against `standalone-manifest.json`), then `node scripts/release-manifest.mjs --check` (the release bar, first, because `node verify.js` exits non-zero on anything short of a Full Pass), then `node test.js` (27 unit tests) and `node verify.js` (25 scored steps) — single-file CommonJS bundles generated from this package's own TypeScript, reaching nothing but Node built-ins. **Expected: release check OK; `# pass 27`, `# fail 0`; Passed 25/25, 0 flags; VERDICT: PROVABLY FAIR — Full Pass; REPRODUCED; exit 0.**

| Command | Purpose |
|---|---|
| `npx mocha` | 27 unit tests: `tests/limbo/RngSpecTests.ts` (1, the 72 spec checks of docs/ALGORITHM.md), `rngTests.ts` (14), `resultFloorTests.ts` (7), `diffTests.ts` (2), `capProbeTests.ts` (3) — operator Verify vectors with intermediate draws, three rejection vectors in both directions, closed-form edge properties with a dense `RTP(m) ≤ 0.99` sweep, the `P(R ≥ m)` identity at the boundary draw, all five clamp transitions, target legality, draw-domain enforcement, the floor regression vector, the float comparison, and Step 25's cap re-probe reader on journals the real capture engine writes against the offline mock. Pinned fixtures: alone they prove nothing about the 6,700 rounds |
| `npm run verify` | the 25 scored steps against the hash-pinned capture; writes only `outputs/run/` |
| `npm run test:toolchain` | `npm run check:build`, then mocha and verify from the TypeScript sources |
| `npm run build` · `npm run check:build` | regenerate the bundles · recompile and compare emitted bytes (needs dev dependencies) |
| `npm run test:full` | mocha, then `simulate:check`, `pass1:check` and `pass2:check` (each writes to `outputs/run/` and must be byte-identical to the committed file), then verify |
| `npm run mutate` | the falsifiability battery: 117 counterexamples in a sandbox copy (`npm run mutate -- <name prefix> …` runs only the named entries, a partial run, exit 3) |
| `npm run report` | `PF_EMIT=1` — the only command that rewrites `outputs/verification-results.json` |
| `npm run simulate` · `npm run pass1` · `npm run pass2:emit` | write the committed simulation files; with the pinned master seeds they reproduce them byte for byte; a changed seed or producer is a new experiment |

| Exit | Meaning |
|---:|---|
| 0 | Full Pass, committed evidence reproduced |
| 1 | any FAIL, a reproduction beyond tolerance, or an RTP-CLAIM table mismatch (and, from the release check, a missing LICENSE or a stale manifest) |
| 2 | an operator FLAG — Conditional Pass (a capture-origin FLAG is disclosed but verdict-neutral; an INFO step is not a flag) |
| 3 | suite-integrity failure — not every step was scored; no verdict |
| 5 | RTP FIGURE OVERSTATED — the enforced RTP-CLAIM 1.2.0 rule finds the published figure overstated on Step 16 and no draw check fails (outranks 2, ranks below 1 and 3) |

`node verify.js` exited 2 (a Conditional Pass on Step 25's FLAG) until the E21 cap re-probe was pinned on 2026-10-02. On an Apple M2 Max (12 cores, Node 22.23.1, 2026-10-03), in a fresh clone, `npm run verify` took about 18 s, `node verify.js` about 18 s and `npm run mutate` about 27 minutes (1,640 s), all three while an unrelated mutation battery ran on the same machine. These are one machine's figures, not a bound.

**Verification does not write the evidence it scores.** `npm run verify` writes only `outputs/run/` (gitignored) — this run's results plus `diff.json`, a field-level diff against the committed copy. Until 2026-09-10 the sibling dice package's verify overwrote `outputs/verification-results.json` on every run, including a failing one, so a reviewer's FAIL erased the record of its own disagreement. **The verdict is unreachable unless every step ran (G-EXEC):** `EXPECTED_STEPS = 25` is a constant, never `results.length`; the run asserts exactly 25 steps numbered 1..25 with no duplicates, and a step module that throws takes the process down with no verdict line. **Determinism:** no fresh-seed simulation runs inside verification (the dice package once ran 2,000,000 draws inside `npm test`, a roughly 2.97% per-run trip rate on honest data); Step 7 measures derivation stability — two forward passes and one reverse pass, 0 disagreements; 204 rounds × 5, 0 unstable.

**The reproduction gate.** Byte identity is required of exact content; a derived floating-point statistic may differ in its last bits across machines, so the bound is **1e-14 absolute + 1e-12 relative** (`|a-b| <= atol + rtol*max(|a|,|b|)`, two distinct integers never agree, non-numeric leaves exactly). A difference inside it is marked `withinTolerance`; outside it the run exits 1.

### Tolerances of record

| Comparison | Tolerance |
|---|---|
| Served vs recomputed result; `multiplier` column vs target; win flags | exact `===`, finiteness-guarded |
| Credit vs `stake × target` (Step 9) | exact integers |
| Credit in Steps 13 and 25 | rounded to four decimals before comparing with `hundredths(stake) × hundredths(target)` |
| Exposure vs the $50,000 ceiling; edge ≥ 1.00%; win chance vs grid count | exact integers |
| Player-favourable test on a captured target's float edge (Step 16) | 1e-12, beside the integer check |
| A target is a 2-dp value (`isTargetLegal`, `src/config.ts`) | 1e-6, the operator's own legality test, ported |
| Commitment hash; dataset SHA-256 | exact string equality with shape checks; exact, by the loader before any step |
| Step 19's stored serial figure | at the 3 decimals the artifact stores |
| Step 23 per-target convergence | 5 sd + 1 win count |
| Step 24's committed Pass-2 block; reproduction gate | 1e-14 absolute + 1e-12 relative |
| RTP-CLAIM | 0.10 percentage points of the stated 99% |
| Legacy simulation per-target edge | 5·SE + 1e-4, the producer's own check, not in the scored path |

### Artifacts of record

| Artifact | SHA-256 | Guard |
|---|---|---|
| `data/limbo-master-6700bets.json` | `8e3ce5b5e1494d1fcc3a783965d3ba7b6a7099f120a64d61e21a577098c07334` | **Pinned** in `src/config.ts`; `loadDataset()` aborts before any step on a mismatch; Step 19 restates the comparison |
| `data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json` | `a2dee374cfd48c62736cf5958fd67f42b1cb7c622ab0883c3f84278d8429ab1e` | **Pinned** as `SUPPLEMENT_DATASET_SHA256`; recomputed and scored by Step 25 |
| `data/liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.journal.ndjson` | `bcacab9c674df62a3b2219cba008542f2e798e9c81559c6321489e1a43949c32` | **Pinned** as `SUPPLEMENT_JOURNAL_SHA256`; Step 25 requires bet-for-bet equality and resume count = `SUPPLEMENT_DECLARED_RESUMES` |
| `evidence/E20-target-ceiling-probe-2026-09-26/` (2 journals) | `c2401ee1fe468557…` · `58822ffa99740859…` | **Pinned** as `CEILING_PROBE_1_SHA256` / `CEILING_PROBE_2_SHA256`; reproduced by Step 25 |
| `evidence/E21-target-cap-probe/liqd-limbo-cap-probe-2026-10-02T18-22-46-633Z.journal.ndjson` | `14f9880eff8294a5a7d8b0ce3fe715093eda5061899713ff87d3c9c098719809` | **Pinned** as `CAP_PROBE_SHA256`; judged by Step 25 (L17) |
| `evidence/E21-target-cap-probe/liqd-limbo-cap-probe-2026-10-02T18-20-11-617Z.journal.ndjson` | `614ef346ecd4366ef4e2bbc1861eeffce320b880868f7baf26896546d527e310` | Recorded, not pinned, not scored |
| `evidence/E13-limbo-boundary-probes.json` | `3705c52e55af72c2…` | Recorded, not pinned — **reproduced** by Step 19 (agreement only, L17) |
| `evidence/E15-limbo-max-exposure.json` | `dcbbf1408e93ac75…` | Recorded, not pinned — **reconciled** by Step 19 |
| `evidence/rtp-page-labels-2026-10-01.json` | `e159a3c173a1887c…` | Recorded, not pinned; the source of the 99% claim; no step reads it |
| `outputs/verification-results.json` | — | the 25-step result with profile labels, the pin set (expected/actual/match), the `rtpClaim` block and the informational block; produced by `npm run report`, never written by `npm run verify` |
| `outputs/simulation-results.json` | `2d609344650eac723c262449fb8929b05c68b75f149ceee708b89ad4ade670cc` | **Pinned** as `SIMULATION_SHA256`, enforced by Step 19 (mismatch, absence, unreadable file, depths vs `SIM_UNIFORMITY_DRAWS` / `SIM_SERIAL_DRAWS` / `SIM_EDGE_BETS`, value domains); `pass2` block re-derived by Step 24; legacy Pass-1 statistics not re-derived (L9) |
| `outputs/rtp-convergence.html` | `efd121156f8255f391eb9c1b3c6f9f06c008d35807cef9a69b1e82be33fd0d69` | **Pinned** as `SIMULATION_HTML_SHA256`; recomputed by Step 19; self-contained, renders with no network access |
| `outputs/pass1-grid.json` | `9999f98ba17fe534b5350274da8e423aa6c1c096f4e136d40daec60a0cbdcae7` | **Pinned** as `PASS1_GRID_SHA256`; re-derived by Step 23; run metadata rejected |
| `outputs/rtp-claim-table.json` | `cdfbf600e0713b822acf00b420c10d12b7af7fca73cce96c395099f49634ba34` | **Pinned** as `RTP_CLAIM_TABLE_SHA256` in `src/rtp-settings.ts`; recomputed every run, exit 1 on a mismatch |

**Ten pins**, all checked against the files on 2026-10-02 with `shasum -a 256`, all matching: nine in `src/config.ts` (dataset, Pass-1 grid, simulation, chart, supplement dataset and journal, the two E20 journals, the E21 journal) and the RTP-CLAIM table pin in `src/rtp-settings.ts`. Why the evidence records are reproduced rather than hash-pinned, in the suite's own words: a hash proves a file has not changed since we pinned it, which is worth little for a file we wrote ourselves; reproduction is worth more. The pins that do exist are on artifacts produced from inputs outside our control (the capture) or by a long computation (the simulation). **Simulation pin history:** its `generatedAt` field was removed on 2026-09-26 with the producer's own `JSON.stringify(…, null, 2)` call (0 values changed), moving the pin from `9ce82a70f6093b05…` to `19aa5314bef13c1e…`; the same day the `pass2` block was replaced by the deterministic rebuild (`npm run pass2:emit`; `pass1` and `model` unchanged value for value), moving it to `66fa63e0…`; the same day again the Pass-1 half was regenerated from `SIM_MASTER_SEED` (`npm run simulate`; every Pass-1 figure moved, `model` and `pass2` unchanged), moving it to the value above (html `b06dca16…` → the value above).

### Deliberate artifact refresh

For reviewed maintenance only. Never re-pin to silence a mismatch, and never re-pin the shipped repository to exercise a semantic check — do that in a disposable copy.

```sh
npm run rtp-claim:write          # then update RTP_CLAIM_TABLE_SHA256 in src/rtp-settings.ts with the printed digest
npm run build                    # after any source change: regenerates verify.js, test.js, standalone-manifest.json
npm run report                   # PF_EMIT=1: rewrites outputs/verification-results.json; review the diff
node scripts/release-manifest.mjs
npm test
```

`node scripts/release-manifest.mjs` computes artifact hashes from disk, reads the verdict and scored counts from `outputs/verification-results.json` and the capture window and host from the headers of both scored captures (the 2026-09-11 dataset and the 2026-09-26 supplement: from the earliest start to the latest finish), and cross-checks the audit ID against README.md and MANIFEST.md, both of which it requires. `--check` also runs the release bar (LICENSE, the second-machine workflow, self-contained pinned pages, one summary shape). A documentation-only edit moves no numerical result; a change to the profile-coverage references in `src/profile-map.ts` changes only the labels in `outputs/verification-results.json`.

### Falsifiability battery

`npm run mutate` runs **117 declared counterexamples** against a sandbox copy: **75** single-file mutations (`tests/mutations.json`; `M-C3i` and `M-C3ii` added 14 October 2026), **41** structural forgeries (`tests/structural-forgeries.json`) and **1** declared survivor (`tests/mutation-survivors.json`). **116 are killed, 1 survives as declared** (run 2026-10-20 on the rebuilt tree, all 117 entries, against a Full Pass baseline: 115 killed, 1 survivor as declared, 1 not as declared, `M04`, which still mutated the `CURSOR` constant in `src/config.ts` that the rebuilt `src/rng.ts` no longer reads; `M04` was retargeted to the cursor in `src/rng.ts` and rerun on its own: killed by Step 5), followed by a manifest showing all 17 listed files byte-identical. Earlier full runs: 2026-10-15, all 117 entries on the tree before the rebuild, gave 116 killed, 1 survivor as declared, 0 other than as declared; 2026-10-03 on the tree of that date, before the two C3 entries existed, gave 114 killed, 1 declared survivor, 0 other than as declared over 115 entries. Each entry must move the step it *names* off its baseline status — "the verdict flipped" is not a kill, which is how a sibling package came to carry a registry naming a guard four other steps were quietly doing the work of. A step that already FLAGs counts only when it moves; a survivor must reproduce the baseline exactly. All 25 steps are represented; two entries are killed by `npx mocha`. Every `mutations.json` entry edits a file that is not hash-pinned, so the framework's `check-mutations.sh` (which does not re-pin) and this runner reach the same guard; every dataset forgery is a committed script under `tests/forgeries/` that re-pins `DATASET_SHA256` as a forger would. The two forgery classes that produced clean Full Passes on sibling packages both fail here: the coherently shrunk dataset with a doctored header and a re-pinned SHA (Step 12), and the absent or unreadable artifact of record (Step 19).

**Four entries name no step, because no step fails.** One deliberately does not re-pin: the loader aborts with `ERROR: dataset SHA-256 mismatch` before any step — proof the pin does something, and of its limit. Three leave every scored step at its baseline status and exit 1 only on the run-vs-committed-artifact reproduction gate (`fieldDiff` from `src/diff.ts`, over every leaf): **(1)** the legacy simulation artifact fabricated outright — perfect uniformity, zero serial correlation, a 5% *player* edge, every `pass` flag true, depths preserved, `SIMULATION_SHA256` re-pinned; **(2)** `meta.limits` doctored to values the capture contradicts on every row (G-BIND working as designed); **(3)** 500 counts moved between two Pass-1 histogram bins with totals kept (added 2026-09-26; Step 23's χ² moves but stays in bound, and `npm run pass1:check` catches it). Read those kills narrowly: they establish that the artifact is not the artifact of record, not that its contents are false, and a forger who regenerated the committed record in the same breath would trip none. **The declared survivor** is `nominalPayout()` rewritten to return zero: it is exported, documented and called by nothing. **What changed on 2026-09-11:** until then both simulation pins and the three `SIM_*` depth constants were read by nothing, so the artifact could be emptied, made unreadable or deleted and the suite still returned 21/21 Full Pass — the framework's `gate-vacuity` M2 arm and `gate-forgery` F1–F6 and F11 arms reported each as SURVIVED. Step 19 now rejects all four shapes, the four counterexamples are registered, and the depth constants moved from survivors to kills. **What changed on 2026-09-23:** two entries moved from survivors to structural forgeries as kills, because both now exit 1 on the reproduction gate; no check was weakened and no limitation was closed.

A mutation you can run: `M14` changes `return result >= target;` to `return result > target;` in `src/config.ts`; `npm run verify` then gives `[FAIL] Step 6`, verdict `NOT PROVABLY FAIR` — 20 settled rounds flip. Restore afterwards. `M12` removes the `Math.max(MIN_RESULT, …)` clamp and `M13` sets it to 1.01; both must fail Step 5. `M00` asserts Step 1 catches the commitment transcription error. **Shared assumptions:** the suite and the reference formula share one reading of the rules, so a rules misreading would move both; Step 15's literal tally, Step 6's settled-money anchor and Step 14's negative control are the structural defences.

### Fresh-clone reproduction — measured 2026-10-03

A fresh `git clone` into an empty directory (package at `limbo/`) of this package as released, except for the fresh-clone record and the battery timings, which were written afterwards from the runs' output. Node v22.23.1, npm 10.9.8, Apple M2 Max (12 cores, macOS 26.3) — the **same** machine that produced the artifacts, **not** a second machine:

| Command | Exit | Result |
|---|---|---|
| `npm ci` | 0 | clean install from package-lock.json |
| `npm test` | 0 | release check OK; `# pass 26`, `# fail 0`; Passed 25/25, 0 flags; VERDICT: PROVABLY FAIR — Full Pass; REPRODUCED |
| `npm run test:full` | 0 | `simulate`, `pass1-grid` and `pass2` regenerations all BYTE-IDENTICAL; Full Pass; REPRODUCED |
| `npm run mutate` | 0 | 114 killed, 1 survivor as declared, 0 not as declared; 16/16 manifest files unchanged |

`outputs/` (except `outputs/run/`) was hashed before `npm test` and after each command: byte-identical every time, and no tracked file changed. `node capture/selftest-capture-limbo-v2.mjs` (offline mock) exit 0, 9/9. **CI:** `.github/workflows/reproduce.yml` runs `npm ci` and `npm test` on a clean ubuntu-latest runner with the Node version in `.nvmrc`, and fails if `npm test` changes a tracked file; it does not run `test:full` or `mutate`. Not done: any of the four commands on a second machine; when CI runs, it covers the first two.

With execution you can settle every row of the step table and the worked rounds by hand. Without it, trace the algorithm against `src/rng.ts` and `src/config.ts` and the schema against `src/types.ts`, but mark every numerical and cryptographic result as unverified. Four things no execution here can settle, all ASSUMED: dataset provenance (L13), production parity (L1), commitment chronology (L6) and the operator-side 1,000,000× result ceiling (L4).

### Repository inventory

```
src/          bias.ts · config.ts · diff.ts · domains.ts · loader.ts · pass1-grid.ts · pass2.ts ·
              pass2-emit.ts · profile-map.ts · rng.ts · rtp-claim.ts · rtp-claim-switch.ts ·
              rtp-settings.ts · simulate.ts · stats.ts · types.ts            (16 files)
docs/         ALGORITHM.md (the written specification src/rng.ts is rebuilt from)
tests/        verify.ts · mutate.ts · mutations.json · structural-forgeries.json · mutation-survivors.json
tests/steps/  commitment (1–4) · determinism (5–7) · payouts (8–11) · dataset (12–13) ·
              anti-circularity (14–15) · edge (16–17) · phase-d (18) · standardization (19–21) ·
              live-fit (22) · pass1 (23) · pass2 (24) · supplement (25) · statistical · context
tests/limbo/  RngSpecTests.ts · rngTests.ts · resultFloorTests.ts · diffTests.ts · capProbeTests.ts
tests/forgeries/  cap-probe-forgeries · coherent-population-shrink · dataset-field-forgeries ·
              dataset-unpinned-edit · declared-capture-gap · evidence-artifact-forgeries ·
              pass1-grid-forged · simulation-artifact-forged · simulation-artifact-unpinned ·
              simulation-domain-violation · supplement-forgeries   (11 × .mjs)
data/         limbo-master-6700bets.json · the 2026-09-26 supplement + journal
evidence/     E13 · E15 · E20-target-ceiling-probe-2026-09-26/ · E21-target-cap-probe/ ·
              rtp-page-labels-2026-10-01.json
outputs/      verification-results.json · simulation-results.json · rtp-convergence.html ·
              pass1-grid.json · rtp-claim-table.json
capture/      capture-limbo.reference.mjs · capture-limbo-v2.mjs · liqd-capture-core.mjs ·
              rng.reference.mjs · selftest-capture-limbo-v2.mjs · selftest-mock-liqd.mjs ·
              curltest.mjs · req.py · req-v2.py · console/limbo-bundle-read.console.js ·
              PROBE-2026-10-02.md
scripts/      build-standalone.mjs · check-standalone.mjs · standalone-runtime.cjs ·
              release-manifest.mjs · release-bar.mjs
```

`src/config.ts` holds the single `resultMultiplier`, the operator's `ci`/`cr` pricing, every population and limit constant, the artifact pins, the closed-form edge proof in its header, the Pass-2 constants fixed in code on 26 September 2026 (`PASS2_*`, no observed figure) and the cap re-probe pins (`CAP_PROBE_*`). `src/loader.ts` recomputes the dataset SHA-256 and aborts on a mismatch. `src/profile-map.ts` maps each scored step to the proposed Framework 1.0 Limbo profile checks (LIMBO-01…31), emitted as labels only. `src/rtp-claim.ts` / `src/rtp-claim-switch.ts` / `src/rtp-settings.ts` are the RTP-CLAIM rule, this package's enforcement switch (on) and the table it is held to. `src/domains.ts` declares the value domain of every numeric leaf Step 19 checks. `tests/steps/context.ts` holds the scored-step contract and its guards (G-BIND, G-EXEC, G-RANGE, G-VALID, G-SCOPE), `servedResultMatches` and `hundredths`. `capture/capture-limbo-v2.mjs` journals every place-bet reply since 2026-10-02, has a `--cap-probe` mode and sends `stakeCurrency`; `capture/rng.reference.mjs` holds the result map and its reasoning as used session-side; it is the capture tool's copy of the earlier model reconstructed from LIQD's client bundle, not the audit's RNG. `src/rng.ts` is the clean-room module rebuilt from `docs/ALGORITHM.md`; `src/bias.ts` is the audit's draw-bias bound built on it.

## Verify a bet

Any player can reproduce a past Limbo round with a standard crypto library and no LIQD software. The field names are the ones LIQD returns in the bet record and its provably-fair panel.

1. **Get the inputs.** `hashedServerSeed` (the commitment, shown before the round), `clientSeed`, `nonce`, the chosen target `params.target` and `betAmount`. The `serverSeed` is revealed only **after that seed epoch rotates** (the rotate call returns it as `revealedServerSeed`); an unrevealed seed cannot yet be checked.
2. **Check the commitment.** `SHA-256( utf8_bytes( serverSeed ) )` — the SHA-256 of the server-seed **hex string as text**, not of its decoded bytes — must equal `hashedServerSeed`.
3. **Compute the draw.** `key = hex_decode(serverSeed)` (16 raw bytes — not the UTF-8 form of step 2); `digest = HMAC_SHA256(key, f"{clientSeed}:{nonce}:0")` (cursor fixed at 0); `maxFair = floor(2^32 / 100000000) * 100000000 = 4,200,000,000`; scan the digest in 4-byte big-endian `uint32` chunks and take the first `chunk < maxFair` as `k = chunk % 100000000`.
4. **Compute the result.** `R = max(100, floor(9900000000 / (k + 1))) / 100`, a 2-dp multiplier (docs/ALGORITHM.md §2 Step 3). It must equal the recorded `result`. Compare exactly: the floor is `1`, not `1.01`. The specification sets no upper cap; LIQD's client code names a 1,000,000× result maximum, which would apply only for `k ≤ 97` and has never been observed, and a result that high wins every legal target either way.
5. **Apply the win rule.** The round wins iff `R >= params.target` (a result exactly on the target wins). This must agree with the recorded `win`.
6. **Check the credit.** On a win, `winningAmount = betAmount × params.target` exactly (both 2-dp, so the product is exact in 4 dp) and `outcome.multiplier` equals `params.target`; on a loss, `winningAmount = 0` and `outcome.multiplier = 0`.

**Worked round `USzRL9gyMBxZg8NLCNoYS`** (Phase A, epoch 0, nonce 0): `serverSeed` `ee4724f00cfc46e28425e9de3239d427`, `clientSeed` `audita5a8f43bd18d`, target 4.58, `betAmount` 0.1. `SHA-256(utf8("ee4724f00cfc46e28425e9de3239d427"))` = `394004d9c91573202b92489b53a5e8eff34ac5b3d34dac76c7379cadd0f34ded`, the round's commitment. HMAC of `audita5a8f43bd18d:0:0` gives `f6c449746155ff64b37cd13cfaa1ef301431369489da985f4a3ade5151cdd137`; its first chunk `0xf6c44974 = 4,140,058,996` is below `maxFair`, so `k = 40,058,996`. `floor(9,900,000,000 / 40,058,997) = 247`, so `R = 2.47`, matching the dataset; `2.47 < 4.58`, so the round loses (`resultLabel = "lost"`) and credits 0 at multiplier 0.

**On the boundary:** `bYS2viIeJOfIRm1YpweuJ` (epoch 17, nonce 32, client seed `audite7134d0080bc`, server seed `441045a40a9fdbea912bb7c77afb1d2e`) gives `k = 84,760,019` and `R = 1.16×` on a 1.16× target, so it wins under `R >= target` and credits `0.1 × 1.16 = 0.116`. **At the top of the captured range:** `S4mFs74Bt-nTtdNWQDxk5` (epoch 34, nonce 29, server seed `06dd164fe01b803ae5a843b4b3fc4bbb`, client seed `audit02b3dbac08bb`, `serverSeedId` `3026b99c-7213-46e8-92b4-d9b4642b311b`) gives `k = 534`, `floor(9,900,000,000 / 535) = 18,504,672`, `R = 185,046.72×`, and pays the 1.17× target: `0.1 × 1.17 = 0.117`. `k ≤ 534` has probability 535/100,000,000, so across 6,700 rounds the chance of at least one is about 3.5% — toward the lucky end of a sample this size. **Stake independence:** `pFaN6MRWzGVvE8DpQBMY8` (Phase C, epoch 120, nonce 2, server seed `141a7e0ab87055e753e0f8d289bbec1a`, `serverSeedId` `fb8c5f4a-76e9-4d88-9802-e263e6d8aa21`, client seed `auditdc525d958d88`) gives `k = 41,427,570`, `floor(9,900,000,000 / 41,427,571) = 238`, `R = 2.38` on a 2.00× target at $10, paying 20; nonce 0 of the same epoch, `ytbdw5ZJKteY4mGYP9sUi`, gives `k = 75,557,563`, `R = 1.31`, a loss. **Custom client seed:** `tixnceeVcH9shNEbR8lP6` (epoch 124, nonce 0, `pfaudit-1789132605572-124`, server seed `8e2ff959b1b7ca9be1ba7408d03c9a19`) gives `k = 16,150,253`, `R = 6.12` on a 1.72× target, paying `0.1 × 1.72 = 0.172`.

A matching recomputation verifies that round against the supplied inputs; it does not, by itself, establish that the commitment was published before the bet (L6).

## Evidence

The dataset and the code are this audit's evidence of record. There are no UI screenshots in this package, and none is claimed as evidence. E13 and E15 are auditor-written JSON records of live operator responses — response bodies retained, the request/response envelope not — and reformatting a note into JSON would not upgrade its status.

| ID | File | SHA-256 | Evidence and limits |
|---|---|---|---|
| E01 | [data/limbo-master-6700bets.json](data/limbo-master-6700bets.json) | `8e3ce5b5e1494d1fcc3a783965d3ba7b6a7099f120a64d61e21a577098c07334` | the 6,700 live rounds, 134 epochs, all revealed; hash-guarded by the loader. Carries the ignored capture-side self-check fields (L8) and the capture-computed `multiplier` column |
| E02 | [outputs/verification-results.json](outputs/verification-results.json) | — | the 25 scored steps with detail strings and profile labels, the pin set, `rtpClaim` and the informational block; no run metadata; produced by `npm run report` |
| E03 | [outputs/simulation-results.json](outputs/simulation-results.json) | `2d609344650eac723c262449fb8929b05c68b75f149ceee708b89ad4ade670cc` | legacy Pass 1 (producer-attested, L9) and Pass 2 (re-derived by Step 24) |
| E04 | [outputs/rtp-convergence.html](outputs/rtp-convergence.html) | `efd121156f8255f391eb9c1b3c6f9f06c008d35807cef9a69b1e82be33fd0d69` | the convergence chart, twin output of E03; pinned, contents not re-derived (L9) |
| E05 | [src/rng.ts](src/rng.ts) · [docs/ALGORITHM.md](docs/ALGORITHM.md) | — | `commitHash`, `generateProvablyFairNumber`, `limboDraw`, `limboResult`, `rejectedLeadingChunks`; Node.js `crypto` only; rebuilt 20 October 2026 from the written spec docs/ALGORITHM.md by an implementer who never opened LIQD's code, LIQD's output run as a second check (E12, E13). The scored result map is E06's `resultMultiplier` |
| E06 | [src/config.ts](src/config.ts) | — | `resultMultiplier`, `targetToHundredths` / `winChance`, `theoreticalRTP`, `effectiveEdge`, `limboWin`, `isTargetLegal`, constants, pins, the edge proof, `CAP_PROBE_*`, and the Pass-2 constants (`PASS2_NONCES = 10_000`, `PASS2_WINDOW = 50`, `PASS2_Z_CRIT`, `PASS2_SCREEN_ALPHA = 0.05`, `PASS2_BINS = 20`). Until 2026-09-26 this block held the old screen's observed figures (`PASS2_P0 = 0.0475`, 11 flags, 6.365, 0.0550393485); they were removed with the rebuild |
| E07 | `tests/verify.ts`, `tests/steps/` | — | the 25 scored steps, with `src/profile-map.ts` (labels only) and `src/domains.ts` (value domains) |
| E08 | `src/simulate.ts`, `src/pass1-grid.ts` | — | the Monte-Carlo producers; a separate producer, not scored as such |
| E09 | `tests/limbo/*.ts` | — | the 27 unit tests (1 + 14 + 7 + 2 + 3); the first runs the 72 spec checks |
| E12 | session record, not shipped | — | the four operator Verify-calculator vectors (2026-09-07), raw responses not retained (L14) |
| E13 | [evidence/E13-limbo-boundary-probes.json](evidence/E13-limbo-boundary-probes.json) | `3705c52e55af72c2…` (recorded, not pinned) | read-only probe of `POST /api/v1/originals/limbo/verify` on an already-revealed seed (`76bb5f88df9cef0c6ef84898cf7a8718`, `audit53bafd211bdd`, nonce 0 → `result = 7.5`): `target = 7.5` → **win, multiplier 7.5**; `target = 7.51` → **loss, multiplier 0**; raw response bodies (`gameType`, `seeds`, `derivationParams`, `outcome`) retained. The file carries no date or host; that it was taken on 11 September 2026 against `qa.liqd.com` rests on the session record (the `--probe` run writes E13 and E15, and E15 is timestamped 2026-09-11 13:09:53 UTC). Reproduced by Step 19; agreement only (L17). Not the sole witness: 20 settled rounds |
| E15 | [evidence/E15-limbo-max-exposure.json](evidence/E15-limbo-max-exposure.json) | `dcbbf1408e93ac75…` (recorded, not pinned) | two live refusals, 11 September 2026 13:09:53 UTC: $0.10 at 1,000,000× → `errorCode 3138` `MaxExposureExceededError`, `fields.maxAllowedBetUsdc = 0.05`, `displayCurrencyCode = USDC`, `betType = main`; a second request, recorded at $0.10 → `errorCode 3113` `BetAmountIsNotInLimitError`. E15 records $0.10 on both; that the second was the $0.05 retry follows from the capture script (`stake: stake8(allowed)` sends the retry at the named stake and writes the original $0.10 into the record), not from the record, so `minBet = $0.10` is inferred. Reconciled by Step 19. One refusal, one currency, one tier, on qa (L5). Dated: 2 October refused 990,000.01× on the target rule, not exposure (E21) |
| E18 | [outputs/pass1-grid.json](outputs/pass1-grid.json) | `9999f98ba17fe534b5350274da8e423aa6c1c096f4e136d40daec60a0cbdcae7` | Pass 1 on a pinned master seed (added 2026-09-26), re-derived by Step 23. Numbered E18, not E16: `src/config.ts` names an E16 that is NOT retained (the `UI_MAX_TARGET` note), and reusing that number would make its "do not cite an E16" warning ambiguous |
| E19 | the 2026-09-26 supplement and journal | `a2dee374…` · `bcacab9c…` | vendored byte-identical from `capture/out/` (both hashes recomputed on source and copy, equal); `capture/capture-limbo-v2.mjs` had text-only edits since the run, all on 2026-10-01 (its missing-cookie hint reworded to drop a local path; two comments made neutral); scored by Step 25 and nothing else |
| E20 | `evidence/E20-target-ceiling-probe-2026-09-26/` | `c2401ee1fe468557585a053377b92e88d0ed7f45ef321a7cec86966abbedd836` · `58822ffa99740859c22bf7bae95e6504f1ee4dbaf8bf2f007c4bd5f8e26c53bc` | the two journals of `capture-limbo-v2.mjs --probe`, vendored byte-identical. Run 1 (17:43:21 UTC) settled a $0.10 bet at 10,000× then sent 93,830.94×: intent, **no settlement**, no `done` event. Run 2 (17:47:53 UTC) read the seed back at nonce 1, revealed it, settled bets at 10,000× and 5,428.51×, and hands over to E19's commitment. The server's reply is not in either journal (the script then threw any refusal other than `3138` unsaved). Run 2's header matches the shipped script plan (100 rounds in each of three decades); run 1's header shows an earlier, unshipped version (75 rounds per decade in four decades, 10^2 to 10^5, and a probe plan of 10,000× then 93,830.94×). Witnesses, not scored population |
| E21 | `evidence/E21-target-cap-probe/` | `14f9880eff8294a5a7d8b0ce3fe715093eda5061899713ff87d3c9c098719809` (pinned) · `614ef346ecd4366ef4e2bbc1861eeffce320b880868f7baf26896546d527e310` (first run, not pinned) | the journal of `node capture/capture-limbo-v2.mjs --cap-probe` from 18:22:46 UTC: event census meta 1, pre 1, rotate 2, epoch 5, intent 5, reply 5, bet 1, refusal 4, skip-group 4, done 1. Control at 10,000× accepted (HTTP 200) and lost: served R 5.96, recomputed 5.96 from the revealed seed `cab1ac45370b16c4a2676d17d6de4c6f`, which hashes to the commitment `37604bb1…`. Each of the four target requests (`stakeCurrency` `USDC`) answered HTTP 400, errorCode 3001, with both field messages on `body.params.target`; each refusal read the active nonce back at 0 (`nonceConsumed: false`); no target has a `bet` event. The first run's control was refused on `body.stakeCurrency` ("Invalid option: expected one of "BTC"\|"ETH"\|"USDT"\|"USDC"\|…\|"USD"\|"EUR"\|"CAD""); its rotation installed the commitment (`bf680b3e…`) the second run opened on. Commands, target choice and what proves the cap: [capture/PROBE-2026-10-02.md](capture/PROBE-2026-10-02.md). Judged by Step 25 (`judgeCapProbe`); terminal output not vendored (L17) |
| E22 | [outputs/rtp-claim-table.json](outputs/rtp-claim-table.json) | `cdfbf600e0713b822acf00b420c10d12b7af7fca73cce96c395099f49634ba34` | the exact RTP of every target 1.01× to 10,000× (999,900 settings) against the 99% claim, 0.10-point band: true min 98.990018% at 9,989.91×, true max 99.000000%, 0 beyond the band, **PASS**; the 99,000,000 targets above 10,000× as "information only, not scored" buckets; every house-side row up to 1,000 retained. Re-pinned 2026-10-02 from `02a61eb4…` when `npm run rtp-claim:write` moved only the `settingSpace` text to cite E21 |
| E23 | [evidence/rtp-page-labels-2026-10-01.json](evidence/rtp-page-labels-2026-10-01.json) | `e159a3c173a1887c6c5dd2728caf9378ade2c6b2fbd6ce8f410a3bca3e13b0e2` (recorded, not pinned) | the RTP and edge figures on the live `liqd.com` Originals pages, read logged out in a headless browser on 1 October 2026; for Limbo: "Released: September 2026 \| Edge: 1.00%", RTP 99%, House Edge 1%, and "2x lands 49.5% of the time, 10,000x lands 0.0099% of the time, and every target in between returns 99%". The only player-facing text in the package; the source of the claim in `src/rtp-settings.ts`; no step reads it |

The result-floor witness (session-recorded, not shipped) is described under [Game and algorithm](#the-result-map-and-both-clamps).

### Representative real rounds

Every value is copied from the dataset; each result recomputes from `limboResult(serverSeed, clientSeed, nonce)`, and was also recomputed — HMAC, rejection scan, both clamps — by a script that does not import `src/rng.ts`. The set spans all four phases, both stakes, wins and losses, and the cases a naive verifier gets wrong; a reviewer should pick at least five rounds of their own. `winningAmountWallet` equals `winningAmount` and `stakeWallet` equals `betAmount` on every row, and on all 6,700 rounds.

| Phase | Why it is here | Bet ID | Epoch | Nonce | Client seed | Target | Draw `k` | Result | Credited |
|---|---|---|---:|---:|---|---:|---:|---:|---:|
| A | ordinary loss | `USzRL9gyMBxZg8NLCNoYS` | 0 | 0 | `audita5a8f43bd18d` | 4.58× | 40,058,996 | 2.47× | 0 |
| A | exactly on target | `bYS2viIeJOfIRm1YpweuJ` | 17 | 32 | `audite7134d0080bc` | 1.16× | 84,760,019 | **1.16×** | 0.116 |
| A | capture maximum | `S4mFs74Bt-nTtdNWQDxk5` | 34 | 29 | `audit02b3dbac08bb` | 1.17× | 534 | **185,046.72×** | 0.117 |
| A | lower clamp fired | `yAVLBL0QWD0RVuewVxG_v` | 3 | 29 | `audit8b0f66ee7a38` | 3.76× | 99,762,668 | **1×** (raw 0.99) | 0 |
| B | 1 of only 4 Phase-B wins | `S8UAp699y0_Mx7AZDzOp5` | 100 | 39 | `audit3b6552f5138f` | 100× | 924,515 | 107.08× | 10 |
| C | 100× stake | `pFaN6MRWzGVvE8DpQBMY8` | 120 | 2 | `auditdc525d958d88` | 2.00× @ $10 | 41,427,570 | 2.38× | 20 |
| C | same epoch, loss | `ytbdw5ZJKteY4mGYP9sUi` | 120 | 0 | `auditdc525d958d88` | 2.00× @ $10 | 75,557,563 | 1.31× | 0 |
| D | auditor-chosen client seed | `tixnceeVcH9shNEbR8lP6` | 124 | 0 | `pfaudit-1789132605572-124` | 1.72× | 16,150,253 | 6.12× | 0.172 |

**Seed of record (epoch 0).** `serverSeed` `ee4724f00cfc46e28425e9de3239d427` → `hashedServerSeed` `394004d9c91573202b92489b53a5e8eff34ac5b3d34dac76c7379cadd0f34ded`; its `nextHashedServerSeed` `7d89efbe2fc3a4418eaee5086ea1f0a97931c53ce9bc200d8072bdf09b364af0` equals epoch 1's active hash; `clientSeed` `audita5a8f43bd18d`, nonces 0–49. **Pre-capture chain link**, recorded at 13:16:46 UTC before any round: `hashedServerSeed` `6e7ed0a2be102bfaadc6bfb0dc98538add33267a98dc6d5c4934a5f7375d01f8`, revealed `serverSeed` `1eea2dae64197a5fef0d56fb4fd266a6`, `nextHashedServerSeed` `394004d9c915…` — epoch 0's commitment; an ordering of records, not a date (L6).

### Where each verdict number is produced

| Number | Source |
|---|---|
| 25/25 PASS, 0 FLAG, `PROVABLY FAIR — Full Pass` | E02 → `summary` |
| RTP-CLAIM PASS on 999,900 targets, true min 98.990018% | E22, recorded in E02 `rtpClaim`; the claim from E23 |
| 6,700 rounds / 134 seeds / dataset SHA-256 | E02 `totalBets`, `totalSeeds`, `artifactHashes.dataset`; `shasum -a 256 data/limbo-master-6700bets.json` |
| Per-step counts (134/134, 133/133, 6,700/6,700, 2,822 wins, 3,878 losses, 147 floored, 78 clamped, 20 boundary, 1,104 targets) | E02 `steps[]` detail strings, emitted by E07 |
| Edge figures over all 99,999,900 legal targets | E02 Step 16 detail, re-run by `npm run verify` |
| Captured-target edge span 1.000000%–1.000041%, 57 exact | E02 Step 16 detail, sub-measurement — not the curve |
| Grid tally anchors | E02 Step 15 detail |
| The `>=` win rule | 20 settled rounds in E01 (Step 6); E13 agrees (Step 19, agreement only) |
| $50,000 ceiling, 500,000× playable maximum (2026-09-11) | E15, reconciled by Step 19; corroborated by 250 settled rounds in E01 |
| The 10,000× ceiling and per-decade Phase A coverage | E20, E21 and E19 → Step 25 |
| Legacy Pass-1 figures | E03, produced by E08 from `SIM_MASTER_SEED`; not scored (L9) |
| Pass 2 figures | E03's `pass2` block, re-derived by Step 24 |
| Live sample RTP 100.4475% | E02 `info`, re-derived by Step 21 (L7) |
| 26/26 unit tests | E09 |
| The 126-round rejection census; the 18.24 boundary-hit expectation | E02 Step 5 and Step 6 detail (L11, closed) |

## Limitations and trust

The verdict is a Full Pass on 25 scored steps, not a claim that nothing is left open. Everything in the register below is a limitation this audit found in its own work, measured where a size can be put on it: what is **not** established, why this capture cannot settle it, and how large the unseen window is. A finding that maps onto an ID here is already declared; one that maps onto nothing is new. **Four are re-checked on every run:** Step 21 re-checks L1–L4 and **fails** if one stops being true (until 2026-10-02 the L2–L4 arms printed "no longer applies" and passed); it recomputes L7 and L8, which cannot fail; L5 and L6 are restated. L9 and L13–L18 are open and not measured by Step 21; L10–L12 are closed and keep their identifiers.

### Load-bearing premises

A premise the data **cannot** contradict must carry a witness from outside the repository's own pipeline, or be marked ASSUMED.

| Premise | Witness artifact | Could the captured data contradict it? |
|---|---|---|
| Win rule is `R >= target`, inclusive | E01 — 20 rounds land with `result == target`; E13 agrees (agreement only, L17) | **yes, with real power** — under a strict `>` rule 20 of 6,700 settled rounds flip; the sibling dice capture had no such power |
| Result map over a uniform draw on `[0, 1e8)` at cursor 0 | E01 | **yes** — all 6,700 recompute under strict `===`; a wrong constant breaks every row |
| Result floor at `MIN_RESULT = 1` | E01 | **yes** — 78 rounds have a raw value below 1 and were served at exactly 1 |
| Commitment `SHA-256(utf8(serverSeed hex string))` | E01 | **yes** — a different convention fails all 134 |
| The server applies the same rejection guard | E01 — 126 rounds exercise it | **yes** — an unguarded server differs on every one; emitted by Step 5 (formerly L11) |
| $50,000 exposure ceiling and $0.10 minimum stake | E15 | **partially, in one direction** — 250 rounds at exactly $50,000 bound it from below; E15 from above; one currency, one tier, on qa (L5) |
| Result ceiling at 1,000,000× | ASSUMED — `LIMBO_MAX_MULTIPLIER` in LIQD's client code, read 2026-09-07, bundle not retained; grid arithmetic in Step 14 | **no — zero power**: 0 rounds against 0.0066 expected (L4) |
| `qa.liqd.com` serves the `liqd.com` production build | ASSUMED — nothing here establishes it | **no — zero power** (L1, A1) |
| **Each commitment existed BEFORE the rounds it covers** | ASSUMED — the capture record: the rig logged each commitment before that epoch's rounds; `at` fields are the capture client's clock | **no — zero power**: a digest carries no time (L6, P4) |

E01, E13 and E15 ship in this package; every other witness is ASSUMED.

### Declared limitations register

| ID | Not established | Magnitude and measurement | Remedy |
|---|---|---|---|
| **L1** | Production-build parity | capture is `qa.liqd.com` only; Step 21 asserts the host every run | A1 |
| **L2** | Trailing withholding — `operatorBetCount` on **0/134** epochs, so the last nonce is the auditor's own last recorded round | leading bound operator-sourced (`nonceStart`, 134/134) and epoch size fixed, so withholding could only occur at an epoch's tail; Step 21 | a server-side signed audit log or an operator trailing counter (A1 item 4) |
| **L3** | What the wallet was credited — `balanceOk` absent on **6,700/6,700**; `stakeWallet` / `winningAmountWallet` present and exact, but settle-response fields | the reported credit follows the rule exactly; the balance delta is missing; Step 21 | capture `Δbalance == winningAmount − betAmount` (A1 item 1) |
| **L4** | The 1,000,000× result ceiling, live | 0 of 6,700 against 0.0066 expected (99/1e8 per round); an even chance of one needs about 700,000 rounds; the lower clamp is witnessed 147 times, 78 genuinely; Step 21 | not worth closing deliberately (A2) |
| **L5** | The exposure ceiling generally — `MAX_EXPOSURE_USDC = $50,000` and `MAX_PLAYABLE_TARGET = 500,000×` rest on one refusal, one currency, one account tier, on qa, dated 2026-09-11 | at least $50,000 (250 settled rounds) and at most $50,000 (E15) for this account; the 500,000× figure is not claimed live (E21 refused 500,000×); restated by Step 21 | A1 item 5 |
| **L6** | That any commitment existed before its rounds | **zero offline power** — no computation on these rows can separate a pre-published commitment from one composed afterwards; restated by Step 21 | P4 |
| **L7** | That live sample RTP is RTP evidence | 100.4475% ($2,650.00 wagered, $2,661.86 returned); ordinary on a 1% edge with targets to 500,000× and a Phase B tranche decided by four wins; recomputed by Step 21 | the RTP result is Step 16, anchored by Step 15 |
| **L8** | That the capture-side self-check fields do no work | present on 6,700/6,700 and ignored — the shape of a self-confirming artifact, since a rig that is wrong is wrong in both columns; counted by Step 21 | the declaration is the closure |
| **L9** | **That the legacy simulation statistics were measured** — no scored step re-derives a statistic in the legacy Pass-1 half of `outputs/simulation-results.json`; Step 19 enforces integrity only | the fabricated-and-re-pinned artifact leaves every step at baseline and exits 1 only on the reproduction gate. *Narrowed 2026-09-26:* Pass-1 claims carried by Step 23, Pass 2 re-derived by Step 24, legacy half regenerated byte for byte by `npm run simulate:check` — still producer-attested | A4 |
| **L10** | ~~Pass 2 is a non-rejection by 0.0050393485 on a per-run bootstrap null~~ — **CLOSED 2026-09-26** | Step 24: Z −0.1711; 10 flags vs 5.8712, P 0.0708; residual: a non-rejection, power printed | — |
| **L11** | ~~Two cited figures are prose derivations no step emits~~ — **CLOSED 2026-09-26** | Step 5 emits the 126-round census and Step 6 the 18.24 expectation; neither moved | — |
| **L12** | ~~No falsifiability battery~~ — **CLOSED** | 117 entries, 116 killed, 1 declared survivor (2026-10-20, `M04` rerun on its own after retargeting); the residual is L9 | — |
| **L13** | Dataset provenance — auditor-attested; single account, single 55-minute window | every computational claim downstream is reproducible; cross-account treatment not observable | A7; an anonymous capture changes who attests, not that it is attested |
| **L14** | The four Verify-calculator vectors as a shipped artifact | session testimony, raw responses not retained; nothing in the verdict rests on them | A1 item 2 |
| **L15** | That the server refuses targets above 10,000× beyond `qa.liqd.com` on the days asked | 2026-09-26: one request (93,830.94×, inside the band) not settled, reply not saved; 2026-10-02: four refused with the reply saved (E21); 100,000× not re-probed; production not probed. *Narrowed 2026-10-02* — until then Step 25's FLAG; Step 25 | re-run the probe on the certified host (A1 item 7) |
| **L16** | The payout above 100× | 2,822 wins on 1.01×–100×, largest credit $20; all 750 rounds at 1,000×, 100,000× and 500,000× lost, and all 300 supplement rounds (0.4182 expected); Steps 9 and 25 print the counts | a long capture |
| **L17** | That evidence with no commitment behind it came from the casino — E13 (an invented E13 agreeing with the model passes) and E21 (a hand-written refusal journal pinned with its own digest would pass) | E13 agreement only; E21's control round recomputed, refusals held to their shape; the journal was copied byte for byte from `capture/out/`, terminal output not vendored; Steps 19 and 25 | keep the terminal output with the journal next run |
| **L18** | That the capped game pays and behaves as the 2026-09-11 build did | after the cap: 304 settled rounds (300 supplement and 3 probe rounds on 2026-09-26, 1 control on 2026-10-02), all recompute, all lost, highest result 800.72× (counted from the pinned files); Step 25 | A1 — a capture on the current build including low targets |

**L2–L3 detail.** L2 is not closable from a client-side capture. For L3, what is established is that the operator's *reported* credit follows the rule exactly, not that the wallet was credited that amount. **L5 precision notes.** (a) The $0.10 minimum stake is inferred: no below-minimum stake was submitted deliberately; `src/config.ts` labels it inferred, and the capture script's comment called it "witnessed" until 2026-10-02 and now says inferred too. (b) E15's second entry's `requestedStake: 0.1` is the outer variable. Neither touches F17, which rests on the `3138` and `maxAllowedBetUsdc`; a standalone below-minimum probe and a rig fix are named recapture items (A1 item 6). **L9 reach.** Step 19 recomputes `SIMULATION_SHA256` and `SIMULATION_HTML_SHA256`, fails on mismatch, absence, an unparseable file or depths that disagree with the `SIM_*` constants, and reads no statistic: *a Monte-Carlo artifact scored by the same process that generates it is not evidence.* The pins establish that the shipped bytes are the bytes this audit read, not that the numbers were measured; every legacy Pass-1 figure — uniformity χ², lag-1 and runs, per-target RTP, convergence path — is producer-attested, and no prose here may describe those statistics as verified. **L15 detail.** 93,830.94× is itself inside the band (98.991642%). The 990,000.01× refusal is the target rule (3001), not the exposure rule (3138). Apart from 93,830.94×, no target between 10,000.01× and 100,101.11× was requested; those targets are inside the band either way. The cap is the operator's to keep: if the server again accepts targets above about 100,100×, the 99% claim fails the rule as stated, and LIQD would have to cap the API or state an RTP range. **L18 detail.** The payout evidence (2,822 wins) and the result formula above 800.72×, including the 1,000,000× cap (L4), rest on the 2026-09-11 build. The server changed at least twice between 2026-09-11 and 2026-10-02 — the target cap, then a required `stakeCurrency` field — and what else changed is not established. In the capped game's favour, the 2026-10-02 refusal message states a win-chance range of 0.009900%–98.019801% for targets 1.01–10,000, which is what the pricing formula gives at 10,000× and at 1.01×.

### Model anchors

| Modelled figure | Anchor method | Tolerance | Enforcing step |
|---|---|---|---|
| Result recomputation | bit-for-bit re-derivation of all 6,700 money-settled results under an intact chain; corroborated by 4 Verify vectors (L14) | exact `===`, finiteness-guarded | Step 5 (`tests/steps/determinism.ts`) |
| Win chance per target | literal tally over the entire 100,000,000-point grid | exact integer equality | Step 15 (`tests/steps/anti-circularity.ts`) |
| Effective edge per target | `floor(N/ci)·ci ≤ N` at all 99,999,900 legal targets; no operator odds field read | exact integers | Step 16 (`tests/steps/edge.ts`) |
| Boundary behaviour | 20 settled rounds plus the operator's verifier at `target == R` and `R + 0.01` | exact | Steps 6 and 19 |
| Exposure ceiling | the operator's own `maxAllowedBetUsdc`, re-derived to $50,000; 250 settled rounds at that exposure | exact integers (hundredths) | Steps 11 and 17 |
| Legacy simulation integrity | SHA-256 against the pins, seed bound to `SIM_MASTER_SEED`, depths to `SIM_*`, value domains | exact | Step 19 — integrity only (L9) |
| Pass-1 · Pass-2 statistics | re-derived from `outputs/pass1-grid.json` · from the dataset | reproduction bound | Steps 23 · 24 |
| Falsifiability | negative control plus 117 declared counterexamples (all 117 executed in the full run of 2026-10-20, `M04` rerun after retargeting) | exact | Step 14, `npm run mutate` |

**Residual (declared).** The oracle and the engine share one reading of the rules — one draw at cursor 0 on a 1e8 domain, the reciprocal map with two clamps, `R >= target`, `stake × target` — so a rules misreading would move both together. The win-chance anchor shares no reasoning with the closed form, and the boundary rule is anchored outside the model. There is no published third-party RTP for this operator; the live page (E23) states no per-target table, so the anchor class is grid enumeration plus settled-result reproduction. The legacy simulation's statistics have no anchor (L9). **Provisional** pending a post-launch production-parity capture.

### Operator trust

The verifier proves that every captured round was consistent with a pre-committed hash and a player-supplied client seed, that its result recomputes bit-for-bit, and that it paid stake × target. **Entropy model:** Client Seed + Server Seed; one draw per round at cursor 0; no external entropy.

| Entropy component | Source | Player-observable? | Player-controllable? |
|---|---|---|---|
| Server seed (secret) | LIQD | No (until reveal) | No |
| Server seed hash (commitment) | `SHA-256(utf8(serverSeed hex string))` | Yes (before any round) | No |
| Next server seed hash | same convention | Yes (during the previous epoch) | No |
| Client seed | Player | Yes | **Yes — supplied at rotation** |
| Nonce | LIQD state | Yes | Only via ordering |

**What commit-reveal proves here:** no post-bet tampering, conditional on the attested chronology (L6); seed foreknowledge removed (133/133 links); client-seed consumption is load-bearing; faithful execution (6,700/6,700 results and win flags); payout conformance; the edge as a proved floor tied to the operator by Steps 5 and 15; and settlement with no residual degrees of freedom (Step 20).

- **R-CHERRY — server-seed cherry-picking.** Containment: STRUCTURAL (medium); statistical screen NOT REJECTED. The primary defence is the client-seed-after-commitment mitigation, by construction for 124 of 134 epochs; the ten Phase-D epochs are a caveat (S5-4). Pass 2 is the secondary screen (F-PASS2). **Residual risk: MEDIUM — structurally contained, statistically unresolved.** No external-entropy pinning is in use, which is peer-standard for commit-reveal formula games; a beacon would collapse this to LOW by construction and make the screen result moot (not a numbered recommendation; P4 is).
- **R-EDGE — the edge is a closed form, not a measurement.** It covers the whole legal range, including the 99,998,796 targets the capture never touched, and no dataset can falsify it; it is exactly as true as the premise that `ci`/`cr` are the operator's real functions, which Steps 5, 14 and 15 tie to observed money. Containment: RESOLVED.
- **R-ORPHAN — server-side selective orphaning.** Not detectable from a client-side capture (L2). A server-side signed, monotonically counted audit log would close it; an external-entropy beacon would not. Containment: DISCLOSED.
- **R-CREDIT** — the credit is confirmed against settle-response fields (L3). DISCLOSED.
- **R-SIM** — the legacy simulation statistics are producer-attested (L9). The sibling dice package was defeated by a reviewer who hand-wrote a perfect Pass 1 and obtained a clean Full Pass; this package cannot be defeated the same way only because it makes no verification claim about the legacy figures. DISCLOSED.
- **R-PARITY** — production parity (L1). DISCLOSED (provisional).
- **R-MULTI** — cross-account seed correlation (L13). OUT OF SCOPE (disclosed).
- **R-RACE** — the mid-round rotation race is structurally not applicable to the instant-settle archetype; server concurrency was not tested. NOT APPLICABLE.
- **R-LIMITS** — the exposure ceiling rests on one probe (L5), and the live target ceiling on five requests over two days on `qa.liqd.com` (L15, L17). DISCLOSED.

Mapping to the register: R-PARITY = L1, R-ORPHAN = L2, R-CREDIT = L3, R-LIMITS = L5 and L15, R-CHERRY = L10 (closed 2026-09-26), R-SIM = L9, R-MULTI = L13.

| Game | Entropy model | Payout model | Boundary rule witnessed by | Cherry-pick containment |
|---|---|---|---|---|
| LIQD Dice | Client + Server | Formula `9900/basisPoints` | verifier probes only (0 settled rounds discriminate) | STRUCTURAL — client seed + Pass 2 |
| LIQD Plinko | Client + Server | Table | n/a | STRUCTURAL — Pass 2 Test B |
| **LIQD Limbo** | Client + Server | `stake × target`, edge a closed-form floor | **20 settled rounds + verifier probes (E13)** | STRUCTURAL — client seed (124/134); Pass 2 not rejected |

### Recommendations

Nothing in the operator list is a security fix: no exploit was found in the paths tested, no captured round is player-favourable, and the house edge is a proved floor. The operator items are the target cap and documentation gaps; the audit items close scope boundaries.

- **P1 — Keep the API cap at 10,000×, show it, and make every number agree with it.** (1) Refuse every target above 10,000× at the API, not only in the UI, on `qa.liqd.com` and `liqd.com`; the claim would still hold up to 100,101.11×, and if the API again accepts targets above about 100,100× the fix is to cap the API or publish an RTP range. (2) Lower the client-code maximum **target** (`LIMBO_MAX_MULTIPLIER = 1,000,000`, read 2026-09-07) to 10,000×, but do not change the 1,000,000× **result** cap; in the client code one constant set both — if it still does, split it. (3) State beside the 99% figure that 10,000× is the maximum target. Do **not** raise the exposure ceiling to make 1,000,000× purchasable: that would re-open the targets where the 99% claim fails.
- **P2 — Publish the result floor**, `min(1000000, max(1, floor(9900000000/(k+1))/100))`, and that it floors at 1, not 1.01. A verifier author implementing the visible formula would disagree with the operator on about 1% of a player's history; this audit's own model had that defect.
- **P3 — Publish the algorithm and the pricing formula**, byte-level: the draw (hex-decoded key, `${clientSeed}:${nonce}:${cursor}`, cursor 0, big-endian chunks, the rejection guard at range 100,000,000 — omitting it breaks a verifier on one round in forty-five), the result map, the commitment convention distinguished from the HMAC key, the inclusive win rule, `winChance(m) = floor(9.9e9 / round(100·m)) / 1e8` with the shared numerator, and a validation vector from a revealed epoch.
- **P4 — Publish commitments to an independently timestamped append-only log.** The single change that would convert the strongest claim here from conditional to unconditional (L6).
- **A1 — Production-parity re-verification**, the single item that gates provisional status, with a recapture step-list: (1) record the wallet balance per round (L3); (2) retain raw HTTP for the boundary and limit probes and the Verify vectors (L14, L17); (3) draw Phase-D client seeds from fresh CSPRNG material after recording the commitment, as the sibling dice harness now does; (4) capture an operator-sourced trailing bet count (L2); (5) probe the exposure ceiling in a second currency and tier (L5); (6) probe below the minimum target, above the maximum target and below the minimum stake, each standalone (a $0.09 probe would settle the minimum; behaviour above 1,000,000× was not probed); (7) re-run the cap re-probe on the certified host and vendor its terminal output beside the journal (L15); (8) capture-record fixes: record the stake actually sent on a retry, write date and host into the boundary-probe record, store `null` when the casino omits a field instead of filling a default (the reference script fills `multiplier` and `nonceStart`), and keep raw responses for every round, as `capture/capture-limbo-v2.mjs` already does.
- **A2 — Witness the 1,000,000× result ceiling** — a standing item, not worth a targeted capture (L4).
- **A3 — A cherry-pick test with power against return-based selection — DONE 2026-09-26**, the served-target half of Step 24; a larger production capture raises its power.
- **A4 — Score the legacy simulation's statistics** (integrity is scored since 2026-09-11), by structural validation: re-derive what can be re-derived and bound the rest (an RTP must be the producer's return for a valid integer win count; win counts cumulatively consistent across nested marks; every plotted SE following from `(n, rtp, wins, m)`). Two warnings: do not add a "perfection proves fabrication" rule (G-VALID forbids it), and recovering a win count by rounding is not enough — a reviewer defeated that with a fractional implied win count.
- **A5 — Ship a falsifiability battery — DONE** (L12); what it did not close is L9.
- **A6 — Make the two prose derivations scored — DONE 2026-09-26** (L11).
- **A7 — Multi-account seed-correlation study** (L13): a two-account capture placing identical target sequences under identical nonces.

**Future evidence collection — not defects.** `maxBet` (9,898 USDC) is config-attested only. The 1.01× minimum target is unviolated but its enforcement is untested. Idempotency was not exercised. Node.js 22.x is the only runtime the package has been run on.

### Production validation plan

The next stage is an anonymous production capture published as a separately identified dataset with its own verification run: production sampling (closes L1, the only item that retires *provisional*); complete capture records (closes L14, narrows L13); wallet reconciliation (closes L3); client-seed sequencing (narrows L6); limit behaviour across currencies and tiers with a standalone below-minimum probe (closes L5); the target ceiling on the certified host (narrows L15); winning payouts above 100× (closes L16); operator-sourced trailing counters (closes L2); and scored legacy simulation statistics, or their retirement in favour of Step 23 (closes L9). **Production sampling cannot close** commitment chronology (L6, needs P4), dataset provenance (L13) or the 1,000,000× ceiling (L4, a rare event, not a hidden one). Final certification requires the anonymous production capture to be completed, reviewed and published with passing verification for its stated scope; remaining exclusions will be recorded explicitly.

## Terms

**Provably fair / commit-reveal:** the server publishes `hashedServerSeed` before any round and reveals `serverSeed` after rotation; it depends on the commitment being published *before* the round, which this audit declares rather than proves (L6). **Server seed:** a 32-character (16-byte) hex string, the HMAC key in hex-decoded form. **Commitment:** `SHA-256(utf8(serverSeed hex string))`, the Stake convention. **Client seed:** player-controlled, mixed into `${clientSeed}:${nonce}:${cursor}`, supplied at rotation. **Nonce:** a round's position in its epoch, 0–49. **Cursor:** the third message field, 0 for every Limbo round; it changes the HMAC message, not an offset into a digest. **Epoch:** 50 rounds under one pair. **Chain link:** `nextHashedServerSeed` equal to the next epoch's commitment; a hash chain orders records, it does not date them. **Draw `k`:** the bias-free integer in `[0, 100,000,000)`. **Range · `maxFair`:** the modulus 100,000,000 · `floor(2³²/range) × range = 4,200,000,000`. **Modulo-bias rejection:** discarding chunks at or above `maxFair`. **Result `R`:** the round's outcome multiplier, not what the player is paid. **Target:** the player's bet `m`; "legal target" means legal under the client constants read 2026-09-07 — the 99,999,900 two-decimal targets from 1.01× to 1,000,000×, of which the server now accepts 999,900, up to 10,000×. **Win rule:** `R >= target`. **Result floor · ceiling:** `MIN_RESULT = 1` · `MAX_MULTIPLIER = 1,000,000`. **Win chance:** `floor(9.9e9 / round(100·m)) / 1e8`, the client-code `cr`; **`ci(m)`:** `Math.round(100·m)`. **Numerator `N`:** 9,900,000,000. **Theoretical RTP · effective edge:** `winChance(m) × m` · `1 − RTP(m) = (1e8 + (N mod ci)) / 1e10`. **Exposure:** `stake × target`; **maximum playable target:** `maxExposure / minBet = 500,000×` on 2026-09-11; **live target ceiling:** `LIVE_TARGET_CEILING = 10,000`. **Instant settlement:** one call places and settles. **Anti-circularity · negative control:** win probabilities and edge from grid arithmetic, never operator odds fields · a deliberately wrong input the verifier must reject. **G-BIND:** population assertions bind to `src/config.ts`, never to a count the artifact supplies. **G-EXEC:** a verdict is unreachable unless every step ran. **G-RANGE:** every scalar bounded by a physically possible range from config or the draw grid. **G-VALID:** never reject the merely surprising. **G-SCOPE:** what the data cannot witness is a declared limitation. **G-LIMITS:** a stated operating limit is recorded as an observed enforcement, not a config field believed. **Pass 1 · Pass 2:** the Monte-Carlo characterisation of the reference RNG · the cherry-pick screen. **Not rejected:** the test statistic did not cross its threshold — not "clean" or "passed". **Standard error:** `σ/√n`. **Producer-attested:** emitted by code no verification step checks. **Declared limitation (L#):** something this audit does not establish, with its magnitude. **PROVISIONAL:** the qualifier while production parity is not established (L1).

## Release history

**`v1.0.0`** — the audit as packaged, release identity in [RELEASE-MANIFEST.json](RELEASE-MANIFEST.json): audit ID `PF-2026-LQ05` (confirmed by ProvablyFair.org), framework 1.1 (1.0 until 14 October 2026), environment pre-production / provisional, supersedes nothing; released 21 October 2026 as the first public release, one commit, signed with the release key whose fingerprint the release manifest records. Recorded verdict: **PROVABLY FAIR — Full Pass** *(provisional — pre-launch capture)*, 25/25, 0 FLAG, 0 hard fails. The history below is the package's own dated record.

**`v1.0.1`** (errata): adds `.gitattributes` (`* -text`) so a Windows git clone keeps every file byte-identical; no audit content changed.

- **7 September 2026** — algorithm recon: model reverse-derived from the client bundle; four Verify-calculator vectors recorded (L14).
- **11 September 2026** — dataset captured (13:16:45–14:12:05 UTC) with the boundary and limit probes (E13, E15). The missing result floor was caught by the inline check on the first epoch of the session and corrected. Step 19 began enforcing the simulation pins and depth constants (until then the artifact could be deleted and the suite still returned 21/21).
- **23 September 2026** — Step 16 replaced its per-target loop with the exhaustive enumeration, correcting the first draft's flat-edge reading; two declared survivors reclassified as reproduction-gate kills; the Pass-2 bootstrap re-rolled twelve times (9, 10 or 11 flags); external reviewer recount received; the 10,000× UI clamp observed (no record kept).
- **26 September 2026** — supplement (E19) and ceiling probe (E20) captured; Steps 22, 23, 24 and 25 added; Pass 2 rebuilt deterministic and scored (L10 closed); the 126-round census and 18.24 expectation moved into Steps 5 and 6 (L11 closed); legacy simulation regenerated from `SIM_MASTER_SEED` (every Pass-1 figure moved; pin history above); S5-L1 and S5-L2 renumbered.
- **29 September 2026** — Step 22 policy INFORMATIONAL.
- **1 October 2026** — the live page read (E23); text-only edits to `capture/capture-limbo-v2.mjs`. From 2026-10-01 the mutation baseline was a Conditional Pass (on 2026-10-01 Steps 16, 17 and 25 flagged; then Step 16; then Step 25 alone, exit 2).
- **2 October 2026** — QA fix list: profile LIMBO-19 follows the RTP-CLAIM band (Step 16 PASS); Step 25 made a FLAG pending a saved refusal; the place-bet API began requiring `stakeCurrency`; the cap re-probe was run and pinned as E21, Step 25 PASS, **verdict Full Pass, exit 0**; RTP-CLAIM table re-pinned from `02a61eb4…` (only `settingSpace` text moved); Step 19's casino-result comparison for E13 added; Step 21's L2–L4 arms made to fail; the third copy of the result map in `src/simulate.ts` removed; six mutation entries added and the two cap re-probe entries rewritten for the pinned journal; all ten pins checked.
- **3 October 2026** — fresh-clone reproduction recorded; mutation battery on the release tree: 114 killed, 1 declared survivor, 0 other than as declared; timings recorded.
- **5 October 2026** — audit ID `PF-2026-LQ05` confirmed by ProvablyFair.org; `RELEASE-MANIFEST.json` regenerated, `auditIdStatus` the only field that changed. No step, figure or verdict changed.
- **14 October 2026 — Methodology v1.1.** RTP-CLAIM 1.1.0 → 1.2.0 (Methodology v1.1, Mike, 14 October 2026; `src/rtp-claim.ts` re-vendored byte for byte, SHA-256 `c9a9c1c4…`; switch still on): an enforced miss would now mark the RTP-claim step RTP FIGURE OVERSTATED and make the verdict RTP FIGURE OVERSTATED, exit 5, instead of NOT PROVABLY FAIR; the claim's source restated to name the game page, one of the rule's six places (no figure changed). Framework 1.0 → 1.1 (D1), the profile version's suffix dropped as approved (D6), the S5 line added (D5). `outputs/rtp-claim-table.json` re-written and re-pinned (`cdfbf600…`); `outputs/verification-results.json` re-emitted with `npm run report` (`ruleVersion`, the table hash, `profileVersion`) and emitted a second time with the same bytes (`993b112c…`); bundles rebuilt; `RELEASE-MANIFEST.json` regenerated. Verdict unchanged: `npm test` on Node 22.23.1 exits 0 — release check OK, `# pass 26`, 25/25, PROVABLY FAIR — Full Pass, REPRODUCED. `npm run mutate`: 114 killed, 1 survivor as declared, 0 not as declared.
- **14 October 2026, later — RTP FIGURE OVERSTATED route (FIXPASS2 C3).** Two entries added to `tests/mutations.json`, each first run as edited (must exit 1 with `[FAIL] Step 16`: a committed RTP table that no longer matches is a reproduction failure even under a miss), then with `regen` (the RTP table re-written and re-pinned and the record re-emitted in the sandbox, as an auditor would after the change), and judged by the exact exit code: `M-C3i` prices target 1,234.57x, which no captured bet used, 2 pp lower where the RTP table prices it; `M-C3ii` raises the published figure to 99.25 % in `src/rtp-settings.ts`. `tests/mutate.ts` gained the `regen` / `expectExit` / `expectVerdict` fields and a name-prefix filter for partial runs. `npx ts-node tests/mutate.ts M-C3i M-C3ii`: both "ends as declared", without regen exit 1 and `[FAIL] Step 16`, with regen exit 5, `VERDICT: RTP FIGURE OVERSTATED`, `[RTP FIGURE OVERSTATED] Step 16`; 16/16 manifest files unchanged; partial run, exit 3. Both ended at exit 5, so no earlier check pre-empted the rule. No step, figure or verdict changed; the full battery has not been run with the two entries.
- **15 October 2026** — release manifest only; no step, figure or verdict changed. `RELEASE-MANIFEST.json` `capturedAt` covered the dataset of 11 September only, while the 300 supplement rounds Step 25 scores were placed on 26 September; `scripts/release-manifest.mjs` now spans the headers of both scored captures, and the regenerated manifest reads 2026-09-11T13:16:45.577Z to 2026-09-26T17:56:42.327Z (`--check` OK). `npm test` exits 0 as before.
- **19 October 2026** — documents only; no step, figure, pinned file or verdict changed. The falsifiability counts in the README, the battery section, L12 and the coverage table are restated from the full battery of 15 October 2026: 117 entries, 116 killed, 1 survivor as declared, 0 not as declared (the 3 October run, 115 entries, is kept as dated history).
- **20 October 2026 — the RNG module rebuilt from a written specification.** Following the client's ruling of 20 October 2026 that RNG code is rebuilt from a written specification and never ported from the casino's code, `src/rng.ts` was replaced by a clean-room module, logic byte for byte, with a provenance header. The specification is added as [docs/ALGORITHM.md](docs/ALGORITHM.md) (a copy of the audit framework's `games/liqd-limbo/ALGORITHM.md`, SHA-256 `2b6698b4…68c9db15`), written without opening LIQD's code; the module was written by an implementer who read only that specification and a module-interface file. Agreement measured on integration over every captured round: the rebuilt module reproduces commitment and result on 7,004 of 7,004 (6,700 dataset, 300 supplement, 4 settled probe rounds in E20 and E21, seeds paired by hashing), LIQD's Verify-calculator values 4 of 4 and its `/verify` replies 2 of 2; LIQD's code is not in the package and no ProvablyFair.org site verifier exists for Limbo. Two differences from the earlier ported code, on paths no captured round reaches: when all eight chunks are rejected the module throws (the earlier code redrew at cursor + 1,000,000), and `limboResult` applies no upper cap (the scored result map, `resultMultiplier` in `src/config.ts`, keeps 1,000,000×; they differ only for `k ≤ 97`). The draw-bias bound moved to `src/bias.ts` with a 4,000-round acceptance probe through `src/rng.ts` (0 disagreements, 81 probe rounds in the rejected tail); the specification's 72-check self-test is unit test `tests/limbo/RngSpecTests.ts` (27 unit tests). Mutations `M00`, `M04`, `M05`, `M06`, `M07`, `M19`, `M27`, `M51`, `M52` and `M53` retargeted to the rebuilt code (`M51` to `src/bias.ts`; `M04` from the `CURSOR` constant in `src/config.ts` to the cursor in `src/rng.ts`). `simulate:check`, `pass1:check` and `pass2:check` regenerate the simulation artifacts byte-identical, so no simulation pin moved; `outputs/verification-results.json` re-emitted with `npm run report` (only Step 5's detail, which now prints the acceptance probe, and the LIMBO-09 coverage label changed); bundles rebuilt; `RELEASE-MANIFEST.json` regenerated. `npm test` on Node 22.23.1 exits 0: release check OK, `# pass 27`, `# fail 0`, 25/25, PROVABLY FAIR — Full Pass, REPRODUCED. `npm run mutate`: 115 killed, 1 survivor as declared, 1 not as declared (`M04`, before its retarget); `M04` retargeted and rerun on its own: killed by Step 5. Verdict and score unchanged. Still carrying values read from LIQD's client bundle, not rewritten: `src/config.ts` (pricing `ci`/`cr`, the 1,000,000× result cap, the `LIMBO_*` constants) and the capture tool's `capture/rng.reference.mjs`.
- **21 October 2026 — release `v1.0.0`.** Release wording only; no step, figure, scored artifact or verdict changed. The release lines name `v1.0.0`, the first public release; a comment in `src/bias.ts` dates the move instead of naming a version; bundles rebuilt; `RELEASE-MANIFEST.json` regenerated (`release` `v1.0.0`, `supersedes` null, `signature` the release key's fingerprint).

### 4 October 2026 — consolidated documentation

The 22 Markdown documents in the package root were reduced to **README.md and this MANIFEST.md**. Repeated explanations and superseded examples were removed; the dataset, supplement, evidence files, outputs, code and every verification result were retained. `capture/PROBE-2026-10-02.md` stays as the run record of the E21 capture it documents (L17 rests the journal's evidential value on it). The profile-coverage labels in `src/profile-map.ts`, and the documentation reference in a comment in `src/rtp-settings.ts`, now point to sections of this overview; `outputs/verification-results.json` was regenerated with `npm run report` (only those labels changed), the standalone bundles were rebuilt and `RELEASE-MANIFEST.json` regenerated. The release generator's list of documents that must carry the audit ID now names README.md and MANIFEST.md. No new casino capture, simulation regeneration or mutation battery is asserted for this update, and no claim, verdict or limitation changed.

### Where the former chapters went

| Former documentation | Consolidated location |
|---|---|
| README (verdict, metrics, game configuration, verify a bet, reproduce, algorithm) | README; Conclusion and scope; Game and algorithm; Verify a bet; Reproduce the audit |
| Executive summary, conclusion | Conclusion and scope; README |
| Scope and methodology | Conclusion and scope; Dataset and capture; Reverse-derivation and reference vectors |
| System architecture, game rules, RNG algorithm analysis, game-logic verifiability | Game and algorithm; Verify a bet |
| Live parity testing | Dataset and capture; Verification results; Live-round statistics |
| RTP analysis, payout verification | Payouts and RTP |
| Edge case analysis | Game and algorithm (both clamps); Verification results (Step 6); Payouts and RTP (limits) |
| Findings | Verification results (step table, step notes, F-PASS2, F-CEILING, baseline-deviation review) |
| Exploit testing | Verification results (exploit matrix) |
| Reproducibility | Reproduce the audit |
| Operator trust analysis, recommendations | Limitations and trust |
| Evidence appendix | Evidence |
| Technical audit report (AUDIT_CONTEXT) | distributed across all sections; its production validation plan is under Limitations and trust |
| Glossary | Terms |
| Summary (navigation) | Contents |
| Previous MANIFEST (algorithm, dataset, verification, inventory, artifacts, premises, register, anchors) | Game and algorithm; Dataset and capture; Verification results; Reproduce the audit; Limitations and trust |
