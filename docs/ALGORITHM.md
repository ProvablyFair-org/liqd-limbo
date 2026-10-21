# LIQD Limbo: clean-room algorithm specification

Copy of the framework spec (SHA-256 2b6698b407f0647effcc3d442fec963ebd990de03d2b7bc5efd452ba68c9db15, the hash cited in src/rng.ts); local workspace paths and tool names replaced by neutral wording, nothing else changed.

Written 20 Oct 2026 for the ProvablyFair.org audit of LIQD Limbo
(`originals-limbo`, captured on qa.liqd.com).

This document is the only input an implementer needs to rebuild LIQD Limbo's
outcome derivation and settlement. It was written without opening any LIQD
source code, any port of it, any audit-package code (`src/`, `tests/`,
`scripts/`, `capture/`, `verify.js`, `test.js`, `verifier-parity/`), any
saved LIQD bundle, or any LIQD verify panel (see §8). Every step names where it
came from:

- **PAGE**: LIQD's public pages or LIQD's own API replies, quoted with location
  and date.
- **STANDARD**: the standard provably-fair construction (SHA-256 commitment to a
  server seed; HMAC-SHA256 keyed by the server seed over client seed, nonce and
  a round cursor; 4 bytes to an unsigned integer; rejection sampling to remove
  modulo bias; limbo result = (1 − edge) / uniform).
- **DATA**: fixed by testing candidates against every captured round:
  6,700 rounds in `repositories/liqd/limbo/data/limbo-master-6700bets.json`
  (11 Sep 2026) and 300 rounds in
  `liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json` (26 Sep 2026),
  7,000 rounds in all, 140 revealed seeds. Seeds were paired to rounds by
  hashing the revealed seed, never by record position.

LIQD's public pages say what the player sees (win at or above the target,
99 % RTP). They do not say how the result is derived, so §2 rests on STANDARD +
DATA.

---

## 1. Inputs and commitment

### 1.1 Inputs

| Input | Form | Source |
|---|---|---|
| `serverSeed` | **32** lowercase hex characters (16 bytes); secret until the seed pair is rotated | DATA: all 140 revealed seeds are 32 hex characters (`revealedServerSeed` in the rotate reply, e.g. `"c37d4bc3c3a94a0c869f83a0085dd920"`) |
| `clientSeed` | text string set by the player | DATA: the place-bet reply carries `provablyFair.clientSeed`; the capture set its own (`audit…`, `pfaudit-…`) and the server accepted them |
| `nonce` | non-negative integer; 0 on the first bet after a rotation, +1 per bet | DATA: rotate reply `"nonce": 0`; `consumedNonce` 0…49 per seed |
| `cursor` | non-negative integer; **0** on every captured round | DATA: place-bet reply `round.cursor: 0` on all 300 v2 rounds (the master dataset does not record the field) |
| `target` | multiplier on a 0.01 grid | PAGE (LIQD API, 2 Oct 2026, E21 journal): *"must be a multiple of 0.01 between 1.01 and 10000 (win chance 0.009900%–98.019801%)"*. DATA: all 7,000 targets are on the 0.01 grid |
| `stake` | decimal string, 8 decimals (`"0.10000000"`) | DATA (request body) |

### 1.2 Commitment

```
commitment = lowercase_hex( SHA-256( ASCII(serverSeed) ) )
```

i.e. hash the **32 ASCII characters** of the seed as written, not the 16 bytes
they encode.

- SOURCE: STANDARD (SHA-256 commitment, hex output) + DATA for the encoding.
- Candidates tried: SHA-256 over the ASCII string → **7,000 / 7,000** rounds
  paired, 140 / 140 seed hashes resolved; SHA-256 over the hex-decoded 16 bytes
  → **0 / 7,000**.
- Note the asymmetry with §2: the commitment hashes the text, the HMAC keys on
  the decoded bytes. Both were chosen by the data.
- Forward chain: the `nextServerSeedHash` shown before each rotation equals the
  active hash after it: master 133 / 133 links, v2 5 / 5 links, and the
  pre-capture link holds in both files.

---

## 2. Outcome derivation

### Step 1: HMAC

```
key     = hex_decode(serverSeed)                                   # 16 bytes
message = UTF-8( clientSeed + ":" + decimal(nonce) + ":" + decimal(cursor) )   # cursor = 0
digest  = HMAC-SHA256(key, message)                                # 32 bytes
```

Example message: `audit3ef1000d9647:0:0`. `decimal(n)` is plain base 10, no
padding.

- SOURCE: STANDARD (HMAC-SHA256, server seed as key, `clientSeed:nonce:cursor`)
  + DATA for the key form, the message format and cursor = 0.
- Candidates tried (§7 lists every combination; 162 in all):
  key = ASCII hex string or hex-decoded bytes; message = `c:n`, `c:n:0`,
  `c-n`, `cn`, `n:c`, `c:n:0:0`; plain SHA-256(serverSeed + message) for each
  message; each with each of 9 byte→result mappings.
- Result: key = **hex-decoded bytes**, message = **`c:n:0`** →
  **7,000 / 7,000**. Every combination outside that key/message family scored
  ≤ 41 / 7,000 (chance level for a result on a 0.01 lattice).

### Step 2: bytes to a uniform integer r (rejection sampling)

```
RANGE = 100_000_000                              # 10^8
LIMIT = floor(2^32 / RANGE) * RANGE              # = 4_200_000_000
for i in 0, 4, 8, …, 28:                         # walk the 8 four-byte chunks of the SAME digest
    v = digest[i..i+3] as unsigned 32-bit BIG-ENDIAN
    if v < LIMIT:
        r = v mod RANGE                          # r in 0 … 99_999_999, exactly uniform
        break
# all 8 chunks rejected: see O1
```

- SOURCE: STANDARD (rejection sampling) + DATA for RANGE, endianness and the
  continuation.
- The rejection path **is exercised by the data**, unlike a 10^4-lattice dice:
  P(first chunk ≥ LIMIT) = 94,967,296 / 2^32 ≈ 2.2 %. Census over 7,000 rounds:
  accepted at chunk 0: **6,857**; chunk 1: **141**; chunk 2: **2**.
- Candidates for the continuation, both tried:
  - next 4-byte chunk of the same digest → **7,000 / 7,000**;
  - a fresh HMAC with `cursor + 1`, first chunk → **6,857 / 7,000** (all 143
    rejected rounds wrong).
  - plain `v mod RANGE` without rejection → **6,857 / 7,000**.
- So the round `cursor` is **not** the rejection counter. On every captured
  round it is 0 and the HMAC is computed once.

### Step 3: r to the result multiplier

```
raw_cents  = floor( 99 * RANGE / (r + 1) )       # = floor(9_900_000_000 / (r + 1)), integer division
result_cents = max(100, raw_cents)               # floor at 1.00x
result     = result_cents / 100                  # 2 decimals, e.g. 116 → 1.16
```

`raw_cents` lies in 99 … 9,900,000,000. The only value below 100 is 99 (when
`r + 1 > 99,000,000`, i.e. the top 1 % of draws), and it is served as **1.00**.

- SOURCE: STANDARD (limbo result = (1 − e) / u with u uniform on (0, 1],
  here u = (r + 1) / RANGE and 1 − e = 0.99, truncated to 2 decimals) + PAGE
  for e = 1 % (*"Edge: 1.00%"*, *"RTP 99%"*, liqd.com/originals/limbo,
  1 Oct 2026, `evidence/rtp-page-labels-2026-10-01.json`) + DATA.
- Candidates tried (with the winning key/message):

  | Mapping | Match |
  |---|---|
  | u32 BE, rejection, mod 10^8, floor(99·10^8 / (r+1)), min 1.00 | **7,000 / 7,000** |
  | same but floor(99·10^8 / r) (no +1) | 6,980 / 7,000 |
  | u32 BE mod 10^8, no rejection, /(r+1) | 6,857 / 7,000 |
  | u32 LE mod 10^8, /(r+1) | ≤ 41 / 7,000 |
  | 4-byte float f = Σ bᵢ/256^(i+1), floor(0.99/f · 100) | ≤ 41 / 7,000 |
  | f = u32/2^32, floor(99 / (1 − f)) | ≤ 41 / 7,000 |
  | floor(2^32 · 99 / (u32 + 1)) | ≤ 41 / 7,000 |
  | 52-bit float (13 hex), floor(99 / (1 − f)) | ≤ 41 / 7,000 |
  | floor(99·10^8 / (10^8 − r)) | ≤ 41 / 7,000 |

- The 1.00 floor is witnessed: **80** rounds have raw_cents = 99 and are served
  as result `1` (147 rounds in all sit at 1.00). Serving 0.99 matches none of
  them.
- Result cap: none is applied in this formula. The largest reachable result is
  99,000,000.00 (r = 0). The largest captured result is 185,046.72. Whether LIQD
  clips the *displayed* result above some value (e.g. 1,000,000) is not
  witnessed (O3). It cannot change any win/loss at a legal target.

### Step 4: independent checks outside the 7,000 rounds

- `evidence/E13-limbo-boundary-probes.json` (LIQD reply carrying
  `derivationParams` / `outcome`): serverSeed `76bb5f88df9cef0c6ef84898cf7a8718`,
  clientSeed `audit53bafd211bdd`, nonce 0 → this spec gives **7.50**; LIQD
  returned `"result": 7.5`.
- `evidence/E20-…` and `E21-…` probe journals: **4 / 4** bets recompute, each
  paired to a seed revealed in the same journals by hashing.

---

## 3. Win condition and payout

### 3.1 Win condition

```
win  ⇔  result_cents ≥ target_cents           (at or above the target wins; a tie wins)
```

- SOURCE: PAGE: *"At or above your target, you're paid the target. Below it, the
  bet is gone."* (liqd.com/originals/limbo page statement, read 1 Oct 2026,
  `rtp-page-labels-2026-10-01.json`); meta description *"win if the result lands
  at or above it"*. DATA: served `win` equals `result ≥ target` on
  **7,000 / 7,000**. Ties witnessed: **20** captured rounds have result =
  target, all won; E13 probe: result 7.50 at target 7.50 → `"win": true`, at
  7.51 → `"win": false`.
- Compare in integer cents (`round(x * 100)`), not floats.
- Because the minimum target is 1.01, a result of 1.00 always loses.

### 3.2 Win probability (derived, not read)

From Steps 2–3, for a target `T` in cents:

```
result_cents ≥ T  ⇔  r + 1 ≤ 99·10^8 / T  ⇔  r ≤ floor(99·10^8 / T) − 1
P(win | T) = floor(9_900_000_000 / T) / 100_000_000          (exact)
RTP(T)     = P(win | T) × T / 100
```

At the API's stated bounds this gives 98.019801 % (T = 1.01) and 0.009900 %
(T = 10000), exactly the two figures in LIQD's own validation message
(*"win chance 0.009900%–98.019801%"*, E21 journal, 2 Oct 2026). RTP is exactly
0.99 whenever T divides 9.9·10^9 (e.g. 2.00, 10000) and slightly below 0.99
otherwise (T = 1.01: 0.9899999901). PAGE claims *"every target in between
returns 99%"*; the exact per-target RTP is for the audit's LIMBO-19 step, not
this spec.

### 3.3 Payout

```
win : multiplier = target           (exactly the chosen target, not the result)
      payout     = stake × target
loss: multiplier = 0, payout = 0
```

- SOURCE: PAGE (*"you're paid the target"*) + DATA: served `multiplier` equals
  `target` on **2,822 / 2,822** wins; `winningAmount = betAmount × target`
  exactly (decimal arithmetic) on **2,822 / 2,822** wins; losses pay 0 on
  **4,178 / 4,178**. The wallet fields (`stakeWallet`, `winningAmountWallet`)
  equal the game fields on 7,000 / 7,000.
- Rounding of the payout is **not exercised**: stakes were 0.1 and 10, so
  stake × (2-decimal target) never exceeded 3 decimals. Stakes are sent with 8
  decimals; the payout rounding rule at the 8th decimal is O4.

### 3.4 Limits (from LIQD replies, not part of the derivation)

- Target: multiple of 0.01 in [1.01, 10000] (API message, 2 Oct 2026). On
  11 Sep 2026 targets up to 500,000 were accepted (master dataset max), so the
  ceiling changed between the captures (O5).
- Exposure: `MaxExposureExceededError` (3138) at target 1,000,000, stake 0.1,
  with `maxAllowedBetUsdc: 0.05` (`evidence/E15-limbo-max-exposure.json`,
  11 Sep 2026), i.e. stake × target ≤ 50,000 USDC at that probe.

### 3.5 Fields an implementation must not read

`result`, `win`, `multiplier`, `winningAmount`, `winningAmountWallet` are the
operator's claims, to be checked. The capture tool's own fields `localDraw`,
`localResult`, `localWin`, `verified`, `commitVerified`, `chainLinkOk` and the
dataset `meta.limboModel` / `meta.edgeSummary` blocks were written by an
earlier audit tool and must not be used either (see §8 for how they were
handled here). The derivation reads only `serverSeed`, `clientSeed`, `nonce`,
`cursor`, `target` and `stake`.

---

## 4. Source per step (summary)

| Step | Source | Evidence |
|---|---|---|
| Commitment = SHA-256 hex | STANDARD | — |
| Commitment input = ASCII of the 32-char seed | DATA | 7,000/7,000 rounds paired; decoded-bytes form 0/7,000 |
| Forward chain next-hash → active hash | DATA | 133/133 + 5/5 links + pre-capture links |
| HMAC-SHA256, key = hex-decoded seed (16 bytes) | STANDARD + DATA | 7,000/7,000; ASCII-key forms ≤ 41 |
| Message `clientSeed:nonce:cursor`, cursor 0 | STANDARD + DATA | 7,000/7,000; `c:n` and 4 other formats ≤ 41; `round.cursor = 0` on 300/300 replies |
| u32 big-endian, RANGE 10^8, rejection ≥ 4.2·10^9 | STANDARD + DATA | 7,000/7,000; no rejection 6,857 |
| Rejection continues on next chunk of same digest | DATA | 143 rejected rounds (141 at chunk 1, 2 at chunk 2) all match; cursor+1 re-HMAC 6,857 |
| result = max(1.00, floor(99·10^8/(r+1))/100) | STANDARD + PAGE (1 % edge) + DATA | 7,000/7,000; no "+1" 6,980; 80 floor clamps witnessed |
| Win ⇔ result ≥ target, tie wins | PAGE + DATA | 7,000/7,000; 20 ties + E13 probe |
| P(win) = floor(99·10^8/T)/10^8 | derived from the steps above | equals LIQD's stated 98.019801 % and 0.009900 % bounds |
| Paid multiplier = target; payout = stake × target | PAGE + DATA | 2,822/2,822 wins; 4,178/4,178 losses = 0 |
| Target grid 0.01 in [1.01, 10000] | PAGE (API reply, 2 Oct) | E21 journal |

---

## 5. Test vectors (from the dataset)

All from `limbo-master-6700bets.json` (round id = the bet `id`), server seed
from the seed record whose ASCII SHA-256 equals the bet's `hashedServerSeed`.
`chunks` are the big-endian u32 values read until one is < 4,200,000,000.

**V1: bet `bYS2viIeJOfIRm1YpweuJ`** (Phase A, tie: result = target wins)
```
serverSeed  441045a40a9fdbea912bb7c77afb1d2e
commitment  e9fe937d57fa02b85c8a610297ea3caaba8decc6383d5c07e2e303067e822126
message     audite7134d0080bc:32:0          target 1.16   stake 0.1
HMAC        bdd394d356d52f250b73879af0390b90194f4ce0688564303161a6b59ce6aa14
chunks [3184760019] → r 84760019 → floor(99e8/84760020) = 116 → result 1.16
win (1.16 ≥ 1.16)   multiplier 1.16   winningAmount 0.116
```

**V2: bet `krv88h79b6gDGRTDgswi9`** (Phase A, first chunk rejected)
```
serverSeed  b73582d05dec4dd4a43b4e0b72ec3ebd
commitment  7d57ba291003c8aa316f52b6b94d6b0100d5ff1b830ee1c3c6ba677f7c9a3033
message     audited5df347a318:2:0           target 1.59   stake 0.1
HMAC        fd8e759aaade3ebec782575f93f3c3fe4203937508034c42119a7c299ce951f6
chunks [4253971866 rejected, 2866691774] → r 66691774 → 148 → result 1.48
loss   multiplier 0   winningAmount 0
```

**V3: bet `a2Jy4tpNCyU5lJsxpk2-e`** (Phase A, first two chunks rejected)
```
serverSeed  6359fcbf9f3c999f1029dd5b98627fe5
commitment  bea90b6183eb0d7c931144e443ae350547de305a2d2b1f9a266533579759f029
message     audit3909c9a555a5:7:0           target 1.75   stake 0.1
HMAC        fb4a951dfe61fae1df46ba960c0e5d99ddadb6121aef947b657fa32e10fc52d3
chunks [4215969053 rej, 4267834081 rej, 3745954454] → r 45954454 → 215 → result 2.15
win   multiplier 1.75   winningAmount 0.175
```

**V4: bet `yAVLBL0QWD0RVuewVxG_v`** (Phase A, floor clamp: raw 0.99 served as 1.00)
```
serverSeed  56481f25aad5d0b6644fbfff05d4e468
commitment  ecf1e700cd3852d869c2e44a5794e854aff5cdf50af7783a25196528d197e653
message     audit8b0f66ee7a38:29:0          target 3.76   stake 0.1
HMAC        ee6788ec0db6038d87df750790f340639afcfb33d1c6dd0fc7fc2eafec6b47e5
chunks [3999762668] → r 99762668 → floor(99e8/99762669) = 99 → max(100, 99) → result 1.00
loss   multiplier 0   winningAmount 0
```

**V5: bet `pFaN6MRWzGVvE8DpQBMY8`** (Phase C, 10 USDC stake, win)
```
serverSeed  141a7e0ab87055e753e0f8d289bbec1a
commitment  d56deeab14ebfe68afb44831463fb33185f24a3216b36ce3c5b70cf85d4915f4
message     auditdc525d958d88:2:0           target 2.00   stake 10
HMAC        6dc1f472c6a163b3a3e3a103106c19a7673be3c9654753746dd064b9b51de5dd
chunks [1841427570] → r 41427570 → 238 → result 2.38
win   multiplier 2   winningAmount 20
```

Extra vectors: Phase D player seed, bet `tixnceeVcH9shNEbR8lP6`
(serverSeed `8e2ff959b1b7ca9be1ba7408d03c9a19`, message
`pfaudit-1789132605572-124:0:0`, r 16150253 → 6.12, win at 1.72); v2 capture,
bet `UVun5z0xmgdvZnooRZOEj` (serverSeed `c37d4bc3c3a94a0c869f83a0085dd920`,
message `audit3ef1000d9647:0:0`, r 85002001 → 1.16, loss at 122.78); E13
probe (above) → 7.50.

---

## 6. Open points the public sources do not settle

- **O1: all 8 chunks rejected.** Probability (94,967,296 / 2^32)^8 ≈ 6·10⁻¹⁴ per round.
  Not witnessed. The `cursor` field suggests a fresh HMAC at `cursor + 1`, but
  the data show cursor + 1 is *not* used for an ordinary rejection, so what
  LIQD does here is unknown. An implementation should report it, not guess.
- **O2: `cursor` ≠ 0.** Every captured round has cursor 0 (300 recorded; the
  master file does not store it, and all 6,700 match with 0). Limbo draws one
  number per round, so a non-zero cursor is not expected, but it is not
  documented.
- **O3: result display cap.** The formula reaches 99,000,000.00. No captured
  result exceeds 185,046.72, so any display clip is unwitnessed. It cannot
  change a win/loss while the target ceiling is 10,000.
- **O4: payout rounding.** All captured payouts are exact (≤ 3 decimals). The
  rounding rule for a stake whose product with the target exceeds 8 decimals is
  not witnessed.
- **O5: target ceiling over time.** 500,000 was accepted on 11 Sep 2026; the
  API refused > 10,000 on 2 Oct 2026. The game page (1 Oct) still quotes
  *"10,000x lands 0.0099% of the time"*; E15 shows 1,000,000 refused on
  exposure on 11 Sep.
- **O6: client-seed encoding beyond ASCII.** UTF-8 is assumed; every captured
  client seed is ASCII.
- **O7: no written algorithm.** No LIQD page describing the derivation was
  readable: plain GETs of liqd.com/originals/limbo, liqd.com/provably-fair,
  liqd.com/fairness and qa.liqd.com/originals/limbo returned 403 on
  20 Oct 2026, and LIQD's Provably Fair / verify panel was deliberately not
  opened (it can show code). Everything in §2 beyond the 1 % edge rests on
  STANDARD + DATA.
- **O8: commitment vs key encoding.** The commitment hashes the ASCII seed while
  the HMAC keys on its decoded bytes. Both are data-determined and consistent
  on every round; a player verifier must use both forms exactly as stated.

---

## 7. Reproduction of this spec

Implemented in throwaway scripts outside every repo
(`scratchpad/liqd-limbo-spec/search.py`, `spec_check.py`, `extras.py`) and
run on every round. Candidate search (`search.py`, top rows):

```
rounds 7000 revealed seeds (distinct) 142
commitment sha256(ascii hex string): rounds paired 7000/7000; seeds whose hash appears on a round: 140/140
commitment sha256(hex-decoded bytes): rounds paired 0/7000; seeds whose hash appears on a round: 0/140
combinations tried: 162
   7000/7000  key=hex-decoded | c:n:cursor | u32BE rej mod1e8, floor(99e8/(r+1)) cents, min 1.00
   6980/7000  key=hex-decoded | c:n:cursor | u32BE rej mod1e8, floor(99e8/r)
   6857/7000  key=hex-decoded | c:n:cursor | u32BE mod1e8 no-rej, floor(99e8/(r+1))
     41/7000  key=ascii hex | c-n | u32LE mod1e8, floor(99e8/(r+1))
```

Spec check (`spec_check.py`):

```
commitment SHA256(ascii(serverSeed)) pairs rounds: 7000 / 7000
result = max(1.00, floor(99e8/(r+1))/100), r = first u32BE chunk < 4200000000 of HMAC(hexdecode(serverSeed), "c:n:0") mod 1e8 (chunk walk): 7000/7000 mismatches=[]
   limbo-master-6700bets.json: 6700/6700
   liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json: 300/300
same with rejection continuing on a fresh HMAC at cursor+1 (cursor walk): 6857/7000
accepted chunk index census (0 = first chunk): {0: 6857, 1: 141, 2: 2}
rounds where chunk-walk and cursor-walk give different draws: 143
rounds on the 1.00 floor by clamp (raw < 1.00): 80
win flag == (result >= target): 7000/7000; ties (result == target): 20
wins=2822: served multiplier == target exactly: 2822/2822; winningAmount == betAmount x target exactly: 2822/2822
losses paying 0: 4178/4178
```

Extras (`extras.py`):

```
E13 probe: spec result 7.5 chunk 0 | served 7.5 | at target 7.5 win True | at 7.51 win False
evidence/E20+E21 journal bets recomputed: 4/4 (unpaired, seed never revealed: 0)
limbo-master-6700bets.json: chain links 133/133; preCapture next==epoch0 True; preCapture commit True; seed commits 134/134
liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json: chain links 5/5; preCapture next==epoch0 True; preCapture commit True; seed commits 6/6
target 1.01: P(win) = floor(99e8/101)/1e8 = 98019801/100000000 = 98.019801%  RTP = 0.9899999901
target 10000.0: P(win) = floor(99e8/1000000)/1e8 = 99/1000000 = 0.009900%  RTP = 0.9900000000
```

---

## 8. Files read while writing this spec

Read: `repositories/liqd/limbo/evidence/E13-limbo-boundary-probes.json`,
`E15-limbo-max-exposure.json`, `rtp-page-labels-2026-10-01.json`, the four
journals under `E20-target-ceiling-probe-2026-09-26/` and
`E21-target-cap-probe/`; `repositories/liqd/limbo/data/limbo-master-6700bets.json`,
`liqd-limbo-capture-v2-2026-09-26T17-48-02-207Z.json` and its
`.journal.ndjson`; the framework spec folder's `games/limbo/profile.json`;
`games/dice/ALGORITHM.md` (shape only). URLs
(GET, no login, all 403): liqd.com/originals/limbo, liqd.com/provably-fair,
liqd.com/fairness, qa.liqd.com/originals/limbo.

Not opened: any `src/`, `tests/`, `scripts/`, `capture/`, `outputs/`,
`verifier-parity/`, `verify.js`, `test.js`, `MANIFEST.md`, `README.md`,
`AUDIT_CONTEXT.md`, `workshop-notes/` of any LIQD package; any `*verify-tab*`
file; any saved LIQD bundle; the auditor's other LIQD working folders; the browser tool's snapshot folder; LIQD's
Provably Fair / verify panel.

**Contamination disclosure.** Three allowed files carry summaries written by
the earlier, code-informed audit tooling, and they were seen before the
candidate search: the dataset's `meta.limboModel`
(`"range": 100000000, "cursor": 0, "resultNumerator": 9900000000`), the
per-bet `localDraw` / `localResult` fields, and `profile.json` reference
strings (*"maxFair (1e8 range)"*, *"win == R ≥ target"*,
*"floor(N/ci)/RANGE"*). None of them states the key form, the commitment
encoding, the message format, the endianness or the rejection continuation.
No script read `localDraw`/`localResult`/`limboModel`; every step above was
chosen by the match counts against the operator's own served fields, with the
standard alternatives tested and failing.
