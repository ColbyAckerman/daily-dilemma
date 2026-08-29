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

import { resolveOpponent, dailyOpponentRef } from './opponents.js';

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
// Simulate a full game: fixed player moves vs an opponent. Used to re-derive a
// finished game from stored moves (reload, share card).
// ---------------------------------------------------------------------------
export function simulate(oppRef, playerMoves, seedStr) {
  const opp = resolveOpponent(oppRef);
  const rng = mulberry32(hashStr(seedStr));
  const selfHist = []; // opponent's moves
  const foeHist = []; // player's moves
  let me = 0;
  let them = 0;
  const rounds = [];
  for (let r = 0; r < playerMoves.length; r++) {
    const pm = playerMoves[r] === 'D' ? 'D' : 'C';
    const omRaw = r === 0 ? opp.first(rng) : opp.move(selfHist, foeHist, r, rng);
    const om = omRaw === 'D' ? 'D' : 'C';
    foeHist.push(pm);
    selfHist.push(om);
    const [a, b] = payoff(pm, om);
    me += a;
    them += b;
    rounds.push({ me: pm, opp: om, myPts: a, oppPts: b });
  }
  return { oppMoves: selfHist, me, them, rounds };
}

// Score a fixed strategy (all-C, all-D, or Tit-for-Tat) against the opponent
// over `length` rounds.
function scoreFixed(oppRef, length, seedStr, kind) {
  const opp = resolveOpponent(oppRef);
  const rng = mulberry32(hashStr(seedStr));
  const selfHist = [];
  const foeHist = [];
  let total = 0;
  for (let r = 0; r < length; r++) {
    let pm;
    if (kind === 'C') pm = 'C';
    else if (kind === 'D') pm = 'D';
    else pm = r === 0 ? 'C' : selfHist[r - 1]; // TFT copies opp's last move
    const omRaw = r === 0 ? opp.first(rng) : opp.move(selfHist, foeHist, r, rng);
    const om = omRaw === 'D' ? 'D' : 'C';
    foeHist.push(pm);
    selfHist.push(om);
    total += payoff(pm, om)[0];
  }
  return total;
}

// ---------------------------------------------------------------------------
// The full daily puzzle spec. `oppId` is included, but the UI must not surface
// the opponent's name/blurb/tell until the game is over.
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
    par: scoreFixed(oppRef, length, 'par:' + dateStr, 'TFT'),
    allCoop: scoreFixed(oppRef, length, 'benchC:' + dateStr, 'C'),
    allDefect: scoreFixed(oppRef, length, 'benchD:' + dateStr, 'D'),
  };
}

// Resolve the opponent for reveal (name / blurb / nice-nasty). Never call this
// from the playing UI — only after the game is over.
export function revealOpponent(oppRef) {
  const o = resolveOpponent(oppRef);
  return { id: o.id, name: o.name, nice: o.nice, blurb: o.blurb, origin: o.origin || null };
}
