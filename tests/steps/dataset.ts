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
 * `CAPTURE_PLAN`, `EXPECTED_PHASES` in src/config.ts), and the header is RECONCILED against
 * them — evidence to be checked, never the plan itself. A count the artifact supplies is a count a
 * forger chooses.
 */

import type { StepResult, VerifyContext } from './context';
import { step, isHex, hundredths } from './context';
import {
  EXPECTED_BETS, EXPECTED_SEEDS, EXPECTED_CAPTURES, MAX_EPOCH_SIZE, EXPECTED_PHASES, EXPECTED_PHASE_IDS,
  CAPTURE_PLAN, EPOCH_PLAN, epochSize,
  PLANNED_TARGET_DECADES, PHASE_A_DECADE_FLOOR, MIN_MULTIPLIER,
  PROD_TARGET_LADDER, PROD_ROUNDS_PER_TARGET, PHASE_D_ROUNDS_PER_TARGET, PROD_LADDER_TOP,
  TOPUP_LOW, TOPUP_HIGH, TOPUP_ROUNDS_BELOW, TOPUP_ROUNDS_AT_TOP, PHASE_C_TARGET, PHASE_C_MIN_WINS,
  MIN_RESULT, MAX_MULTIPLIER, PROD_TOP_TARGET, limboWin, resultMultiplier,
} from '../../src/config';
import { limboDraw } from '../../src/rng';

export function run(ctx: VerifyContext): StepResult[] {
  const { bets, seeds, meta, datasetSha256, expectedDatasetHash, seedMap } = ctx;

  // ── Step 12: Dataset integrity & population identity ────────────────────────
  const hashOk = datasetSha256 === expectedDatasetHash;

  // (a) the population IS the audited population — against src/config.ts, never against meta
  const betCountOk = bets.length === EXPECTED_BETS;
  const seedCountOk = seeds.length === EXPECTED_SEEDS;

  // (b) the code plan adds up to the typed pins (so neither can move alone), every epoch holds exactly
  //     its planned number of bets, and the epoch count is the planned one
  const planBets = CAPTURE_PLAN.reduce((n, b) => n + b.epochs * b.size, 0);
  const planEpochs = CAPTURE_PLAN.reduce((n, b) => n + b.epochs, 0);
  const planCaptures = new Set(CAPTURE_PLAN.map((b) => b.capture)).size;
  const planOk = planBets === EXPECTED_BETS && planEpochs === EXPECTED_SEEDS && planCaptures === EXPECTED_CAPTURES
    && Math.max(...CAPTURE_PLAN.map((b) => b.size)) === MAX_EPOCH_SIZE && EPOCH_PLAN.length === EXPECTED_SEEDS;
  const perEpoch = new Map<number, number>();
  for (const b of bets) perEpoch.set(b.epoch, (perEpoch.get(b.epoch) ?? 0) + 1);
  const epochsOk = planOk && perEpoch.size === EXPECTED_SEEDS
    && [...perEpoch.entries()].every(([e, n]) => n === epochSize(e));

  // (c) each epoch's nonce window CLOSES: exactly 0..size-1, size from the code plan
  let epochsWithNonceGap = 0;
  const byEpochNonces = new Map<number, Set<number>>();
  for (const b of bets) {
    let s = byEpochNonces.get(b.epoch);
    if (!s) { s = new Set(); byEpochNonces.set(b.epoch, s); }
    s.add(b.nonce);
  }
  for (const [e, ns] of byEpochNonces) {
    const size = epochSize(e);
    let gap = !Number.isInteger(size);
    for (let i = 0; i < size; i++) if (!ns.has(i)) gap = true;
    if (gap || ns.size !== size) epochsWithNonceGap++;
  }

  // (d) 100% verifiable: every seed revealed, seed[0] not null
  const seed0Ok = seeds.length > 0 && seeds[0].serverSeed != null;
  const revealed = seeds.filter((s) => s.serverSeed != null).length;
  const allRevealed = revealed === seeds.length;

  // (e) the header and the per-record tags are RECONCILED against the constants, not trusted as the plan
  type Tagged = { capture?: number; phaseId?: string; seedTag?: string; plannedBets?: number };
  const headerCaptures = ((meta as unknown as { captures?: { capture: number; epochs: number; bets: number; firstEpoch: number; lastEpoch: number; status: string }[] }).captures ?? []);
  const capturesOk = headerCaptures.length === EXPECTED_CAPTURES && headerCaptures.every((c) => {
    const blocks = CAPTURE_PLAN.filter((b) => b.capture === c.capture);
    const first = EPOCH_PLAN.findIndex((b) => b.capture === c.capture);
    const n = blocks.reduce((x, b) => x + b.epochs, 0);
    return blocks.length > 0 && c.epochs === n && c.bets === blocks.reduce((x, b) => x + b.epochs * b.size, 0)
      && c.firstEpoch === first && c.lastEpoch === first + n - 1 && c.status === 'completed';
  });
  const seedTagsOk = seeds.every((s) => {
    const plan = EPOCH_PLAN[s.epoch]; const t = s as unknown as Tagged;
    return !!plan && s.phase === plan.phase && t.phaseId === plan.phaseId && t.capture === plan.capture && t.seedTag === plan.seedTag && t.plannedBets === plan.size;
  });
  const betTagsOk = bets.every((b) => {
    const plan = EPOCH_PLAN[b.epoch]; const t = b as unknown as Tagged;
    return !!plan && b.phase === plan.phase && t.phaseId === plan.phaseId && t.capture === plan.capture;
  });
  const metaAgrees = meta.plannedTotal === EXPECTED_BETS
    && (meta.progress?.bets as number | undefined) === EXPECTED_BETS
    && (meta.progress?.seeds as number | undefined) === EXPECTED_SEEDS
    && (meta.progress?.status as string | undefined) === 'completed'
    && capturesOk && seedTagsOk && betTagsOk;

  // (f) G-RANGE sweep over every scalar this suite reads from a bet record. Bounds come from
  //     src/config.ts and from the draw grid — never from the artifact being checked. This is the
  //     "reject the impossible" pass; it is deliberately NOT a "reject the surprising" pass, so
  //     nothing here treats an exact or round value as suspicious (G-VALID).
  const maxStake = Math.max(...Object.values(EXPECTED_PHASES).map((p) => p.stake));
  const maxCredit = maxStake * PROD_TOP_TARGET;   // no credit can exceed the largest planned stake at the top target
  let fieldViolations = 0;
  const violationKinds = new Set<string>();
  const noteBad = (kind: string) => { fieldViolations++; violationKinds.add(kind); };
  for (const b of bets) {
    if (!Number.isInteger(b.epoch) || b.epoch < 0 || b.epoch >= EXPECTED_SEEDS) noteBad(`epoch out of [0,${EXPECTED_SEEDS})`);
    if (!Number.isInteger(b.nonce) || b.nonce < 0 || b.nonce >= MAX_EPOCH_SIZE) noteBad(`nonce out of [0,${MAX_EPOCH_SIZE})`);
    if (!isHex(b.hashedServerSeed, 64)) noteBad('commitment not 64-hex');
    if (typeof b.clientSeed !== 'string' || b.clientSeed.length === 0) noteBad('empty client seed');
    if (typeof b.id !== 'string' || b.id.length === 0) noteBad('empty bet id');
    const result = Number(b.result);
    if (!Number.isFinite(result) || result < MIN_RESULT || result > MAX_MULTIPLIER) noteBad('result out of [1,1e6]');
    const stake = Number(b.betAmount);
    if (!Number.isFinite(stake) || stake <= 0 || stake > maxStake) noteBad('stake out of (0, largest planned stake]');
    const credit = Number(b.winningAmount);
    if (!Number.isFinite(credit) || credit < 0 || credit > maxCredit) noteBad('credit out of [0, largest planned stake x top target]');
    if (typeof b.win !== 'boolean') noteBad('win flag not boolean');
  }
  let seedFieldViolations = 0;
  for (const s of seeds) {
    if (!Number.isInteger(s.epoch) || s.epoch < 0 || s.epoch >= EXPECTED_SEEDS) seedFieldViolations++;
    if (!isHex(s.hashedServerSeed, 64) || !isHex(s.nextHashedServerSeed, 64)) seedFieldViolations++;
    if (s.serverSeed != null && !isHex(s.serverSeed, 32)) seedFieldViolations++;
  }

  // (g) bet ids are distinct — 5,838 settlements, not one settlement recorded 5,838 times
  const distinctIds = new Set(bets.map((b) => b.id)).size;

  const countsOk = betCountOk && seedCountOk && epochsOk && epochsWithNonceGap === 0 && metaAgrees
    && fieldViolations === 0 && seedFieldViolations === 0 && distinctIds === EXPECTED_BETS;

  const s12 = step(12, 'Dataset Integrity & Population Identity',
    hashOk && seed0Ok && allRevealed && countsOk ? 'PASS' : 'FAIL',
    `SHA-256 pin ${hashOk ? 'match' : 'MISMATCH'} (${datasetSha256.slice(0, 16)}… vs ${expectedDatasetHash.slice(0, 16)}…); `
    + `population bound to src/config.ts, NOT to the dataset header (G-BIND): ${bets.length}/${EXPECTED_BETS} bets (${betCountOk ? 'ok' : 'WRONG POPULATION'}), `
    + `${seeds.length}/${EXPECTED_SEEDS} seeds (${seedCountOk ? 'ok' : 'WRONG POPULATION'}), ${perEpoch.size} epochs each holding exactly its planned number of bets `
    + `(${CAPTURE_PLAN.map((b) => `${b.epochs} x ${b.size} ${b.phaseId}`).join(' + ')} = ${planBets}; ${epochsOk ? 'ok' : 'EPOCH SIZE/COUNT MISMATCH'}; the code plan adds up to the typed pins ${EXPECTED_BETS} / ${EXPECTED_SEEDS} / ${EXPECTED_CAPTURES} runs: ${planOk}), `
    + `${epochsWithNonceGap} epoch(s) whose nonce window 0..size-1 does not close; `
    + `${distinctIds}/${EXPECTED_BETS} distinct bet ids; `
    + `dataset header and record tags reconcile with those constants (meta.plannedTotal=${meta.plannedTotal}, meta.progress.bets=${meta.progress?.bets}, meta.progress.seeds=${meta.progress?.seeds}, ${headerCaptures.length} runs in meta.captures each completed with its planned epochs and bets: ${capturesOk}; capture / phase / plan-entry / seed-tag / plannedBets on every seed record: ${seedTagsOk}; capture / phase / plan-entry on every bet: ${betTagsOk}); `
    + `seed[0].serverSeed ${seed0Ok ? 'present' : 'NULL'}; ${revealed}/${seeds.length} seeds revealed (100% verifiable ${allRevealed ? 'yes' : 'NO'}); `
    + `G-RANGE field sweep: ${fieldViolations} bet-field and ${seedFieldViolations} seed-field values outside their physically possible bounds`
    + (violationKinds.size ? ` [${[...violationKinds].join(', ')}]` : ''),
  );

  // ── Step 13: Phase plan conformance ─────────────────────────────────────────
  // The plan is the constants of src/config.ts, not `meta.phases` inside the evidence. Checked in both
  // directions (every declared phase present at its declared count and stake, and no phase in the data
  // that the plan does not declare), then the header reconciled against the same constants.
  //   Phase A  (5,000): the 50-target ladder 1.01x..100x, 100 rounds per target, 0.10 USDT.
  //   Phase A+ (100):   the top-up: 50 rounds on targets in [1000, 10000) and 50 at exactly 10,000x, 0.10 USDT.
  //   Phase D  (500):   the same ladder, 10 rounds per target, under 5 player-set client seeds (Step 18), 0.10 USDT.
  //   Phase C  (238):   one target, 2.00x, at 10.00 USDT — the elevated-stake phase (profile LIMBO-12):
  //                     at least PHASE_C_MIN_WINS wins must go through the payout path, and every round
  //                     must settle by the same rule as a 0.10 round at the same target.
  const byPhase: Record<string, number> = {};
  const byPhaseId: Record<string, number> = {};
  const stakesByPhase: Record<string, Set<number>> = {};
  const idOf = (b: unknown) => String((b as { phaseId?: string }).phaseId);
  for (const b of bets) {
    byPhase[b.phase] = (byPhase[b.phase] || 0) + 1;
    byPhaseId[idOf(b)] = (byPhaseId[idOf(b)] || 0) + 1;
    (stakesByPhase[b.phase] ||= new Set()).add(Number(b.betAmount));
  }
  const planEntries = Object.entries(EXPECTED_PHASES) as [string, { bets: number; stake: number }][];
  const countsMatch = planEntries.every(([k, p]) => byPhase[k] === p.bets)
    && Object.entries(EXPECTED_PHASE_IDS).every(([k, n]) => byPhaseId[k] === n);
  const noStrayPhase = Object.keys(byPhase).every((k) => k in EXPECTED_PHASES) && Object.keys(byPhaseId).every((k) => k in EXPECTED_PHASE_IDS);
  const stakesMatch = planEntries.every(([k, p]) => {
    const st = stakesByPhase[k];
    return !!st && st.size === 1 && hundredths([...st][0]) === hundredths(p.stake);
  });
  const metaPhasesOk = planEntries.every(([k, p]) => meta.phases?.[k]?.bets === p.bets && hundredths(Number(meta.phases?.[k]?.amount)) === hundredths(p.stake))
    && Object.keys(meta.phases ?? {}).every((k) => k in EXPECTED_PHASES) && meta.currency === 'USDT';

  // The ladder (plan entries A and D): exactly the 50 code targets at exactly the planned count each.
  const ladderH = PROD_TARGET_LADDER.map((t) => hundredths(t));
  const tally = (id: string) => { const m = new Map<number, number>(); for (const b of bets) if (idOf(b) === id) { const h = hundredths(Number(b.params.target)); m.set(h, (m.get(h) ?? 0) + 1); } return m; };
  const perTargetA = tally('A'), perTargetD = tally('D'), perTargetC = tally('C'), perTargetTop = tally('A+');
  const exact = (m: Map<number, number>, n: number) => m.size === ladderH.length && ladderH.every((h) => m.get(h) === n);
  const ladderA = exact(perTargetA, PROD_ROUNDS_PER_TARGET), ladderD = exact(perTargetD, PHASE_D_ROUNDS_PER_TARGET);
  const ladderShape = PROD_TARGET_LADDER.length * PROD_ROUNDS_PER_TARGET === EXPECTED_PHASE_IDS['A']
    && PROD_TARGET_LADDER.length * PHASE_D_ROUNDS_PER_TARGET === EXPECTED_PHASE_IDS['D']
    && Math.max(...PROD_TARGET_LADDER) === PROD_LADDER_TOP && Math.min(...PROD_TARGET_LADDER) === MIN_MULTIPLIER;
  const headerLadder = Array.isArray((meta as unknown as { ladder?: unknown }).ladder) ? ((meta as unknown as { ladder: unknown[] }).ladder).map(Number) : [];
  const headerLadderOk = headerLadder.length === PROD_TARGET_LADDER.length && headerLadder.every((t, i) => hundredths(t) === ladderH[i]);
  // The top-up (A+): TOPUP_ROUNDS_BELOW rounds inside [TOPUP_LOW, TOPUP_HIGH) and TOPUP_ROUNDS_AT_TOP at exactly TOPUP_HIGH.
  let topBelow = 0, topAt = 0, topOther = 0;
  for (const [h, n] of perTargetTop) { if (h === hundredths(TOPUP_HIGH)) topAt += n; else if (h >= hundredths(TOPUP_LOW) && h < hundredths(TOPUP_HIGH)) topBelow += n; else topOther += n; }
  const topupOk = topBelow === TOPUP_ROUNDS_BELOW && topAt === TOPUP_ROUNDS_AT_TOP && topOther === 0 && TOPUP_HIGH === PROD_TOP_TARGET
    && TOPUP_ROUNDS_BELOW + TOPUP_ROUNDS_AT_TOP === EXPECTED_PHASE_IDS['A+'];
  // Phase C: one target; wins through the payout path; every round settles as the rule says at the elevated stake.
  const phaseC = bets.filter((b) => b.phase === 'C');
  const cTargetOk = perTargetC.size === 1 && perTargetC.get(hundredths(PHASE_C_TARGET)) === EXPECTED_PHASES.C.bets;
  let cWins = 0, cRuleFails = 0;
  for (const b of phaseC) {
    const ss = seedMap.get(b.hashedServerSeed);
    const stake = Number(b.betAmount), target = Number(b.params.target);
    const win = !!ss && limboWin(resultMultiplier(limboDraw(ss, b.clientSeed, b.nonce)), target);
    if (win) cWins++;
    const credit = win ? hundredths(stake) * hundredths(target) * 1e4 : 0;
    if (!ss || win !== b.win || Math.round(Number(b.winningAmount) * 1e8) !== credit || Number(b.multiplier) !== (win ? target : 0)) cRuleFails++;
  }
  // 2.00x is not on the 0.10 ladder, so there is no base-stake round at the same target to pair with: the
  // comparison is rule against rule (the elevated-stake rounds settle by the rule every 0.10 round settles by, Steps 5-10).
  const phaseCOk = cTargetOk && cRuleFails === 0 && cWins >= PHASE_C_MIN_WINS && EXPECTED_PHASES.C.stake > EXPECTED_PHASES.A.stake;

  // Target coverage by decade (profile LIMBO-15), Phase A rounds (A and A+), against PLANNED_TARGET_DECADES.
  const decadeCount = new Map<number, number>();
  for (const b of bets) {
    if (b.phase !== 'A') continue;
    const d = Math.floor(Math.log10(hundredths(Number(b.params.target)) / 100));
    decadeCount.set(d, (decadeCount.get(d) ?? 0) + 1);
  }
  const planDecades = Object.entries(PLANNED_TARGET_DECADES).map(([d, n]) => [Number(d), n] as const);
  const topDecade = Math.floor(Math.log10(PROD_TOP_TARGET));
  const decadesOk = planDecades.every(([d, n]) => (decadeCount.get(d) ?? 0) === n && n >= PHASE_A_DECADE_FLOOR)
    && [...decadeCount.keys()].every((d) => d in PLANNED_TARGET_DECADES)
    && planDecades.length === topDecade + 1;   // every decade from 10^0 to the decade of the top target is in the plan
  const minTargetSeen = Math.min(...bets.map((b) => Number(b.params.target)));
  const maxTargetSeen = Math.max(...bets.map((b) => Number(b.params.target)));
  const aboveTop = bets.filter((b) => hundredths(Number(b.params.target)) > hundredths(PROD_TOP_TARGET)).length;
  const coverageOk = decadesOk && minTargetSeen === MIN_MULTIPLIER && maxTargetSeen === PROD_TOP_TARGET && aboveTop === 0;
  // What the capture did NOT exercise at the high end, measured so the limitation carries its number:
  const highestWinningTarget = Math.max(...bets.filter((b) => b.win).map((b) => Number(b.params.target)));
  const winsAtOrAbove1000 = bets.filter((b) => b.win && Number(b.params.target) >= TOPUP_LOW).length;

  const s13 = step(13, 'Phase Plan Conformance',
    countsMatch && noStrayPhase && stakesMatch && metaPhasesOk && ladderA && ladderD && ladderShape && headerLadderOk
      && topupOk && phaseCOk && coverageOk ? 'PASS' : 'FAIL',
    `phases ${JSON.stringify(byPhase)} and plan entries ${JSON.stringify(byPhaseId)} match the CODE plan ${JSON.stringify(Object.fromEntries(planEntries.map(([k, p]) => [k, p.bets])))} / ${JSON.stringify(EXPECTED_PHASE_IDS)} (${countsMatch}), no undeclared phase present (${noStrayPhase}); `
    + `each phase ran at its planned stake (${stakesMatch}: ${planEntries.map(([k, p]) => `${k} ${p.stake.toFixed(2)} ${meta.currency}`).join(', ')}); `
    + `the header's per-phase bet counts, stakes and currency reconcile (${metaPhasesOk}); `
    + `TARGET LADDER: Phase A holds ${perTargetA.size} distinct targets against the ${PROD_TARGET_LADDER.length} of PROD_TARGET_LADDER in src/config.ts, each played exactly ${PROD_ROUNDS_PER_TARGET} times (${ladderA}); Phase D holds the same ${perTargetD.size}, each exactly ${PHASE_D_ROUNDS_PER_TARGET} times (${ladderD}); `
    + `the ladder recorded in the header (meta.ladder) is the same list (${headerLadderOk}); `
    + `TOP-UP (A+): ${topBelow}/${TOPUP_ROUNDS_BELOW} rounds on targets in [${TOPUP_LOW}, ${TOPUP_HIGH}) (${perTargetTop.size - (topAt > 0 ? 1 : 0)} distinct), ${topAt}/${TOPUP_ROUNDS_AT_TOP} at exactly ${TOPUP_HIGH}x, ${topOther} elsewhere (${topupOk}); `
    + `PHASE C, BET-SIZE INVARIANCE (profile LIMBO-12): ${phaseC.length} rounds at ${EXPECTED_PHASES.C.stake.toFixed(2)} ${meta.currency} (${EXPECTED_PHASES.C.stake / EXPECTED_PHASES.A.stake} times the base stake) on the single target ${PHASE_C_TARGET.toFixed(2)}x (${cTargetOk}); `
    + `every one recomputes from its revealed seed and is settled by the base-stake rule (win == R >= target, credit == stake x target exactly, multiplier == target; 0 on a loss): ${cRuleFails} deviations; ${cWins} wins went through the payout path (floor ${PHASE_C_MIN_WINS}: ${cWins >= PHASE_C_MIN_WINS}); `
    + `TARGET COVERAGE by decade, Phase A rounds against PLANNED_TARGET_DECADES (floor ${PHASE_A_DECADE_FLOOR} per decade): ${planDecades.map(([d, n]) => `10^${d} ${decadeCount.get(d) ?? 0}/${n}`).join(', ')} (${decadesOk}); `
    + `minimum target ${MIN_MULTIPLIER}x played (${minTargetSeen === MIN_MULTIPLIER}); highest target played ${maxTargetSeen}x = PROD_TOP_TARGET, ${aboveTop} rounds above it. `
    + `NOT EXERCISED, a capture limit and not a finding about the casino: ${winsAtOrAbove1000} of the ${topBelow + topAt} rounds at ${TOPUP_LOW}x and above won (their win chances are 0.0099% to 0.099% each), so the highest target on which a production WIN was paid is ${highestWinningTarget}x; `
    + `above it the payout rule rests on the losses settling as the rule says, on the verifier replies (Step 25) and on the closed form (Steps 15-16)`,
  );

  return [s12, s13];
}
