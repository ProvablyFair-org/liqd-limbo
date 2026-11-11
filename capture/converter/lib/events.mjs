// ============================================================================
//  Shared reader for the LIQD prod capture files (the runners' exported .ndjson, one event per line).
//  Builds what every adapter needs and nothing game-specific:
//    - the parsed events, the meta event, the pre-capture anchor (pre + the rotation that closed it);
//    - one seed record per epoch, from the RAW rotation replies, by the same rule as runners/_shared/check-core.mjs:
//      the epoch's commitment / next hash / client seed / post-rotation nonce come from the rotation that OPENED it
//      (epoch 0: the rotation that closed the pre-capture pair), its revealed server seed from the rotation that CLOSED it;
//    - the settled rounds (`bet` events, rec) in file order, and the verify replies keyed by seq.
//  No network, no write. Every value is read from the file; the two booleans per seed (commitVerified, chainLinkOk) are
//  recomputed here with sha256 / string equality and are labelled as recomputed in the output meta.
// ============================================================================
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const sha256 = (b) => createHash('sha256').update(b).digest('hex');
export const commitHash = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex');

export function readCapture(path) {
  const bytes = readFileSync(path);
  const text = bytes.toString('utf8');
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  const ev = lines.map((l, i) => { try { return JSON.parse(l); } catch { throw new Error(`${path}: line ${i + 1} is not JSON`); } });
  return { path, sha256: sha256(bytes), bytes: bytes.length, lines: lines.length, ev };
}

/** The capture, folded into the parts every adapter maps from. Throws on a structure the converter cannot map honestly. */
export function fold(cap) {
  const { ev } = cap;
  const metaEv = ev.find((e) => e.t === 'meta'); if (!metaEv) throw new Error('no meta event');
  const meta = metaEv.meta;
  const pre = ev.find((e) => e.t === 'pre');
  const preRot = ev.find((e) => e.t === 'rotate' && e.closes === 'pre');
  if (!pre || !preRot) throw new Error('no pre-capture anchor (pre + its rotation)');
  const epochs = ev.filter((e) => e.t === 'epoch').sort((a, b) => a.epoch - b.epoch);
  const rots = new Map(ev.filter((e) => e.t === 'rotate' && e.closes !== 'pre').map((e) => [e.closes, e]));
  const opener = (E) => (E === 0 ? preRot : rots.get(E - 1));
  const bets = ev.filter((e) => e.t === 'bet').map((e) => e.rec);
  const byEpoch = new Map(); for (const b of bets) { const a = byEpoch.get(b.epoch) ?? []; a.push(b); byEpoch.set(b.epoch, a); }
  const seeds = epochs.map((ep) => {
    const o = opener(ep.epoch), c = rots.get(ep.epoch);
    if (!o) throw new Error(`epoch ${ep.epoch}: no opening rotation`);
    const nonces = (byEpoch.get(ep.epoch) ?? []).map((b) => b.nonce).filter(Number.isInteger);
    const serverSeed = c?.state?.revealedServerSeed ?? null;
    return {
      epoch: ep.epoch,
      phase: ep.phase,
      at: o.at,                                              // the time of the rotation that opened the epoch
      clientSeed: o.state.clientSeed,                        // served by that rotation (the submitted seed, accepted)
      hashedServerSeed: o.state.hashedServerSeed,            // served: the commitment active before the epoch's first round
      nextHashedServerSeed: o.state.nextHashedServerSeed,    // served: the pre-commitment published with it
      serverSeed,                                            // served by the rotation that closed the epoch
      nonceStart: o.state.nonce,                             // served: the post-rotation nonce
      nonceEnd: nonces.length ? Math.max(...nonces) : null,  // auditor-recorded: the last nonce this capture recorded
      commitVerified: serverSeed === null ? null : commitHash(serverSeed) === o.state.hashedServerSeed,   // recomputed
      chainLinkOk: c ? o.state.nextHashedServerSeed === c.state.hashedServerSeed : null,                   // recomputed
    };
  });
  const verifies = new Map();
  for (const v of ev.filter((e) => e.t === 'verify')) if (v.status === 200) verifies.set(v.seq, v);   // last 200 reply per round
  const done = ev.find((e) => e.t === 'done') ?? null;
  const note = ev.find((e) => e.t === 'export-note') ?? null;
  const preCapture = {
    at: pre.at,
    hashedServerSeed: pre.state.hashedServerSeed,
    clientSeed: pre.state.clientSeed,
    nonce: pre.state.nonce,
    nextHashedServerSeed: pre.state.nextHashedServerSeed,
    revealedServerSeed: preRot.state.revealedServerSeed ?? null,
    commitVerified: preRot.state.revealedServerSeed ? commitHash(preRot.state.revealedServerSeed) === pre.state.hashedServerSeed : null,   // recomputed
  };
  return { ev, meta, metaAt: metaEv.at, pre, preRot, epochs, rots, opener, bets, byEpoch, seeds, verifies, done, note, preCapture,
    counts: Object.fromEntries([...ev.reduce((m, e) => m.set(e.t, (m.get(e.t) ?? 0) + 1), new Map())]) };
}

/** Phases as the plan in the capture's meta states them: { A: { bets, amount } } (prod plans are one phase, A). */
export function phasesFromPlan(meta) {
  const out = {};
  for (const e of meta.plan ?? []) {
    const p = out[e.phase] ?? (out[e.phase] = { bets: 0, amount: undefined });
    p.bets += e.bets.length;
    const amts = [...new Set(e.bets.map((b) => b.amount))];
    if (amts.length !== 1 || (p.amount !== undefined && p.amount !== amts[0])) throw new Error(`phase ${e.phase}: more than one planned amount`);
    p.amount = amts[0];
  }
  return out;
}

/** The meta fields every package dataset shares, from the capture. `extra` is the game adapter's own. */
export function baseMeta(f, cap, { gameId, currency, conversion, extra = {}, phases }) {
  const m = f.meta;
  return {
    audit: m.audit,
    platform: m.platform,
    gameId,
    schema: m.schema,
    houseEdge: m.houseEdge,
    currency,
    epochSize: m.epochSize,
    plannedTotal: m.planSummary?.rounds ?? (m.plan ?? []).reduce((s, e) => s + e.bets.length, 0),
    ...extra,
    phases: phases ?? phasesFromPlan(m),
    startedAt: f.metaAt,
    finishedAt: f.done?.at ?? null,
    progress: { savedAt: f.note?.at ?? null, bets: f.bets.length, seeds: f.seeds.length, status: f.done ? 'completed' : 'incomplete' },
    preCapture: f.preCapture,
    conversion: {
      converter: 'convert/convert.mjs (workshop liqd-prod-2026-11-03)',
      source: { file: cap.path.split('/').pop(), sha256: cap.sha256, bytes: cap.bytes, lines: cap.lines, schema: m.schema, runner: m.script, origin: m.origin },
      stake: { amount: m.stake, currency: m.stakeCurrency, currencyId: m.currencyId },
      seedRecords: 'one per epoch: clientSeed, hashedServerSeed, nextHashedServerSeed, nonceStart from the rotation reply that opened the epoch (epoch 0: the one that closed the pre-capture pair), serverSeed from the rotation reply that closed it; at = that opening rotation; nonceEnd = the last nonce this capture recorded in the epoch; commitVerified = sha256(serverSeed) === hashedServerSeed and chainLinkOk = nextHashedServerSeed === the hash the closing rotation made active, both recomputed by the converter',
      preCapture: 'the pre event (active pair read before any bet) and the rotation that revealed it; commitVerified recomputed by the converter',
      progress: 'bets / seeds = counts in this file; status completed when the capture holds its done event; savedAt = the export-note time',
      ...conversion,
    },
  };
}
