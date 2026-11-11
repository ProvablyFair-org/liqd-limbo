#!/usr/bin/env node
// ============================================================================
//  LIQD Limbo: the three production captures (Phase A; D + A top-up; C) -> ONE package dataset { meta, seeds[], bets[] }.
//  PRIVATE WORKSHOP ONLY. No network. Capture files are read, never edited.
//
//  Usage:  node convert/full-limbo.mjs [--out <dir>]        (run from the workshop root or anywhere)
//  Reads convert/inputs.limbo.json (each input sha256-checked first), writes
//    convert/out/limbo-prod-full-<n>bets.json   JSON.stringify(dataset, null, 2), no trailing newline
//    convert/out/limbo-full.selfcheck.txt
//  The conversion is run twice and the two serialisations must be byte-identical.
//  Exit: 0 every self-check passes · 1 a self-check or an input hash fails
// ============================================================================
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCapture, fold, sha256, commitHash } from './lib/events.mjs';
import { convertPart, fullConversion, fullOutName } from './adapters/limbo.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), WORKSHOP = resolve(HERE, '..');
const oi = process.argv.indexOf('--out'), OUT = oi > 0 ? resolve(process.argv[oi + 1]) : join(HERE, 'out');
const inputs = JSON.parse(readFileSync(join(HERE, 'inputs.limbo.json'), 'utf8'));

const L = [], fails = [];
const row = (ok, label, detail) => { L.push(`  ${ok === null ? '----' : ok ? 'PASS' : 'FAIL'}  ${label.padEnd(18)} ${detail}`); if (ok === false) fails.push(label); };

const caps = inputs.map((j) => ({ j, cap: readCapture(join(WORKSHOP, j.capture)) }));
for (const { j, cap } of caps) row(cap.sha256 === j.sha256, 'input sha256', `${j.capture}: ${cap.sha256} (${cap.bytes} bytes, ${cap.lines} lines)${cap.sha256 === j.sha256 ? '' : ` expected ${j.sha256}`}`);
if (fails.length) { console.log(L.join('\n')); process.exit(1); }

function build() {
  const folds = caps.map(({ cap }) => fold(cap));
  const bets = [], seeds = [], captures = [];
  let epochOffset = 0; const gameIds = new Set();
  folds.forEach((f, i) => {
    const { cap, j } = caps[i];
    const part = convertPart(f, { capture: i + 1, epochOffset });
    gameIds.add(part.gameId);
    const m = f.meta;
    captures.push({
      capture: i + 1,
      file: j.capture.split('/').pop(), sha256: cap.sha256, bytes: cap.bytes, lines: cap.lines,
      schema: m.schema, runner: m.script, origin: m.origin, planVersion: m.planVersion ?? null,
      stakeCurrency: m.stakeCurrency, currencyId: m.currencyId,
      planPhases: (m.planSummary?.phases ?? [...new Set(f.epochs.map((e) => e.phaseId ?? e.phase))]),
      firstEpoch: epochOffset, lastEpoch: epochOffset + f.seeds.length - 1, epochs: f.seeds.length, bets: part.bets.length,
      startedAt: f.metaAt, firstRoundAt: part.bets[0].at, lastRoundAt: part.bets.at(-1).at, finishedAt: f.done?.at ?? null, savedAt: f.note?.at ?? null,
      status: f.done ? 'completed' : 'incomplete',
      verifyReplies: f.ev.filter((e) => e.t === 'verify' && e.status === 200).length,
      preCapture: f.preCapture,
    });
    bets.push(...part.bets); seeds.push(...part.seeds);
    epochOffset += f.seeds.length;
  });
  if (gameIds.size !== 1) throw new Error(`served gameId differs across captures: ${[...gameIds]}`);
  const one = (k) => { const v = new Set(folds.map((f) => JSON.stringify(f.meta[k]))); if (v.size !== 1) throw new Error(`meta.${k} differs across captures`); return folds[0].meta[k]; };
  const phases = {};
  for (const b of bets) {
    const p = phases[b.phase] ?? (phases[b.phase] = { bets: 0, stake: b.betAmount, amount: Number(b.betAmount), epochs: 0, epochSizes: [], ids: {} });
    if (p.stake !== b.betAmount) throw new Error(`phase ${b.phase}: more than one served stake (${p.stake}, ${b.betAmount})`);
    p.bets++; p.ids[b.phaseId] = (p.ids[b.phaseId] ?? 0) + 1;
  }
  for (const s of seeds) { const p = phases[s.phase]; p.epochs++; if (!p.epochSizes.includes(s.plannedBets)) p.epochSizes.push(s.plannedBets); }
  // the ladder: the 7 Nov plan's targets and the 10 Nov plan's ladder100 (Phase D) must be the same list
  const ladders = folds.map((f) => f.meta.targets ?? f.meta.ladder100).filter(Boolean).map((a) => JSON.stringify(a));
  if (new Set(ladders).size !== 1) throw new Error('the ladder differs across captures');
  const generators = {}; for (const f of folds) for (const [k, v] of Object.entries(f.meta.clientSeedGenerator ?? {})) { if (generators[k] !== undefined && generators[k] !== v) throw new Error(`clientSeedGenerator.${k} differs across captures`); generators[k] = v; }
  const meta = {
    audit: one('audit'), platform: one('platform'), gameId: [...gameIds][0], schema: one('schema'), houseEdge: one('houseEdge'),
    currency: one('stakeCurrency'),
    plannedTotal: folds.reduce((s, f) => s + (f.meta.planSummary?.rounds ?? 0), 0),
    phases,
    ladder: JSON.parse(ladders[0]),
    targetRule: folds[0].meta.targetRule ?? null,
    topupRule: folds.map((f) => f.meta.topupRule).find(Boolean) ?? null,
    clientSeedGenerator: generators,
    startedAt: folds[0].metaAt, finishedAt: folds.at(-1).done?.at ?? null,
    progress: { savedAt: folds.at(-1).note?.at ?? null, bets: bets.length, seeds: seeds.length, status: folds.every((f) => f.done) ? 'completed' : 'incomplete' },
    captures,
    conversion: fullConversion,
  };
  const ds = { meta, seeds, bets };
  return { folds, ds, text: JSON.stringify(ds, null, 2) };
}

const a = build(), b = build();
const outPath = join(OUT, fullOutName(a.ds.bets.length));
mkdirSync(OUT, { recursive: true });
writeFileSync(outPath, a.text);

// ── self-check: the file as written, read back, against the capture files ─────────────────────────────────────
const bytes = readFileSync(outPath), ds = JSON.parse(bytes.toString('utf8'));
row(a.text === b.text, 'deterministic', `two conversions serialise to the same bytes (${sha256(Buffer.from(a.text))})`);
const capBets = a.folds.flatMap((f) => f.bets), capEpochs = a.folds.flatMap((f, i) => f.epochs.map((e) => ({ ...e, capture: i + 1 })));
row(ds.bets.length === capBets.length && ds.seeds.length === capEpochs.length, 'counts',
  `${ds.bets.length} bets out of ${capBets.length} settled rounds in the ${caps.length} captures (${a.folds.map((f) => f.bets.length).join(' + ')}); ${ds.seeds.length} seed records for ${capEpochs.length} epochs (${a.folds.map((f) => f.epochs.length).join(' + ')})`);
const cnt = (arr, key) => arr.reduce((m, x) => (m[key(x)] = (m[key(x)] ?? 0) + 1, m), {});
const capEpochOf = a.folds.map((f) => new Map(f.epochs.map((e) => [e.epoch, e])));
const capById = {}; a.folds.forEach((f, i) => { for (const r of f.bets) { const id = r.phaseId ?? capEpochOf[i].get(r.epoch).phaseId ?? r.phase; capById[id] = (capById[id] ?? 0) + 1; } });
const dsById = cnt(ds.bets, (x) => x.phaseId), dsByLetter = cnt(ds.bets, (x) => x.phase);
const idsOk = JSON.stringify(Object.entries(capById).sort()) === JSON.stringify(Object.entries(dsById).sort());
row(idsOk, 'bets per phase', `dataset ${Object.entries(dsById).map(([k, v]) => `${k} ${v}`).join(', ')} = the captures' ${Object.entries(capById).map(([k, v]) => `${k} ${v}`).join(', ')}; by letter ${Object.entries(dsByLetter).map(([k, v]) => `${k} ${v}`).join(', ')}; meta.phases ${Object.entries(ds.meta.phases).map(([k, v]) => `${k} ${v.bets} at ${v.stake} in ${v.epochs} epochs of ${v.epochSizes.join('/')}`).join(', ')}`);
const planned = {}; for (const f of a.folds) for (const e of f.meta.plan ?? []) { const id = e.id ?? e.phase; planned[id] = (planned[id] ?? 0) + e.bets.length; }
row(JSON.stringify(Object.entries(planned).sort()) === JSON.stringify(Object.entries(dsById).sort()), 'plan = played', `planned rounds per phase id in the captures' meta: ${Object.entries(planned).map(([k, v]) => `${k} ${v}`).join(', ')}; meta.plannedTotal ${ds.meta.plannedTotal}`);
const perEpoch = cnt(ds.bets, (x) => x.epoch);
const epochOk = ds.seeds.every((s) => perEpoch[s.epoch] === s.plannedBets) && Object.keys(perEpoch).length === ds.seeds.length;
row(epochOk, 'bets per epoch', `= the epoch's plannedBets on ${ds.seeds.filter((s) => perEpoch[s.epoch] === s.plannedBets).length}/${ds.seeds.length} epochs (sizes ${[...new Set(ds.seeds.map((s) => s.plannedBets))].sort((x, y) => x - y).join(', ')})`);
const seedBy = new Map(ds.seeds.map((s) => [s.epoch, s]));
let mapped = 0; const bad = [];
for (const x of ds.bets) { const s = seedBy.get(x.epoch); const ok = !!s && s.capture === x.capture && s.hashedServerSeed === x.hashedServerSeed && s.clientSeed === x.clientSeed && s.phase === x.phase && s.phaseId === x.phaseId && typeof s.serverSeed === 'string' && commitHash(s.serverSeed) === s.hashedServerSeed; if (ok) mapped++; else if (bad.length < 3) bad.push(x.id); }
const revealed = ds.seeds.filter((s) => typeof s.serverSeed === 'string' && commitHash(s.serverSeed) === s.hashedServerSeed).length;
row(mapped === ds.bets.length && revealed === ds.seeds.length, 'bet -> seed', `${mapped}/${ds.bets.length} bets carry their epoch seed record's commitment, client seed, capture and phase; ${revealed}/${ds.seeds.length} seed records revealed with sha256(serverSeed) = hashedServerSeed${bad.length ? `; e.g. ${bad.join(', ')}` : ''}`);
let links = 0, linkN = 0, anchors = 0;
for (const c of ds.meta.captures) {
  const ss = ds.seeds.filter((s) => s.capture === c.capture);
  if (c.preCapture.commitVerified === true && c.preCapture.nextHashedServerSeed === ss[0].hashedServerSeed && commitHash(c.preCapture.revealedServerSeed) === c.preCapture.hashedServerSeed) anchors++;
  for (let i = 1; i < ss.length; i++) { linkN++; if (ss[i - 1].nextHashedServerSeed === ss[i].hashedServerSeed) links++; }
}
row(links === linkN && anchors === ds.meta.captures.length && ds.seeds.every((s) => s.chainLinkOk === true), 'chain', `${links}/${linkN} epoch-to-epoch links inside the captures (next hash = the next epoch's commitment); ${anchors}/${ds.meta.captures.length} pre-capture anchors revealed, hashing to their commitment and announcing their capture's first epoch; chainLinkOk true on ${ds.seeds.filter((s) => s.chainLinkOk === true).length}/${ds.seeds.length} seed records`);
let seqOk = 0, endOk = 0;
for (const s of ds.seeds) { const ns = ds.bets.filter((x) => x.epoch === s.epoch).map((x) => x.nonce); if (ns.every((n, i) => n === s.nonceStart + i)) seqOk++; if (s.nonceEnd === ns.at(-1)) endOk++; }
row(seqOk === ds.seeds.length && endOk === ds.seeds.length, 'nonce sequence', `${seqOk}/${ds.seeds.length} epochs: nonces nonceStart, +1, ... in file order, no gap or repeat; nonceEnd = the last recorded nonce on ${endOk}/${ds.seeds.length}`);
const ids = new Set(ds.bets.map((x) => x.id));
const same = ds.bets.every((x, i) => x.id === capBets[i].betId && x.betAmount === capBets[i].stake && x.winningAmount === capBets[i].winningAmount && x.params.target === capBets[i].servedParams.target && x.result === capBets[i].outcome.result);
row(ids.size === ds.bets.length && same, 'ids', `${ids.size} distinct bet ids; bet i = the captures' bet event i (id, served stake, served winning amount, served target, served result) ${same ? 'on every row' : 'NO'}`);
const dSeeds = ds.seeds.filter((s) => s.phase === 'D'), player = ds.seeds.filter((s) => s.seedTag === 'player');
row(dSeeds.length === player.length && dSeeds.every((s) => s.seedTag === 'player') && new Set(dSeeds.map((s) => s.clientSeed)).size === dSeeds.length, 'player-set seeds', `Phase D: ${dSeeds.length} epochs, ${new Set(dSeeds.map((s) => s.clientSeed)).size} distinct player-set client seeds; player-set seeds outside Phase D: ${player.filter((s) => s.phase !== 'D').length}`);
const stakes = cnt(ds.bets, (x) => `${x.phaseId} ${x.betAmount}`);
row(null, 'stakes', Object.entries(stakes).map(([k, v]) => `${k}: ${v}`).join('; ') + `; currency ${ds.meta.currency}`);
// targets: per phase id, distinct targets and the range; decades over the whole file
const tg = {}; for (const x of ds.bets) { const t = tg[x.phaseId] ?? (tg[x.phaseId] = { set: new Set(), min: Infinity, max: -Infinity }); t.set.add(x.params.target); t.min = Math.min(t.min, x.params.target); t.max = Math.max(t.max, x.params.target); }
const dec = cnt(ds.bets.filter((x) => x.phase === 'A'), (x) => `1e${Math.floor(Math.log10(Math.round(x.params.target * 100) / 100))}`);
row(null, 'targets', Object.entries(tg).map(([k, t]) => `${k}: ${t.set.size} distinct, ${t.min}..${t.max}`).join('; ') + `; Phase A rounds per target decade ${Object.entries(dec).sort().map(([k, v]) => `${k} ${v}`).join(', ')}; rounds at exactly 10000: ${ds.bets.filter((x) => x.params.target === 10000).length}; rounds above 10000: ${ds.bets.filter((x) => x.params.target > 10000).length}`);
// verifier replies: one per round, the request is the round's revealed inputs, the reply equals the served round
let vReq = 0, vEq = 0;
for (const x of ds.bets) {
  const s = seedBy.get(x.epoch), v = x.verifier;
  if (v && v.status === 200 && v.request.serverSeed === s.serverSeed && v.request.clientSeed === x.clientSeed && v.request.nonce === x.nonce && v.request.target === x.params.target) vReq++;
  if (v && v.result === x.result && v.win === x.win && v.multiplier === x.multiplier) vEq++;
}
row(vReq === ds.bets.length && vEq === ds.bets.length, 'verifier replies', `${ds.bets.filter((x) => x.verifier?.status === 200).length}/${ds.bets.length} rounds carry an HTTP 200 verifier reply; request = the round's revealed seed, client seed, nonce and target on ${vReq}/${ds.bets.length}; reply result, win, multiplier = the served round on ${vEq}/${ds.bets.length}`);
const v = ds.bets.filter((x) => x.verified === true).length;
row(v === ds.bets.length, 'recompute', `verified === true on ${v}/${ds.bets.length} rows (the package's own src/rng.ts limboResult and src/config.ts limboWin)`);
const sha = sha256(bytes);
row(null, 'sha256', `${sha} (${bytes.length} bytes)`);
row(null, 'output', relative(WORKSHOP, outPath));
const ok = fails.length === 0;
L.unshift(`LIQD limbo prod (full: ${inputs.map((j) => j.phases.join(' ')).join(' | ')}) -> package dataset: ${ok ? 'SELF-CHECK PASS' : `SELF-CHECK FAIL (${fails.join('; ')})`}`);
writeFileSync(join(OUT, 'limbo-full.selfcheck.txt'), L.join('\n') + '\n');
console.log(L.join('\n'));
process.exit(ok ? 0 : 1);
