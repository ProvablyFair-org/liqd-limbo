/**
 * PROVENANCE (header added on integration, 20 Oct 2026; everything below this comment is the
 * clean-room module byte for byte).
 *
 * This module was REBUILT FROM A WRITTEN SPECIFICATION, not ported from LIQD's code:
 *   spec      docs/ALGORITHM.md, a copy of games/liqd-limbo/ALGORITHM.md in the ProvablyFair.org audit
 *             framework (SHA-256 2b6698b4…68c9db15 as copied). Written from LIQD's public pages and API
 *             replies, the standard provably-fair construction and the 7,000 captured rounds, without
 *             opening LIQD's code (its §8 lists every file read).
 *   rebuild   written by an implementer who read ONLY that spec and a module-interface file, and never
 *             opened LIQD's code, its client bundle, or this package's earlier src/rng.ts.
 *   self-test tests/limbo/RngSpecTests.ts (the spec's vectors and properties).
 *
 * LIQD's own verification output is NOT the source of this module. It is used as a SECOND CHECK: the
 * four values read from LIQD's Verify calculator (E12, tests/limbo/rngTests.ts) and LIQD's /verify
 * endpoint replies (E13, Step 19). No LIQD code file is shipped or executed by this package (src/config.ts
 * still carries constants and the result map read from LIQD's client bundle; see its header). The audit's
 * draw-bias bound is src/bias.ts, built on this module's generateProvablyFairNumber.
 *
 * Three-way agreement measured on integration (20 Oct 2026, every captured round: 6,700 master +
 * 300 supplement + 4 probe rounds in E20/E21): this module vs the live rounds, commitment and result
 * 7,004/7,004; vs LIQD's Verify-calculator values 4/4 and /verify replies 2/2. No ProvablyFair.org
 * site verifier exists for limbo, so there is no third leg.
 *
 * Where this module and the package's earlier, ported code differ on inputs no captured round reaches:
 *   (1) when all eight chunks of a digest are rejected (spec O1, unspecified; about 6e-14 per round)
 *       this module throws; the earlier code redrew at cursor + 1,000,000;
 *   (2) this module's limboResult applies no upper cap (spec O3); src/config.ts resultMultiplier, which
 *       the scored steps use for the result map, caps at 1,000,000x (LIQD's client constant
 *       LIMBO_MAX_RESULT_MULTIPLIER). They differ only for a draw r <= 97 (98 of 10^8 draws), which no
 *       captured round reaches (smallest captured draw 534, result 185,046.72x) and which wins at every
 *       legal target either way.
 */
// Clean-room LIQD Limbo RNG module.
// Built only from ALGORITHM.md (behaviour) and INTERFACE.md (names and types).
// Node `crypto` is the only dependency.

import { createHash, createHmac } from "crypto";

// ALGORITHM.md §2 Step 2: the limbo range is 10^8.
const LIMBO_RANGE = 100_000_000;
// §2 Step 3: the numerator 99 * RANGE, i.e. (1 - 1 % edge) expressed in cents.
const LIMBO_NUMERATOR = 99 * LIMBO_RANGE; // 9_900_000_000, exact in a double
// §2 Step 3: the result is never served below 1.00x (100 cents).
const RESULT_FLOOR_CENTS = 100;
// §2 Step 2: a SHA-256 digest is 32 bytes, read as 8 four-byte chunks.
const CHUNK_BYTES = 4;
const DIGEST_BYTES = 32;
const TWO_POW_32 = 0x1_0000_0000;

// §1.1: a server seed is written as lowercase hex characters (32 of them in every capture).
const HEX_RE = /^[0-9a-f]+$/;

function assertHexSeed(serverSeed: string): void {
  // §2 Step 1 hex-decodes the seed for the HMAC key, so it must be an even-length hex string.
  // Node's Buffer.from(..., "hex") silently truncates bad input; refuse it instead.
  if (serverSeed.length === 0 || serverSeed.length % 2 !== 0 || !HEX_RE.test(serverSeed)) {
    throw new Error(`serverSeed must be an even-length lowercase hex string, got ${JSON.stringify(serverSeed)}`);
  }
}

function assertNonNegInt(name: string, n: number): void {
  // §1.1: nonce and cursor are non-negative integers, printed in plain base 10 (§2 Step 1).
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`${name} must be a non-negative safe integer, got ${n}`);
  }
}

function assertRange(range: number): void {
  // §2 Step 2 computes LIMIT = floor(2^32 / range) * range; that needs 1 <= range <= 2^32.
  if (!Number.isSafeInteger(range) || range < 1 || range > TWO_POW_32) {
    throw new Error(`range must be an integer in [1, 2^32], got ${range}`);
  }
}

/**
 * §1.2: the published commitment is SHA-256 over the ASCII text of the seed
 * (the hex characters as written, not the bytes they encode), as lowercase hex.
 */
export function commitHash(serverSeedHexString: string): string {
  return createHash("sha256").update(Buffer.from(serverSeedHexString, "ascii")).digest("hex");
}

/** SHA-256 of a byte buffer, lowercase hex (file fingerprinting; INTERFACE.md). */
export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * §2 Step 1: the HMAC message is clientSeed, nonce and cursor joined by ":",
 * with the two numbers in unpadded base 10. Example: "audit3ef1000d9647:0:0".
 */
export function getProvablyFairHmacSalt(clientSeed: string, nonce: number, cursor: number): string {
  assertNonNegInt("nonce", nonce);
  assertNonNegInt("cursor", cursor);
  return `${clientSeed}:${nonce.toString(10)}:${cursor.toString(10)}`;
}

/**
 * §2 Step 1: HMAC-SHA256 keyed by the hex-DECODED server seed (16 bytes for a
 * 32-char seed), over the UTF-8 bytes of the message. Note the deliberate
 * asymmetry with commitHash (§1.2 / O8).
 */
function roundDigest(serverSeed: string, clientSeed: string, nonce: number, cursor: number): Buffer {
  assertHexSeed(serverSeed);
  const key = Buffer.from(serverSeed, "hex");
  const message = Buffer.from(getProvablyFairHmacSalt(clientSeed, nonce, cursor), "utf8");
  return createHmac("sha256", key).update(message).digest();
}

/**
 * §2 Step 2: walk the 8 big-endian u32 chunks of ONE digest in order and take
 * the first one below LIMIT = floor(2^32 / range) * range. Returns the index of
 * the accepted chunk and r = value mod range, or null when all 8 are rejected
 * (O1: behaviour unknown, so it is reported to the caller, not guessed).
 */
function walkChunks(digest: Buffer, range: number): { index: number; r: number } | null {
  const limit = Math.floor(TWO_POW_32 / range) * range;
  for (let i = 0; i + CHUNK_BYTES <= DIGEST_BYTES; i += CHUNK_BYTES) {
    const v = digest.readUInt32BE(i);
    if (v < limit) {
      return { index: i / CHUNK_BYTES, r: v % range };
    }
  }
  return null;
}

/**
 * §2 Steps 1-2: the accepted draw r in [0, range). A rejected chunk moves to the
 * next chunk of the same digest; the cursor is NOT advanced (§2 Step 2). If all
 * 8 chunks are rejected this throws (O1).
 */
export function generateProvablyFairNumber(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor: number,
  range: number,
): number {
  assertRange(range);
  const hit = walkChunks(roundDigest(serverSeed, clientSeed, nonce, cursor), range);
  if (hit === null) {
    throw new Error(
      "all 8 chunks of the digest were rejected (ALGORITHM.md O1: the operator's behaviour here is not specified)",
    );
  }
  return hit.r;
}

/** §1.1 + §2 Step 2: the limbo draw uses range 10^8 and cursor 0. */
export function limboDraw(serverSeed: string, clientSeed: string, nonce: number): number {
  return generateProvablyFairNumber(serverSeed, clientSeed, nonce, 0, LIMBO_RANGE);
}

/**
 * §2 Step 3: raw_cents = floor(99 * 10^8 / (r + 1)) by integer division,
 * clamped up to 100 cents, then expressed as a 2-decimal multiplier.
 * No upper cap is applied (O3).
 */
export function limboResult(serverSeed: string, clientSeed: string, nonce: number): number {
  const r = limboDraw(serverSeed, clientSeed, nonce);
  // Both operands are integers far below 2^53, so Math.floor of the double quotient
  // equals true integer division here; BigInt is used anyway to make that explicit.
  const rawCents = Number(BigInt(LIMBO_NUMERATOR) / BigInt(r + 1));
  const resultCents = Math.max(RESULT_FLOOR_CENTS, rawCents);
  return resultCents / 100;
}

/**
 * §2 Step 2 census: the number of leading chunks rejected before the accepted
 * one, for the given range, at cursor 0 (the only cursor the spec witnesses).
 * Returns 8 when every chunk is rejected (O1) rather than throwing, since the
 * count is still well defined in that case.
 */
export function rejectedLeadingChunks(serverSeed: string, clientSeed: string, nonce: number, range: number): number {
  assertRange(range);
  const hit = walkChunks(roundDigest(serverSeed, clientSeed, nonce, 0), range);
  return hit === null ? DIGEST_BYTES / CHUNK_BYTES : hit.index;
}
