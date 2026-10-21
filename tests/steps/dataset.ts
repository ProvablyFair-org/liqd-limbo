/**
 * Steps 12–13: Dataset integrity, POPULATION identity, and the phase plan.
 *
 * ── POPULATION BINDING (G-BIND) ─────────────────────────────────────────────────────────────────
 * The obvious way to write these steps is to compare `bets.length` against `meta.plannedTotal` and
 * the observed phase counts against `meta.phases`. Every one of those fields lives INSIDE the file
 * being scored, so the plan would be self-referential: shrink the data, doctor the header, re-pin
 * the SHA-256, and the repo is internally consistent again. That exact forgery was executed against
 * the sibling dice audit — nonces 30..49 deleted from every epoch, `epochSize` set to 30,
 * `plannedTotal` to 4020 — and the suite returned a clean Full Pass on a 4,020-bet dataset.
 *
 * The SHA pin cannot help. It proves the file has not changed since WE pinned it; it says nothing
 * about whether the file is the capture.
 *
 * So the expected cardinality comes from CODE constants (`EXPECTED_BETS`, `EXPECTED_SEEDS`,
 * `EXPECTED_EPOCH_SIZE`, `EXPECTED_PHASES` in src/config.ts), and the header is RECONCILED against
 * them — evidence to be checked, never the plan itself. A count the artifact supplies is a count a
 * forger chooses.
 */

import type { StepResult, VerifyContext } from './context';
import { limboDraw } from '../../src/rng';
import { step, isHex, hundredths } from './context';
import {
  EXPECTED_BETS, EXPECTED_SEEDS, EXPECTED_EPOCH_SIZE, EXPECTED_PHASES,
  PLANNED_TARGET_DECADES, PHASE_C_MIN_WINS, UI_MAX_TARGET, MAX_PLAYABLE_TARGET, MIN_MULTIPLIER,
  resultMultiplier, limboWin,
  MIN_RESULT, MAX_MULTIPLIER, MAX_EXPOSURE_USDC, LIVE_TARGET_CEILING, LIVE_TARGET_CEILING_WITNESSED,
} from '../../src/config';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, seeds, meta, datasetSha256, expectedDatasetHash } = ctx;

  // ── Step 12: Dataset integrity & population identity ────────────────────────
  const hashOk = datasetSha256 === expectedDatasetHash;

  // (a) the population IS the audited population — against src/config.ts, never against meta
  const betCountOk = bets.length === EXPECTED_BETS;
  const seedCountOk = seeds.length === EXPECTED_SEEDS;

  // (b) every epoch is a full epoch, the epoch count is the audited one, and the three constants
  //     are mutually consistent (134 x 50 == 6,700) — so no pair of them can be satisfied by
  //     trading bets between epochs
  const perEpoch = new Map<number, number>();
  for (const b of bets) perEpoch.set(b.epoch, (perEpoch.get(b.epoch) ?? 0) + 1);
  const epochsOk = perEpoch.size === EXPECTED_SEEDS
    && [...perEpoch.values()].every((n) => n === EXPECTED_EPOCH_SIZE)
    && EXPECTED_SEEDS * EXPECTED_EPOCH_SIZE === EXPECTED_BETS;

  // (c) each epoch's nonce window CLOSES: exactly 0..EXPECTED_EPOCH_SIZE-1, no hole absorbed by a
  //     shrunken declared epoch size, because the size is no longer declared by the artifact
  let epochsWithNonceGap = 0;
  const byEpochNonces = new Map<number, Set<number>>();
  for (const b of bets) {
    let s = byEpochNonces.get(b.epoch);
    if (!s) { s = new Set(); byEpochNonces.set(b.epoch, s); }
    s.add(b.nonce);
  }
  for (const [, ns] of byEpochNonces) {
    let gap = false;
    for (let i = 0; i < EXPECTED_EPOCH_SIZE; i++) if (!ns.has(i)) gap = true;
    if (gap || ns.size !== EXPECTED_EPOCH_SIZE) epochsWithNonceGap++;
  }

  // (d) 100% verifiable: every seed revealed, seed[0] not null (the recurring pre-delivery miss)
  const seed0Ok = seeds.length > 0 && seeds[0].serverSeed != null;
  const revealed = seeds.filter((s) => s.serverSeed != null).length;
  const allRevealed = revealed === seeds.length;

  // (e) the header is RECONCILED against the constants, not trusted as the plan
  const metaAgrees = meta.plannedTotal === EXPECTED_BETS
    && meta.epochSize === EXPECTED_EPOCH_SIZE
    && (meta.progress?.bets as number | undefined) === EXPECTED_BETS
    && (meta.progress?.seeds as number | undefined) === EXPECTED_SEEDS;

  // (f) G-RANGE sweep over every scalar this suite reads from a bet record. Bounds come from
  //     src/config.ts and from the draw grid — never from the artifact being checked. This is the
  //     "reject the impossible" pass; it is deliberately NOT a "reject the surprising" pass, so
  //     nothing here treats an exact or round value as suspicious (G-VALID).
  let fieldViolations = 0;
  const violationKinds = new Set<string>();
  const noteBad = (kind: string) => { fieldViolations++; violationKinds.add(kind); };
  for (const b of bets) {
    if (!Number.isInteger(b.epoch) || b.epoch < 0 || b.epoch >= EXPECTED_SEEDS) noteBad('epoch out of [0,134)');
    if (!Number.isInteger(b.nonce) || b.nonce < 0 || b.nonce >= EXPECTED_EPOCH_SIZE) noteBad('nonce out of [0,50)');
    if (!isHex(b.hashedServerSeed, 64)) noteBad('commitment not 64-hex');
    if (typeof b.clientSeed !== 'string' || b.clientSeed.length === 0) noteBad('empty client seed');
    if (typeof b.id !== 'string' || b.id.length === 0) noteBad('empty bet id');
    const result = Number(b.result);
    if (!Number.isFinite(result) || result < MIN_RESULT || result > MAX_MULTIPLIER) noteBad('result out of [1,1e6]');
    const stake = Number(b.betAmount);
    if (!Number.isFinite(stake) || stake <= 0) noteBad('non-positive stake');
    const credit = Number(b.winningAmount);
    if (!Number.isFinite(credit) || credit < 0 || credit > MAX_EXPOSURE_USDC) noteBad('credit out of [0,maxExposure]');
    if (typeof b.win !== 'boolean') noteBad('win flag not boolean');
    if (hundredths(stake) * hundredths(Number(b.params.target)) > MAX_EXPOSURE_USDC * 1e4) noteBad('exposure over ceiling');
  }
  let seedFieldViolations = 0;
  for (const s of seeds) {
    if (!Number.isInteger(s.epoch) || s.epoch < 0 || s.epoch >= EXPECTED_SEEDS) seedFieldViolations++;
    if (!isHex(s.hashedServerSeed, 64) || !isHex(s.nextHashedServerSeed, 64)) seedFieldViolations++;
    if (s.serverSeed != null && !isHex(s.serverSeed, 32)) seedFieldViolations++;
  }

  // (g) bet ids are distinct — 6,700 settlements, not one settlement recorded 6,700 times
  const distinctIds = new Set(bets.map((b) => b.id)).size;

  const countsOk = betCountOk && seedCountOk && epochsOk && epochsWithNonceGap === 0 && metaAgrees
    && fieldViolations === 0 && seedFieldViolations === 0 && distinctIds === EXPECTED_BETS;

  const s12 = step(12, 'Dataset Integrity & Population Identity',
    hashOk && seed0Ok && allRevealed && countsOk ? 'PASS' : 'FAIL',
    `SHA-256 pin ${hashOk ? 'match' : 'MISMATCH'} (${datasetSha256.slice(0, 16)}… vs ${expectedDatasetHash.slice(0, 16)}…); `
    + `population bound to src/config.ts, NOT to the dataset header (G-BIND): ${bets.length}/${EXPECTED_BETS} bets (${betCountOk ? 'ok' : 'WRONG POPULATION'}), `
    + `${seeds.length}/${EXPECTED_SEEDS} seeds (${seedCountOk ? 'ok' : 'WRONG POPULATION'}), ${perEpoch.size} epochs x ${EXPECTED_EPOCH_SIZE} bets each (${epochsOk ? 'ok' : 'EPOCH SIZE/COUNT MISMATCH'}, and ${EXPECTED_SEEDS} x ${EXPECTED_EPOCH_SIZE} == ${EXPECTED_BETS} so the three constants cannot be satisfied by moving bets between epochs), `
    + `${epochsWithNonceGap} epoch(s) whose nonce window 0..${EXPECTED_EPOCH_SIZE - 1} does not close; `
    + `${distinctIds}/${EXPECTED_BETS} distinct bet ids; `
    + `dataset header reconciles with those constants (meta.plannedTotal=${meta.plannedTotal}, meta.epochSize=${meta.epochSize}, meta.progress.bets=${meta.progress?.bets}, meta.progress.seeds=${meta.progress?.seeds}: ${metaAgrees ? 'ok' : 'DISAGREES'}); `
    + `seed[0].serverSeed ${seed0Ok ? 'present' : 'NULL'}; ${revealed}/${seeds.length} seeds revealed (100% verifiable ${allRevealed ? 'yes' : 'NO'}); `
    + `G-RANGE field sweep: ${fieldViolations} bet-field and ${seedFieldViolations} seed-field values outside their physically possible bounds`
    + (violationKinds.size ? ` [${[...violationKinds].join(', ')}]` : ''),
  );

  // ── Step 13: Phase plan conformance ─────────────────────────────────────────
  // The plan is EXPECTED_PHASES in code, not `meta.phases` inside the evidence. Checked in both
  // directions — every declared phase present at its declared count and stake, and no phase in the
  // data that the plan does not declare — then the header's per-phase BET COUNTS reconciled against the
  // same constants. Only the counts: the header's Phase B label ("100/1000/100k/1M") is a fixed string in
  // the capture script, and the dataset holds no bet at 1,000,000x; the dataset is pinned, so the header
  // stays as it is and the step prints the label beside the count.
  //
  // Phase B is where the plan carries a FINDING rather than a parameter: its top tranche is
  // 500,000x, NOT the 1,000,000x maximum target in LIQD's client code, because at the $0.10 minimum stake a
  // 1,000,000x bet needs $100,000 of exposure against a $50,000 ceiling. Step 17 scores that
  // finding; this step's job is to confirm the capture executed the plan that the finding forced,
  // so that 500,000x is never silently read as "the maximum".
  const byPhase: Record<string, number> = {};
  const stakesByPhase: Record<string, Set<number>> = {};
  for (const b of bets) {
    byPhase[b.phase] = (byPhase[b.phase] || 0) + 1;
    (stakesByPhase[b.phase] ||= new Set()).add(Number(b.betAmount));
  }
  const planEntries = Object.entries(EXPECTED_PHASES) as [string, { bets: number; stake: number; targets?: readonly number[] }][];
  const countsMatch = planEntries.every(([k, p]) => byPhase[k] === p.bets);
  const noStrayPhase = Object.keys(byPhase).every((k) => k in EXPECTED_PHASES);
  const stakesMatch = planEntries.every(([k, p]) => {
    const s = stakesByPhase[k];
    return !!s && s.size === 1 && hundredths([...s][0]) === hundredths(p.stake);
  });
  const metaPhasesOk = planEntries.every(([k, p]) => meta.phases?.[k]?.bets === p.bets)
    && Object.keys(meta.phases ?? {}).every((k) => k in EXPECTED_PHASES);

  // Phase B tranches: the four declared targets, each at an equal share of the phase.
  const planB = EXPECTED_PHASES.B;
  const bTargets = new Map<number, number>();
  for (const b of bets) if (b.phase === 'B') bTargets.set(Number(b.params.target), (bTargets.get(Number(b.params.target)) ?? 0) + 1);
  const expectedPerTranche = planB.bets / planB.targets.length;
  const tranchesOk = planB.targets.every((t) => bTargets.get(t) === expectedPerTranche)
    && bTargets.size === planB.targets.length;

  // Stake independence: two stakes present, an order of magnitude apart, with the $10 phase pinned
  // to a single target so the comparison is like-for-like.
  const stakes = [...new Set(bets.map((b) => Number(b.betAmount)))].sort((a, z) => a - z);
  const phaseCTargets = new Set(bets.filter((b) => b.phase === 'C').map((b) => Number(b.params.target)));
  const stakeSpreadOk = stakes.length >= 2 && phaseCTargets.size === 1;

  // Phase D must actually use auditor-chosen client seeds — otherwise the client-seed control in
  // Step 18 would be scored over operator-generated seeds and prove nothing.
  const dCustom = bets.filter((b) => b.phase === 'D' && /^pfaudit-/.test(b.clientSeed)).length;
  const dOk = dCustom === EXPECTED_PHASES.D.bets;

  // Elevated stake (profile LIMBO-12): every Phase C bet is recomputed here from primitives and must
  // settle by exactly the rule a base-stake bet at the same target settles by — the win rule on the
  // recomputed R, and a credit of exactly stake x target in integer hundredths — and at least
  // PHASE_C_MIN_WINS of them must be WINS, so the payout path (not only the result) is exercised at
  // the elevated stake. The pricing has no stake input at all (winChance(m) is a function of m only).
  let cRecomputed = 0, cWins = 0, cBad = 0;
  for (const b of bets) {
    if (b.phase !== 'C') continue;
    const ss = ctx.seedMap.get(b.hashedServerSeed);
    if (!ss) { cBad++; continue; }
    const R = resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce));
    const win = limboWin(R, Number(b.params.target));
    const credit = win ? hundredths(Number(b.betAmount)) * hundredths(Number(b.params.target)) : 0;
    if (R !== Number(b.result) || win !== !!b.win || Math.round(Number(b.winningAmount) * 1e4) !== credit) cBad++;
    if (win) cWins++;
    cRecomputed++;
  }
  const phaseCOk = cRecomputed === EXPECTED_PHASES.C.bets && cBad === 0 && cWins >= PHASE_C_MIN_WINS;

  // Target coverage by decade (profile LIMBO-15), against PLANNED_TARGET_DECADES in src/config.ts.
  const decadeCount = new Map<number, number>();
  for (const b of bets) {
    const d = Math.floor(Math.log10(hundredths(Number(b.params.target)) / 100));
    decadeCount.set(d, (decadeCount.get(d) ?? 0) + 1);
  }
  const planDecades = Object.entries(PLANNED_TARGET_DECADES).map(([d, n]) => [Number(d), n] as const);
  const decadesOk = planDecades.every(([d, n]) => (decadeCount.get(d) ?? 0) >= n);
  const highestPlanned = Math.max(...planDecades.map(([d]) => d));
  const unplannedGaps: number[] = [];
  for (let d = 0; d <= highestPlanned; d++) if (!(d in PLANNED_TARGET_DECADES) && !(decadeCount.get(d))) unplannedGaps.push(d);
  const minTargetSeen = Math.min(...bets.map((b) => Number(b.params.target)));
  const belowUiCap = bets.filter((b) => Number(b.params.target) <= UI_MAX_TARGET).length;
  const aboveUiCap = bets.filter((b) => Number(b.params.target) > UI_MAX_TARGET && Number(b.params.target) <= MAX_PLAYABLE_TARGET).length;
  const coverageOk = decadesOk && minTargetSeen === MIN_MULTIPLIER && belowUiCap > 0 && aboveUiCap > 0;

  const s13 = step(13, 'Phase Plan Conformance',
    countsMatch && noStrayPhase && stakesMatch && metaPhasesOk && tranchesOk && stakeSpreadOk && dOk
      && phaseCOk && coverageOk ? 'PASS' : 'FAIL',
    `phases ${JSON.stringify(byPhase)} match the CODE plan ${JSON.stringify(Object.fromEntries(planEntries.map(([k, p]) => [k, p.bets])))} (${countsMatch}), no undeclared phase present (${noStrayPhase}); `
    + `each phase ran at its planned stake (${stakesMatch}: ${planEntries.map(([k, p]) => `${k} $${p.stake}`).join(', ')}); `
    + `the header's per-phase bet counts reconcile (${metaPhasesOk}); its Phase B label reads ${JSON.stringify(String(meta.phases?.B?.target ?? ''))}, a fixed string in the capture script, and the dataset has ${bets.filter((b) => Number(b.params.target) === 1_000_000).length} bets at ${1_000_000}x; `
    + `Phase B tranches ${planB.targets.map((t) => `${t}x:${bTargets.get(t) ?? 0}`).join(', ')} — ${expectedPerTranche} bets each as planned (${tranchesOk}). `
    + `The top tranche is ${planB.targets[planB.targets.length - 1]}x and NOT the ${1_000_000}x maximum target in LIQD's client code: that is a FINDING, scored in Step 17, not a choice of coverage; `
    + `stake independence: stakes ${stakes.map((s) => `$${s}`).join(', ')} with Phase C pinned to a single target ${[...phaseCTargets].join(',')}x (${stakeSpreadOk}); `
    + `Phase D custom client seeds (pfaudit-) on ${dCustom}/${EXPECTED_PHASES.D.bets} bets (${dOk}); `
    + `ELEVATED STAKE: ${cRecomputed}/${EXPECTED_PHASES.C.bets} Phase C bets recomputed from primitives, ${cBad} settled differently from the base-stake rule (result, win flag or credit = stake x target in integer hundredths), `
    + `${cWins} elevated-stake WINS through the payout path against a floor of ${PHASE_C_MIN_WINS} (${phaseCOk}); `
    + `TARGET COVERAGE by decade against PLANNED_TARGET_DECADES: ${planDecades.map(([d, n]) => `10^${d} ${decadeCount.get(d) ?? 0}/${n}`).join(', ')} (${decadesOk}); `
    + `minimum legal target ${MIN_MULTIPLIER}x played (${minTargetSeen === MIN_MULTIPLIER}); ${belowUiCap} bets at or below the ${UI_MAX_TARGET}x UI cap and ${aboveUiCap} above it up to ${MAX_PLAYABLE_TARGET}x (server-accepted on 2026-09-11; on ${LIVE_TARGET_CEILING_WITNESSED} the live API refused a target above ${LIVE_TARGET_CEILING}x — Step 25); `
    + `${[...decadeCount.keys()].length} decades reached, ${new Set(bets.map((b) => Number(b.params.target))).size} distinct targets; `
    + (unplannedGaps.length ? `decade${unplannedGaps.length > 1 ? 's' : ''} ${unplannedGaps.map((d) => `10^${d} (${10 ** d}x..${10 ** (d + 1) - 0.01}x)`).join(', ')} UNPLAYED in this dataset — outside the 2026-09-11 capture plan, a capture-origin coverage gap disclosed here, not a finding about the operator; Phase A coverage up to the declared ceiling, decade 10^4 included, is Step 25 on the 2026-09-26 supplement` : 'no unplanned decade gap'),
  );

  return [s12, s13];
}
