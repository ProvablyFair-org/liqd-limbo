// DATASET FIELD FORGERIES — one documented case per invocation, each re-pinning DATASET_SHA256.
//
// WHY THESE ARE SCRIPTS AND NOT find/replace ENTRIES. `data/limbo-master-6700bets.json` is pinned by
// SHA-256 in src/config.ts and the loader exits(1) on a mismatch BEFORE any step is scored. A static
// find/replace therefore never reaches the guard it is supposed to test: the run dies at the pin and
// the entry proves only that the pin exists. A forger who edits the capture re-pins in the same
// commit, so these scripts do too, and the semantic guards have to do the work. The one entry where
// the PIN ITSELF is the guard under test is `dataset-unpinned-edit.mjs`, which deliberately does not.
//
// ZERO FABRICATION. Every bet id, nonce, epoch, target, stake and credit named below was read out of
// the frozen capture. Where a forgery needs a WRONG hash, it is produced by advancing the first hex
// digit of a real one (`bendHex`) rather than by inventing 64 characters — so the value is visibly
// derived from the artifact and cannot be mistaken for a captured hash.
//
// usage: node dataset-field-forgeries.mjs <sandboxRepo> <case>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = process.argv[2];
const kase = process.argv[3];
if (!repo || !kase) { console.error('usage: dataset-field-forgeries.mjs <sandboxRepo> <case>'); process.exit(2); }

const dsPath = path.join(repo, 'data/limbo-master-6700bets.json');
const ds = JSON.parse(fs.readFileSync(dsPath, 'utf8'));

const betById = (id) => {
  const b = ds.bets.find((x) => x.id === id);
  if (!b) { console.error(`case ${kase}: bet ${id} is not in the capture — the registry cites a bet that does not exist`); process.exit(2); }
  return b;
};
const seedByEpoch = (e) => {
  const s = ds.seeds.find((x) => x.epoch === e);
  if (!s) { console.error(`case ${kase}: no seed record for epoch ${e}`); process.exit(2); }
  return s;
};
/** Advance the first hex digit of a real hash — a wrong value that is visibly derived, not invented. */
const bendHex = (h) => ((parseInt(h[0], 16) + 1) % 16).toString(16) + h.slice(1);

let note;
switch (kase) {
  // ── Step 2 ────────────────────────────────────────────────────────────────────────────────────
  case 'precommit-link-severed': {
    const was = ds.meta.preCapture.nextHashedServerSeed;
    ds.meta.preCapture.nextHashedServerSeed = bendHex(was);
    note = `meta.preCapture.nextHashedServerSeed ${was.slice(0, 12)}… -> ${ds.meta.preCapture.nextHashedServerSeed.slice(0, 12)}… `
      + '(the pre-capture record no longer names epoch 0\'s commitment; the in-capture chain is untouched)';
    break;
  }
  case 'precommit-reveal-forged': {
    const was = ds.meta.preCapture.revealedServerSeed;
    ds.meta.preCapture.revealedServerSeed = bendHex(was);
    note = `meta.preCapture.revealedServerSeed ${was.slice(0, 8)}… -> ${ds.meta.preCapture.revealedServerSeed.slice(0, 8)}… `
      + '(the seed released before the first bet no longer hashes to the commitment recorded with it)';
    break;
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────────────────────────
  case 'unbacked-commitment': {
    const b = betById('USzRL9gyMBxZg8NLCNoYS');       // epoch 0, nonce 0
    const was = b.hashedServerSeed;
    b.hashedServerSeed = bendHex(was);
    note = `bet USzRL9gyMBxZg8NLCNoYS (epoch 0 nonce 0) settled against ${b.hashedServerSeed.slice(0, 12)}…, `
      + 'a commitment no seed record backs';
    break;
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────────────────────────
  case 'nonce-window-doctored': {
    const s = seedByEpoch(3);
    const was = s.nonceEnd;
    s.nonceEnd = 48;
    note = `seeds[epoch 3].nonceEnd ${was} -> 48 while 50 bets with nonces 0..49 remain in the epoch`;
    break;
  }

  // ── Step 6 ────────────────────────────────────────────────────────────────────────────────────
  case 'win-flag-flipped': {
    const b = betById('USzRL9gyMBxZg8NLCNoYS');       // R 2.47x against target 4.58x — a real loss
    b.win = true;
    b.resultLabel = 'won';
    note = 'bet USzRL9gyMBxZg8NLCNoYS (R 2.47x, target 4.58x) relabelled a WIN, credit left at 0 — '
      + 'the settled outcome no longer follows from the recomputed result';
    break;
  }

  // ── Step 8 ────────────────────────────────────────────────────────────────────────────────────
  case 'paid-multiplier-forged': {
    const b = betById('zFT06HYCJUcIINZ9CX3Nd');       // epoch 0 nonce 2, target 1.07x, credited 0.107
    const was = b.multiplier;
    b.multiplier = 1.08;
    note = `bet zFT06HYCJUcIINZ9CX3Nd credited at ${b.multiplier}x rather than the chosen target ${was}x`;
    break;
  }

  // ── Step 9 ────────────────────────────────────────────────────────────────────────────────────
  case 'credit-off-by-1e8': {
    const b = betById('zFT06HYCJUcIINZ9CX3Nd');       // $0.10 at 1.07x -> exactly 0.107
    const was = b.winningAmount;
    b.winningAmount = 0.10700001;
    b.winningAmountWallet = 0.10700001;               // wallet moved too, so Step 11 cannot be the catcher
    note = `bet zFT06HYCJUcIINZ9CX3Nd credited ${b.winningAmount} instead of ${was} — one unit in the 8th `
      + 'decimal place, on both the game ledger and the wallet ledger';
    break;
  }

  // ── Step 10 ───────────────────────────────────────────────────────────────────────────────────
  case 'loss-relabelled-won': {
    const b = betById('DbC72X6-SkOFWEqoJrLvj');       // epoch 1 nonce 3, R 1x against target 2.14x
    b.resultLabel = 'won';
    note = 'bet DbC72X6-SkOFWEqoJrLvj labelled "won" while win=false, credit 0 and multiplier 0';
    break;
  }

  // ── Step 11 ───────────────────────────────────────────────────────────────────────────────────
  case 'wallet-ledger-divergence': {
    const b = betById('yAVLBL0QWD0RVuewVxG_v');       // epoch 3 nonce 29
    const was = b.stakeWallet;
    b.stakeWallet = 0.09;
    note = `bet yAVLBL0QWD0RVuewVxG_v: wallet-denominated stake ${b.stakeWallet} against a game-ledger stake of ${was}`;
    break;
  }

  // ── Step 12 ───────────────────────────────────────────────────────────────────────────────────
  case 'duplicate-bet-id': {
    const was = ds.bets[1].id;
    ds.bets[1].id = ds.bets[0].id;
    note = `bets[1].id ${was} -> ${ds.bets[0].id} — 6,700 records carrying 6,699 distinct settlement ids`;
    break;
  }

  // ── Step 13 ───────────────────────────────────────────────────────────────────────────────────
  case 'phase-relabelled': {
    const b = betById('USzRL9gyMBxZg8NLCNoYS');
    const was = b.phase;
    b.phase = 'C';
    note = `bet USzRL9gyMBxZg8NLCNoYS moved from phase ${was} to phase C at its $0.10 stake`;
    break;
  }

  // ── Step 21 ───────────────────────────────────────────────────────────────────────────────────
  case 'capture-host-relabelled': {
    const was = ds.meta.platform;
    ds.meta.platform = 'liqd.com';
    note = `meta.platform ${was} -> liqd.com — a QA capture presented as production`;
    break;
  }
  case 'operator-bet-count-partial': {
    const s = seedByEpoch(0);
    s.operatorBetCount = 50;
    note = 'seeds[epoch 0].operatorBetCount = 50 — one epoch acquires an operator-sourced trailing '
      + 'witness while 133 do not';
    break;
  }
  // Added 2026-10-02 (QA C7): until then Step 21 PASSED these two and printed "no longer applies".
  case 'operator-bet-count-all': {
    for (const s of ds.seeds) s.operatorBetCount = ds.bets.filter((b) => b.epoch === s.epoch).length;
    note = `operatorBetCount set on all ${ds.seeds.length} epochs (each to its own recorded round count) — limitation L2 no longer holds as declared`;
    break;
  }
  case 'balance-ledger-all': {
    for (const b of ds.bets) b.balanceOk = true;
    note = `balanceOk = true on all ${ds.bets.length} bets — a wallet balance ledger appears, so limitation L3 no longer holds as declared`;
    break;
  }

  // ── DECLARED SURVIVOR ─────────────────────────────────────────────────────────────────────────
  case 'advertised-limits-doctored': {
    const was = JSON.stringify(ds.meta.limits);
    ds.meta.limits.minBetUsdc = 5;
    ds.meta.limits.maxExposureUsdc = 1;
    ds.meta.limits.maxMultiplier = 7;
    note = `meta.limits ${was} -> ${JSON.stringify(ds.meta.limits)} — the dataset's own advertised-limits `
      + 'block set to values the capture flatly contradicts';
    break;
  }

  default:
    console.error(`unknown case: ${kase}`);
    process.exit(2);
}

fs.writeFileSync(dsPath, JSON.stringify(ds, null, 2));

const newSha = crypto.createHash('sha256').update(fs.readFileSync(dsPath)).digest('hex');
const cfgPath = path.join(repo, 'src/config.ts');
let cfg = fs.readFileSync(cfgPath, 'utf8');
cfg = cfg.replace(/export const DATASET_SHA256 = '[0-9a-f]{64}'/, `export const DATASET_SHA256 = '${newSha}'`);
fs.writeFileSync(cfgPath, cfg);

console.log(`${kase}: ${note}; DATASET_SHA256 re-pinned to ${newSha}`);
