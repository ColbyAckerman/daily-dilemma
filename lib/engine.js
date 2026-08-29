// lib/engine.js — Daily Dilemma v1
// A daily, single-player Iterated Prisoner's Dilemma. You choose Cooperate or
// Defect each round against a hidden "opponent of the day" (revealed at the
// end). Fully deterministic from the UTC date — no noise, no server.
//
// HARD RULE: no Math.random() / Date.now() in any scoring path. Everything is
// reproducible from a seed so every player faces the identical puzzle.
//
// Move-function convention: move(selfHist, foeHist, roundIndex, rng)
//   selfHist = the mover's own past moves
//   foeHist  = the other side's past moves
//   both length === roundIndex; rng is a seeded () => [0,1)

import { resolveOpponent, dailyOpponentRef, NAMED } from './opponents.js';

export const LAUNCH_DATE = '2026-08-29';

// ---------------------------------------------------------------------------
// Payoff matrix (T > R > P > S):  CC 3,3 · DD 1,1 · CD 0,5 · DC 5,0
// ---------------------------------------------------------------------------
export const PAYOFF = { CC: [3, 3], DD: [1, 1], CD: [0, 5], DC: [5, 0] };

export function payoff(mine, theirs) {
  return PAYOFF[(mine === 'D' ? 'D' : 'C') + (theirs === 'D' ? 'D' : 'C')];
}

// ---------------------------------------------------------------------------
// Deterministic seeding
// ---------------------------------------------------------------------------
export function hashStr(s) {
  s = String(s);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Dates — always UTC
// ---------------------------------------------------------------------------
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function issueNumber(dateStr, launch = LAUNCH_DATE) {
  const a = Date.parse(launch + 'T00:00:00Z');
  const b = Date.parse(dateStr + 'T00:00:00Z');
  return Math.floor((b - a) / 86400000) + 1;
}

export function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

// ---------------------------------------------------------------------------
// Random game length — geometric continuation (Axelrod style). You never know
// which round is the last, so there's no free end-game defection.
// ---------------------------------------------------------------------------
const LENGTH_OPTIONS = [12, 14, 16, 18, 20];

export function dailyLength(dateStr) {
  const pick = mulberry32(hashStr('len:' + dateStr));
  const expected = LENGTH_OPTIONS[Math.floor(pick() * LENGTH_OPTIONS.length)];
  const rng = mulberry32(hashStr('mlen:' + dateStr));
  const floor = 8;
  const cap = Math.min(Math.round(expected * 1.9), 28); // keep it a sane number of clicks
  const w = 1 - 1 / Math.max(2, expected - floor);
  let len = floor;
  while (len < cap && rng() < w) len++;
  return { expected, length: len };
}

// Opponent roster + procedural generator live in ./opponents.js

// ---------------------------------------------------------------------------
// Signal noise (optional). When on, each side's intended move flips in
// transmission with probability NOISE_RATE. Seeded per (date, round, side), so
// the flip pattern is identical for every player who has noise on that day —
// the puzzle stays fair and deterministic given your choices.
//
// NOISE_RATE = 0.10 matches the noisy-IPD tournament studies (e.g. the 2005
// noisy category won by DBS). It's opt-in — enough per-round flips over a
// daily-length game that forgiving strategies (Generous TfT, Contrite TfT,
// Pavlov) visibly pull ahead of rigid ones, exactly as the literature found.
// ---------------------------------------------------------------------------
export const NOISE_RATE = 0.1;

function flips(dateStr, r, side, rate) {
  if (!rate) return false;
  return mulberry32(hashStr(`noise:${dateStr}:${r}:${side}`))() < rate;
}
export function transmit(dateStr, r, side, intended, rate) {
  return flips(dateStr, r, side, rate) ? (intended === 'D' ? 'C' : 'D') : intended;
}

// ---------------------------------------------------------------------------
// Simulate a full game: fixed player moves vs an opponent. Used to re-derive a
// finished game from stored moves (reload, share card). `playerMoves` are the
// player's *intended* moves; `noiseDate` + `rate` re-apply the same flips.
// ---------------------------------------------------------------------------
export function simulate(oppRef, playerMoves, seedStr, noiseDate = null, rate = 0) {
  const opp = resolveOpponent(oppRef);
  const rng = mulberry32(hashStr(seedStr));
  const selfHist = []; // opponent's transmitted moves
  const foeHist = []; // player's transmitted moves
  let me = 0;
  let them = 0;
  const rounds = [];
  for (let r = 0; r < playerMoves.length; r++) {
    const pIntent = playerMoves[r] === 'D' ? 'D' : 'C';
    const oIntentRaw = r === 0 ? opp.first(rng) : opp.move(selfHist, foeHist, r, rng);
    const oIntent = oIntentRaw === 'D' ? 'D' : 'C';
    const pm = noiseDate ? transmit(noiseDate, r, 'p', pIntent, rate) : pIntent;
    const om = noiseDate ? transmit(noiseDate, r, 'o', oIntent, rate) : oIntent;
    foeHist.push(pm);
    selfHist.push(om);
    const [a, b] = payoff(pm, om);
    me += a;
    them += b;
    rounds.push({ me: pm, opp: om, myIntent: pIntent, myPts: a, oppPts: b });
  }
  return { oppMoves: selfHist, me, them, rounds };
}

// Play a reference "player" strategy against the day's opponent and return the
// player's total. `playerRef` is a NAMED opponent id (used as the player) or a
// literal 'C' / 'D'. Its own seed stream keeps it independent of the live game.
export function scoreAgainst(oppRef, length, seedStr, playerRef, noiseDate = null, rate = 0) {
  const opp = resolveOpponent(oppRef);
  const player = playerRef === 'C' || playerRef === 'D' ? null : resolveOpponent(playerRef);
  const oRng = mulberry32(hashStr(seedStr + ':o'));
  const pRng = mulberry32(hashStr(seedStr + ':p'));
  const selfHist = []; // opponent's transmitted moves
  const foeHist = []; // player's transmitted moves
  let total = 0;
  for (let r = 0; r < length; r++) {
    let pIntent;
    if (playerRef === 'C') pIntent = 'C';
    else if (playerRef === 'D') pIntent = 'D';
    else pIntent = r === 0 ? player.first(pRng) : player.move(foeHist, selfHist, r, pRng);
    pIntent = pIntent === 'D' ? 'D' : 'C';
    const oIntentRaw = r === 0 ? opp.first(oRng) : opp.move(selfHist, foeHist, r, oRng);
    const oIntent = oIntentRaw === 'D' ? 'D' : 'C';
    // reference bots use a per-strategy noise stream so their flips don't all
    // coincide, but still deterministic for the day.
    const pm = noiseDate ? transmit(noiseDate + ':' + playerRef, r, 'p', pIntent, rate) : pIntent;
    const om = noiseDate ? transmit(noiseDate + ':' + playerRef, r, 'o', oIntent, rate) : oIntent;
    foeHist.push(pm);
    selfHist.push(om);
    total += payoff(pm, om)[0];
  }
  return total;
}

// ---------------------------------------------------------------------------
// The daily puzzle spec (light — the UI computes the field itself so it can
// honour the player's noise setting).
// ---------------------------------------------------------------------------
export function dailyPuzzle(dateStr = todayStr()) {
  const { expected, length } = dailyLength(dateStr);
  const oppRef = dailyOpponentRef(dateStr);
  return {
    dateStr,
    issue: issueNumber(dateStr),
    prettyDate: prettyDate(dateStr),
    expected,
    length,
    oppRef,
    seed: 'daily:' + dateStr,
  };
}

// The field: every named historical strategy scored against today's opponent,
// at the given noise rate (0 = clean). Axelrod-tournament style.
export function buildField(oppRef, length, dateStr, rate = 0) {
  const oppId = resolveOpponent(oppRef).id;
  return NAMED
    .filter((s) => s.id !== oppId)
    .map((s) => ({
      id: s.id,
      name: s.name,
      nice: s.nice,
      score: scoreAgainst(
        oppRef,
        length,
        `field:${s.id}:${dateStr}`,
        'named:' + s.id,
        rate ? dateStr : null,
        rate
      ),
    }))
    .sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
}

// Resolve the opponent for reveal (name / blurb / nice-nasty). Never call this
// from the playing UI — only after the game is over.
export function revealOpponent(oppRef) {
  const o = resolveOpponent(oppRef);
  return { id: o.id, name: o.name, nice: o.nice, blurb: o.blurb, origin: o.origin || null };
}
