/**
 * DRAW-BIAS BOUND (profile LIMBO-08 / rules.drawBias R1) — the audit's own measurement, not part of the RNG.
 *
 * Moved here from src/rng.ts on 20 Oct 2026, when src/rng.ts was replaced by the clean-room
 * module rebuilt from docs/ALGORITHM.md. This file is the auditor's code, not LIQD's and not the clean-room
 * implementer's: it measures the module, it does not implement it. The bound is the arithmetic of the
 * acceptance rule docs/ALGORITHM.md §2 Step 2 states (LIMIT = floor(2^32 / range) · range), and
 * `acceptanceProbe` ties that arithmetic to the code the game runs: it calls src/rng.ts
 * generateProvablyFairNumber on a fixed set of rounds and requires every draw to equal
 * "first 32-bit big-endian chunk below maxFair, mod range" read off the same HMAC, so a change to the
 * module's acceptance rule is a change Step 5 sees.
 */

import { createHash, createHmac } from 'node:crypto';
import { generateProvablyFairNumber, getProvablyFairHmacSalt } from './rng';

/**
 * The rejection-sampling bias bound for a range. The draw accepts a 32-bit chunk only below
 * maxFair = floor(2^32 / range) * range, a whole number of ranges, so every value in [0, range) is hit by
 * exactly maxFair / range accepted chunks: the per-value bias is 0, not merely <= 2^-32.
 * `rejectedPerChunk` is the share of chunk values in the discarded tail.
 */
export function drawBiasBound(range: number): {
  maxFair: number; wholeRanges: boolean; acceptedPerValue: number; rejectedChunkValues: number;
  rejectedPerChunk: number; biasPerValue: number;
} {
  const maxFair = Math.floor(0x1_0000_0000 / range) * range;
  const wholeRanges = maxFair % range === 0 && maxFair <= 0x1_0000_0000;
  const rejectedChunkValues = 0x1_0000_0000 - maxFair;
  // accepted chunk values per draw value is the same integer for every value iff wholeRanges
  const acceptedPerValue = maxFair / range;
  return {
    maxFair, wholeRanges, acceptedPerValue, rejectedChunkValues,
    rejectedPerChunk: rejectedChunkValues / 0x1_0000_0000,
    biasPerValue: wholeRanges ? 0 : 1 / range,
  };
}

/** The fixed probe set: round i uses serverSeed = sha256(PROBE_SEED|i)[0..32), clientSeed 'bias-probe', nonce i % 50. */
const PROBE_SEED = 'pf.org/liqd-limbo/bias-probe/2026-10-20';

/**
 * Measures the module's acceptance rule against the bound: for `rounds` fixed rounds at cursor 0, the
 * module's draw must equal the first chunk below drawBiasBound(range).maxFair, mod range. Returns the
 * counts; `disagree` must be 0, and `firstChunkRejected` must be > 0 for the probe to have exercised the
 * rejected tail at all.
 */
export function acceptanceProbe(range: number, rounds = 4_000): {
  rounds: number; firstChunkRejected: number; disagree: number;
} {
  const { maxFair } = drawBiasBound(range);
  let firstChunkRejected = 0;
  let disagree = 0;
  for (let i = 0; i < rounds; i++) {
    const serverSeed = createHash('sha256').update(`${PROBE_SEED}|${i}`).digest('hex').slice(0, 32);
    const clientSeed = 'bias-probe';
    const nonce = i % 50;
    const digest = createHmac('sha256', Buffer.from(serverSeed, 'hex'))
      .update(getProvablyFairHmacSalt(clientSeed, nonce, 0), 'utf8').digest();
    let expected: number | null = null;
    for (let off = 0; off + 4 <= digest.length; off += 4) {
      const v = digest.readUInt32BE(off);
      if (v < maxFair) { expected = v % range; break; }
      if (off === 0) firstChunkRejected++;
    }
    let got: number | null;
    try { got = generateProvablyFairNumber(serverSeed, clientSeed, nonce, 0, range); } catch { got = null; }
    if (got !== expected) disagree++;
  }
  return { rounds, firstChunkRejected, disagree };
}
