import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import type { Dataset, Seed, Bet } from './types';

export interface LoadedDataset extends Dataset {
  sha256: string;
  path: string;
}

export function loadDataset(path: string, expectedSha256?: string): LoadedDataset {
  if (!existsSync(path)) {
    console.error(`ERROR: dataset not found at ${path}`);
    process.exit(1);
  }
  const raw = readFileSync(path);
  const sha256 = createHash('sha256').update(raw).digest('hex');
  if (expectedSha256 && sha256 !== expectedSha256) {
    console.error(`ERROR: dataset SHA-256 mismatch`);
    console.error(`  expected: ${expectedSha256}`);
    console.error(`  actual:   ${sha256}`);
    process.exit(1);
  }
  const parsed = JSON.parse(raw.toString('utf8')) as Dataset;
  return { ...parsed, sha256, path };
}

/** O(1) lookup: hashedServerSeed → its Seed entry (with revealed serverSeed once rotated). */
export function revealedSeedMap(seeds: Seed[]): Map<string, Seed> {
  const m = new Map<string, Seed>();
  for (const s of seeds) m.set(s.hashedServerSeed, s);
  return m;
}

/** epoch index → Seed entry. */
export function seedByEpoch(seeds: Seed[]): Map<number, Seed> {
  const m = new Map<number, Seed>();
  for (const s of seeds) m.set(s.epoch, s);
  return m;
}

/** epoch index → its bets. */
export function betsByEpoch(bets: Bet[]): Map<number, Bet[]> {
  const m = new Map<number, Bet[]>();
  for (const b of bets) {
    const a = m.get(b.epoch);
    if (a) a.push(b); else m.set(b.epoch, [b]);
  }
  return m;
}

export function phaseBets(bets: Bet[], phase: string): Bet[] {
  return bets.filter((b) => b.phase === phase);
}
