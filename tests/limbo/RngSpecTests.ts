/**
 * Spec self-test — docs/ALGORITHM.md vectors (§5, §2 Step 4) and properties, run against src/rng.ts.
 *
 * Written by the clean-room implementer together with src/rng.ts, from docs/ALGORITHM.md and the module
 * interface alone (never from LIQD's code). Integrated 20 Oct 2026: the checks are unchanged; only the
 * import path, the mocha wrapper and the reporting (failures collected instead of printed) were adapted.
 */
import * as assert from "assert";

import { createHmac, createHash } from "crypto";
import {
  commitHash,
  sha256Buffer,
  getProvablyFairHmacSalt,
  generateProvablyFairNumber,
  limboDraw,
  limboResult,
  rejectedLeadingChunks,
} from "../../src/rng";

const EXPECTED_CHECKS = 72;

function runSelftest(): { passed: number; total: number; failed: string[] } {
  let pass = 0;
  let total = 0;
  const failed: string[] = [];
  function check(name: string, ok: boolean, detail = ""): void {
    total++;
    if (ok) pass++;
    if (!ok) failed.push(`${name}${detail ? "  " + detail : ""}`);
  }
  function throws(fn: () => unknown): boolean {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  }

  const RANGE = 100_000_000;
  const LIMIT = 4_200_000_000;

  // Independent HMAC for checking the spec's printed digest (the module does not export it).
  function hmacHex(seed: string, msg: string): string {
    return createHmac("sha256", Buffer.from(seed, "hex")).update(msg, "utf8").digest("hex");
  }
  function chunksUntilAccepted(hex: string): number[] {
    const b = Buffer.from(hex, "hex");
    const out: number[] = [];
    for (let i = 0; i < 32; i += 4) {
      const v = b.readUInt32BE(i);
      out.push(v);
      if (v < LIMIT) break;
    }
    return out;
  }

  interface Vector {
    id: string;
    seed: string;
    commitment?: string;
    clientSeed: string;
    nonce: number;
    message: string;
    hmac?: string;
    chunks?: number[];
    r?: number;
    result: number;
    rejected?: number;
  }

  // §5 V1..V5 (full vectors), then §5 extras and §2 Step 4 E13 probe.
  const vectors: Vector[] = [
    {
      id: "V1 bYS2viIeJOfIRm1YpweuJ",
      seed: "441045a40a9fdbea912bb7c77afb1d2e",
      commitment: "e9fe937d57fa02b85c8a610297ea3caaba8decc6383d5c07e2e303067e822126",
      clientSeed: "audite7134d0080bc", nonce: 32, message: "audite7134d0080bc:32:0",
      hmac: "bdd394d356d52f250b73879af0390b90194f4ce0688564303161a6b59ce6aa14",
      chunks: [3184760019], r: 84760019, result: 1.16, rejected: 0,
    },
    {
      id: "V2 krv88h79b6gDGRTDgswi9",
      seed: "b73582d05dec4dd4a43b4e0b72ec3ebd",
      commitment: "7d57ba291003c8aa316f52b6b94d6b0100d5ff1b830ee1c3c6ba677f7c9a3033",
      clientSeed: "audited5df347a318", nonce: 2, message: "audited5df347a318:2:0",
      hmac: "fd8e759aaade3ebec782575f93f3c3fe4203937508034c42119a7c299ce951f6",
      chunks: [4253971866, 2866691774], r: 66691774, result: 1.48, rejected: 1,
    },
    {
      id: "V3 a2Jy4tpNCyU5lJsxpk2-e",
      seed: "6359fcbf9f3c999f1029dd5b98627fe5",
      commitment: "bea90b6183eb0d7c931144e443ae350547de305a2d2b1f9a266533579759f029",
      clientSeed: "audit3909c9a555a5", nonce: 7, message: "audit3909c9a555a5:7:0",
      hmac: "fb4a951dfe61fae1df46ba960c0e5d99ddadb6121aef947b657fa32e10fc52d3",
      chunks: [4215969053, 4267834081, 3745954454], r: 45954454, result: 2.15, rejected: 2,
    },
    {
      id: "V4 yAVLBL0QWD0RVuewVxG_v",
      seed: "56481f25aad5d0b6644fbfff05d4e468",
      commitment: "ecf1e700cd3852d869c2e44a5794e854aff5cdf50af7783a25196528d197e653",
      clientSeed: "audit8b0f66ee7a38", nonce: 29, message: "audit8b0f66ee7a38:29:0",
      hmac: "ee6788ec0db6038d87df750790f340639afcfb33d1c6dd0fc7fc2eafec6b47e5",
      chunks: [3999762668], r: 99762668, result: 1.0, rejected: 0,
    },
    {
      id: "V5 pFaN6MRWzGVvE8DpQBMY8",
      seed: "141a7e0ab87055e753e0f8d289bbec1a",
      commitment: "d56deeab14ebfe68afb44831463fb33185f24a3216b36ce3c5b70cf85d4915f4",
      clientSeed: "auditdc525d958d88", nonce: 2, message: "auditdc525d958d88:2:0",
      hmac: "6dc1f472c6a163b3a3e3a103106c19a7673be3c9654753746dd064b9b51de5dd",
      chunks: [1841427570], r: 41427570, result: 2.38, rejected: 0,
    },
    {
      id: "X1 tixnceeVcH9shNEbR8lP6",
      seed: "8e2ff959b1b7ca9be1ba7408d03c9a19",
      clientSeed: "pfaudit-1789132605572-124", nonce: 0, message: "pfaudit-1789132605572-124:0:0",
      r: 16150253, result: 6.12,
    },
    {
      id: "X2 UVun5z0xmgdvZnooRZOEj",
      seed: "c37d4bc3c3a94a0c869f83a0085dd920",
      clientSeed: "audit3ef1000d9647", nonce: 0, message: "audit3ef1000d9647:0:0",
      r: 85002001, result: 1.16,
    },
    {
      id: "E13 probe",
      seed: "76bb5f88df9cef0c6ef84898cf7a8718",
      clientSeed: "audit53bafd211bdd", nonce: 0, message: "audit53bafd211bdd:0:0",
      result: 7.5, rejected: 0,
    },
  ];

  for (const v of vectors) {
    if (v.commitment !== undefined) {
      check(`${v.id} commitHash`, commitHash(v.seed) === v.commitment);
    }
    const msg = getProvablyFairHmacSalt(v.clientSeed, v.nonce, 0);
    check(`${v.id} message`, msg === v.message, msg);
    if (v.hmac !== undefined) {
      const h = hmacHex(v.seed, msg);
      check(`${v.id} HMAC`, h === v.hmac);
    }
    if (v.chunks !== undefined) {
      const c = chunksUntilAccepted(hmacHex(v.seed, msg));
      check(`${v.id} chunks`, JSON.stringify(c) === JSON.stringify(v.chunks), JSON.stringify(c));
    }
    const r = limboDraw(v.seed, v.clientSeed, v.nonce);
    if (v.r !== undefined) {
      check(`${v.id} limboDraw r`, r === v.r, `r=${r}`);
      check(
        `${v.id} generateProvablyFairNumber(cursor 0, 1e8) == r`,
        generateProvablyFairNumber(v.seed, v.clientSeed, v.nonce, 0, RANGE) === v.r,
      );
    }
    const res = limboResult(v.seed, v.clientSeed, v.nonce);
    check(`${v.id} limboResult`, res === v.result, `result=${res}`);
    if (v.rejected !== undefined) {
      const k = rejectedLeadingChunks(v.seed, v.clientSeed, v.nonce, RANGE);
      check(`${v.id} rejectedLeadingChunks`, k === v.rejected, `k=${k}`);
    }
  }

  // ---- Hash checks (§1.2): true for the right seed, false otherwise ----
  const V1 = vectors[0];
  check("hash check: commitHash(V1 seed) == V1 commitment (true)", commitHash(V1.seed) === V1.commitment);
  check("hash check: commitHash(V2 seed) == V1 commitment (false)", (commitHash(vectors[1].seed) === V1.commitment) === false);
  check(
    "hash check: SHA-256 over hex-decoded bytes != commitment (false, §1.2)",
    (createHash("sha256").update(Buffer.from(V1.seed, "hex")).digest("hex") === V1.commitment) === false,
  );
  check("hash check: commitHash is lowercase 64-hex", /^[0-9a-f]{64}$/.test(commitHash(V1.seed)));
  check(
    "sha256Buffer(\"abc\") known value",
    sha256Buffer(Buffer.from("abc")) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  check("sha256Buffer(ASCII seed) == commitHash(seed)", sha256Buffer(Buffer.from(V1.seed, "ascii")) === commitHash(V1.seed));

  // ---- Properties: ranges and bias/census consistency over many rounds ----
  const seeds = vectors.map((v) => v.seed);
  let rangeOk = true;
  let resultOk = true;
  let censusOk = true;
  const census: Record<number, number> = {};
  const N = 20_000;
  for (let i = 0; i < N; i++) {
    const seed = seeds[i % seeds.length];
    const cs = `selftest-${i % 7}`;
    const nonce = i;
    const r = limboDraw(seed, cs, nonce);
    if (!(Number.isInteger(r) && r >= 0 && r < RANGE)) rangeOk = false;
    const res = limboResult(seed, cs, nonce);
    const cents = Math.round(res * 100);
    const expectedCents = Math.max(100, Math.floor(9_900_000_000 / (r + 1)));
    if (!(res >= 1 && cents === expectedCents && Math.abs(res * 100 - cents) < 1e-6)) resultOk = false;
    // census consistency: the reported rejected count matches an independent chunk walk,
    // and the accepted chunk mod 1e8 is the draw.
    const k = rejectedLeadingChunks(seed, cs, nonce, RANGE);
    const ch = chunksUntilAccepted(hmacHex(seed, getProvablyFairHmacSalt(cs, nonce, 0)));
    if (k !== ch.length - 1 || ch[ch.length - 1] % RANGE !== r || ch.slice(0, -1).some((x) => x < LIMIT)) censusOk = false;
    census[k] = (census[k] ?? 0) + 1;
  }
  check(`property: limboDraw r in [0, 1e8) on ${N} rounds`, rangeOk);
  check(`property: limboResult >= 1.00, 2-decimal, == max(100, floor(99e8/(r+1)))/100 on ${N} rounds`, resultOk);
  check(`property: rejectedLeadingChunks consistent with chunk walk and draw on ${N} rounds`, censusOk, JSON.stringify(census));
  const rej = N - (census[0] ?? 0);
  const pRej = 94_967_296 / 2 ** 32; // §2 Step 2
  const se = Math.sqrt(N * pRej * (1 - pRej));
  check(
    `property: first-chunk rejection rate within 5 SE of ${(pRej * 100).toFixed(3)}%`,
    Math.abs(rej - N * pRej) <= 5 * se,
    `rejected=${rej} expected=${(N * pRej).toFixed(1)}`,
  );

  // Extremes of §2 Step 3 (formula-level, r = 0 and r = 99_999_999).
  check("property: r=0 gives 99,000,000.00 raw cents bound", Math.floor(9_900_000_000 / 1) / 100 === 99_000_000);
  check("property: r=99_999_999 gives raw 99 -> served 1.00", Math.max(100, Math.floor(9_900_000_000 / 100_000_000)) === 100);

  // Generic ranges for generateProvablyFairNumber.
  let genOk = true;
  for (const range of [1, 2, 6, 37, 10_000, 2 ** 32]) {
    for (let n = 0; n < 200; n++) {
      const x = generateProvablyFairNumber(V1.seed, "gen", n, 3, range);
      if (!(Number.isInteger(x) && x >= 0 && x < range)) genOk = false;
    }
  }
  check("property: generateProvablyFairNumber in [0, range) for ranges 1,2,6,37,1e4,2^32", genOk);
  check("property: range 2^32 never rejects", rejectedLeadingChunks(V1.seed, "gen", 0, 2 ** 32) === 0);
  check(
    "property: cursor changes the digest (cursor 1 != cursor 0 draw on V1)",
    generateProvablyFairNumber(V1.seed, V1.clientSeed, V1.nonce, 1, RANGE) !== limboDraw(V1.seed, V1.clientSeed, V1.nonce),
  );

  // O1 path: with range 2^31+1 about half of chunks are rejected, so an all-8-rejected
  // round exists within a few hundred nonces; generateProvablyFairNumber must throw there.
  const BIG = 2 ** 31 + 1;
  let allRejectedNonce = -1;
  for (let n = 0; n < 20_000 && allRejectedNonce < 0; n++) {
    if (rejectedLeadingChunks(V1.seed, "o1", n, BIG) === 8) allRejectedNonce = n;
  }
  check("O1: found a round with all 8 chunks rejected at range 2^31+1", allRejectedNonce >= 0, `nonce=${allRejectedNonce}`);
  check(
    "O1: generateProvablyFairNumber throws when all chunks are rejected",
    allRejectedNonce >= 0 && throws(() => generateProvablyFairNumber(V1.seed, "o1", allRejectedNonce, 0, BIG)),
  );

  // Input validation.
  check("validation: odd-length seed throws", throws(() => limboDraw("abc", "c", 0)));
  check("validation: non-hex seed throws", throws(() => limboDraw("zz".repeat(16), "c", 0)));
  check("validation: negative nonce throws", throws(() => getProvablyFairHmacSalt("c", -1, 0)));
  check("validation: range 0 throws", throws(() => generateProvablyFairNumber(V1.seed, "c", 0, 0, 0)));

  return { passed: pass, total, failed };
}

describe('clean-room RNG spec self-test (docs/ALGORITHM.md)', () => {
  it(`all ${EXPECTED_CHECKS} spec checks pass against src/rng.ts`, () => {
    const r = runSelftest();
    assert.deepStrictEqual(r.failed, [], `failed: ${r.failed.join(' | ')}`);
    assert.strictEqual(r.total, EXPECTED_CHECKS, `ran ${r.total} checks, expected ${EXPECTED_CHECKS}`);
    assert.strictEqual(r.passed, EXPECTED_CHECKS);
  });
});
