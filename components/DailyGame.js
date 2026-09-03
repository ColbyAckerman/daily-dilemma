'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  hashStr,
  mulberry32,
  payoff,
  revealOpponent,
  transmit,
  buildField,
  bestScore,
  NOISE_RATE,
} from '@/lib/engine';
import { resolveOpponent } from '@/lib/opponents';
import Modal from './Modal';

const HKEY = 'dd:history';
const HOLD_MS = 340; // brief face-down beat before the flip
const REVEAL_MS = 780;
const FX_MS = 1150;

// gain / fx-kind, keyed by yourMove + theirMove
const VERDICT = {
  CC: ['+3', 'trust'],
  DC: ['+5', 'sting'],
  CD: ['+0', 'sucker'],
  DD: ['+1', 'stale'],
};
const GLYPH = { C: 'C', D: 'D' };

// your percentile in the field: you outscored this % of the 100 strategies
function percentile(beat, total) {
  if (!total) return null;
  return Math.min(99, Math.max(1, Math.round((beat / total) * 100)));
}
function ordSuffix(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
}
function ordinal(n) {
  return `${n}${ordSuffix(n)}`;
}
function tierLabel(beat, total) {
  const p = percentile(beat, total);
  if (p == null) return '';
  return `${p >= 90 ? '\u{1F3C6} ' : ''}${ordinal(p)} percentile`;
}


// ---------------------------------------------------------------------------
function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HKEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}
function writeDay(dateStr, record) {
  try {
    const h = readHistory();
    h[dateStr] = record;
    localStorage.setItem(HKEY, JSON.stringify(h));
  } catch (e) {}
}
function mergeDay(dateStr, patch) {
  const h = readHistory();
  const next = { ...(h[dateStr] || {}), ...patch };
  writeDay(dateStr, next);
  return next;
}
function untilNextPuzzle() {
  const n = new Date();
  const next = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1);
  const ms = Math.max(0, next - n.getTime());
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
function longDate(d) {
  const [, m, day] = d.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${day}`;
}
function buzz(p) {
  try {
    navigator.vibrate && navigator.vibrate(p);
  } catch (e) {}
}
function computeStats(history) {
  const days = Object.keys(history)
    .filter((d) => history[d] && history[d].done)
    .sort();
  const done = new Set(days);
  const now = new Date();
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const ds = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    if (done.has(ds)) streak++;
    else if (i === 0) continue;
    else break;
  }
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    run = prev && Date.parse(d) - Date.parse(prev) === 86400000 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const pcts = days
    .map((d) => history[d])
    .filter((r) => r && r.total > 0)
    .map((r) => Math.round((r.beat / r.total) * 100));
  const avgPct = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  const bestPct = pcts.length ? Math.max(...pcts) : null;
  return { played: days.length, streak, best, avgPct, bestPct };
}

// green = cooperate, red = defect — one square per round, same as the board
function moveRow(moves) {
  return moves.map((m) => (m === 'D' ? '\u{1F7E5}' : '\u{1F7E9}')).join('');
}

// stable per-browser id so the leaderboard keeps one row per device per day
function deviceId() {
  try {
    let d = localStorage.getItem('dd:device');
    if (!d) {
      d =
        (typeof crypto !== 'undefined' && crypto.randomUUID && crypto.randomUUID()) ||
        `d${Date.now()}${Math.random().toString(36).slice(2)}`;
      localStorage.setItem('dd:device', d);
    }
    return d;
  } catch (e) {
    return `d${Date.now()}`;
  }
}
// the player's *intended* line (undo the noise flips) — what the server re-simulates
function intendedLine(my, slips) {
  return my.map((m, i) => (slips.includes(i) ? (m === 'D' ? 'C' : 'D') : m)).join('');
}
function shareText(puzzle, my, them, headline, beat) {
  const base =
    typeof window !== 'undefined' ? window.location.origin : 'https://daily-dilemma-nine.vercel.app';
  const link = beat == null ? base : `${base}/d/${puzzle.dateStr}?b=${beat}`;
  return `DD#${puzzle.issue}\n${headline}\n${moveRow(my)}\n${moveRow(them)}\n${link}`;
}

// ---------------------------------------------------------------------------
export default function DailyGame({ puzzle }) {
  const opp = useMemo(() => resolveOpponent(puzzle.oppRef), [puzzle.oppRef]);
  const rngRef = useRef(null);
  const timers = useRef([]);

  const [phase, setPhase] = useState('intro'); // intro | play | done
  const [my, setMy] = useState([]); // transmitted player moves
  const [them, setThem] = useState([]); // transmitted opponent moves
  const [slips, setSlips] = useState([]); // round indices where the player's move flipped
  const [armed, setArmed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fx, setFx] = useState(null); // { n } — marks that the current round has resolved
  const [exchange, setExchange] = useState(null); // last resolved round, kept on screen
  const [theme, setTheme] = useState(null);
  const [modal, setModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState({});

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    let t = null;
    try {
      t = localStorage.getItem('dd-theme');
    } catch (e) {}
    if (t !== 'dark' && t !== 'light') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    setTheme(t);

    const h = readHistory();
    setHistory(h);
    const saved = h[puzzle.dateStr];

    const rate = NOISE_RATE; // signal noise — off for now (NOISE_RATE = 0); plumbing kept

    const rng = mulberry32(hashStr(puzzle.seed));
    rngRef.current = rng;
    if (saved) {
      const mv = typeof saved.moves === 'string' ? saved.moves.split('') : [];
      const om = [];
      for (let r = 0; r < mv.length; r++) {
        const raw = r === 0 ? opp.first(rng) : opp.move(om, mv.slice(0, r), r, rng);
        const oi = raw === 'D' ? 'D' : 'C';
        om.push(rate ? transmit(puzzle.dateStr, r, 'o', oi, rate) : oi);
      }
      setMy(mv);
      setThem(om);
      if (mv.length) {
        let a = 0;
        let b = 0;
        for (let i = 0; i < mv.length; i++) {
          const [x, y] = payoff(mv[i], om[i]);
          a += x;
          b += y;
        }
        const ld = a - b;
        const lm = mv[mv.length - 1];
        const lo = om[om.length - 1];
        const [lgain, lkind] = VERDICT[lm + lo];
        setExchange({
          me: lm,
          them: lo,
          gain: lgain,
          kind: lkind,
          leadTxt: ld > 0 ? `you lead +${ld}` : ld < 0 ? `you trail ${ld}` : 'dead level',
          n: mv.length - 1,
        });
      }
      setPhase(saved.done || mv.length >= puzzle.length ? 'done' : 'play');
    }
  }, [puzzle.dateStr, puzzle.seed, puzzle.length, opp]);

  function setThemeMode() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('dd-theme', next);
    } catch (e) {}
  }
  function start() {
    writeDay(puzzle.dateStr, { moves: '', score: 0, oppRef: puzzle.oppRef, done: false });
    setHistory((h) => ({ ...h, [puzzle.dateStr]: { moves: '', score: 0, done: false } }));
    setPhase('play');
  }

  const scores = useMemo(() => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < them.length; i++) {
      const [x, y] = payoff(my[i], them[i]);
      a += x;
      b += y;
    }
    return { me: a, them: b };
  }, [my, them]);

  function choose(move) {
    if (phase !== 'play' || busy) return;
    setBusy(true);
    setArmed(move);

    const r = my.length;
    const rng = rngRef.current;
    const rate = NOISE_RATE;
    const oRaw = r === 0 ? opp.first(rng) : opp.move(them, my, r, rng);
    const oIntent = oRaw === 'D' ? 'D' : 'C';
    const pm = rate ? transmit(puzzle.dateStr, r, 'p', move, rate) : move;
    const om = rate ? transmit(puzzle.dateStr, r, 'o', oIntent, rate) : oIntent;

    const t1 = setTimeout(() => {
      const nMy = [...my, pm];
      const nThem = [...them, om];
      setMy(nMy);
      setThem(nThem);
      if (pm !== move) setSlips((s) => [...s, r]);

      const [gain] = VERDICT[pm + om];
      setFx({ n: r });
      buzz(om === 'D' && pm === 'C' ? [12, 45, 25] : 12);

      let myTot = 0;
      let themTot = 0;
      for (let i = 0; i < nMy.length; i++) {
        const [x, y] = payoff(nMy[i], nThem[i]);
        myTot += x;
        themTot += y;
      }
      setExchange({ me: pm, them: om, gain, slipped: pm !== move, n: r });

      const finished = nMy.length >= puzzle.length;
      writeDay(puzzle.dateStr, {
        moves: nMy.join(''),
        score: myTot,
        oppRef: puzzle.oppRef,
        done: finished,
      });
      setHistory((h) => ({
        ...h,
        [puzzle.dateStr]: { moves: nMy.join(''), score: myTot, done: finished },
      }));

      const t2 = setTimeout(() => {
        setArmed(null);
        setBusy(false);
        if (finished) setPhase('done');
      }, REVEAL_MS);
      const t3 = setTimeout(() => setFx(null), FX_MS);
      timers.current.push(t2, t3);
    }, HOLD_MS);
    timers.current.push(t1);
  }

  const round = my.length;
  const canPlay = phase === 'play' && !busy && round < puzzle.length;

  // keyboard — the terminal takes input
  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey || modal) return;
      const k = e.key.toLowerCase();
      if (phase === 'intro' && (k === 'enter' || k === ' ')) {
        e.preventDefault();
        start();
      } else if (phase === 'play' && canPlay) {
        if (k === 'c') {
          e.preventDefault();
          choose('C');
        } else if (k === 'd') {
          e.preventDefault();
          choose('D');
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, canPlay, modal, my.length, busy]); // eslint-disable-line

  const stats = useMemo(() => computeStats(history), [history]);
  const field = useMemo(
    () => buildField(puzzle.oppRef, puzzle.length, puzzle.dateStr, NOISE_RATE),
    [puzzle.oppRef, puzzle.length, puzzle.dateStr]
  );

  async function doShare(headline, beat) {
    const text = shareText(puzzle, my, them, headline, beat);
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch (e2) {}
      ta.remove();
    }
  }

  return (
    <>
      <header className="hdr">
        <div className="hdr__group">
          <button className="ico" aria-label="How to play" onClick={() => setModal('help')}>
            <HelpIcon />
          </button>
        </div>
        <button
          type="button"
          className="hdr__title"
          aria-label="Reload"
          onClick={() => window.location.reload()}
        >
          Daily Dilemma
        </button>
        <div className="hdr__group">
          <button className="ico" aria-label="Stats" onClick={() => setModal('stats')}>
            <StatsIcon />
          </button>
          <button className="ico" aria-label="Theme" onClick={setThemeMode} suppressHydrationWarning>
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      <main className={`page${phase === 'done' ? '' : ' page--center'}`}>
        {phase === 'intro' && <Intro onPlay={start} />}

        {(phase === 'play' || phase === 'done') && (
          <p className="meta">
            <span className="meta__no">DD#{puzzle.issue}</span>
            <span className="meta__date">{longDate(puzzle.dateStr)}</span>
          </p>
        )}

        {phase === 'play' && (
          <section className="play">
            <div className="play__stage">
              <Scoreboard me={scores.me} them={scores.them} bump={exchange?.n} />
              <Board
                my={my}
                them={them}
                slips={slips}
                armed={armed}
                rolling={!!armed && !fx}
                gain={armed && !fx ? null : exchange?.gain}
                revealedN={exchange?.n}
                myScore={scores.me}
                themScore={scores.them}
                live
              />
            </div>

            <div className="choices">
              <button
                className={`btn btn--c${armed === 'C' ? ' is-armed' : ''}`}
                onClick={() => choose('C')}
                disabled={!canPlay}
              >
                <kbd>C</kbd>Cooperate
              </button>
              <button
                className={`btn btn--d${armed === 'D' ? ' is-armed' : ''}`}
                onClick={() => choose('D')}
                disabled={!canPlay}
              >
                <kbd>D</kbd>Defect
              </button>
            </div>
          </section>
        )}

        {phase === 'done' && (
          <Result
            puzzle={puzzle}
            reveal={revealOpponent(puzzle.oppRef)}
            field={field}
            my={my}
            them={them}
            slips={slips}
            score={scores.me}
            oppScore={scores.them}
            streak={stats.streak}
            copied={copied}
            savedName={history[puzzle.dateStr]?.name}
            onShare={doShare}
            onName={(name) => {
              const next = mergeDay(puzzle.dateStr, { name });
              setHistory((h) => ({ ...h, [puzzle.dateStr]: next }));
            }}
            onRecord={(p) => {
              const next = mergeDay(puzzle.dateStr, p);
              setHistory((h) => ({ ...h, [puzzle.dateStr]: next }));
            }}
          />
        )}
      </main>

      {modal === 'help' && (
        <Modal title="How to play" onClose={() => setModal(null)}>
          <Help />
        </Modal>
      )}
      {modal === 'stats' && (
        <Modal title="Your record" onClose={() => setModal(null)}>
          <div className="stats">
            <div>
              <b className="num">{stats.played}</b>
              <span>Played</span>
            </div>
            <div>
              <b className="num">{stats.streak}</b>
              <span>Streak</span>
            </div>
            <div>
              <b className="num">{stats.best}</b>
              <span>Best</span>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The board. One grid does everything: play surface, running record, and —
// coloured in — the shareable result. Two rows (you / them), one column per
// round. Green = cooperate, red = defect, grey = not played. Both sides
// commit at once; your tile fills, theirs flips over. Nothing about their
// move is random or a reaction to yours.
function Board({
  my,
  them,
  slips,
  armed,
  rolling,
  gain,
  revealedN,
  myScore,
  themScore,
  live = false,
}) {
  const active = my.length;
  const cols = active + (live ? 1 : 0); // played + the active column
  const idxs = Array.from({ length: Math.max(cols, my.length) }, (_, i) => i);

  const tile = (side, i) => {
    const played = i < my.length;
    if (played) {
      const mv = side === 'me' ? my[i] : them[i];
      const flip = i === revealedN;
      const slip = side === 'me' && slips.includes(i);
      return (
        <span
          key={i}
          className={`tile tile--${mv}${flip ? ' tile--flip' : ''}${slip ? ' tile--slip' : ''}`}
        >
          {GLYPH[mv]}
        </span>
      );
    }
    if (live && i === active) {
      if (side === 'me') {
        return (
          <span key={i} className={`tile tile--active${armed ? ` tile--${armed}` : ''}`}>
            {armed ? GLYPH[armed] : ''}
          </span>
        );
      }
      return <span key={i} className={`tile tile--active${rolling ? ' tile--wait' : ''}`} />;
    }
    return <span key={i} className="tile tile--ghost" />;
  };

  return (
    <div className="board">
      <div className="board__grid">
        <div className="board__row">
          <span className="board__label">You</span>
          {idxs.map((i) => tile('me', i))}
        </div>
        <div className="board__row board__row--them">
          <span className="board__label">Them</span>
          {idxs.map((i) => tile('them', i))}
        </div>
      </div>
      <div className="board__foot">
        {gain != null && (
          <span key={`g${revealedN}`} className="board__gain">
            {gain}
          </span>
        )}
      </div>
    </div>
  );
}

// Running score, sat right above the grid so it's the first thing you read.
// Whoever's ahead lights up; the numbers tick on every resolved round.
function Scoreboard({ me, them, bump }) {
  const lead = me > them ? 'me' : them > me ? 'them' : null;
  return (
    <div className="score" key={`s${bump ?? 'x'}`}>
      <div className={`score__side${lead === 'me' ? ' is-lead' : ''}`}>
        <span className="score__pts">{me}</span>
        <span className="score__who">You</span>
      </div>
      <span className="score__vs" aria-hidden="true" />
      <div className={`score__side${lead === 'them' ? ' is-lead' : ''}`}>
        <span className="score__pts">{them}</span>
        <span className="score__who">Them</span>
      </div>
    </div>
  );
}

const Co = <b className="c">cooperate</b>;
const De = <b className="d">defect</b>;
const OUTCOMES = [
  ['cc', <>You both {Co}</>, '3', '3'],
  ['dc', <>You {De}, they {Co}</>, '5', '0'],
  ['cd', <>They {De}, you {Co}</>, '0', '5'],
  ['dd', <>You both {De}</>, '1', '1'],
];

function Payoffs() {
  return (
    <div className="payoff">
      <div className="payoff__head">
        <span>Outcome</span>
        <span>You</span>
        <span>Them</span>
      </div>
      {OUTCOMES.map(([key, label, x, y]) => (
        <div className="payoff__row" key={key}>
          <span className="payoff__case">{label}</span>
          <span className="payoff__n payoff__n--me">{x}</span>
          <span className="payoff__n">{y}</span>
        </div>
      ))}
    </div>
  );
}

// how the finish reads as a bold uppercase word, emoji stripped for on-screen
function tierText(tier) {
  return (tier || '').replace('\u{1F3C6} ', '');
}
function tierWin(tier) {
  return /\u{1F3C6}/u.test(tier || '');
}

// your finish, as a percentile marked on the field's bell curve
function Percentile({ pct, tier }) {
  if (pct == null) return null;
  const W = 240;
  const H = 58;
  const MID = W / 2;
  const SIG = W / 5.4;
  const g = (x) => Math.exp(-((x - MID) ** 2) / (2 * SIG * SIG)) * (H - 5);
  const pts = [];
  for (let x = 0; x <= W; x += 4) pts.push(`${x},${(H - g(x)).toFixed(1)}`);
  const line = `M ${pts.join(' L ')}`;
  const area = `M 0,${H} L ${pts.join(' L ')} L ${W},${H} Z`;
  const mx = Math.min(W - 1, Math.max(1, (pct / 100) * W));
  const my = H - g(mx);
  const markTop = Math.min(my - 6, H - 26);
  const beatPts = [];
  for (let x = 0; x <= mx; x += 4) beatPts.push(`${x},${(H - g(x)).toFixed(1)}`);
  beatPts.push(`${mx.toFixed(1)},${my.toFixed(1)}`);
  const beat = `M 0,${H} L ${beatPts.join(' L ')} L ${mx.toFixed(1)},${H} Z`;
  const win = tierWin(tier);
  return (
    <div className={`pctl${win ? ' pctl--win' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H + 2}`} className="pctl__chart" aria-hidden="true">
        <path className="pctl__area" d={area} />
        <path className="pctl__beat" d={beat} />
        <path className="pctl__line" d={line} />
        <line className="pctl__mark" x1={mx} y1={markTop} x2={mx} y2={H} />
        <circle className="pctl__dot" cx={mx} cy={my} r="3.5" />
      </svg>
      <p className="pctl__label">
        {pct}
        <span className="pctl__ord">{ordSuffix(pct)}</span> percentile
      </p>
    </div>
  );
}

function Intro({ onPlay }) {
  return (
    <section className="intro">
      <p className="intro__lead">
        Each round, you and today&rsquo;s hidden strategy both choose{' '}
        <b className="c">cooperate</b> or <b className="d">defect</b>.
      </p>
      <Payoffs />
      <p className="intro__lead">The match ends on a round you can&rsquo;t predict.</p>

      <button className="btn btn--accent" onClick={onPlay}>
        Play
      </button>
    </section>
  );
}

function Result({
  puzzle,
  reveal,
  field: raw,
  my,
  them,
  slips,
  score,
  oppScore,
  streak,
  copied,
  savedName,
  onShare,
  onName,
  onRecord,
}) {
  const [countdown, setCountdown] = useState(untilNextPuzzle());
  useEffect(() => {
    const id = setInterval(() => setCountdown(untilNextPuzzle()), 30000);
    return () => clearInterval(id);
  }, []);

  // real-player board
  const [board, setBoard] = useState({ enabled: false, entries: [] });
  const [myName, setMyName] = useState(savedName || null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');
  useEffect(() => {
    let live = true;
    fetch(`/api/board?date=${puzzle.dateStr}`)
      .then((r) => r.json())
      .then((d) => live && setBoard({ enabled: !!d.enabled, entries: d.entries || [] }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [puzzle.dateStr]);

  async function submitName(e) {
    e.preventDefault();
    const name = draft.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    setSubmitErr('');
    try {
      const res = await fetch('/api/board', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          date: puzzle.dateStr,
          name,
          moves: intendedLine(my, slips),
          device: deviceId(),
        }),
      }).then((r) => r.json());
      if (res.ok) {
        setMyName(res.name);
        onName?.(res.name);
        setBoard((b) => ({
          ...b,
          entries: [
            ...b.entries.filter((x) => !(x.name === res.name && x.score === res.score)),
            { name: res.name, score: res.score },
          ],
        }));
      } else {
        setSubmitErr('Could not add that — try a different name.');
      }
    } catch (err) {
      setSubmitErr('Network hiccup — try again.');
    }
    setSubmitting(false);
  }

  const strat = (raw || []).map((s) => ({ name: s.name, score: s.score, nice: s.nice }));
  const beat = strat.filter((s) => s.score < score).length;
  const total = strat.length || 100;
  const tier = tierLabel(beat, total);
  const share = tierText(tier);

  const humans = (board.entries || [])
    .filter((e) => !(myName && e.name === myName && e.score === score))
    .map((e) => ({ name: e.name, score: e.score, human: true }));
  const rows = [
    ...strat.map((s) => ({ ...s, me: false })),
    ...humans,
    { name: myName || 'You', score, me: true, human: true },
  ].sort((a, b) => b.score - a.score || (a.me ? -1 : b.me ? 1 : a.name < b.name ? -1 : 1));
  const best = useMemo(
    () => bestScore(puzzle.oppRef, puzzle.length, puzzle.seed, puzzle.dateStr, NOISE_RATE),
    [puzzle.oppRef, puzzle.length, puzzle.seed, puzzle.dateStr]
  );
  const [showAll, setShowAll] = useState(false);
  const meIdx = rows.findIndex((r) => r.me);
  const slice = [];
  {
    const keep = new Set([0]);
    for (let d = -3; d <= 3; d++) {
      const j = meIdx + d;
      if (j >= 0 && j < rows.length) keep.add(j);
    }
    let prev = -1;
    for (const j of [...keep].sort((a, b) => a - b)) {
      if (prev >= 0 && j > prev + 1) slice.push({ gap: j - prev - 1, key: `g${j}` });
      slice.push({ r: rows[j], i: j, key: j });
      prev = j;
    }
  }
  const shownRows = showAll ? rows.map((r, i) => ({ r, i, key: i })) : slice;
  const meRef = useRef(null);
  useEffect(() => {
    onRecord?.({ beat, total, best });
    const t = setTimeout(() => meRef.current?.scrollIntoView({ block: 'center' }), 900);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  return (
    <section className="result">
      <Board my={my} them={them} slips={slips} myScore={score} themScore={oppScore} />

      <Percentile pct={percentile(beat, total)} tier={tier} />

      <div className={`card card--${reveal.nice ? 'nice' : 'nasty'}`}>
        <div className="card__head">
          <span className="card__name">{reveal.name}</span>
          <span className="tag">{reveal.nice ? 'NICE' : 'NASTY'}</span>
        </div>
        <p className="card__fam">{reveal.family}</p>
        <p className="card__blurb">{reveal.blurb}</p>
        {reveal.origin && <p className="card__src">{reveal.origin}</p>}
        <p className="card__best">
          You scored <b>{score}</b>. The best any line could do against it was{' '}
          <b>{best}</b>.
        </p>
      </div>

      <p className="log__cap">
        The field{board.enabled ? <span> &amp; the players</span> : null}
      </p>

      {board.enabled && !myName && (
        <form className="named" onSubmit={submitName}>
          <input
            className="named__in"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Pick a name for the board"
            maxLength={16}
            autoComplete="off"
            spellCheck="false"
          />
          <button className="btn named__go" disabled={!draft.trim() || submitting}>
            {submitting ? '…' : 'Add me'}
          </button>
        </form>
      )}
      {submitErr && <p className="named__err">{submitErr}</p>}

      <div className={`log${showAll ? ' log--all' : ''}`}>
        <table>
          <tbody>
            {shownRows.map((v) =>
              v.gap ? (
                <tr key={v.key} className="log__gap">
                  <td colSpan={3}>{v.gap} more between</td>
                </tr>
              ) : (
                <tr
                  key={v.key}
                  ref={v.r.me ? meRef : null}
                  className={v.r.me ? 'me' : undefined}
                >
                  <td className="rank">{v.i + 1}</td>
                  <td className="name">
                    <i
                      className={`dot dot--${
                        v.r.me || v.r.human ? 'human' : v.r.nice ? 'nice' : 'nasty'
                      }`}
                    />
                    {v.r.name}
                  </td>
                  <td className="pts">{v.r.score}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
      {!showAll && (
        <button className="log__more" onClick={() => setShowAll(true)}>
          Show all {rows.length}
        </button>
      )}

      {streak > 1 && <p className="streak">{'\u{1F525}'} {streak}-day streak</p>}

      <button className="btn btn--accent result__share" onClick={() => onShare(share, beat)}>
        {copied ? 'Copied' : 'Share'}
      </button>
      <p className="result__next">Next puzzle in {countdown}</p>
    </section>
  );
}

function Help() {
  return (
    <div className="prose">
      <p>
        Each round, you and a hidden strategy secretly choose <strong>Cooperate</strong> or{' '}
        <strong>Defect</strong>. Every pair of choices pays out:
      </p>
      <Payoffs />
      <p>
        Defecting on a cooperator is the greedy play &mdash; you take 5, they get nothing. But if
        you both reach for it, you both walk away with 1. Try to end with the most points.
      </p>

      <h3>The opponent</h3>
      <p>
        A new pre-determined strategy each day, the same one for everyone. Figure it out as you go.
        It&rsquo;s revealed with its name once the match ends.
      </p>

      <h3>Length</h3>
      <p>
        The match ends after a set but secret number of rounds. It changes each day, and there
        is no warning &mdash; so there is no safe last defection.
      </p>

      <h3>The field</h3>
      <p>
        When it&rsquo;s over, a fixed field of 100 strategies is scored against your exact opponent
        over the same rounds. Where your score lands among them is your placement.
      </p>

      <h3>Nice or nasty</h3>
      <p style={{ marginBottom: 0 }}>
        The opponent is <strong>nice</strong> if it never defects first, <strong>nasty</strong> if
        it will.
      </p>
    </div>
  );
}

/* icons — one weight, one style */
const HelpIcon = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.9.4-1.5 1-1.5 2.2" />
    <path d="M12 17.5v.01" />
  </svg>
);
const StatsIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M5 20V11M12 20V5M19 20v-6" />
  </svg>
);
const MoonIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
  </svg>
);
const SunIcon = () => (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
  </svg>
);
