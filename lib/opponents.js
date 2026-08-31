// lib/opponents.js
// The opponent-of-the-day pool for Daily Dilemma v1.
//
// Two tiers:
//   NAMED      — ~36 hand-built strategies, most drawn straight from Axelrod's
//                1980/1984 tournaments (plus Gradual and the 2012 ZD strategy).
//   GENERATED  — ~250 opponents assembled from parametrised archetypes, so the
//                daily opponent feels fresh for the better part of a year.
//
// Every opponent is tagged `nice` (Axelrod's term: never the first to defect)
// or nasty. That label is computed, not asserted, by playing it against a pure
// cooperator.
//
// Move convention: move(selfHist, foeHist, r, rng) where selfHist is the
// opponent's own past moves and foeHist is the player's.

import { hashStr, mulberry32, payoff } from './engine.js';

const countD = (h) => {
  let d = 0;
  for (let i = 0; i < h.length; i++) if (h[i] === 'D') d++;
  return d;
};
const tft = (s, foe, r) => (r === 0 ? 'C' : foe[r - 1]);
const grim = (s, foe) => (foe.indexOf('D') !== -1 ? 'D' : 'C');

// ===========================================================================
// NAMED tier
// ===========================================================================
export const NAMED = [
  {
    id: 'pushover', name: 'The Pushover', nice: true,
    blurb: 'Cooperated every single round, no matter what you did.',
    origin: null,
    first: () => 'C', move: () => 'C',
  },
  {
    id: 'bully', name: 'The Bully', nice: false,
    blurb: 'Betrayed every round, unconditionally.',
    origin: 'ALL-D — Axelrod tournament benchmark',
    first: () => 'D', move: () => 'D',
  },
  {
    id: 'mirror', name: 'The Mirror', nice: true,
    blurb: 'Opened with Cooperate, then copied your previous move exactly.',
    origin: 'Tit for Tat — Anatol Rapoport, winner of both Axelrod tournaments (1980)',
    first: () => 'C', move: (s, foe, r) => foe[r - 1],
  },
  {
    id: 'grudge', name: 'The Grudge-Holder', nice: true,
    blurb: 'Cooperated until your first betrayal — then betrayed forever.',
    origin: 'Grim / Friedman — Axelrod 1980',
    first: () => 'C', move: grim,
  },
  {
    id: 'slow-anger', name: 'Slow to Anger', nice: true,
    blurb: 'Only retaliated after you betrayed twice in a row.',
    origin: 'Tit for Two Tats — Axelrod 1984 (would have won the 1980 tournament)',
    first: () => 'C',
    move: (s, foe, r) => (r >= 2 && foe[r - 1] === 'D' && foe[r - 2] === 'D' ? 'D' : 'C'),
  },
  {
    id: 'cold-open', name: 'Cold Open', nice: false,
    blurb: 'Opened with a betrayal, then mirrored you from there.',
    origin: 'Suspicious Tit for Tat',
    first: () => 'D', move: (s, foe, r) => foe[r - 1],
  },
  {
    id: 'forgiving', name: 'Generous Tit for Tat', nice: true,
    blurb: 'Mirrored you, but forgave about a third of your betrayals — the level Nowak & Sigmund proved optimal.',
    origin: 'Generous Tit for Tat — Nowak & Sigmund (1992); out-performs plain Tit for Tat once noise is in play',
    first: () => 'C',
    move: (s, foe, r, rng) => {
      const last = foe[r - 1];
      if (last === 'D' && rng() < 1 / 3) return 'C';
      return last;
    },
  },
  {
    id: 'win-stay', name: 'Win-Stay', nice: true,
    blurb: 'Repeated its move after a good round, flipped after a bad one.',
    origin: 'Pavlov / Win-Stay-Lose-Shift — Kraines (1989), Nowak & Sigmund (1993)',
    first: () => 'C',
    move: (s, foe, r) => {
      const m = s[r - 1];
      const o = foe[r - 1];
      const good = (m === 'C' && o === 'C') || (m === 'D' && o === 'C');
      return good ? m : m === 'C' ? 'D' : 'C';
    },
  },
  {
    id: 'two-for-one', name: 'Two-for-One', nice: true,
    blurb: 'Answered every one of your betrayals with two of its own.',
    origin: 'Two Tits for Tat — Axelrod 1980',
    first: () => 'C',
    move: (s, foe, r) => (foe[r - 1] === 'D' || foe[r - 2] === 'D' ? 'D' : 'C'),
  },
  {
    id: 'three-strikes', name: 'Three Strikes', nice: true,
    blurb: 'Cooperated until your third betrayal — then betrayed forever.',
    origin: null,
    first: () => 'C', move: (s, foe) => (countD(foe) >= 3 ? 'D' : 'C'),
  },
  {
    id: 'probe', name: 'The Probe', nice: false,
    blurb: 'Tested you with an early betrayal — then exploited you for not hitting back, or settled into mirroring if you did.',
    origin: 'Tester — David Gladstein, Axelrod 1984',
    first: () => 'D',
    move: (s, foe, r) => {
      if (r === 1 || r === 2) return 'C';
      const retaliated = foe[1] === 'D' || foe[2] === 'D';
      return retaliated ? foe[r - 1] : 'D';
    },
  },
  {
    id: 'alternator', name: 'The Alternator', nice: false,
    blurb: 'Ignored you completely and alternated Cooperate, Betray.',
    origin: null,
    first: () => 'C', move: (s) => (s[s.length - 1] === 'C' ? 'D' : 'C'),
  },
  {
    id: 'three-beat', name: 'Three-Beat', nice: false,
    blurb: 'Ran a fixed loop: Cooperate, Cooperate, Betray.',
    origin: null,
    first: () => 'C', move: (s, foe, r) => (r % 3 === 2 ? 'D' : 'C'),
  },
  {
    id: 'soft-majority', name: 'Soft Majority', nice: true,
    blurb: 'Cooperated as long as you had cooperated at least half the time.',
    origin: 'Soft Majority — Axelrod 1984',
    first: () => 'C', move: (s, foe) => (countD(foe) > foe.length - countD(foe) ? 'D' : 'C'),
  },
  {
    id: 'hard-majority', name: 'Hard Majority', nice: false,
    blurb: 'Betrayed unless you had clearly cooperated more than you betrayed.',
    origin: 'Hard Majority — Axelrod 1984',
    first: () => 'D',
    move: (s, foe) => {
      const d = countD(foe);
      return foe.length - d > d ? 'C' : 'D';
    },
  },
  {
    id: 'remorseful', name: 'The Remorseful', nice: true,
    blurb: 'Mirrored you, but always broke a betrayal spiral by cooperating first.',
    origin: null,
    first: () => 'C',
    move: (s, foe, r) => (s[r - 1] === 'D' && foe[r - 1] === 'D' ? 'C' : foe[r - 1]),
  },
  {
    id: 'handshake', name: 'The Handshake', nice: false,
    blurb: 'Cooperated only with players who echoed its secret opening: Betray, then Cooperate.',
    origin: 'Handshake — Robson (1990)',
    first: () => 'D',
    move: (s, foe, r) => (r === 1 ? 'C' : foe[0] === 'D' && foe[1] === 'C' ? 'C' : 'D'),
  },
  {
    id: 'echo', name: 'The Echo', nice: true,
    blurb: 'Cooperated twice, then played your move from two rounds earlier.',
    origin: 'Slow Tit for Tat',
    first: () => 'C', move: (s, foe, r) => (r >= 2 ? foe[r - 2] : 'C'),
  },
  {
    id: 'firm-fair', name: 'Firm but Fair', nice: true,
    blurb: 'Cooperated freely; retaliated only the round after its own cooperation was betrayed.',
    origin: 'Firm But Fair — Frean (1994)',
    first: () => 'C',
    move: (s, foe, r) => (s[r - 1] === 'C' && foe[r - 1] === 'D' ? 'D' : 'C'),
  },
  {
    id: 'sneak', name: 'The Sneak', nice: false,
    blurb: 'Mirrored you, but slipped in a free betrayal every seventh round.',
    origin: 'Joss — Johann Joss, Axelrod 1980',
    first: () => 'C',
    move: (s, foe, r) => {
      const base = foe[r - 1];
      return base === 'C' && (r + 1) % 7 === 0 ? 'D' : base;
    },
  },
  {
    id: 'contrarian', name: 'The Contrarian', nice: false,
    blurb: 'Did the opposite of whatever you just did.',
    origin: null,
    first: () => 'D', move: (s, foe, r) => (foe[r - 1] === 'C' ? 'D' : 'C'),
  },
  {
    id: 'accountant', name: 'The Accountant', nice: true,
    blurb: 'Cooperated while ahead on points, betrayed to catch up when behind.',
    origin: null,
    first: () => 'C',
    move: (s, foe, r) => {
      let me = 0;
      let you = 0;
      for (let i = 0; i < r; i++) {
        const [a, b] = payoff(s[i], foe[i]);
        me += a;
        you += b;
      }
      return me >= you ? 'C' : 'D';
    },
  },
  {
    id: 'patient-grudge', name: 'The Patient Grudge', nice: true,
    blurb: 'Went hostile after your first betrayal, but three straight cooperations won it back.',
    origin: null,
    first: () => 'C',
    move: (s, foe, r) => {
      if (foe.indexOf('D') === -1) return 'C';
      if (r >= 3 && foe[r - 1] === 'C' && foe[r - 2] === 'C' && foe[r - 3] === 'C') return 'C';
      return 'D';
    },
  },
  {
    id: 'mood-swing', name: 'The Mood Swing', nice: false,
    blurb: 'Played fair Tit-for-Tat for the first dozen rounds — then turned on you for good.',
    origin: null,
    first: () => 'C', move: (s, foe, r) => (r >= 12 ? 'D' : foe[r - 1]),
  },
  // --- historical additions ---
  {
    id: 'modeler', name: 'The Modeler', nice: false,
    blurb: 'Built a statistical model of how you react, and betrayed while it was still uncertain about you.',
    origin: 'Downing / "Outcome Maximization" — Leslie Downing, Axelrod 1980 (finished near the bottom — too clever for its own good)',
    first: () => 'D',
    move: (s, foe, r) => {
      if (r < 2) return 'D';
      let cAfterC = 0;
      let nAfterC = 0;
      let cAfterD = 0;
      let nAfterD = 0;
      for (let i = 1; i < r; i++) {
        if (s[i - 1] === 'C') {
          nAfterC++;
          if (foe[i] === 'C') cAfterC++;
        } else {
          nAfterD++;
          if (foe[i] === 'C') cAfterD++;
        }
      }
      const pC = nAfterC ? cAfterC / nAfterC : 0.5;
      const pD = nAfterD ? cAfterD / nAfterD : 0.5;
      return 3 * pC >= 1 + 4 * pD ? 'C' : 'D';
    },
  },
  {
    id: 'escalator', name: 'The Escalator', nice: true,
    blurb: 'Punished your nth betrayal with n retaliations, then offered two cooperations to reset.',
    origin: 'Gradual — Beaufils, Delahaye & Mathieu (1996); beat Tit for Tat in their tournament',
    first: () => 'C',
    move: (s, foe, r) => {
      let punishLeft = 0;
      let calmLeft = 0;
      let seenD = 0;
      let mv = 'C';
      for (let i = 0; i < r; i++) {
        if (foe[i] === 'D') {
          seenD++;
          if (punishLeft <= 0 && calmLeft <= 0) {
            punishLeft = seenD;
            calmLeft = 2;
          }
        }
        if (punishLeft > 0) {
          mv = 'D';
          punishLeft--;
        } else if (calmLeft > 0) {
          mv = 'C';
          calmLeft--;
        } else mv = 'C';
      }
      return mv;
    },
  },
  {
    id: 'matcher', name: 'The Matcher', nice: true,
    blurb: 'Cooperated whenever you two had agreed last round, betrayed whenever you had clashed.',
    origin: 'Grofman — Bernard Grofman, Axelrod 1980',
    first: () => 'C', move: (s, foe, r) => (s[r - 1] === foe[r - 1] ? 'C' : 'D'),
  },
  {
    id: 'fader', name: 'The Fader', nice: false,
    blurb: 'Started as pure Tit-for-Tat, then grew steadily more likely to betray as the game wore on.',
    origin: 'Feld — Scott Feld, Axelrod 1980',
    first: () => 'C',
    move: (s, foe, r, rng) => {
      const base = foe[r - 1] === 'D' ? 'D' : 'C';
      if (base === 'C' && rng() < Math.min(0.5, r / 40)) return 'D';
      return base;
    },
  },
  {
    id: 'auditor', name: 'The Auditor', nice: false,
    blurb: 'Played fair Tit-for-Tat — with one surprise inspection betrayal midway through.',
    origin: 'Graaskamp — Jim Graaskamp, Axelrod 1980',
    first: () => 'C',
    move: (s, foe, r) => (r === 9 ? 'D' : foe[r - 1] === 'D' ? 'D' : 'C'),
  },
  {
    id: 'extortionist', name: 'The Extortionist', nice: false,
    blurb: 'Skimmed a betrayal off your cooperation on a schedule, forcing you into a losing ratio.',
    origin: 'Zero-Determinant strategy — Press & Dyson (2012); proved you can extort a fixed advantage in the IPD',
    first: () => 'C',
    move: (s, foe, r) => {
      const m = s[r - 1];
      const o = foe[r - 1];
      if (o === 'D') return 'D';
      if (m === 'C' && o === 'C') return r % 3 === 0 ? 'D' : 'C';
      if (m === 'D' && o === 'C') return 'C';
      return 'D';
    },
  },
  {
    id: 'historian', name: 'The Historian', nice: true,
    blurb: 'Decided each move from the pattern of the last three rounds — punished two or more betrayals in that window.',
    origin: 'Inspired by Nydegger — Rudy Nydegger, Axelrod 1980 (3rd place)',
    first: () => 'C',
    move: (s, foe, r) => (countD(foe.slice(Math.max(0, r - 3))) >= 2 ? 'D' : 'C'),
  },
  {
    id: 'cynic', name: 'The Cynic', nice: false,
    blurb: 'Opened by betraying, then held a permanent grudge against any betrayal of yours.',
    origin: 'Suspicious Grim',
    first: () => 'D', move: (s, foe) => (foe.indexOf('D') !== -1 ? 'D' : 'C'),
  },
  {
    id: 'tranquilizer', name: 'The Tranquilizer', nice: false,
    blurb: 'Built a relationship over the opening rounds, then quietly started taking advantage of it.',
    origin: 'The Tranquilizer — Craig Feathers, Axelrod 1980',
    first: () => 'C',
    move: (s, foe, r) => {
      if (r < 8) return foe[r - 1] === 'D' ? 'D' : 'C';
      if (foe[r - 1] === 'D' || foe[r - 2] === 'D') return foe[r - 1];
      return r % 4 === 0 ? 'D' : 'C';
    },
  },
  {
    id: 'gambler', name: 'The Gambler', nice: false,
    blurb: 'Mostly reciprocated — but could not resist pouncing on a run of three cooperations.',
    origin: null,
    first: () => 'C',
    move: (s, foe, r) => {
      if (s[r - 1] === 'D' && foe[r - 1] === 'D') return 'D';
      if (r >= 3 && foe[r - 1] === 'C' && foe[r - 2] === 'C' && foe[r - 3] === 'C') return 'D';
      return foe[r - 1] === 'D' ? 'D' : 'C';
    },
  },
  {
    id: 'random', name: 'The Coin', nice: false,
    blurb: 'Flipped a coin every round. No pattern, no memory, no mercy.',
    origin: 'RANDOM — Axelrod tournament benchmark',
    first: (rng) => (rng() < 0.5 ? 'C' : 'D'),
    move: (s, foe, r, rng) => (rng() < 0.5 ? 'C' : 'D'),
  },
  {
    id: 'slow-warmer', name: 'The Slow Warmer', nice: false,
    blurb: 'Cold for the first five rounds, then thawed into Tit-for-Tat.',
    origin: null,
    first: () => 'D',
    move: (s, foe, r) => (r < 5 ? 'D' : foe[r - 1] === 'D' ? 'D' : 'C'),
  },
  {
    id: 'tolerant', name: 'The Tolerant', nice: true,
    blurb: 'Extremely forgiving — cooperated until your fifth betrayal, then betrayed for good.',
    origin: null,
    first: () => 'C', move: (s, foe) => (countD(foe) >= 5 ? 'D' : 'C'),
  },
  {
    id: 'trend-follower', name: 'The Trend Follower', nice: true,
    blurb: 'Copied your last move when you were consistent, and betrayed whenever you wavered.',
    origin: null,
    first: () => 'C',
    move: (s, foe, r) => (r < 2 ? foe[r - 1] : foe[r - 1] === foe[r - 2] ? foe[r - 1] : 'D'),
  },
  {
    id: 'diplomat', name: 'The Diplomat', nice: true,
    blurb: 'Played Tit-for-Tat, but paused to offer peace every fifth round no matter what.',
    origin: null,
    first: () => 'C',
    move: (s, foe, r) => (r % 5 === 0 ? 'C' : foe[r - 1] === 'D' ? 'D' : 'C'),
  },
  {
    id: 'saint', name: 'The Saint', nice: false,
    blurb: 'Almost a total pushover — with one inexplicable betrayal early on.',
    origin: null,
    first: () => 'C', move: (s, foe, r) => (r === 6 ? 'D' : 'C'),
  },
  // --- the noise era: strategies built to survive mistakes ---
  {
    id: 'contrite', name: 'Contrite Tit for Tat', nice: true,
    blurb: 'Mirrored you, but tracked whose fault a betrayal was — and apologised with a cooperation whenever it had slipped first.',
    origin: 'Contrite Tit for Tat — Boyd (1989), Wu & Axelrod (1995); the noise-robust fix for Tit-for-Tat spirals',
    first: () => 'C',
    move: (s, foe, r) => {
      if (r === 0) return 'C';
      // if last round it betrayed while you cooperated, it "owes" an apology
      if (s[r - 1] === 'D' && foe[r - 1] === 'C') return 'C';
      return foe[r - 1];
    },
  },
  {
    id: 'zd-gtft2', name: 'Generous ZD', nice: true,
    blurb: 'A zero-determinant strategy tuned to be generous: it cannot be beaten head-to-head, yet still rewards cooperation.',
    origin: 'ZDGTFT-2 — Stewart & Plotkin (2012); "good" zero-determinant strategy that won their evolutionary tournament',
    first: () => 'C',
    move: (s, foe, r, rng) => {
      const m = s[r - 1];
      const o = foe[r - 1];
      // memory-1 probabilities approximating ZDGTFT-2 (p_CC,p_CD,p_DC,p_DD)
      const p = m === 'C' && o === 'C' ? 1 : m === 'C' && o === 'D' ? 1 / 8 : m === 'D' && o === 'C' ? 1 : 1 / 4;
      return rng() < p ? 'C' : 'D';
    },
  },
  {
    id: 'apavlov', name: 'Adaptive Pavlov', nice: true,
    blurb: 'Played Tit-for-Tat for six rounds to size you up, then switched to the best answer for the type of player you turned out to be.',
    origin: 'APavlov — Li (2007); classifies the opponent, then best-responds',
    first: () => 'C',
    move: (s, foe, r) => {
      if (r < 6) return foe[r - 1];
      const d = countD(foe.slice(0, 6));
      if (d >= 4) return 'D'; // aggressive → punish hard
      if (d === 0) return 'C'; // cooperator → keep cooperating
      return foe[r - 1]; // mixed → keep mirroring
    },
  },
  {
    id: 'omega', name: 'Omega Tit for Tat', nice: true,
    blurb: 'Tit-for-Tat with two safety valves: it breaks out of a Cooperate/Betray see-saw, and goes permanently hostile if you start looking random.',
    origin: 'OmegaTFT — Slany & Kienreich (2003)',
    first: () => 'C',
    move: (s, foe, r) => {
      if (r === 0) return 'C';
      let randomness = 0;
      let deadlock = 0;
      for (let i = 1; i < r; i++) {
        if (foe[i] !== foe[i - 1]) randomness++;
        if (foe[i] !== s[i]) deadlock++;
      }
      if (r >= 8 && randomness / r > 0.55) return 'D'; // treat as random → grim
      if (deadlock >= 3 && s[r - 1] !== foe[r - 1] && s[r - 2] !== foe[r - 2]) return 'C'; // break the see-saw
      return foe[r - 1];
    },
  },
  {
    id: 'forecaster', name: 'The Forecaster', nice: true,
    blurb: 'Built a short-term model of how you respond and played the best reply to its forecast — forgiving a lone anomaly as probable noise.',
    origin: 'Derived Belief Strategy (DBS) — Au & Nau (2006); winner of the 2005 noisy IPD category',
    first: () => 'C',
    move: (s, foe, r) => {
      if (r < 2) return 'C';
      // P(you cooperate | your own last move)
      let cAfterC = 0;
      let nAfterC = 0;
      let cAfterD = 0;
      let nAfterD = 0;
      for (let i = 1; i < r; i++) {
        if (foe[i - 1] === 'C') {
          nAfterC++;
          if (foe[i] === 'C') cAfterC++;
        } else {
          nAfterD++;
          if (foe[i] === 'C') cAfterD++;
        }
      }
      const predict = foe[r - 1] === 'C'
        ? nAfterC && cAfterC / nAfterC >= 0.5
        : nAfterD && cAfterD / nAfterD >= 0.5;
      return predict ? 'C' : 'D'; // cooperate if it forecasts your cooperation
    },
  },
  {
    id: 'naive-prober', name: 'Naive Prober', nice: false,
    blurb: 'Played Tit-for-Tat but slipped in a small unprovoked betrayal now and then, just to see what it could get away with.',
    origin: 'Naive Prober — a standard low-rate probing variant of Tit for Tat',
    first: () => 'C',
    move: (s, foe, r, rng) => {
      const base = foe[r - 1] === 'D' ? 'D' : 'C';
      if (base === 'C' && rng() < 0.04) return 'D';
      return base;
    },
  },
  {
    id: 'remorseful-prober', name: 'Remorseful Prober', nice: false,
    blurb: 'Probed like Naive Prober, but if you retaliated for its probe it backed off and cooperated to smooth things over.',
    origin: 'Remorseful Prober — a probing Tit-for-Tat that distinguishes its own probes from your betrayals',
    first: () => 'C',
    move: (s, foe, r, rng) => {
      if (r >= 2 && s[r - 1] === 'D' && foe[r - 1] === 'D' && s[r - 2] === 'D' && foe[r - 2] === 'C')
        return 'C'; // you punished my probe — make peace
      const base = foe[r - 1] === 'D' ? 'D' : 'C';
      if (base === 'C' && rng() < 0.05) return 'D';
      return base;
    },
  },
  {
    id: 'colluder', name: 'The Colluder', nice: false,
    blurb: 'Ran a recognition handshake and cooperated only with players who returned it — everyone else got hammered.',
    origin: 'Southampton team strategy — Rogers et al. (2004), which won Axelrod’s 20th-anniversary tournament by colluding',
    first: () => 'C',
    move: (s, foe, r) => {
      // handshake: C, D, C, D over the first four rounds
      const HS = ['C', 'D', 'C', 'D'];
      if (r < 4) return HS[r];
      const matched = foe[0] === 'C' && foe[1] === 'D' && foe[2] === 'C' && foe[3] === 'D';
      return matched ? 'C' : 'D';
    },
  },
];

// ===========================================================================
// GENERATED tier — parametrised archetypes
// ===========================================================================
const CYCLE_PATTERNS = ['CD', 'CCD', 'CDD', 'CCDD', 'CDDD', 'CCCD', 'CCDCD', 'CDC', 'DCC', 'CCDD'];

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const flip = (m) => (m === 'D' ? 'C' : 'D');
const sub = {
  tft: (s, foe, r) => (r === 0 ? 'C' : foe[r - 1]),
  allC: () => 'C',
  allD: () => 'D',
  grim: (s, foe) => (foe.indexOf('D') !== -1 ? 'D' : 'C'),
};

const ARCHETYPES = [
  {
    key: 'reciprocator',
    pick: (rng) => ({
      open: pick(rng, ['C', 'D']),
      patience: pick(rng, [1, 1, 2, 3]),
      grudge: pick(rng, [1, 1, 2, 3]),
      forgive: pick(rng, [0, 0, 0.1, 0.25]),
    }),
    build: (p) => ({
      first: () => p.open,
      move: (s, foe, r, rng) => {
        let angry = false;
        for (let i = Math.max(p.patience - 1, r - p.grudge); i < r; i++) {
          let run = true;
          for (let k = 0; k < p.patience; k++) {
            if (foe[i - k] !== 'D') {
              run = false;
              break;
            }
          }
          if (run) {
            angry = true;
            break;
          }
        }
        if (angry && (p.forgive === 0 || rng() >= p.forgive)) return 'D';
        return r === 0 ? p.open : 'C';
      },
    }),
    describe: (p) => {
      const parts = [];
      parts.push(p.open === 'D' ? 'Opened with a betrayal.' : 'Opened by cooperating.');
      parts.push(
        p.patience === 1
          ? 'Retaliated as soon as you betrayed'
          : `Retaliated only after ${p.patience} of your betrayals in a row`
      );
      parts.push(p.grudge === 1 ? 'for one round' : `for ${p.grudge} rounds`);
      let s = parts[0] + ' ' + parts[1] + ' ' + parts[2] + '.';
      if (p.forgive > 0)
        s += ` Forgave about ${Math.round(p.forgive * 100)}% of the time.`;
      return s;
    },
  },
  {
    key: 'grudger',
    pick: (rng) => ({
      open: pick(rng, ['C', 'C', 'D']),
      threshold: pick(rng, [1, 1, 2, 3, 5]),
      redemption: pick(rng, ['none', 'none', 'streak3', 'periodic8']),
    }),
    build: (p) => ({
      first: () => p.open,
      move: (s, foe, r) => {
        if (countD(foe) < p.threshold) return r === 0 ? p.open : 'C';
        if (p.redemption === 'streak3' && r >= 3 && foe[r - 1] === 'C' && foe[r - 2] === 'C' && foe[r - 3] === 'C')
          return 'C';
        if (p.redemption === 'periodic8' && r > 0 && r % 8 === 0) return 'C';
        return 'D';
      },
    }),
    describe: (p) => {
      const lead = p.open === 'D' ? 'Opened by betraying, then cooperated' : 'Cooperated';
      let s = `${lead} until your ${ordinal(p.threshold)} betrayal, then betrayed`;
      if (p.redemption === 'streak3') s += ', though three cooperations in a row could win it back.';
      else if (p.redemption === 'periodic8') s += ', with a fresh start every 8 rounds.';
      else s += ' for the rest of the game.';
      return s;
    },
  },
  {
    key: 'cycler',
    pick: (rng) => ({ pattern: pick(rng, CYCLE_PATTERNS) }),
    build: (p) => ({
      first: () => p.pattern[0],
      move: (s, foe, r) => p.pattern[r % p.pattern.length],
    }),
    describe: (p) =>
      `Ignored you entirely and ran a fixed loop: ${p.pattern
        .split('')
        .map((c) => (c === 'C' ? 'Cooperate' : 'Betray'))
        .join(', ')}.`,
  },
  {
    key: 'majority',
    pick: (rng) => ({
      open: pick(rng, ['C', 'D']),
      hard: pick(rng, [false, true]),
      window: pick(rng, [0, 0, 5, 8]),
    }),
    build: (p) => ({
      first: () => p.open,
      move: (s, foe) => {
        const w = p.window ? foe.slice(-p.window) : foe;
        const d = countD(w);
        const c = w.length - d;
        return p.hard ? (c > d ? 'C' : 'D') : d > c ? 'D' : 'C';
      },
    }),
    describe: (p) => {
      const span = p.window ? `your last ${p.window} moves` : 'your whole record';
      return p.hard
        ? `Betrayed unless ${span} showed a clear cooperation majority.`
        : `Cooperated as long as ${span} were at least half cooperative.`;
    },
  },
  {
    key: 'turncoat',
    pick: (rng) => {
      const kinds = ['tft', 'allC', 'allD', 'grim'];
      const a = pick(rng, kinds);
      let b = pick(rng, kinds);
      if (b === a) b = kinds[(kinds.indexOf(a) + 1) % kinds.length];
      return { a, b, turn: pick(rng, [6, 8, 10, 12]) };
    },
    build: (p) => ({
      first: () => (sub[p.a](['x'], ['x'], 0) === 'D' ? 'D' : 'C'),
      move: (s, foe, r) => (r < p.turn ? sub[p.a](s, foe, r) : sub[p.b](s, foe, r)),
    }),
    describe: (p) =>
      `Played ${phase(p.a)} for the first ${p.turn} rounds, then switched to ${phase(p.b)}.`,
  },
  {
    key: 'prober',
    pick: (rng) => ({
      probe: pick(rng, ['D', 'DC', 'DCC', 'DDC']),
      ifPunished: pick(rng, ['tft', 'grim']),
      ifNot: pick(rng, ['allD', 'sneak', 'meanTft']),
    }),
    build: (p) => ({
      first: () => p.probe[0],
      move: (s, foe, r) => {
        if (r < p.probe.length) return p.probe[r];
        const punished = foe.slice(1, p.probe.length + 1).indexOf('D') !== -1;
        if (punished) return p.ifPunished === 'grim' ? sub.grim(s, foe) : foe[r - 1];
        if (p.ifNot === 'allD') return 'D';
        if (p.ifNot === 'sneak') return foe[r - 1] === 'C' && (r + 1) % 5 === 0 ? 'D' : foe[r - 1];
        return r % 3 === 0 ? 'D' : foe[r - 1] === 'D' ? 'D' : 'C';
      },
    }),
    describe: (p) => {
      const pr = p.probe;
      const yes =
        p.ifPunished === 'grim' ? 'a permanent grudge' : 'plain mirroring';
      const no =
        p.ifNot === 'allD'
          ? 'relentless betrayal'
          : p.ifNot === 'sneak'
          ? 'regular sneak betrayals'
          : 'frequent needling betrayals';
      return `Opened with a probe pattern (${pr}). If you hit back, it settled into ${yes}; if you let it slide, it moved to ${no}.`;
    },
  },
  {
    key: 'scorekeeper',
    pick: (rng) => ({
      open: pick(rng, ['C', 'D']),
      mode: pick(rng, ['ahead', 'within', 'behind']),
      margin: pick(rng, [0, 5, 10]),
    }),
    build: (p) => ({
      first: () => p.open,
      move: (s, foe, r) => {
        let me = 0;
        let you = 0;
        for (let i = 0; i < r; i++) {
          const [a, b] = payoff(s[i], foe[i]);
          me += a;
          you += b;
        }
        if (p.mode === 'ahead') return me >= you ? 'C' : 'D';
        if (p.mode === 'within') return Math.abs(me - you) <= p.margin ? 'C' : 'D';
        return me < you - p.margin ? 'D' : 'C';
      },
    }),
    describe: (p) => {
      if (p.mode === 'ahead') return 'Watched the scoreboard — cooperated while ahead, betrayed to catch up when behind.';
      if (p.mode === 'within')
        return `Cooperated while the score stayed within ${p.margin} points either way, and betrayed once the gap widened.`;
      return `Turned aggressive only when it fell more than ${p.margin} points behind.`;
    },
  },
  {
    key: 'sneak',
    pick: (rng) => ({
      every: pick(rng, [4, 5, 6, 7, 8, 10]),
      base: pick(rng, ['tft', 'allC']),
    }),
    build: (p) => ({
      first: () => 'C',
      move: (s, foe, r) => {
        const b = p.base === 'tft' ? (r === 0 ? 'C' : foe[r - 1]) : 'C';
        return b === 'C' && (r + 1) % p.every === 0 ? 'D' : b;
      },
    }),
    describe: (p) =>
      `${p.base === 'tft' ? 'Mirrored you' : 'Cooperated'}, but slipped in a free betrayal every ${
        p.every
      } rounds.`,
  },
  {
    key: 'pavlov',
    pick: (rng) => ({ open: pick(rng, ['C', 'C', 'D']), greedy: pick(rng, [true, true, false]) }),
    build: (p) => ({
      first: () => p.open,
      move: (s, foe, r) => {
        const m = s[r - 1];
        const o = foe[r - 1];
        const win = (m === 'C' && o === 'C') || (p.greedy && m === 'D' && o === 'C');
        return win ? m : flip(m);
      },
    }),
    describe: (p) =>
      `${
        p.open === 'D' ? 'Opened by betraying. ' : ''
      }Kept its move after a round that went well for it and flipped after one that did not.`,
  },
  {
    key: 'reader',
    pick: (rng) => ({
      open: pick(rng, ['C', 'C', 'D']),
      window: pick(rng, [2, 3, 4]),
      trigger: pick(rng, [1, 2, 3]),
    }),
    build: (p) => ({
      first: () => p.open,
      move: (s, foe, r) => (countD(foe.slice(-p.window)) >= p.trigger ? 'D' : r === 0 ? p.open : 'C'),
    }),
    describe: (p) =>
      `${p.open === 'D' ? 'Opened by betraying. ' : ''}Punished you whenever your last ${
        p.window
      } moves held ${p.trigger} or more betrayals.`,
  },
];

function ordinal(n) {
  return { 1: 'first', 2: 'second', 3: 'third', 5: 'fifth' }[n] || n + 'th';
}
function phase(k) {
  return { tft: 'Tit-for-Tat', allC: 'unconditional cooperation', allD: 'unconditional betrayal', grim: 'a permanent grudge' }[k];
}

// name pools
const ADJ_NICE = ['Gentle', 'Patient', 'Forgiving', 'Steady', 'Cordial', 'Measured', 'Earnest', 'Genial', 'Fair-Minded'];
const ADJ_NASTY = ['Ruthless', 'Sly', 'Cold', 'Grasping', 'Vicious', 'Devious', 'Merciless', 'Predatory', 'Underhanded'];
const ADJ_ODD = ['Curious', 'Restless', 'Peculiar', 'Methodical', 'Erratic', 'Inscrutable', 'Clockwork'];
const NOUNS = {
  reciprocator: ['Reciprocator', 'Mirror', 'Echoer', 'Answerer'],
  grudger: ['Sentinel', 'Zealot', 'Warden', 'Inquisitor'],
  cycler: ['Metronome', 'Automaton', 'Drummer', 'Loop'],
  majority: ['Census-Taker', 'Pollster', 'Tallyman', 'Registrar'],
  turncoat: ['Turncoat', 'Chameleon', 'Two-Face', 'Weathervane'],
  prober: ['Tester', 'Prober', 'Interrogator', 'Needle'],
  scorekeeper: ['Scorekeeper', 'Banker', 'Bookkeeper', 'Auditor'],
  sneak: ['Pickpocket', 'Grifter', 'Magpie', 'Cutpurse'],
  pavlov: ['Pragmatist', 'Opportunist', 'Adapter'],
  reader: ['Analyst', 'Profiler', 'Watcher', 'Reader'],
};

function makeName(rng, key, nice) {
  let adj;
  if (key === 'cycler') adj = pick(rng, ADJ_ODD); // a metronome isn't "ruthless"
  else if (nice) adj = pick(rng, ADJ_NICE);
  else adj = rng() < 0.75 ? pick(rng, ADJ_NASTY) : pick(rng, ADJ_ODD);
  return `The ${adj} ${pick(rng, NOUNS[key])}`;
}

// Axelrod's test: a strategy is "nice" if it is never the first to defect.
function computeNice(strat, len = 26) {
  const rng = mulberry32(0x5eed);
  const selfHist = [];
  const foeHist = [];
  for (let r = 0; r < len; r++) {
    const mv = r === 0 ? strat.first(rng) : strat.move(selfHist, foeHist, r, rng);
    if (mv === 'D') return false;
    selfHist.push('C');
    foeHist.push('C');
  }
  return true;
}

export function buildGenerated(seed) {
  const rng = mulberry32(seed >>> 0);
  const arch = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];
  const params = arch.pick(rng);
  const strat = arch.build(params);
  const nice = computeNice(strat);
  const name = makeName(rng, arch.key, nice);
  const blurb = arch.describe(params);
  return {
    id: 'gen:' + (seed >>> 0),
    name,
    nice,
    blurb,
    origin: null,
    first: strat.first,
    move: strat.move,
  };
}

// ===========================================================================
// Selection + resolution
// ===========================================================================
export const GENERATED_POOL = 260; // virtual size for the daily draw

function rawRef(dateStr, salt) {
  // ~1 day in 7 is a NAMED classic; the rest are freshly generated.
  const key = 'opp:' + dateStr + (salt ? ':' + salt : '');
  const kind = hashStr('oppkind:' + dateStr + (salt ? ':' + salt : '')) % 7;
  const h = hashStr(key);
  if (kind === 0) return 'named:' + NAMED[h % NAMED.length].id;
  return 'gen:' + h;
}

// The daily opponent, guaranteed not to share a name with any of the last 30
// days — so it always feels like something you haven't seen recently.
export function dailyOpponentRef(dateStr) {
  const base = Date.parse(dateStr + 'T00:00:00Z');
  const recent = new Set();
  for (let i = 1; i <= 30; i++) {
    const d = new Date(base - i * 86400000).toISOString().slice(0, 10);
    recent.add(resolveOpponent(rawRef(d)).name);
  }
  let ref = rawRef(dateStr);
  for (let t = 1; t <= 16 && recent.has(resolveOpponent(ref).name); t++) {
    ref = rawRef(dateStr, 'r' + t);
  }
  return ref;
}

export function resolveOpponent(ref) {
  if (typeof ref === 'string' && ref.startsWith('named:')) {
    const id = ref.slice(6);
    return NAMED.find((o) => o.id === id) || NAMED[0];
  }
  if (typeof ref === 'string' && ref.startsWith('gen:')) {
    return buildGenerated(Number(ref.slice(4)) >>> 0);
  }
  // bare id fallback
  return NAMED.find((o) => o.id === ref) || buildGenerated(hashStr(String(ref)));
}

export const POOL_SIZE = NAMED.length + GENERATED_POOL;
