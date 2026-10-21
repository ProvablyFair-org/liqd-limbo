# Module interface the audit package expects (written by the auditor, not from the casino)

Write `rng.ts` (TypeScript, strict, Node `crypto` only, no dependencies) exporting exactly these names.
Semantics come from ALGORITHM.md; this file only fixes names, types and the package's own conventions.

```ts
// The commitment the casino publishes for a server seed, as lowercase hex (per the spec's commitment section).
export function commitHash(serverSeedHexString: string): string;
// SHA-256 of a byte buffer, lowercase hex (used to fingerprint files).
export function sha256Buffer(buf: Buffer): string;
// The HMAC message for (clientSeed, nonce, cursor), exactly as the spec builds it.
export function getProvablyFairHmacSalt(clientSeed: string, nonce: number, cursor: number): string;
// The accepted draw r in [0, range) for (seeds, nonce, cursor), applying the spec's chunk walk and rejection rule.
// Throw if no chunk is accepted.
export function generateProvablyFairNumber(serverSeed: string, clientSeed: string, nonce: number, cursor: number, range: number): number;
// The limbo draw r (range 10^8, cursor 0) for a round.
export function limboDraw(serverSeed: string, clientSeed: string, nonce: number): number;
// The limbo result multiplier for a round, as the spec defines it (floored to cents, 1.00 floor).
export function limboResult(serverSeed: string, clientSeed: string, nonce: number): number;
// How many leading chunks of the round's digest were rejected before the accepted one, for that range.
export function rejectedLeadingChunks(serverSeed: string, clientSeed: string, nonce: number, range: number): number;
```
Win/payout logic is NOT part of this module; implement only the above.
