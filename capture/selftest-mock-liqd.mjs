// ============================================================================
//  selftest-mock-liqd.mjs — an OFFLINE stand-in for qa.liqd.com, used only by the capture self-tests.
//  It makes no network call. It keeps a seed pair per account the way LIQD's shared provably-fair core
//  does (active + committed next, nonce, rotate reveals), and settles keno / limbo / mines rounds with
//  the algorithms the game scripts pass in, so the capture-time recomputation is exercised for real.
//  Fault injection (`faults`) lets a test drop a response AFTER the server acted, send a 429, refuse
//  a keno risk, expire the cookie mid-run, or plant secret-looking fields in a response.
//  The SAME file sits in keno/, mines/ and limbo/ capture folders.
// ============================================================================
import { randomBytes, createHash } from 'node:crypto';

const hash = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const seed = () => randomBytes(16).toString('hex');

export function createMock({ kenoDraw, kenoPaytable, minesFor, minesMult, limboResult, perStepMultiplier = true, faults = {} } = {}) {
  const st = { active: seed(), next: seed(), clientSeed: 'initial-seed', nonce: 0, games: [], requests: 0, idem: new Map(), mine: null, log: [] };
  const f = { dropAfterAct: new Set(faults.dropAfterAct ?? []), rate429: new Set(faults.rate429 ?? []), authAt: faults.authAt ?? null,
    refuseKenoModes: new Set(faults.refuseKenoModes ?? []), plantSecrets: !!faults.plantSecrets, echoCookieValue: faults.echoCookieValue ?? null };
  const ok = (data) => ({ status: 200, text: JSON.stringify(data) });
  const apiErr = (status, errorCode, name, fields = {}) => ({ status, text: JSON.stringify({ data: null, errors: [{ name, errorCode, fields }] }) });
  const seedState = () => ({ activeServerSeedHash: hash(st.active), nextServerSeedHash: hash(st.next), clientSeed: st.clientSeed, nonce: st.nonce, gamesInProgress: st.mine ? [{ game: 'mines' }] : [] });
  const plant = (o) => (f.plantSecrets ? { ...o, user: { email: 'someone@example.com', accessToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig' } } : o);

  function handle(method, path, body) {
    if (path.endsWith('/fast-games/provably-fair/active')) return ok(plant(seedState()));
    if (path.endsWith('/fast-games/provably-fair/rotate')) {
      const revealed = st.active; st.active = st.next; st.next = seed(); st.clientSeed = body.clientSeed; st.nonce = 0;
      return ok({ revealedServerSeed: revealed, ...seedState() });
    }
    if (path.endsWith('/originals/keno/place-bet')) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(body.idempotencyKey))) return apiErr(400, 3001, 'RequestInputValidationError', { path: ['body', 'idempotencyKey'], message: 'Invalid UUID' }); // as live LIQD, probe 2026-09-26
      if (st.idem.has(body.idempotencyKey)) return ok(st.idem.get(body.idempotencyKey));
      const mode = body.params.mode;
      if (f.refuseKenoModes.has(mode)) return apiErr(400, 3999, 'InvalidKenoModeError', { mode });
      const picks = body.params.rows[0].picks; const n = st.nonce++;
      const drawn = kenoDraw(st.active, st.clientSeed, n); const hits = picks.filter((p) => drawn.includes(p)).length;
      const mult = kenoPaytable[mode][picks.length][hits]; const stake = Number(body.stake);
      const win = (stake * mult).toFixed(8);
      const res = { idempotencyKey: body.idempotencyKey, consumedNonce: n,
        provablyFair: { serverSeedHash: hash(st.active), clientSeed: st.clientSeed, nonce: n, serverSeedStatus: 'active' },
        round: { roundId: `originals-keno-1-x-${n}`, betId: randomBytes(10).toString('base64url'), gameType: 'keno', gameId: 'originals-keno', archetype: 'instant',
          clientSeed: st.clientSeed, serverSeedId: 'sid-' + hash(st.active).slice(0, 8), nonce: n, cursor: 0,
          wagers: [{ id: 'wager-0', betType: 'main', stake: body.stake, stakeWallet: body.stake, result: mult > 0 ? 'won' : 'lost', winningAmount: win, winningAmountWallet: win,
            logicVersion: 2, params: { picks, mode }, outcome: { drawn, hits, multiplier: mult } }] } };
      if (f.echoCookieValue) res.debugEcho = f.echoCookieValue;
      st.idem.set(body.idempotencyKey, res);
      return ok(plant(res));
    }
    if (path.endsWith('/originals/limbo/place-bet')) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(body.idempotencyKey))) return apiErr(400, 3001, 'RequestInputValidationError', { path: ['body', 'idempotencyKey'], message: 'Invalid UUID' }); // as live LIQD, probe 2026-09-26
      if (st.idem.has(body.idempotencyKey)) return ok(st.idem.get(body.idempotencyKey));
      const target = Number(body.params.target), stake = Number(body.stake);
      if (stake * target > 50000) return apiErr(400, 3138, 'MaxExposureExceededError', { maxAllowedBetUsdc: Math.floor((50000 / target) * 1e8) / 1e8 });
      const n = st.nonce++; const R = limboResult(st.active, st.clientSeed, n); const won = R >= target;
      const res = { idempotencyKey: body.idempotencyKey, consumedNonce: n,
        provablyFair: { serverSeedHash: hash(st.active), clientSeed: st.clientSeed, nonce: n, serverSeedStatus: 'active' },
        round: { roundId: `originals-limbo-1-x-${n}`, betId: randomBytes(10).toString('base64url'), clientSeed: st.clientSeed, serverSeedId: 'sid', nonce: n, cursor: 0,
          wagers: [{ betType: 'main', stake: body.stake, stakeWallet: body.stake, result: won ? 'won' : 'lost', winningAmount: won ? (stake * target).toFixed(8) : '0', winningAmountWallet: won ? (stake * target).toFixed(8) : '0',
            params: { target }, outcome: { result: R, win: won } }] } };
      st.idem.set(body.idempotencyKey, res);
      return ok(plant(res));
    }
    if (path.endsWith('/fast-games/mine-game/place-bet')) {
      if (st.mine) return apiErr(400, 3117, 'GameInProgressError');
      const n = st.nonce++;
      st.mine = { n, m: body.mineCount, clientSeed: body.clientSeed, layout: minesFor(st.active, body.clientSeed, n, body.mineCount), open: [], bet: Number(body.betAmount), id: randomBytes(8).toString('hex') };
      return ok(plant({ id: st.mine.id, nonce: n, mineCount: body.mineCount }));
    }
    if (path.endsWith('/fast-games/mine-game/open-tile')) {
      const g = st.mine; if (!g) return apiErr(400, 3116, 'NoPlacedBetFound');
      g.open.push(body.tile);
      if (g.layout.includes(body.tile)) { st.mine = null; return ok({ mineTile: true, ...settle(g, false) }); }
      const r = { mineTile: false, openTiles: [...g.open] };
      if (perStepMultiplier) r.multiplier = Math.floor(minesMult(g.m, g.open.length) * 100) / 100;
      return ok(plant(r));
    }
    if (path.endsWith('/fast-games/mine-game/cash-out-bet')) {
      const g = st.mine; if (!g) return apiErr(400, 3116, 'NoPlacedBetFound'); st.mine = null; return ok(settle(g, true));
    }
    if (path.endsWith('/fast-games/mine-game/auto-bet')) {
      const n = st.nonce++; const layout = minesFor(st.active, body.clientSeed, n, body.mineCount);
      const g = { n, m: body.mineCount, clientSeed: body.clientSeed, layout, open: body.tiles, bet: Number(body.betAmount), id: randomBytes(8).toString('hex') };
      return ok({ ...settle(g, !body.tiles.some((t) => layout.includes(t))), currentGameSettings: {} });
    }
    return { status: 404, text: JSON.stringify({ errors: [{ name: 'NotFound', errorCode: 404 }] }) };
  }
  function settle(g, won) {
    const mult = won ? Math.floor(minesMult(g.m, g.open.length) * 100) / 100 : 0;
    return { id: g.id, nonce: g.n, clientSeed: g.clientSeed, serverSeedId: 'sid', mineTiles: g.layout, openTiles: [...g.open], betAmount: g.bet,
      winningAmount: won ? Number((g.bet * mult).toFixed(8)) : 0, multiplier: mult, result: won ? 'won' : 'lost' };
  }

  const transport = async (method, url, body) => {
    const i = ++st.requests;
    const path = new URL(url).pathname;
    st.log.push({ i, method, path });
    if (f.authAt != null && i >= f.authAt) return { status: 403, text: '<html>Cloudflare Access</html>' };
    if (f.rate429.has(i)) return { status: 429, text: '{}' };
    const r = handle(method, path, body);
    if (f.dropAfterAct.has(i)) { const e = new Error('transport timeout'); e.kind = 'TRANSIENT'; throw e; }   // server acted, response lost
    return r;
  };
  return { transport, st, faults: f };
}
