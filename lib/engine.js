// lib/engine.js
// Pure, framework-free game-theory engine for Daily Dilemma.
// Shared verbatim by server API routes and client components.
// HARD RULE: no Math.random(), no Date.now(), no object-key iteration order
// dependence anywhere in scoring math. Everything is reproducible from a seed.

// ---------------------------------------------------------------------------
// Launch date — issue number is "days since launch (UTC) + 1".
// ---------------------------------------------------------------------------
export const LAUNCH_DATE = '2026-08-28';

// ---------------------------------------------------------------------------
// 3.1 Payoff matrix (standard T > R > P > S)
//   CC -> 3,3   DD -> 1,1   CD -> 0,5   DC -> 5,0
// ---------------------------------------------------------------------------
export const PAYOFF = {
  CC: [3, 3],
  DD: [1, 1],
  CD: [0, 5],
  DC: [5, 0],
};

export function payoff(myMove, oppMove) {
  const key = (myMove === 'D' ? 'D' : 'C') + (oppMove === 'D' ? 'D' : 'C');
  return PAYOFF[key];
}

// ---------------------------------------------------------------------------
// 3.5 Deterministic seeding
// ---------------------------------------------------------------------------

// 32-bit FNV-1a string hash -> unsigned 32-bit seed.
export function hashStr(s) {
  s = String(s);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// mulberry32 PRNG: returns a function producing floats in [0, 1).
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
// Daily twist — derived deterministically from the UTC date string.
// ---------------------------------------------------------------------------
// The day's *expected* match length. Each individual match ends at a random
// round (probabilistic continuation, Axelrod-tournament style) so no strategy
// can know it's the final round and defect for free. This set averages 200.
export const ROUND_OPTIONS = [160, 180, 200, 220, 240];
export const NOISE_OPTIONS = [
  { pct: 0, label: 'Clear Signal' },
  { pct: 4, label: 'Light Static' },
  { pct: 8, label: 'Heavy Static' },
  { pct: 12, label: 'Fog of War' },
];

export function computeTwist(dateStr) {
  const rng = mulberry32(hashStr('twist:' + dateStr));
  const expectedRounds = ROUND_OPTIONS[Math.floor(rng() * ROUND_OPTIONS.length)];
  const noise = NOISE_OPTIONS[Math.floor(rng() * NOISE_OPTIONS.length)];
  return {
    expectedRounds,
    noisePct: noise.pct,
    noiseLabel: noise.label,
  };
}

// Deterministic per-match length. Independent geometric continuation: after the
// first round, keep going with probability w = 1 - 1/expectedRounds, so the
// expected length is `expectedRounds`. Floored so no match is trivially short,
// capped at 3x so worst-case compute stays bounded. Uses its own seed stream so
// tweaking length logic never perturbs the move/noise RNG sequence.
export function lengthSeed(dateStr, idA, idB) {
  return hashStr(
    dateStr + '#' + [String(idA), String(idB)].sort().join('|') + ':len'
  );
}

export function matchLength(seed, expectedRounds) {
  const rng = mulberry32(seed);
  // Always play at least `floor` rounds, then continue geometrically. Tuning w
  // to the remaining budget makes the expected total exactly `expectedRounds`
  // with no probability spike at the floor.
  const floor = Math.min(20, Math.floor(expectedRounds / 2));
  const cap = expectedRounds * 3;
  const w = 1 - 1 / Math.max(2, expectedRounds - floor);
  let len = floor;
  while (len < cap && rng() < w) len++;
  return len;
}

// ---------------------------------------------------------------------------
// Date helpers — always UTC, never browser-local.
// ---------------------------------------------------------------------------
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function issueNumber(dateStr, launchDateStr = LAUNCH_DATE) {
  const a = Date.parse(launchDateStr + 'T00:00:00Z');
  const b = Date.parse(dateStr + 'T00:00:00Z');
  return Math.floor((b - a) / 86400000) + 1;
}

export function lastNDays(todayStr, n, launchDateStr) {
  const out = [];
  const today = Date.parse(todayStr + 'T00:00:00Z');
  for (let i = n - 1; i >= 0; i--) {
    const ds = new Date(today - i * 86400000).toISOString().slice(0, 10);
    if (launchDateStr && ds < launchDateStr) continue;
    out.push(ds);
  }
  return out;
}

export function filedDate(dateStr) {
  // "August 28, 2026"
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}

// ---------------------------------------------------------------------------
// 3.3 Ten canonical bots (hardcoded, always present, never editable)
// ---------------------------------------------------------------------------
export const BOTS = [
  {
    id: 'bot:always-cooperate',
    name: 'Always Cooperate',
    blurb: 'Cooperates every round, no matter what the opponent does.',
    strat: { first: () => 'C', move: () => 'C' },
  },
  {
    id: 'bot:always-defect',
    name: 'Always Defect',
    blurb: 'Defects every round, unconditionally.',
    strat: { first: () => 'D', move: () => 'D' },
  },
  {
    id: 'bot:tit-for-tat',
    name: 'Tit for Tat',
    blurb: 'Opens with Cooperate, then copies the opponent’s previous move.',
    strat: { first: () => 'C', move: (my, opp, r) => opp[r - 1] },
  },
  {
    id: 'bot:grim-trigger',
    name: 'Grim Trigger',
    blurb: 'Cooperates until the opponent defects even once, then defects forever.',
    strat: {
      first: () => 'C',
      move: (my, opp) => (opp.indexOf('D') !== -1 ? 'D' : 'C'),
    },
  },
  {
    id: 'bot:tit-for-two-tats',
    name: 'Tit for Two Tats',
    blurb: 'Only retaliates after the opponent defects twice in a row.',
    strat: {
      first: () => 'C',
      move: (my, opp, r) =>
        r >= 2 && opp[r - 1] === 'D' && opp[r - 2] === 'D' ? 'D' : 'C',
    },
  },
  {
    id: 'bot:suspicious-tit-for-tat',
    name: 'Suspicious Tit for Tat',
    blurb: 'Opens with Defect, then mirrors the opponent’s previous move.',
    strat: { first: () => 'D', move: (my, opp, r) => opp[r - 1] },
  },
  {
    id: 'bot:generous-tit-for-tat',
    name: 'Generous Tit for Tat',
    blurb: 'Mirrors the opponent, but forgives a defection 10% of the time.',
    strat: {
      first: () => 'C',
      move: (my, opp, r, rng) => {
        const last = opp[r - 1];
        if (last === 'D' && rng() < 0.1) return 'C';
        return last;
      },
    },
  },
  {
    id: 'bot:pavlov',
    name: 'Pavlov (Win-Stay, Lose-Shift)',
    blurb:
      'Repeats its last move after a good outcome (mutual cooperation or a successful defection), otherwise switches.',
    strat: {
      first: () => 'C',
      move: (my, opp, r) => {
        const m = my[r - 1];
        const o = opp[r - 1];
        const good = (m === 'C' && o === 'C') || (m === 'D' && o === 'C');
        return good ? m : m === 'C' ? 'D' : 'C';
      },
    },
  },
  {
    id: 'bot:coin-flip',
    name: 'Coin Flip',
    blurb: 'Picks Cooperate or Defect at random, 50/50, every round.',
    strat: {
      first: (rng) => (rng() < 0.5 ? 'C' : 'D'),
      move: (my, opp, r, rng) => (rng() < 0.5 ? 'C' : 'D'),
    },
  },
  {
    id: 'bot:joss',
    name: 'Joss',
    blurb:
      'Plays Tit for Tat, but sneaks in an unprovoked defection about 10% of the time.',
    strat: {
      first: () => 'C',
      move: (my, opp, r, rng) => {
        const last = opp[r - 1];
        if (last === 'C') return rng() < 0.1 ? 'D' : 'C';
        return 'D';
      },
    },
  },
];

export const BOT_BY_ID = BOTS.reduce((acc, b) => {
  acc[b.id] = b;
  return acc;
}, {});

// ---------------------------------------------------------------------------
// 3.4 No-code rule builder — compile a user strategy definition into a strat.
//   def = { firstMove: 'C'|'D', rules: [{ type, params, action }], default: 'C'|'D' }
//   Rules evaluate top to bottom; first match wins; else `default`.
//   Rules only apply from roundIndex >= 1 (round 0 always uses firstMove).
// ---------------------------------------------------------------------------
export function compileUserStrategy(def) {
  const firstMove = def && def.firstMove === 'D' ? 'D' : 'C';
  const rules = def && Array.isArray(def.rules) ? def.rules : [];
  const dflt = def && def.default === 'D' ? 'D' : 'C';
  return {
    first: () => firstMove,
    move: (my, opp, r, rng) => {
      for (let i = 0; i < rules.length; i++) {
        if (matchRule(rules[i], my, opp, r, rng)) {
          return rules[i].action === 'D' ? 'D' : 'C';
        }
      }
      return dflt;
    },
  };
}

function coopRate(hist, upto) {
  if (upto <= 0) return 1;
  let c = 0;
  for (let i = 0; i < upto; i++) if (hist[i] === 'C') c++;
  return c / upto;
}

function matchRule(rule, my, opp, r, rng) {
  if (!rule || typeof rule.type !== 'string') return false;
  const p = rule.params || {};
  switch (rule.type) {
    case 'opp_last':
      return opp[r - 1] === (p.move === 'D' ? 'D' : 'C');
    case 'my_last':
      return my[r - 1] === (p.move === 'D' ? 'D' : 'C');
    case 'opp_streak': {
      const n = p.n | 0;
      if (n < 1 || r < n) return false;
      const want = p.move === 'D' ? 'D' : 'C';
      for (let i = 1; i <= n; i++) if (opp[r - i] !== want) return false;
      return true;
    }
    case 'opp_defect_gte': {
      const n = p.n | 0;
      let d = 0;
      for (let i = 0; i < r; i++) if (opp[i] === 'D') d++;
      return d >= n;
    }
    case 'opp_coop_rate': {
      const rate = coopRate(opp, r) * 100;
      return p.cmp === 'lte' ? rate <= p.pct : rate >= p.pct;
    }
    case 'round_is': {
      const roundNum = r + 1;
      const n = p.n | 0;
      if (p.cmp === 'eq') return roundNum === n;
      if (p.cmp === 'multiple') return n > 0 && roundNum % n === 0;
      return roundNum >= n; // 'gte'
    }
    case 'random_chance':
      return rng() < p.pct / 100;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// 3.5 Match simulation with trembling-hand noise.
// A is always the lexicographically-smaller id (caller guarantees), so the
// rng draw order is stable regardless of roster iteration order.
// ---------------------------------------------------------------------------
export function playMatch(stratA, stratB, rounds, noisePct, seed) {
  const rng = mulberry32(seed);
  const histA = [];
  const histB = [];
  let scoreA = 0;
  let scoreB = 0;
  const noise = noisePct / 100;
  for (let r = 0; r < rounds; r++) {
    let a = r === 0 ? stratA.first(rng) : stratA.move(histA, histB, r, rng);
    let b = r === 0 ? stratB.first(rng) : stratB.move(histB, histA, r, rng);
    a = a === 'D' ? 'D' : 'C';
    b = b === 'D' ? 'D' : 'C';
    if (noise > 0) {
      if (rng() < noise) a = a === 'C' ? 'D' : 'C';
      if (rng() < noise) b = b === 'C' ? 'D' : 'C';
    }
    const pay = payoff(a, b);
    scoreA += pay[0];
    scoreB += pay[1];
    histA.push(a);
    histB.push(b);
  }
  return { scoreA, scoreB, histA, histB };
}

// ---------------------------------------------------------------------------
// Roster construction: 10 house bots + compiled user strategies.
// Each entry: { id, name, house, author?, rules?, firstMove?, default?, blurb?, strat }
// ---------------------------------------------------------------------------
export function buildRoster(strategies) {
  const roster = BOTS.map((b) => ({
    id: b.id,
    name: b.name,
    house: true,
    blurb: b.blurb,
    strat: b.strat,
  }));
  const list = Array.isArray(strategies) ? strategies : [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    roster.push({
      id: String(s.id),
      name: s.name,
      house: false,
      author: s.author || 'Anonymous',
      rules: Array.isArray(s.rules) ? s.rules : [],
      firstMove: s.firstMove === 'D' ? 'D' : 'C',
      default: s.default === 'D' ? 'D' : 'C',
      createdAt: s.createdAt,
      strat: compileUserStrategy(s),
    });
  }
  return roster;
}

export function pairSeed(dateStr, idA, idB) {
  return hashStr(dateStr + '#' + [String(idA), String(idB)].sort().join('|'));
}

// ---------------------------------------------------------------------------
// 3.6 Round-robin standings.
// Returns rows sorted by avg desc (tie-break: id asc), each with a rank.
// ---------------------------------------------------------------------------
export function computeStandings(roster, twist, dateStr, opts = {}) {
  const n = roster.length;
  const keepMatches = !!opts.keepMatches;
  const totals = new Map();
  for (let i = 0; i < n; i++) {
    totals.set(roster[i].id, {
      points: 0,
      roundsPlayed: 0,
      opponents: 0,
      wins: 0,
      ties: 0,
      losses: 0,
      matches: keepMatches ? [] : null,
    });
  }
  const expected = twist.expectedRounds || twist.rounds || 200;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let A = roster[i];
      let B = roster[j];
      let swapped = false;
      if (String(A.id) > String(B.id)) {
        const t = A;
        A = B;
        B = t;
        swapped = true;
      }
      const seed = pairSeed(dateStr, A.id, B.id);
      const rounds = matchLength(lengthSeed(dateStr, A.id, B.id), expected);
      const res = playMatch(A.strat, B.strat, rounds, twist.noisePct, seed);
      const ta = totals.get(A.id);
      const tb = totals.get(B.id);
      ta.points += res.scoreA;
      ta.roundsPlayed += rounds;
      ta.opponents += 1;
      tb.points += res.scoreB;
      tb.roundsPlayed += rounds;
      tb.opponents += 1;
      if (res.scoreA > res.scoreB) {
        ta.wins++;
        tb.losses++;
      } else if (res.scoreA < res.scoreB) {
        ta.losses++;
        tb.wins++;
      } else {
        ta.ties++;
        tb.ties++;
      }
      if (keepMatches) {
        const outcome =
          res.scoreA === res.scoreB ? 'tie' : res.scoreA > res.scoreB ? 'A' : 'B';
        ta.matches.push({
          oppId: B.id,
          oppName: B.name,
          oppHouse: !!B.house,
          rounds,
          myScore: res.scoreA,
          oppScore: res.scoreB,
          myAvg: res.scoreA / rounds,
          oppAvg: res.scoreB / rounds,
          result: outcome === 'tie' ? 'T' : outcome === 'A' ? 'W' : 'L',
          myHist: res.histA,
          oppHist: res.histB,
        });
        tb.matches.push({
          oppId: A.id,
          oppName: A.name,
          oppHouse: !!A.house,
          rounds,
          myScore: res.scoreB,
          oppScore: res.scoreA,
          myAvg: res.scoreB / rounds,
          oppAvg: res.scoreA / rounds,
          result: outcome === 'tie' ? 'T' : outcome === 'B' ? 'W' : 'L',
          myHist: res.histB,
          oppHist: res.histA,
        });
      }
      void swapped;
    }
  }

  const rows = roster.map((e) => {
    const t = totals.get(e.id);
    const avg = t.roundsPlayed > 0 ? t.points / t.roundsPlayed : 0;
    return {
      id: String(e.id),
      name: e.name,
      house: !!e.house,
      author: e.author || null,
      rules: e.rules || null,
      firstMove: e.firstMove || null,
      default: e.default || null,
      blurb: e.blurb || null,
      createdAt: e.createdAt || null,
      avg,
      totalPoints: t.points,
      opponents: t.opponents,
      wins: t.wins,
      ties: t.ties,
      losses: t.losses,
      matches: t.matches,
    };
  });
  rows.sort((a, b) => b.avg - a.avg || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  rows.forEach((row, idx) => {
    row.rank = idx + 1;
  });
  return rows;
}

// ---------------------------------------------------------------------------
// 3.7 All-time leaderboard.
// For each of the last 30 days (or since launch), recompute that day's
// standings with the roster as it existed on that date, then average each
// strategy's daily avg across days it had >= 1 opponent.
// ---------------------------------------------------------------------------
export function computeAllTime(strategies, todayStr, launchDateStr = LAUNCH_DATE) {
  const days = lastNDays(todayStr, 30, launchDateStr);
  const acc = new Map();

  for (let d = 0; d < days.length; d++) {
    const day = days[d];
    const active = (strategies || []).filter(
      (s) => s.createdAt && s.createdAt <= day
    );
    const roster = buildRoster(active);
    if (roster.length < 2) continue;
    const twist = computeTwist(day);
    const standings = computeStandings(roster, twist, day);
    for (let i = 0; i < standings.length; i++) {
      const row = standings[i];
      if (row.opponents < 1) continue;
      if (!acc.has(row.id)) {
        acc.set(row.id, {
          id: row.id,
          name: row.name,
          house: row.house,
          author: row.author,
          rules: row.rules,
          firstMove: row.firstMove,
          default: row.default,
          blurb: row.blurb,
          sum: 0,
          daysPlayed: 0,
          bestDay: -Infinity,
        });
      }
      const a = acc.get(row.id);
      a.sum += row.avg;
      a.daysPlayed += 1;
      if (row.avg > a.bestDay) a.bestDay = row.avg;
      // Keep the freshest metadata (names can change on resubmit).
      a.name = row.name;
      a.author = row.author;
      a.rules = row.rules;
      a.firstMove = row.firstMove;
      a.default = row.default;
    }
  }

  const rows = [];
  acc.forEach((a) => {
    rows.push({
      id: a.id,
      name: a.name,
      house: a.house,
      author: a.author,
      rules: a.rules,
      firstMove: a.firstMove,
      default: a.default,
      blurb: a.blurb,
      avgAllTime: a.daysPlayed > 0 ? a.sum / a.daysPlayed : 0,
      daysPlayed: a.daysPlayed,
      bestDay: a.bestDay === -Infinity ? 0 : a.bestDay,
    });
  });
  rows.sort(
    (x, y) =>
      y.avgAllTime - x.avgAllTime ||
      y.daysPlayed - x.daysPlayed ||
      (x.id < y.id ? -1 : x.id > y.id ? 1 : 0)
  );
  rows.forEach((row, idx) => {
    row.rank = idx + 1;
  });
  return { days: days.length, rows };
}

// ---------------------------------------------------------------------------
// Preview helper for the client "Run Simulation" button.
// Inserts the draft strategy into the live roster, recomputes standings while
// keeping match detail, and returns everything ResultPanel needs.
// ---------------------------------------------------------------------------
export const DRAFT_ID = '__draft__';

export function simulateDraft(draftDef, strategies, twist, dateStr) {
  const roster = buildRoster(strategies);
  roster.push({
    id: DRAFT_ID,
    name: draftDef.name || 'Your Strategy',
    house: false,
    author: draftDef.author || 'you',
    rules: Array.isArray(draftDef.rules) ? draftDef.rules : [],
    firstMove: draftDef.firstMove === 'D' ? 'D' : 'C',
    default: draftDef.default === 'D' ? 'D' : 'C',
    strat: compileUserStrategy(draftDef),
  });
  const standings = computeStandings(roster, twist, dateStr, { keepMatches: true });
  const mine = standings.find((r) => r.id === DRAFT_ID);
  const topOther = standings.find((r) => r.id !== DRAFT_ID) || null;
  let transcript = null;
  if (mine && topOther) {
    const m = mine.matches.find((x) => x.oppId === topOther.id);
    if (m) {
      transcript = {
        oppName: topOther.name,
        oppRank: topOther.rank,
        oppHouse: topOther.house,
        myScore: m.myScore,
        oppScore: m.oppScore,
        roundsCount: m.rounds,
        rounds: m.myHist.map((mv, i) => ({ me: mv, opp: m.oppHist[i] })),
      };
    }
  }
  return {
    rank: mine ? mine.rank : null,
    fieldSize: standings.length,
    avg: mine ? mine.avg : 0,
    wins: mine ? mine.wins : 0,
    ties: mine ? mine.ties : 0,
    losses: mine ? mine.losses : 0,
    perOpponent: mine
      ? mine.matches
          .slice()
          .sort((a, b) => b.myAvg - a.myAvg)
          .map((x) => ({
            oppName: x.oppName,
            oppHouse: x.oppHouse,
            myScore: x.myScore,
            oppScore: x.oppScore,
            myAvg: x.myAvg,
            oppAvg: x.oppAvg,
            result: x.result,
          }))
      : [],
    transcript,
    standings: standings.map((r) => ({
      id: r.id,
      name: r.name,
      rank: r.rank,
      avg: r.avg,
      house: r.house,
      isDraft: r.id === DRAFT_ID,
    })),
  };
}
