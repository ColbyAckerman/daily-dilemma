// lib/live.js
// Best-effort, poll-based Live Duel. Redis path uses SET NX / GETDEL for the
// pairing handshake and a Lua script for race-free move appends. Memory path
// keeps it working locally (single process only).

import { getRedis } from './redis';
import {
  BOTS,
  BOT_BY_ID,
  hashStr,
  mulberry32,
  payoff,
} from './engine';

export const LIVE_ROUNDS = 10;
const QUEUE_TTL = 60;
const PAIR_TTL = 40;
const MATCH_TTL = 7200;

const mem = globalThis.__ddLive || (globalThis.__ddLive = {
  queue: null, // { clientId, name, queuedAt }
  paired: new Map(), // clientId -> { matchId, opponent }
  matches: new Map(), // matchId -> match object
});

function newId() {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  } catch (e) {
    return Math.random().toString(36).slice(2, 12);
  }
}

function pickBot(seedStr) {
  return BOTS[hashStr(seedStr) % BOTS.length];
}

function freshMatch({ a, b, vsBot, botId }) {
  return {
    id: newId(),
    a, // { clientId, name }
    b, // { clientId, name }  (clientId may be null for a bot)
    vsBot: !!vsBot,
    botId: botId || null,
    movesA: [],
    movesB: [],
    rounds: LIVE_ROUNDS,
    status: 'active',
    lastActivity: Date.now(),
  };
}

// --------------------------------------------------------------------------
// Queue / pairing
// --------------------------------------------------------------------------
export async function joinQueue(clientId, name) {
  const r = getRedis();
  name = (name || 'Anon').slice(0, 24);

  if (!r) {
    const p = mem.paired.get(clientId);
    if (p) {
      mem.paired.delete(clientId);
      return { status: 'matched', matchId: p.matchId, opponent: p.opponent, youAre: 'a' };
    }
    if (mem.queue && mem.queue.clientId !== clientId) {
      const waiter = mem.queue;
      mem.queue = null;
      const m = freshMatch({
        a: { clientId: waiter.clientId, name: waiter.name },
        b: { clientId, name },
        vsBot: false,
      });
      mem.matches.set(m.id, m);
      mem.paired.set(waiter.clientId, {
        matchId: m.id,
        opponent: { name },
      });
      return { status: 'matched', matchId: m.id, opponent: { name: waiter.name }, youAre: 'b' };
    }
    mem.queue = { clientId, name, queuedAt: Date.now() };
    return { status: 'waiting' };
  }

  // Redis path
  const paired = await r.getdel('live:paired:' + clientId);
  if (paired) {
    return {
      status: 'matched',
      matchId: paired.matchId,
      opponent: paired.opponent,
      youAre: 'a',
    };
  }

  const claimed = await r.getdel('live:queue');
  if (claimed && claimed.clientId && claimed.clientId !== clientId) {
    const m = freshMatch({
      a: { clientId: claimed.clientId, name: claimed.name },
      b: { clientId, name },
      vsBot: false,
    });
    await r.set('live:match:' + m.id, m, { ex: MATCH_TTL });
    await r.set(
      'live:paired:' + claimed.clientId,
      { matchId: m.id, opponent: { name } },
      { ex: PAIR_TTL }
    );
    return {
      status: 'matched',
      matchId: m.id,
      opponent: { name: claimed.name },
      youAre: 'b',
    };
  }

  // Nobody waiting (or we just reclaimed our own stale entry) -> queue up.
  await r.set(
    'live:queue',
    { clientId, name, queuedAt: Date.now() },
    { nx: true, ex: QUEUE_TTL }
  );
  return { status: 'waiting' };
}

export async function leaveQueue(clientId) {
  const r = getRedis();
  if (!r) {
    if (mem.queue && mem.queue.clientId === clientId) mem.queue = null;
    return;
  }
  const q = await r.get('live:queue');
  if (q && q.clientId === clientId) await r.del('live:queue');
}

export async function botMatch(clientId, name) {
  const r = getRedis();
  name = (name || 'Anon').slice(0, 24);
  const bot = pickBot(clientId + ':' + Date.now());
  const m = freshMatch({
    a: { clientId, name },
    b: { clientId: null, name: bot.name },
    vsBot: true,
    botId: bot.id,
  });

  if (!r) {
    if (mem.queue && mem.queue.clientId === clientId) mem.queue = null;
    mem.matches.set(m.id, m);
  } else {
    const q = await r.get('live:queue');
    if (q && q.clientId === clientId) await r.del('live:queue');
    await r.set('live:match:' + m.id, m, { ex: MATCH_TTL });
  }
  return { status: 'matched', matchId: m.id, opponent: { name: bot.name }, youAre: 'a', vsBot: true };
}

// --------------------------------------------------------------------------
// Match state
// --------------------------------------------------------------------------
function decorate(match, clientId) {
  if (!match) return null;
  let youAre = null;
  if (match.a && match.a.clientId === clientId) youAre = 'a';
  else if (match.b && match.b.clientId === clientId) youAre = 'b';
  const movesA = Array.isArray(match.movesA) ? match.movesA : [];
  const movesB = Array.isArray(match.movesB) ? match.movesB : [];
  let scoreA = 0;
  let scoreB = 0;
  const n = Math.min(movesA.length, movesB.length);
  for (let i = 0; i < n; i++) {
    const [pa, pb] = payoff(movesA[i], movesB[i]);
    scoreA += pa;
    scoreB += pb;
  }
  return {
    id: match.id,
    youAre,
    vsBot: !!match.vsBot,
    rounds: match.rounds || LIVE_ROUNDS,
    status: match.status,
    names: { a: match.a ? match.a.name : 'A', b: match.b ? match.b.name : 'B' },
    movesA,
    movesB,
    scoreA,
    scoreB,
    settledRounds: n,
  };
}

export async function getMatch(matchId, clientId) {
  const r = getRedis();
  const raw = r ? await r.get('live:match:' + matchId) : mem.matches.get(matchId);
  return decorate(raw, clientId);
}

const APPEND_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'nomatch' end
local m = cjson.decode(raw)
local side = ARGV[1]
local round = tonumber(ARGV[2])
local move = ARGV[3]
local now = ARGV[4]
local arr = (side == 'a') and m.movesA or m.movesB
if arr == nil then arr = {} end
if #arr == round then
  arr[round + 1] = move
  if side == 'a' then m.movesA = arr else m.movesB = arr end
  m.lastActivity = tonumber(now)
end
if m.movesA == nil then m.movesA = {} end
if m.movesB == nil then m.movesB = {} end
if #m.movesA >= m.rounds and #m.movesB >= m.rounds then m.status = 'done' end
redis.call('SET', KEYS[1], cjson.encode(m), 'EX', 7200)
return cjson.encode(m)
`;

function botReplyMove(match, round) {
  const bot = BOT_BY_ID[match.botId] || BOTS[2];
  const rng = mulberry32(hashStr(match.id + ':bot:' + round));
  const botHist = Array.isArray(match.movesB) ? match.movesB : [];
  const oppHist = Array.isArray(match.movesA) ? match.movesA : [];
  const mv =
    round === 0
      ? bot.strat.first(rng)
      : bot.strat.move(botHist, oppHist, round, rng);
  return mv === 'D' ? 'D' : 'C';
}

export async function submitMove(matchId, clientId, round, move) {
  move = move === 'D' ? 'D' : 'C';
  round = Math.floor(Number(round));
  const r = getRedis();

  if (!r) {
    const m = mem.matches.get(matchId);
    if (!m) return { error: 'nomatch' };
    const side =
      m.a && m.a.clientId === clientId ? 'a' : m.b && m.b.clientId === clientId ? 'b' : null;
    if (!side) return { error: 'notyours' };
    const arr = side === 'a' ? m.movesA : m.movesB;
    if (arr.length === round) arr.push(move);
    if (m.vsBot && side === 'a' && m.movesB.length === round) {
      m.movesB.push(botReplyMove(m, round));
    }
    if (m.movesA.length >= m.rounds && m.movesB.length >= m.rounds) m.status = 'done';
    m.lastActivity = Date.now();
    return { ok: true, match: decorate(m, clientId) };
  }

  const raw = await r.get('live:match:' + matchId);
  if (!raw) return { error: 'nomatch' };
  const side =
    raw.a && raw.a.clientId === clientId
      ? 'a'
      : raw.b && raw.b.clientId === clientId
      ? 'b'
      : null;
  if (!side) return { error: 'notyours' };

  await r.eval(APPEND_LUA, ['live:match:' + matchId], [side, String(round), move, String(Date.now())]);

  // Bot answers in the same request so the human never waits a poll cycle.
  const after = await r.get('live:match:' + matchId);
  if (after && after.vsBot && side === 'a') {
    const bMoves = Array.isArray(after.movesB) ? after.movesB : [];
    if (bMoves.length === round) {
      const botMove = botReplyMove(after, round);
      await r.eval(
        APPEND_LUA,
        ['live:match:' + matchId],
        ['b', String(round), botMove, String(Date.now())]
      );
    }
  }

  return { ok: true, match: await getMatch(matchId, clientId) };
}
