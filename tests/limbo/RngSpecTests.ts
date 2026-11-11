/**
 * Spec self-test — docs/ALGORITHM.md vectors (§5) and properties, run against src/rng.ts.
 *
 * Every vector is a settled production round of data/limbo-prod-full-5838bets.json or a production
 * verifier probe of evidence/E02: seed, commitment, client seed, nonce, HMAC, chunks, draw and result as
 * the casino served them. The properties below them are checks of the module against the specification.
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

const EXPECTED_CHECKS = 78;

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

  // docs/ALGORITHM.md §5: V1..V5 (full vectors) and X1..X3 are settled production rounds of the dataset
  // (liqd.com, 7 and 10 November 2026); P1 is a production verifier probe (evidence/E02).
  const vectors: Vector[] = [
    // V1: first round of the capture (epoch 0 nonce 0, Phase A, 7 Nov 2026), first chunk accepted.
    {
      id: "V1 3G5Wm6eniZ8jXrzab4IJd",
      seed: "ea7c5163f5e0ac12ffe0efd8b6cd5dd7",
      commitment: "c391eb4f199b95d18aceafbb8f4794a08eba2ac78a7b85e22c38552061a09a65",
      clientSeed: "audit395ae5c90a74", nonce: 0, message: "audit395ae5c90a74:0:0",
      hmac: "7dd759603abdd8d8feaf4aa93fa2e368a478b86d6cf572bb2cc4abcaac72061f",
      chunks: [2111265120], r: 11265120, result: 8.78, rejected: 0,
    },
    // V2: first chunk rejected, second taken (epoch 0 nonce 2).
    {
      id: "V2 hiPVRKoU-wdPXn0YtH9sl",
      seed: "ea7c5163f5e0ac12ffe0efd8b6cd5dd7",
      commitment: "c391eb4f199b95d18aceafbb8f4794a08eba2ac78a7b85e22c38552061a09a65",
      clientSeed: "audit395ae5c90a74", nonce: 2, message: "audit395ae5c90a74:2:0",
      hmac: "fdae0a776135ddb5531e99bb0b2d6da4a1377943cc9643d9ff563edf95b9f7f6",
      chunks: [4256041591, 1630920117], r: 30920117, result: 3.2, rejected: 1,
    },
    // V3: two chunks rejected, third taken (epoch 5 nonce 47).
    {
      id: "V3 A4NXYN57ZZ1apMd7VXrFM",
      seed: "759753950ecfcdeae8d13a2255fbdcb5",
      commitment: "b089f5ee5f0891da1dbeafe3eff029756bc587afedc9f3623ffcbb85c8988b12",
      clientSeed: "auditf7e4dbc7ca73", nonce: 47, message: "auditf7e4dbc7ca73:47:0",
      hmac: "fb68a109fe6fa66626bf9619d9a13b632d5493198582f9596f941fba3755a24b",
      chunks: [4217938185, 4268729958, 650090009], r: 50090009, result: 1.97, rejected: 2,
    },
    // V4: raw value 0.99, served 1 (the result floor; epoch 1 nonce 86).
    {
      id: "V4 4thzOegbI0ipF1HbnCn0O",
      seed: "19d9d3f0f202d9b5f85f00b56b26e9af",
      commitment: "fc8fa5325f5b06ba6597af5ad6077173dc9c630f370fc133f88dd81296129819",
      clientSeed: "audit4ae5ddbd2dba", nonce: 86, message: "audit4ae5ddbd2dba:86:0",
      hmac: "3b9a46641c91d22c920e75295250a05def9cb56bfb8aab4b6e44121da1d2db31",
      chunks: [999966308], r: 99966308, result: 1, rejected: 0,
    },
    // V5: result exactly on the target 11.57, settled as a win (epoch 21 nonce 76).
    {
      id: "V5 G0bAcxPQ57qsF4ZWi3YJE",
      seed: "aefb854f2db350ef9db660cd9f565042",
      commitment: "d9aa33335f877dde262e86bfb2314581452ecc6cc10b66d40f8c1134f4021d1d",
      clientSeed: "audit3b77da5eea13", nonce: 76, message: "audit3b77da5eea13:76:0",
      hmac: "a76729b29c92b13eede3ee42cd6e288a3a2551915e8d98d0334da322eaf68ae6",
      chunks: [2808555954], r: 8555954, result: 11.57, rejected: 0,
    },
    // X1: Phase D, a player-set client seed (epoch 25 nonce 0, 10 Nov 2026).
    {
      id: "X1 rTMFeZcZ1T7_oH6WHzDu0",
      seed: "b69bc456d161bf8126f6075674f06e03",
      clientSeed: "pfaudit-prod-limbo-d1-6fa0b0094142", nonce: 0, message: "pfaudit-prod-limbo-d1-6fa0b0094142:0:0",
      r: 69732708, result: 1.41,
    },
    // X2: Phase C, 10.00 USDT on 2.00x, a win (epoch 31 nonce 2, 10 Nov 2026).
    {
      id: "X2 WIthFiUFeWouUsnxxnhOw",
      seed: "a072c3f5bb121bb493eb99e1459c8db1",
      clientSeed: "auditc42639ada586", nonce: 2, message: "auditc42639ada586:2:0",
      r: 8193866, result: 12.08,
    },
    // X3: the highest result in the capture, 28181.04x (epoch 6 nonce 162).
    {
      id: "X3 Xu87aEnkSOXs1tEZpq_hv",
      seed: "7bfeb75c44f3a438f86cc3232b72211c",
      clientSeed: "auditc72e948ee77c", nonce: 162, message: "auditc72e948ee77c:162:0",
      r: 3512, result: 28181.04,
    },
    // P1: production verifier probe L-5 of 9 Nov 2026 (evidence/E02), an unsettled nonce just under the result cap.
    {
      id: "P1 verifier probe L-5",
      seed: "759753950ecfcdeae8d13a2255fbdcb5",
      clientSeed: "auditf7e4dbc7ca73", nonce: 1150803, message: "auditf7e4dbc7ca73:1150803:0",
      r: 100, result: 980198.01, rejected: 0,
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
  check("hash check: commitHash(V3 seed) == V1 commitment (false)", (commitHash(vectors[2].seed) === V1.commitment) === false);
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

describe('RNG spec self-test (docs/ALGORITHM.md)', () => {
  it(`all ${EXPECTED_CHECKS} spec checks pass against src/rng.ts`, () => {
    const r = runSelftest();
    assert.deepStrictEqual(r.failed, [], `failed: ${r.failed.join(' | ')}`);
    assert.strictEqual(r.total, EXPECTED_CHECKS, `ran ${r.total} checks, expected ${EXPECTED_CHECKS}`);
    assert.strictEqual(r.passed, EXPECTED_CHECKS);
  });
});
