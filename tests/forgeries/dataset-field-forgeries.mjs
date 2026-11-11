// DATASET FIELD FORGERIES — one documented case per invocation, each re-pinning DATASET_SHA256.
//
// WHY THESE ARE SCRIPTS AND NOT find/replace ENTRIES. `data/limbo-prod-full-5838bets.json` is pinned by
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

const dsPath = path.join(repo, 'data/limbo-prod-full-5838bets.json');
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
    const was = ds.meta.captures[0].preCapture.nextHashedServerSeed;
    ds.meta.captures[0].preCapture.nextHashedServerSeed = bendHex(was);
    note = `meta.captures[0].preCapture.nextHashedServerSeed ${was.slice(0, 12)}… -> ${ds.meta.captures[0].preCapture.nextHashedServerSeed.slice(0, 12)}… `
      + '(the pre-capture record no longer names epoch 0\'s commitment; the in-capture chain is untouched)';
    break;
  }
  case 'precommit-reveal-forged': {
    const was = ds.meta.captures[0].preCapture.revealedServerSeed;
    ds.meta.captures[0].preCapture.revealedServerSeed = bendHex(was);
    note = `meta.captures[0].preCapture.revealedServerSeed ${was.slice(0, 8)}… -> ${ds.meta.captures[0].preCapture.revealedServerSeed.slice(0, 8)}… `
      + '(the seed released before the first bet no longer hashes to the commitment recorded with it)';
    break;
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────────────────────────
  case 'unbacked-commitment': {
    const b = betById('3G5Wm6eniZ8jXrzab4IJd');       // epoch 0, nonce 0
    const was = b.hashedServerSeed;
    b.hashedServerSeed = bendHex(was);
    note = `bet 3G5Wm6eniZ8jXrzab4IJd (epoch 0 nonce 0) settled against ${b.hashedServerSeed.slice(0, 12)}…, `
      + 'a commitment no seed record backs';
    break;
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────────────────────────
  case 'nonce-window-doctored': {
    const s = seedByEpoch(3);
    const was = s.nonceEnd;
    s.nonceEnd = 198;
    note = `seeds[epoch 3].nonceEnd ${was} -> 198 while 200 bets with nonces 0..199 remain in the epoch`;
    break;
  }

  // ── Step 6 ────────────────────────────────────────────────────────────────────────────────────
  case 'win-flag-flipped': {
    const b = betById('9woTGRttiUxaK2tF7nmig');       // epoch 0 nonce 6, R 1.21x against target 1.77x — a real loss
    b.win = true;
    b.resultLabel = 'won';
    note = 'bet 9woTGRttiUxaK2tF7nmig (R 1.21x, target 1.77x) relabelled a WIN, credit left at 0 — '
      + 'the settled outcome no longer follows from the recomputed result';
    break;
  }

  // ── Step 8 ────────────────────────────────────────────────────────────────────────────────────
  case 'paid-multiplier-forged': {
    const b = betById('3G5Wm6eniZ8jXrzab4IJd');       // epoch 0 nonce 0, target 1.01x, served multiplier 1.01
    const was = b.multiplier;
    b.multiplier = 1.02;
    note = `bet 3G5Wm6eniZ8jXrzab4IJd served at ${b.multiplier}x rather than the chosen target ${was}x`;
    break;
  }

  // ── Step 9 ────────────────────────────────────────────────────────────────────────────────────
  case 'credit-off-by-1e8': {
    const b = betById('3G5Wm6eniZ8jXrzab4IJd');       // 0.10 at 1.01x -> exactly 0.10100000
    const was = b.winningAmount;
    b.winningAmount = '0.10100001';
    b.winningAmountWallet = '0.10100001';             // wallet moved too, so Step 11 cannot be the catcher
    note = `bet 3G5Wm6eniZ8jXrzab4IJd credited ${b.winningAmount} instead of ${was} — one unit in the 8th `
      + 'decimal place, on both the game ledger and the wallet ledger';
    break;
  }

  // ── Step 10 ───────────────────────────────────────────────────────────────────────────────────
  case 'loss-relabelled-won': {
    const b = betById('4thzOegbI0ipF1HbnCn0O');       // epoch 1 nonce 86, R 1x against target 29.55x
    b.resultLabel = 'won';
    note = 'bet 4thzOegbI0ipF1HbnCn0O labelled "won" while win=false, credit 0 and multiplier 0';
    break;
  }

  // ── Step 11 ───────────────────────────────────────────────────────────────────────────────────
  case 'wallet-ledger-divergence': {
    const b = betById('Vo0z4ovk6NRP1rcZ-sGYc');       // epoch 3 nonce 29
    const was = b.stakeWallet;
    b.stakeWallet = '0.09000000';
    note = `bet Vo0z4ovk6NRP1rcZ-sGYc: wallet-denominated stake ${b.stakeWallet} against a game-ledger stake of ${was}`;
    break;
  }

  // ── Step 12 ───────────────────────────────────────────────────────────────────────────────────
  case 'duplicate-bet-id': {
    const was = ds.bets[1].id;
    ds.bets[1].id = ds.bets[0].id;
    note = `bets[1].id ${was} -> ${ds.bets[0].id} — ${ds.bets.length} records carrying ${ds.bets.length - 1} distinct settlement ids`;
    break;
  }

  // ── Step 13 ───────────────────────────────────────────────────────────────────────────────────
  case 'phase-relabelled': {
    const b = betById('3G5Wm6eniZ8jXrzab4IJd');
    const was = b.phase;
    b.phase = 'C';
    b.phaseId = 'C';
    note = `bet 3G5Wm6eniZ8jXrzab4IJd moved from phase ${was} to phase C at its 0.10 stake and its 1.01x target`;
    break;
  }

  // ── Step 21 ───────────────────────────────────────────────────────────────────────────────────
  case 'capture-host-relabelled': {
    const was = ds.meta.platform;
    ds.meta.platform = 'staging.liqd.invalid';
    note = `meta.platform ${was} -> staging.liqd.invalid — the production capture relabelled as another host`;
    break;
  }
  case 'operator-bet-count-partial': {
    const s = seedByEpoch(0);
    s.operatorBetCount = 200;
    note = 'seeds[epoch 0].operatorBetCount = 200 — one epoch acquires an operator-sourced trailing '
      + 'witness while 32 do not';
    break;
  }
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

  // ── Step 2, a later run ───────────────────────────────────────────────────────────────────────
  case 'run2-anchor-severed': {
    const c = ds.meta.captures.find((x) => x.capture === 2);
    const was = c.preCapture.nextHashedServerSeed;
    c.preCapture.nextHashedServerSeed = bendHex(was);
    note = `meta.captures[run 2].preCapture.nextHashedServerSeed ${was.slice(0, 12)}… -> ${c.preCapture.nextHashedServerSeed.slice(0, 12)}… `
      + '(the pair read before the 10 November run no longer names that run\'s first commitment)';
    break;
  }

  // ── Step 18 ───────────────────────────────────────────────────────────────────────────────────
  case 'player-seed-tag-moved': {
    // a Phase D epoch relabelled as an ordinary one: the plan says epoch 25 is Phase D under a player-set seed
    const s = seedByEpoch(25);
    s.phase = 'A'; s.phaseId = 'A'; s.seedTag = 'audit';
    for (const b of ds.bets) if (b.epoch === 25) { b.phase = 'A'; b.phaseId = 'A'; }
    note = 'epoch 25 (Phase D, player-set seed pfaudit-prod-limbo-d1-…) relabelled Phase A on its seed record and its 100 rounds';
    break;
  }

  // ── Step 25 ───────────────────────────────────────────────────────────────────────────────────
  case 'verifier-reply-forged': {
    const b = betById('3G5Wm6eniZ8jXrzab4IJd');       // epoch 0 nonce 0: the verifier returned 8.78
    const was = b.verifier.result;
    b.verifier.result = 8.79;
    note = `bet 3G5Wm6eniZ8jXrzab4IJd: the stored verifier reply's result ${was} -> ${b.verifier.result} (one 2-dp tick), the settled round untouched`;
    break;
  }
  case 'verifier-request-not-round': {
    const b = betById('3G5Wm6eniZ8jXrzab4IJd');
    const was = b.verifier.request.nonce;
    b.verifier.request.nonce = was + 1;
    note = `bet 3G5Wm6eniZ8jXrzab4IJd: the stored verifier REQUEST's nonce ${was} -> ${b.verifier.request.nonce}, so the reply no longer answers this round`;
    break;
  }
  case 'verifier-reply-removed': {
    const b = betById('3G5Wm6eniZ8jXrzab4IJd');
    delete b.verifier;
    note = 'bet 3G5Wm6eniZ8jXrzab4IJd: its verifier reply deleted — 5,837 of 5,838 rounds carry one';
    break;
  }

  // ── DECLARED SURVIVOR ─────────────────────────────────────────────────────────────────────────
  case 'advertised-limits-doctored': {
    // The production dataset carries no meta.limits block (no limit configuration is served in the production
    // replies), so the forgery ADDS one with values the capture flatly contradicts.
    const was = JSON.stringify(ds.meta.limits ?? null);
    ds.meta.limits = { ...(ds.meta.limits ?? {}), minBetUsdc: 5, maxExposureUsdc: 1, maxMultiplier: 7 };
    note = `meta.limits ${was} -> ${JSON.stringify(ds.meta.limits)} — an advertised-limits `
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
