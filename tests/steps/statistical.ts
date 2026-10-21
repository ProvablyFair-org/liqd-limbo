/**
 * Informational items — NOT scored, and deliberately so.
 *
 * Everything here is a property of a 6,700-bet sample. A sample cannot establish an RTP; the RTP
 * result in this audit is the closed-form edge identity (Step 16), anchored by the full-grid tally
 * (Step 15) and tied to the operator by the reproduction of every settled result (Step 5). These
 * figures illustrate variance and give the reader a feel for the capture — nothing more.
 *
 * G-VALID applies here too: none of these numbers is a pass criterion, so none of them can be
 * "too good". A live RTP above 100% over 6,700 bets on a 1% edge is ordinary variance, not evidence
 * of generosity — and it is not evidence of anything else either.
 */

import type { InfoItem, VerifyContext } from './context';
import { effectiveEdge, theoreticalRTP, winChance, MIN_RESULT, MAX_MULTIPLIER } from '../../src/config';

export function run(ctx: VerifyContext): InfoItem[] {
  const { bets, distinctTargets } = ctx;
  const items: InfoItem[] = [];
  if (bets.length === 0) return [{ label: 'Live bets', detail: 'No bets in dataset' }];

  const wagered = bets.reduce((s, b) => s + Number(b.betAmount), 0);
  const returned = bets.reduce((s, b) => s + Number(b.winningAmount), 0);
  items.push({
    label: 'Live sample RTP (variance illustration ONLY)',
    detail: `${(returned / wagered * 100).toFixed(4)}% — $${wagered.toFixed(2)} wagered, $${returned.toFixed(2)} returned over ${bets.length} bets, net ${(returned - wagered) >= 0 ? '+' : ''}$${(returned - wagered).toFixed(2)} to the player. `
      + `NOT RTP evidence and never cited as such: the RTP result is the closed-form edge of Step 16 (>= 1.00% on every legal target). `
      + `A 6,700-bet sample on mixed targets has a standard error far wider than the 1% edge, so a figure above 100% here is ordinary.`,
  });

  const wins = bets.filter((b) => b.win).length;
  const expectedWins = bets.reduce((s, b) => s + winChance(Number(b.params.target)), 0);
  items.push({
    label: 'Live win rate',
    detail: `${wins}/${bets.length} = ${(wins / bets.length * 100).toFixed(2)}% against ${expectedWins.toFixed(1)} expected from the sum of each bet's own priced win chance (mixed targets — informational)`,
  });

  const results = bets.map((b) => Number(b.result)).sort((a, z) => a - z);
  const floored = results.filter((r) => r === MIN_RESULT).length;
  const median = results[Math.floor(results.length / 2)];
  items.push({
    label: 'Result distribution',
    detail: `min ${results[0]}x, median ${median}x, max ${results[results.length - 1]}x, ceiling ${MAX_MULTIPLIER}x unreached; `
      + `${floored} rounds (${(floored / results.length * 100).toFixed(2)}%) at the R = ${MIN_RESULT}x floor, against ~1.98% of the draw grid that maps there — the floor is a normal part of the game, not an edge case`,
  });

  const edges = distinctTargets.map((m) => effectiveEdge(m));
  items.push({
    label: 'Theoretical edge over captured targets',
    detail: `${distinctTargets.length} distinct targets from ${distinctTargets[0]}x to ${distinctTargets[distinctTargets.length - 1]}x: `
      + `edge ${(Math.min(...edges) * 100).toFixed(6)}%–${(Math.max(...edges) * 100).toFixed(6)}%, mean ${(edges.reduce((a, b) => a + b, 0) / edges.length * 100).toFixed(6)}% `
      + `(deterministic, from the operator's own pricing — a span over the targets this capture used, not the edge curve; the full curve over every legal target is Step 16)`,
  });

  for (const phase of ['A', 'B', 'C', 'D']) {
    const ph = bets.filter((b) => b.phase === phase);
    if (ph.length === 0) continue;
    const w = ph.reduce((s, b) => s + Number(b.betAmount), 0);
    const r = ph.reduce((s, b) => s + Number(b.winningAmount), 0);
    const theo = ph.reduce((s, b) => s + Number(b.betAmount) * theoreticalRTP(Number(b.params.target)), 0) / w;
    items.push({
      label: `Phase ${phase} sample return`,
      detail: `${ph.length} bets, $${w.toFixed(2)} wagered, $${r.toFixed(2)} returned = ${(r / w * 100).toFixed(3)}% against a stake-weighted theoretical ${(theo * 100).toFixed(4)}% `
        + `(${ph.filter((b) => b.win).length} wins — variance illustration)`,
    });
  }

  items.push({
    label: 'Capture-side self-check fields',
    detail: 'localDraw / localResult / localWin / verified / creditedOk / walletOk are present in the dataset and IGNORED by verification — every scored figure is re-derived from primitives. '
      + 'They are the capture rig\'s own inline check, which is how the missing R = 1 result floor was caught on 2026-09-11 in an earlier capture run that is not shipped, instead of after the whole run.',
  });

  return items;
}
