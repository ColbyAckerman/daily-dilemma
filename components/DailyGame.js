'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  hashStr,
  mulberry32,
  payoff,
  revealOpponent,
  transmit,
  buildField,
  NOISE_RATE,
} from '@/lib/engine';
import { resolveOpponent } from '@/lib/opponents';
import Modal from './Modal';

const HKEY = 'dd:history';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOLD_MS = 560; // suspense between your commit and the reveal
const REVEAL_MS = 820;
const FX_MS = 1150;

// gain / fx-kind, keyed by yourMove + theirMove
const VERDICT = {
  CC: ['+3', 'trust'],
  DC: ['+5', 'sting'],
  CD: ['+0', 'sucker'],
  DD: ['+1', 'stale'],
};
// the two moves stay 'C' / 'D' internally; players see cooperate / betray
const GLYPH = { C: 'C', D: 'B' };

function prefersReduced() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

// count a number up to its target with easing
function useCountUp(target, dur = 520, initial) {
  const [val, setVal] = useState(initial == null ? target : initial);
  const raf = useRef(0);
  useEffect(() => {
    if (val === target) return undefined;
    if (prefersReduced()) {
      setVal(target);
      return undefined;
    }
    const from = val;
    const delta = target - from;
    let start = 0;
    const tick = (ts) => {
      if (!start) start = ts;
      const p = Math.min(1, (ts - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(p < 1 ? Math.round(from + delta * eased) : target);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]); // eslint-disable-line
  return val;
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
  return { played: days.length, streak, best };
}

function tile(me, opp) {
  if (me === 'C' && opp === 'C') return '\u{1F7E9}';
  if (me === 'D' && opp === 'C') return '\u{1F7E5}';
  if (me === 'C' && opp === 'D') return '\u{1F7E8}';
  return '⬛';
}
function shareText(puzzle, my, opp, score, place) {
  const grid = my.map((m, i) => tile(m, opp[i])).join('');
  return `Daily Dilemma #${puzzle.issue}\nScored ${score} · ${place}\n${grid}`;
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
  const [nudge, setNudge] = useState(0);
  const [fx, setFx] = useState(null); // { word, gain, kind, om, n }
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

      const [gain, kind] = VERDICT[pm + om];
      setFx({ gain, kind, om, pm, n: r });
      if (om === 'D') {
        setNudge((n) => n + 1);
        buzz(pm === 'C' ? [12, 45, 25] : 18);
      } else {
        buzz(pm === 'D' ? [8, 30, 14] : 10);
      }

      let myTot = 0;
      let themTot = 0;
      for (let i = 0; i < nMy.length; i++) {
        const [x, y] = payoff(nMy[i], nThem[i]);
        myTot += x;
        themTot += y;
      }
      const ld = myTot - themTot;
      setExchange({
        me: pm,
        them: om,
        gain,
        kind,
        leadTxt: ld > 0 ? `you lead +${ld}` : ld < 0 ? `you trail ${ld}` : 'dead level',
        n: r,
      });

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

  // screen shake on a betrayal (opponent defected)
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (!nudge) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 460);
    return () => clearTimeout(t);
  }, [nudge]);

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
        } else if (k === 'b' || k === 'd') {
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

  const lead = scores.me - scores.them;
  const shownMe = useCountUp(scores.me);
  const shownThem = useCountUp(scores.them);

  async function doShare(place) {
    const text = shareText(puzzle, my, them, scores.me, place);
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
      {fx && <div className={`fx-wash fx-wash--${fx.om}`} key={`w${fx.n}`} />}

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

      <main
        className={`page${phase === 'done' ? '' : ' page--center'}${
          shaking ? ' page--shake' : ''
        }`}
      >
        {phase === 'intro' && <Intro onPlay={start} />}

        {phase !== 'intro' && (
          <p className="meta">
            {shortDate(puzzle.dateStr)} &middot; no. {puzzle.issue}
          </p>
        )}

        {phase === 'play' && (
          <section>
            <div className="score">
              <p className="cap score__round">Round {Math.min(round + 1, puzzle.length)}</p>
              <div className="score__row">
                <span className="score__who">You</span>
                <span className="score__val num" key={`me${scores.me}`}>
                  {shownMe}
                </span>
              </div>
              <div className="score__row score__row--them">
                <span className="score__who">Them</span>
                <span className="score__val num" key={`th${scores.them}`}>
                  {shownThem}
                </span>
              </div>
              <p className={`score__lead num${lead > 0 ? ' up' : lead < 0 ? ' down' : ''}`}>
                {lead > 0 ? `+${lead}` : lead < 0 ? lead : '—'}
              </p>
            </div>

            <Arena
              myMove={armed || exchange?.me}
              themMove={exchange?.them}
              rolling={!!armed && !fx}
              gain={armed && !fx ? null : exchange?.gain}
              kind={exchange?.kind}
              revealKey={fx?.n}
              note={armed && !fx ? 'deciding…' : exchange?.leadTxt}
            />

            <Tape my={my} them={them} slips={slips} hideThemId />

            <div className="choices">
              <button
                className={`btn btn--c${armed === 'C' ? ' is-armed' : ''}`}
                onClick={() => choose('C')}
                disabled={!canPlay}
              >
                <span className="btn__top">
                  <kbd>C</kbd>Cooperate
                </span>
                <span className="btn__odds">+3 &middot; or 0 if betrayed</span>
              </button>
              <button
                className={`btn btn--d${armed === 'D' ? ' is-armed' : ''}`}
                onClick={() => choose('D')}
                disabled={!canPlay}
              >
                <span className="btn__top">
                  <kbd>B</kbd>Betray
                </span>
                <span className="btn__odds">+5 &middot; or +1 if matched</span>
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
// The round arena — your locked move vs the opponent's, drawn live.
function Arena({ myMove, themMove, rolling, gain, kind, revealKey, note }) {
  const [flick, setFlick] = useState('C');
  useEffect(() => {
    if (!rolling || prefersReduced()) return undefined;
    const id = setInterval(() => setFlick((f) => (f === 'C' ? 'D' : 'C')), 68);
    return () => clearInterval(id);
  }, [rolling]);

  const them = rolling ? flick : themMove;
  const revealed = !rolling && gain != null;
  return (
    <div className={`arena${revealed ? ` arena--reveal arena--${kind}` : ''}`}>
      <div className="arena__row">
        <div className="arena__seat">
          <span className="arena__who">You</span>
          <span
            key={myMove || 'x'}
            className={`arena__chip${myMove ? ` chip--${myMove}` : ' arena__chip--empty'}`}
          >
            {myMove ? GLYPH[myMove] : ''}
          </span>
        </div>
        <span className="arena__vs">vs</span>
        <div className="arena__seat">
          <span className="arena__who">Them</span>
          <span
            key={rolling ? 'roll' : `th-${revealKey == null ? them || 'x' : revealKey}`}
            className={`arena__chip${them ? ` chip--${them}` : ' arena__chip--empty'}${
              rolling ? ' arena__chip--roll' : revealed ? ' arena__chip--pop' : ''
            }`}
          >
            {them ? GLYPH[them] : ''}
          </span>
        </div>
      </div>
      <div className="arena__foot">
        {revealed ? (
          <span key={`g-${revealKey == null ? gain : revealKey}`} className="arena__gain">
            {gain}
          </span>
        ) : (
          <span className="arena__note">{note || ' '}</span>
        )}
      </div>
    </div>
  );
}

function Tape({ my, them, slips, hideThemId }) {
  return (
    <div className="tape">
      <div className="tape__row">
        <span className="cap">You</span>
        {my.map((m, i) => (
          <span
            key={i}
            className={`chip chip--${m}${i === my.length - 1 ? ' chip--flip' : ''}${
              slips.includes(i) ? ' chip--slip' : ''
            }`}
          >
            {GLYPH[m]}
          </span>
        ))}
      </div>
      <div className="tape__row">
        <span className="cap">{hideThemId ? '?' : 'Them'}</span>
        {them.map((m, i) => (
          <span
            key={i}
            className={`chip chip--${m}${hideThemId ? ' chip--muted' : ''}${
              i === them.length - 1 ? ' chip--flip' : ''
            }`}
          >
            {GLYPH[m]}
          </span>
        ))}
      </div>
    </div>
  );
}

const PAYOFFS = [
  ['C', 'C', '3', '3'],
  ['D', 'C', '5', '0'],
  ['C', 'D', '0', '5'],
  ['D', 'D', '1', '1'],
];

function Payoffs() {
  return (
    <table className="payoff">
      <thead>
        <tr className="payoff__grp">
          <th colSpan={2}>Choice</th>
          <th colSpan={2}>Points</th>
        </tr>
        <tr className="payoff__sub">
          <th>You</th>
          <th>Them</th>
          <th>You</th>
          <th>Them</th>
        </tr>
      </thead>
      <tbody>
        {PAYOFFS.map(([a, b, x, y], i) => (
          <tr key={i}>
            <td>
              <span className={`chip chip--${a}`}>{GLYPH[a]}</span>
            </td>
            <td>
              <span className={`chip chip--${b}`}>{GLYPH[b]}</span>
            </td>
            <td className="pts pts--me">{x}</td>
            <td className="pts">{y}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Intro({ onPlay }) {
  return (
    <section className="intro">
      <p className="intro__lead">
        Each round, you and today&rsquo;s strategy will choose <b className="c">COOPERATE</b> or{' '}
        <b className="d">BETRAY</b>
      </p>
      <Payoffs />
      <p className="intro__lead">
        <b className="d">BETRAY</b> a <b className="c">COOPERATOR</b> to <strong>WIN BIG</strong>
        <br />
        <b className="d">BETRAY</b> each other and you <strong>BOTH LOSE</strong>
      </p>
      <p className="intro__lead">The last round comes without warning</p>
      <p className="intro__lead">~ 1 in 10 moves flip in transit</p>

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
}) {
  const rows = (raw || [])
    .map((s) => ({ name: s.name, score: s.score, nice: s.nice, me: false }))
    .concat([{ name: 'YOU', score, nice: null, me: true }])
    .sort((a, b) => b.score - a.score || (a.me ? -1 : b.me ? 1 : a.name < b.name ? -1 : 1));
  const rank = rows.findIndex((r) => r.me) + 1;
  const place = `#${rank} of ${rows.length}`;
  const shownScore = useCountUp(score, 900, 0);
  const meRef = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => meRef.current?.scrollIntoView({ block: 'center' }), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="result">
      <p className="prompt" style={{ textAlign: 'center', marginBottom: 'var(--sp-4)' }}>
        Match complete &middot; {my.length} rounds
      </p>

      <div className="result__score num">
        {shownScore}
        <span className="cap">your score</span>
      </div>
      <p className="result__sub">
        vs <b>{reveal.name}</b> &middot; they scored {oppScore}
      </p>

      <div className={`card card--${reveal.nice ? 'nice' : 'nasty'}`}>
        <div className="card__head">
          <span className="card__name">{reveal.name}</span>
          <span className="tag">{reveal.nice ? 'NICE' : 'NASTY'}</span>
        </div>
        <p className="card__blurb">{reveal.blurb}</p>
        {reveal.origin && <p className="card__src">{reveal.origin}</p>}
      </div>

      <p className="log__cap">
        The field vs {reveal.name} &middot; you placed <b>{place}</b>
      </p>
      <div className="log">
        <table>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} ref={r.me ? meRef : null} className={r.me ? 'me' : undefined}>
                <td className="rank">{String(i + 1).padStart(2, '0')}</td>
                <td className="name">
                  {!r.me && <i className={`dot dot--${r.nice ? 'nice' : 'nasty'}`} />}
                  {r.name}
                </td>
                <td className="pts">{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Tape my={my} them={them} slips={slips} />

      {streak > 1 && <p className="streak">{'\u{1F525}'} {streak}-day streak</p>}

      <button className="btn btn--accent" onClick={() => onShare(place)}>
        {copied ? 'Copied' : 'Share'}
      </button>
    </section>
  );
}

function Help() {
  return (
    <div className="prose">
      <p>
        Each round, you and a hidden strategy secretly choose <strong>Cooperate</strong> or{' '}
        <strong>Betray</strong>. Every pair of choices pays out:
      </p>
      <Payoffs />
      <p>
        Betraying a cooperator is the greedy play &mdash; you take 5, they get nothing. But if you
        both reach for it, you both walk away with 1. Cooperating together isn&rsquo;t the top
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
        The match ends on a round you can&rsquo;t predict, usually somewhere from 12 to 20. There
        is no safe final betrayal &mdash; you never know if a round is the last.
      </p>

      <h3>Noise</h3>
      <p>
        Every move has a 1-in-10 chance of flipping on the way out &mdash; yours and the
        opponent&rsquo;s. The pattern is seeded from the date, so it&rsquo;s identical for everyone
        playing that day. It&rsquo;s the condition where forgiving strategies pull ahead of rigid
        ones: a single stray betrayal shouldn&rsquo;t start a feud.
      </p>

      <h3>The field</h3>
      <p>
        When it&rsquo;s over, the whole roster of named historical strategies is scored against
        your exact opponent under the same rounds and the same noise. Where your score lands among
        them is your placement.
      </p>

      <h3>Nice or nasty</h3>
      <p style={{ marginBottom: 0 }}>
        The opponent is <strong>nice</strong> if it never betrays first (Axelrod&rsquo;s term for
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
