// LIQD Limbo prod capture -> repositories/liqd/limbo dataset shape (src/types.ts Dataset / Seed / Bet).
import { pkg } from '../../runners/_shared/check-core.mjs';
import { baseMeta } from '../lib/events.mjs';

const rng = await pkg('limbo', 'src/rng.ts'), cfg = await pkg('limbo', 'src/config.ts');

export const game = 'limbo';
export const outName = (n) => `limbo-prod-${n}bets.json`;

export function convert(f, cap) {
  const seedOf = new Map(f.seeds.map((s) => [s.epoch, s.serverSeed]));
  const gameIds = new Set(f.bets.map((b) => b.raw?.round?.gameId));
  if (gameIds.size !== 1) throw new Error(`limbo: served gameId not unique: ${[...gameIds]}`);
  const bets = f.bets.map((b) => {
    const o = b.outcome, t = b.servedParams.target, seed = seedOf.get(b.epoch);
    const localDraw = rng.limboDraw(seed, b.clientSeed, b.nonce), localResult = rng.limboResult(seed, b.clientSeed, b.nonce);
    const localWin = cfg.limboWin(localResult, t);
    return {
      at: b.at, epoch: b.epoch, phase: b.phase, id: b.betId,
      params: { target: t },
      nonce: b.nonce, clientSeed: b.clientSeed, serverSeedId: b.serverSeedId, hashedServerSeed: b.serverSeedHash,
      result: o.result, win: o.win, multiplier: o.multiplier, resultLabel: b.result,
      betAmount: b.stake, winningAmount: b.winningAmount,
      stakeWallet: Number(b.stakeWallet), winningAmountWallet: Number(b.winningAmountWallet),
      localDraw, localResult, localWin, verified: localResult === o.result && localWin === o.win,
    };
  });
  const meta = baseMeta(f, cap, {
    gameId: [...gameIds][0], currency: f.meta.stakeCurrency,
    conversion: {
      bets: {
        served: 'id = betId; params.target = servedParams.target; nonce, clientSeed, serverSeedId, hashedServerSeed (= serverSeedHash) as served; result, win, multiplier = the served outcome (on prod the reply carries the wager multiplier; on the QA capture it was the rig\'s fill, src/types.ts); resultLabel = the served wager result; betAmount / winningAmount = the served 8-dp strings; stakeWallet / winningAmountWallet = Number(served string)',
        recorded: 'at, epoch, phase = the runner\'s record of the round',
        recomputed: {
          localDraw: 'src/rng.ts limboDraw(revealed seed, clientSeed, nonce)', localResult: 'src/rng.ts limboResult(...)',
          localWin: 'src/config.ts limboWin(localResult, target)', verified: 'localResult === served result && localWin === served win (exact; the QA rig compared the result only, 1e-9 tolerance)',
        },
        notProduced: {
          creditedOk: 'the package fixes no settlement-rounding rule (src/config.ts nominalPayout is the un-rounded stake x target); the QA rig used a 1e-6 tolerance of its own',
          walletOk: 'same reason as creditedOk',
        },
      },
      metaNotProduced: { limits: 'no limit config served in the prod limbo replies', limboModel: 'package constants (src/config.ts), not in the capture', boundaryProbe: 'QA-only', edgeSummary: 'QA capture-time summary' },
      targets: f.meta.targets, targetRule: f.meta.targetRule, ladderTop: f.meta.ladderTop,
    },
  });
  return { meta, seeds: f.seeds, bets };
}

// ── Full production dataset (10 Nov 2026): Phase A plus the later phases, one file ──────────────────────────────
// Used by convert/full-limbo.mjs only. `convert()` above is unchanged (its Phase A output stays byte-identical).
// phase   = the plan's phase letter (A, C, D), as the runner recorded it on the round.
// phaseId = the plan entry: equal to the letter except 'A+' (Phase A's top-up: 50 rounds on targets in [1000, 10000) and 50 at
//           exactly 10,000x). The 7 Nov capture predates phase ids; all its rounds are Phase A, so its phaseId is 'A'.
// verifier = the production verifier's reply for the round (the capture's `verify` event for the same seq): the request body the
//           runner sent and the outcome the casino returned, both as stored, parsed with JSON.parse; nothing is recomputed in it.
export const fullOutName = (n) => `limbo-prod-full-${n}bets.json`;

export function convertPart(f, { capture, epochOffset }) {
  const gameIds = new Set(f.bets.map((b) => b.raw?.round?.gameId));
  if (gameIds.size !== 1) throw new Error(`limbo: served gameId not unique: ${[...gameIds]}`);
  const seedOf = new Map(f.seeds.map((s) => [s.epoch, s.serverSeed]));
  const epochEv = new Map(f.epochs.map((e) => [e.epoch, e]));
  const idOf = (b) => { const e = epochEv.get(b.epoch); const id = b.phaseId ?? e.phaseId ?? b.phase; if ((e.phaseId ?? e.phase) !== id) throw new Error(`limbo: round ${b.betId} phase id ${id} != its epoch's ${e.phaseId ?? e.phase}`); return id; };
  // the verify replies keyed by bet id (the shared reader keys them by seq, which the 7 Nov bet records count per epoch)
  const verifyOf = new Map();
  for (const v of f.ev) if (v.t === 'verify' && v.status === 200) { if (verifyOf.has(v.betId)) throw new Error(`limbo: two HTTP 200 verify replies for ${v.betId}`); verifyOf.set(v.betId, v); }
  const bets = f.bets.map((b) => {
    const o = b.outcome, t = b.servedParams.target, seed = seedOf.get(b.epoch), e = epochEv.get(b.epoch);
    if (b.phase !== e.phase) throw new Error(`limbo: round ${b.betId} phase ${b.phase} != its epoch's ${e.phase}`);
    const localDraw = rng.limboDraw(seed, b.clientSeed, b.nonce), localResult = rng.limboResult(seed, b.clientSeed, b.nonce);
    const localWin = cfg.limboWin(localResult, t);
    const v = verifyOf.get(b.betId);
    if (!v || v.epoch !== b.epoch || v.nonce !== b.nonce) throw new Error(`limbo: round ${b.betId} has no HTTP 200 verify reply of its own`);
    const rq = JSON.parse(v.request.body), rp = JSON.parse(v.body);
    return {
      at: b.at, capture, epoch: b.epoch + epochOffset, phase: b.phase, phaseId: idOf(b), id: b.betId,
      params: { target: t },
      nonce: b.nonce, clientSeed: b.clientSeed, serverSeedId: b.serverSeedId, hashedServerSeed: b.serverSeedHash,
      result: o.result, win: o.win, multiplier: o.multiplier, resultLabel: b.result,
      betAmount: b.stake, winningAmount: b.winningAmount,
      stakeWallet: b.stakeWallet, winningAmountWallet: b.winningAmountWallet,
      verifier: {
        date: v.date, status: v.status,
        request: { serverSeed: rq.serverSeed, clientSeed: rq.clientSeed, nonce: rq.nonce, target: rq.params?.target },
        echo: { clientSeed: rp.seeds?.clientSeed, nonce: rp.seeds?.nonce, target: rp.derivationParams?.target },
        result: rp.outcome?.result, win: rp.outcome?.win, multiplier: rp.outcome?.multiplier,
      },
      localDraw, localResult, localWin, verified: localResult === o.result && localWin === o.win,
    };
  });
  const seeds = f.seeds.map((s) => {
    const e = epochEv.get(s.epoch);
    return { ...s, epoch: s.epoch + epochOffset, capture, captureEpoch: s.epoch, phaseId: e.phaseId ?? e.phase, seedTag: e.seedTag ?? 'audit', plannedBets: e.plannedBets, stake: e.stake ?? f.meta.stake };
  });
  return { bets, seeds, gameId: [...gameIds][0] };
}

export const fullConversion = {
  converter: 'convert/full-limbo.mjs + convert/adapters/limbo.mjs (workshop liqd-prod-2026-11-03)',
  api: 'originals (/api/v1/originals/limbo/place-bet and /verify), every round of every capture',
  order: 'captures in the order of convert/inputs.limbo.json (the order they were played); inside a capture, the file order of its bet events. Epochs are renumbered 0..N-1 across the captures in that order; seeds[].captureEpoch is the epoch number inside its own capture file',
  seedRecords: 'one per epoch: clientSeed, hashedServerSeed, nextHashedServerSeed, nonceStart from the rotation reply that opened the epoch (the first epoch of a capture: the rotation that closed that capture\'s pre-capture pair), serverSeed from the rotation reply that closed it; at = that opening rotation; nonceEnd = the last nonce recorded in the epoch; commitVerified = sha256(serverSeed) === hashedServerSeed and chainLinkOk = nextHashedServerSeed === the hash the closing rotation made active, both recomputed by the converter; capture, captureEpoch, phase, phaseId, seedTag (player = a Phase D player-set seed, audit = the runner\'s per-epoch seed), plannedBets, stake = the runner\'s epoch event (the 7 Nov capture\'s epoch events carry no stake: its meta stake)',
  captures: 'meta.captures[i]: the source file and its sha256, the runner build, the plan summary, the first / last epoch and the bet count it contributes, its window, and its own pre-capture anchor (the pair active before its first round and the rotation that revealed it; commitVerified recomputed). The three captures are three separate runs on the same account: the seed chain is asserted inside each capture, not across them',
  bets: {
    served: 'id = betId; params.target = servedParams.target; nonce, clientSeed, serverSeedId, hashedServerSeed (= serverSeedHash) as served; result, win, multiplier = the served outcome; resultLabel = the served wager result; betAmount / winningAmount / stakeWallet / winningAmountWallet = the served strings, unchanged',
    recorded: 'at, phase, phaseId = the runner\'s record of the round (the 7 Nov capture has no phase id: all its rounds are Phase A, phaseId A); capture = 1-based index into meta.captures; epoch = renumbered as above',
    verifier: 'the capture\'s verify event of the same round (same betId, epoch and nonce; exactly one HTTP 200 reply per round): date = the reply\'s Date header; request = the body the runner POSTed to /api/v1/originals/limbo/verify (serverSeed, clientSeed, nonce, params.target); echo = the reply\'s seeds and derivationParams; result, win, multiplier = the reply\'s outcome. Parsed with JSON.parse, not recomputed',
    recomputed: {
      localDraw: 'src/rng.ts limboDraw(revealed seed, clientSeed, nonce)', localResult: 'src/rng.ts limboResult(...)',
      localWin: 'src/config.ts limboWin(localResult, target)', verified: 'localResult === served result && localWin === served win (exact)',
    },
  },
  phases: 'meta.phases[letter]: bets and epochs counted from the capture files, stake = the served stake string of every round of the phase (one value, or the converter stops), amount = Number(stake), ids = bets per plan entry (A: A = the 50-target ladder of 7 Nov, A+ = the top-up of 10 Nov), epochSizes = the distinct plannedBets of its epochs',
  plan: 'meta.ladder = the 50 targets of the 7 Nov plan (its meta.targets) and of Phase D (the 10 Nov meta.ladder100), required identical; meta.targetRule, meta.topupRule = the runners\' own descriptions; meta.clientSeedGenerator = the runners\' own descriptions per seed tag',
};
