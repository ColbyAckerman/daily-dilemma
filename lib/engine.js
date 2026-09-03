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

import {
  resolveOpponent,
  dailyOpponentRef,
  NAMED,
  familyOf,
  oppMovesVs,
} from './opponents.js';

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
const LENGTH_OPTIONS = [11, 12, 13, 14];

export function dailyLength(dateStr) {
  const pick = mulberry32(hashStr('len:' + dateStr));
  const expected = LENGTH_OPTIONS[Math.floor(pick() * LENGTH_OPTIONS.length)];
  const rng = mulberry32(hashStr('mlen:' + dateStr));
  const floor = 9;
  const cap = 15; // short enough that every round counts
  const w = 1 - 1 / Math.max(2, expected - floor);
  let len = floor;
  while (len < cap && rng() < w) len++;
  return { expected, length: len };
}

// Opponent roster + procedural generator live in ./opponents.js

// ---------------------------------------------------------------------------
// Signal noise. Each side's intended move can flip in transmission with
// probability NOISE_RATE, seeded per (date, round, side) so the flip pattern
// is identical for every player that day.
//
// OFF for now (NOISE_RATE = 0): moves always transmit as intended. The
// plumbing below stays in place so it can be dialed back up in one spot.
// ---------------------------------------------------------------------------
export const NOISE_RATE = 0;

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
// The daily puzzle spec (light — the UI computes the field itself, at
// NOISE_RATE, once the game is over).
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

// The field is a fixed 100-strong tournament: the named historical roster,
// padded to 100 with a stable cast of generated strategies. The same 100 every
// day — only the scores move with the daily opponent. (Real human entrants get
// mixed in here once a backend is wired up.)
export const FIELD_SIZE = 100;

let _fieldPad = null;
function fieldPad() {
  if (_fieldPad) return _fieldPad;
  const seen = new Set(NAMED.map((s) => s.name));
  const out = [];
  for (let i = 0; i < 800 && out.length < 60; i++) {
    const ref = 'gen:' + (hashStr('field-roster:' + i) >>> 0);
    const g = resolveOpponent(ref);
    if (seen.has(g.name)) continue;
    seen.add(g.name);
    out.push({ ref, name: g.name, nice: g.nice });
  }
  _fieldPad = out;
  return out;
}

export function buildField(oppRef, length, dateStr, rate = 0) {
  const opp = resolveOpponent(oppRef);
  const roster = [
    ...NAMED.filter((s) => s.id !== opp.id).map((s) => ({
      ref: 'named:' + s.id,
      name: s.name,
      nice: s.nice,
    })),
    ...fieldPad().filter((g) => g.name !== opp.name),
  ].slice(0, FIELD_SIZE - 1);

  return roster
    .map((s) => ({
      name: s.name,
      nice: s.nice,
      score: scoreAgainst(
        oppRef,
        length,
        `field:${s.ref}:${dateStr}`,
        s.ref,
        rate ? dateStr : null,
        rate
      ),
    }))
    .sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
}

// Resolve the opponent for reveal (name / family / nice-nasty / blurb). Never
// call this from the playing UI — only after the game is over.
export function revealOpponent(oppRef) {
  const o = resolveOpponent(oppRef);
  const fam = familyOf(oppRef);
  return {
    id: o.id,
    name: o.name,
    nice: o.nice,
    blurb: o.blurb,
    origin: o.origin || null,
    family: fam.name,
    familyHint: fam.hint,
  };
}

// A one-sentence account of how the opponent played *this* match, from the
// transmitted move lists. Post-game only.
export function matchStory(oppRef, my, them, dateStr = null, rate = 0) {
  if (!my.length) return '';
  const R = my.length;
  const myD = my.indexOf('D');
  const themD = them.indexOf('D');

  if (themD === -1) return 'It never defected once — it was cooperating the whole way.';

  // what it would have transmitted against a pure cooperator, same noise
  const soloIntent = oppMovesVs(oppRef, my.map(() => 'C')).slice(0, R);
  const soloTx = soloIntent
    .map((m, r) => (rate ? transmit(dateStr, r, 'o', m, rate) : m))
    .join('');
  if (soloTx === them.slice(0, R).join('')) {
    return 'It ignored you completely and just ran its own script.';
  }

  if (myD === -1) {
    return `It struck first on round ${themD + 1}, with nothing from you to provoke it.`;
  }
  if (themD < myD) {
    return `It defected first, on round ${themD + 1} — before you had done anything.`;
  }

  const reactAt = them.indexOf('D', myD);
  if (reactAt === -1) return `You defected on round ${myD + 1} and it never hit back.`;

  const gap = reactAt - myD;
  const react = gap <= 1 ? 'answered the very next round' : `answered ${gap} rounds later`;
  const myLastD = my.lastIndexOf('D');
  const tail = them.slice(myLastD + 1);
  const madePeace = tail.length >= 2 && tail.every((m) => m === 'C');
  return madePeace
    ? `You defected on round ${myD + 1}; it ${react}, then cooperation held to the end.`
    : `You defected on round ${myD + 1}; it ${react} and never fully came back.`;
}

// The best a player could have scored against this exact opponent, over every
// fixed line of play. Brute force — fine for daily-length matches. Memoised.
const _best = new Map();
export function bestScore(oppRef, length, seedStr, noiseDate = null, rate = 0) {
  const key = `${resolveOpponent(oppRef).id}|${length}|${seedStr}|${noiseDate}|${rate}`;
  if (_best.has(key)) return _best.get(key);
  const n = Math.min(length, 16);
  const moves = new Array(n);
  let best = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    for (let i = 0; i < n; i++) moves[i] = mask & (1 << i) ? 'D' : 'C';
    const { me } = simulate(oppRef, moves, seedStr, noiseDate, rate);
    if (me > best) best = me;
  }
  _best.set(key, best);
  return best;
}
