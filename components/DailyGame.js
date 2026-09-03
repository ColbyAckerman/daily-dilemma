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
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

// how a finish reads: 🏆 top of the field / 🏆 top X% / top X% / top half / bottom half
function tierLabel(beat, total) {
  if (!total) return '';
  const topPct = Math.ceil(((total - beat) / total) * 100);
  if (beat >= total - 3) return '\u{1F3C6} top of the field';
  if (topPct <= 10) return `\u{1F3C6} top ${topPct}%`;
  if (topPct <= 25) return `top ${topPct}%`;
  return total - beat <= Math.floor(total / 2) ? 'top half' : 'bottom half';
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
function shortDate(d) {
  const [, m, day] = d.split('-').map(Number);
  return `${MONTHS[m - 1]} ${day}`;
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
  const tops = days
    .map((d) => history[d])
    .filter((r) => r && r.total > 0)
    .map((r) => Math.ceil(((r.total - r.beat) / r.total) * 100));
  const avgTop = tops.length ? Math.round(tops.reduce((a, b) => a + b, 0) / tops.length) : null;
  const bestTop = tops.length ? Math.min(...tops) : null;
  return { played: days.length, streak, best, avgTop, bestTop };
}

// green = cooperate, red = defect — one square per round, same as the board
function moveRow(moves) {
  return moves.map((m) => (m === 'D' ? '\u{1F7E5}' : '\u{1F7E9}')).join('');
}
function shareText(puzzle, my, them, headline, beat) {
  const base =
    typeof window !== 'undefined' ? window.location.origin : 'https://daily-dilemma-nine.vercel.app';
  const link = beat == null ? base : `${base}/d/${puzzle.dateStr}?b=${beat}`;
  return `Daily Dilemma No. ${puzzle.issue}\n${headline}\n${moveRow(my)}\n${moveRow(them)}\n${link}`;
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

    const rate = NOISE_RATE; // signal noise is part of the daily puzzle for everyone

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
      setPhase(saved.done || mv.length >= puzzle.length ? 'home' : 'play');
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
            {shortDate(puzzle.dateStr)} &middot; no. {puzzle.issue}
          </p>
        )}

        {phase === 'play' && (
          <section className="play">
            <div className="play__stage">
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
            onShare={doShare}
            onRecord={(p) => {
              const next = mergeDay(puzzle.dateStr, p);
              setHistory((h) => ({ ...h, [puzzle.dateStr]: next }));
            }}
            onDone={() => setPhase('home')}
          />
        )}

        {phase === 'home' && (
          <Home
            puzzle={puzzle}
            today={history[puzzle.dateStr] || {}}
            stats={stats}
            copied={copied}
            onShare={doShare}
            onReview={() => setPhase('done')}
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
  const diff = myScore - themScore;

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
      return (
        <span key={i} className={`tile tile--active${rolling ? ' tile--down' : ''}`}>
          {rolling ? '·' : ''}
        </span>
      );
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
        {live && my.length > 0 && (
          <span className={`board__diff${diff > 0 ? ' up' : diff < 0 ? ' down' : ''}`}>
            {diff === 0 ? 'even' : diff > 0 ? `you +${diff}` : `you ${diff}`}
          </span>
        )}
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
  return /\u{1F3C6}|of the field/u.test(tier || '');
}

function Tally({ beat, total, tier }) {
  return (
    <div className={`tally${tierWin(tier) ? ' tally--win' : ''}`}>
      <div className="tally__num num">{beat}</div>
      <p className="tally__cap">of {total} beaten</p>
      <p className="tally__tier">{tierText(tier)}</p>
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
  onShare,
  onRecord,
  onDone,
}) {
  const rows = (raw || [])
    .map((s) => ({ name: s.name, score: s.score, nice: s.nice, me: false }))
    .concat([{ name: 'YOU', score, nice: null, me: true }])
    .sort((a, b) => b.score - a.score || (a.me ? -1 : b.me ? 1 : a.name < b.name ? -1 : 1));
  const rank = rows.findIndex((r) => r.me) + 1;
  const total = rows.length;
  const beat = total - rank;
  const place = `#${rank} of ${total}`;
  const tier = tierLabel(beat, total);
  const share = `Beat ${beat} of ${total} · ${tier}`;
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
      if (prev >= 0 && j > prev + 1) slice.push({ gap: true, key: `g${j}` });
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

      <p className="result__line">
        <b className="num">{beat}</b> of {total} beaten
        {tier ? <span className="result__tier">{tierText(tier)}</span> : null}
      </p>

      <div className={`card card--${reveal.nice ? 'nice' : 'nasty'}`}>
        <div className="card__head">
          <span className="card__name">{reveal.name}</span>
          <span className="tag">{reveal.nice ? 'NICE' : 'NASTY'}</span>
        </div>
        <p className="card__fam">{reveal.family}</p>
        <p className="card__blurb">{reveal.blurb}</p>
        {reveal.origin && <p className="card__src">{reveal.origin}</p>}
        <p className="card__best">
          Best line here scored <b>{best}</b> &middot; you got <b>{score}</b>.
        </p>
      </div>

      <p className="log__cap">
        You placed <b>{place}</b> in the field
      </p>
      <div className={`log${showAll ? ' log--all' : ''}`}>
        <table>
          <tbody>
            {shownRows.map((v) =>
              v.gap ? (
                <tr key={v.key} className="log__gap">
                  <td colSpan={3}>&middot;&nbsp;&middot;&nbsp;&middot;</td>
                </tr>
              ) : (
                <tr
                  key={v.key}
                  ref={v.r.me ? meRef : null}
                  className={v.r.me ? 'me' : undefined}
                >
                  <td className="rank">{v.i + 1}</td>
                  <td className="name">
                    {!v.r.me && <i className={`dot dot--${v.r.nice ? 'nice' : 'nasty'}`} />}
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
          Show all {total}
        </button>
      )}

      {streak > 1 && <p className="streak">{'\u{1F525}'} {streak}-day streak</p>}

      <div className="result__actions">
        <button className="btn btn--accent" onClick={() => onShare(share, beat)}>
          {copied ? 'Copied' : 'Share'}
        </button>
        <button className="btn" onClick={onDone}>
          Home
        </button>
      </div>
    </section>
  );
}

function Home({ puzzle, today, stats, copied, onShare, onReview }) {
  const [countdown, setCountdown] = useState(untilNextPuzzle());
  useEffect(() => {
    const id = setInterval(() => setCountdown(untilNextPuzzle()), 30000);
    return () => clearInterval(id);
  }, []);

  const has = today && today.total > 0;
  const tier = has ? tierLabel(today.beat, today.total) : '';
  const shareStr = has ? `Beat ${today.beat} of ${today.total} · ${tier}` : 'Played today';

  return (
    <section className="home">
      <p className="meta">
        {shortDate(puzzle.dateStr)} &middot; no. {puzzle.issue}
      </p>

      <p className="home__badge">
        <span className="home__check">✓</span> Solved today
      </p>

      {has && <Tally beat={today.beat} total={today.total} tier={tier} />}

      <div className="home__stats">
        <div>
          <b>
            {'\u{1F525}'} {stats.streak}
          </b>
          <span>day streak</span>
        </div>
        <div>
          <b>{stats.played}</b>
          <span>played</span>
        </div>
        <div>
          <b>{stats.avgTop != null ? `top ${stats.avgTop}%` : '—'}</b>
          <span>average</span>
        </div>
        <div>
          <b>{stats.bestTop != null ? `top ${stats.bestTop}%` : '—'}</b>
          <span>best</span>
        </div>
      </div>

      <p className="home__next">Next puzzle in {countdown}</p>

      <div className="result__actions">
        <button className="btn btn--accent" onClick={() => onShare(shareStr, has ? today.beat : undefined)}>
          {copied ? 'Copied' : 'Share'}
        </button>
        <button className="btn" onClick={onReview}>
          Today&rsquo;s breakdown
        </button>
      </div>
    </section>
  );
}

function Help() {
  return (
    <div className="prose">
      <p>
        Each round, you and a hidden strategy secretly choose <strong>Cooperate</strong> (share)
        or <strong>Defect</strong> (steal). Every pair of choices pays out:
      </p>
      <Payoffs />
      <p>
        Defecting on a cooperator is the greedy play &mdash; you take 5, they get nothing. But if
        you both reach for it, you both walk away with 1. Cooperating together isn&rsquo;t the top
        score, it&rsquo;s the best one you can rely on.
      </p>

      <h3>The opponent</h3>
      <p>
        One strategy a day, fixed by the date, so everyone faces the same one. It&rsquo;s hidden
        until the match ends, then revealed with its name and where it comes from. The pool mixes
        classic tournament strategies with procedurally built ones, and the day&rsquo;s pick
        won&rsquo;t have appeared in about a month.
      </p>

      <h3>Length</h3>
      <p>
        The match ends on a round you can&rsquo;t predict &mdash; no announced number, no warning.
        There is no safe final defection: you never know which round is the last.
      </p>

      <h3>Noise</h3>
      <p>
        Every move has roughly a 1-in-14 chance of flipping on the way out &mdash; yours and the
        opponent&rsquo;s. The pattern is seeded from the date, so it&rsquo;s identical for everyone
        playing that day. It&rsquo;s the condition where forgiving strategies pull ahead of rigid
        ones: a single stray defection shouldn&rsquo;t start a feud.
      </p>

      <h3>The field</h3>
      <p>
        When it&rsquo;s over, a fixed field of 100 strategies &mdash; the named historical roster
        plus a stable cast of generated ones &mdash; is scored against your exact opponent under
        the same rounds and the same noise. Where your score lands among them is your placement.
      </p>

      <h3>Nice or nasty</h3>
      <p style={{ marginBottom: 0 }}>
        The opponent is <strong>nice</strong> if it never defects first (Axelrod&rsquo;s term for
        it), <strong>nasty</strong> if it will. It&rsquo;s checked by playing it against a pure
        cooperator, not taken on faith.
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
