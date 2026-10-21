// LIQD Limbo — provably-fair RNG, canonical implementation (capture-side reference).
// Shares the LIQD fast-games core (HMAC-SHA256, `clientSeed:nonce:cursor`, bias-free
// uint draw, SHA-256(utf8(serverSeedHexString)) commitment) proven for dice/plinko/mines.
//
// Limbo-specific: one bias-free draw k in [0, 1e8) at cursor 0; the RESULT (crash) multiplier
// is R = min(1e6, floor(9.9e9 / (k+1)) / 100). Both the win-chance and the result share the
// numerator 9.9e9 = (1 - 0.01)*100*1e8, so P(R >= target) equals the served win chance exactly.
//
// Reverse-engineered from the operator's own client bundle (constants module `ci`/`cr` and
// the LIMBO_* exports) and confirmed against LIQD's Provably-Fair "Verify" calculator over
// four live vectors on 2026-09-07 (serverSeed 000…0001, clientSeed "abc"):
//   nonce 0 → 1.71x, 1 → 2.65x, 2 → 1.04x, 3 → 20.14x.

import { createHmac, createHash } from 'node:crypto';

// HMAC message = `clientSeed:nonce:cursor`
export const salt = (clientSeed, nonce, cursor) => `${clientSeed}:${nonce}:${cursor}`;

// Bias-free uniform integer in [0, range). Server seed hex-decoded to raw bytes = HMAC key.
export function generateProvablyFairNumber(serverSeed, clientSeed, nonce, cursor, range) {
  const key = Buffer.from(serverSeed, 'hex');
  const digest = createHmac('sha256', key).update(salt(clientSeed, nonce, cursor)).digest();
  const maxFair = Math.floor(0x1_0000_0000 / range) * range; // modulo-bias guard
  for (let offset = 0; offset + 4 <= digest.length; offset += 4) {
    const chunk = digest.readUInt32BE(offset);
    if (chunk < maxFair) return chunk % range;
  }
  return generateProvablyFairNumber(serverSeed, clientSeed, nonce, cursor + 1_000_000, range);
}

export const LIMBO_RANGE = 100_000_000;           // draw 0 .. 99_999_999
export const RESULT_NUMERATOR = 9_900_000_000;    // (1 - 0.01) * 100 * 1e8
export const MAX_MULTIPLIER = 1_000_000;
// The RESULT floor, which is NOT the same number as the minimum legal TARGET (1.01). A target
// below 1.01 cannot be bet; a RESULT of exactly 1 is served routinely — witnessed 2026-09-11 in an
// earlier capture run that is not shipped (serverSeed 5d8a6efd…, nonce 49, k = 99,588,964, served R = 1).
// Conflating the two would rewrite every floored
// round as 1.01 and break the recompute in the opposite direction.
export const MIN_RESULT = 1;

// The single bias-free draw that seeds the round.
export function limboDraw(serverSeed, clientSeed, nonce) {
  return generateProvablyFairNumber(serverSeed, clientSeed, nonce, 0, LIMBO_RANGE);
}

// RESULT (crash) multiplier.
// R = clamp(floor(9.9e9 / (k+1)) / 100) into [MIN_RESULT, MAX_MULTIPLIER].
//
// The LOWER clamp was missing until 2026-09-11 and was caught by the capture's own inline
// per-epoch check in an earlier capture run that is not shipped: nonce 49, k = 99,588,964, the operator served R = 1
// while this function returned 0.99. A limbo multiplier cannot be below 1.00 — a round pays
// stake x target or nothing, and a multiplier under 1 has no meaning.
//
// It is NOT a rare edge. The raw value drops below 1 whenever k > 98,999,999, which is 1,000,000
// of the 100,000,000 possible draws — about 1% of every capture, ~67 rounds in 6,700. Shipping
// without it would have mismatched roughly one round in a hundred across the whole dataset.
//
// The clamp does not disturb the win chance for any legal target: MIN_TARGET is 1.01, and
// R = 1 loses against every target >= 1.01, exactly as the un-clamped 0.99 would have. It changes
// the RESULT that is reported and recomputed, not who won.
export function limboResult(serverSeed, clientSeed, nonce) {
  const k = limboDraw(serverSeed, clientSeed, nonce);
  return Math.min(MAX_MULTIPLIER, Math.max(MIN_RESULT, Math.floor(RESULT_NUMERATOR / (k + 1)) / 100));
}

// Win rule: the chosen target is reached iff result >= target.
export function limboWin(result, target) {
  return result >= target;
}

// Served win chance for a target (operator `cr`): floor(9.9e9 / round(100*target)) / 1e8.
export function limboWinChancePct(target) {
  return Math.floor(RESULT_NUMERATOR / Math.round(target * 100)) / LIMBO_RANGE * 100;
}

// Hash commitment: activeServerSeedHash = SHA-256( utf8_bytes( serverSeed_hex_string ) ).
export function commitHash(serverSeedHexString) {
  return createHash('sha256').update(serverSeedHexString, 'utf8').digest('hex');
}
