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
const HOLD_MS = 380;
const REVEAL_MS = 820;

// gain / fx-kind, keyed by yourMove + theirMove
const VERDICT = {
  CC: ['+3', 'trust'],
  DC: ['+5', 'sting'],
  CD: ['+0', 'sucker'],
  DD: ['+1', 'stale'],
};
const WORD = (m) => (m === 'D' ? 'DEFECT' : 'COOPERATE');
const GLYPHS = '#%&$@?/\\=+*01<>';

function prefersReduced() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}
function scramble(len) {
  let s = '';
  for (let i = 0; i < len; i++) s += GLYPHS[(Math.random() * GLYPHS.length) | 0];
  return s;
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
        setExchange({
          me: mv[mv.length - 1],
          them: om[om.length - 1],
          gain: '+' + payoff(mv[mv.length - 1], om[om.length - 1])[0],
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
      setFx({ gain, kind, om, n: r });
      if (om === 'D') {
        setNudge((n) => n + 1);
        buzz(pm === 'C' ? [10, 40, 22] : 16);
      } else {
        buzz(8);
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
      const t3 = setTimeout(() => setFx(null), 980);
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

  const lead = scores.me - scores.them;

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
      {fx && (
        <>
          <div className={`fx-wash fx-wash--${fx.om}`} key={`w${fx.n}`} />
          <div className={`fx-gain fx-gain--${fx.kind}`} key={`g${fx.n}`}>
            {fx.gain}
          </div>
        </>
      )}

      <header className="hdr">
        <div className="hdr__group">
          <button className="ico" aria-label="How to play" onClick={() => setModal('help')}>
            <HelpIcon />
          </button>
        </div>
        <h1 className="hdr__title">Daily Dilemma</h1>
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
                <span className="score__val num">{scores.me}</span>
              </div>
              <div className="score__row score__row--them">
                <span className="score__who">Them</span>
                <span className="score__val num">{scores.them}</span>
              </div>
              <p className={`score__lead num${lead > 0 ? ' up' : lead < 0 ? ' down' : ''}`}>
                {lead > 0 ? `+${lead}` : lead < 0 ? lead : '—'}
              </p>
            </div>

            <Tape my={my} them={them} slips={slips} hideThemId />

            <div className="console" aria-live="polite">
              {!exchange && <p className="console__dim">Waiting for your first move.</p>}
              {exchange && (
                <>
                  <p>
                    <span className="lbl">You played </span>
                    <b className={exchange.me === 'D' ? 'd' : 'c'}>{WORD(exchange.me)}</b>
                  </p>
                  <p>
                    <span className="lbl">Opponent played </span>
                    <Decode
                      key={exchange.n}
                      value={WORD(exchange.them)}
                      live={!!fx && fx.n === exchange.n && !prefersReduced()}
                      className={exchange.them === 'D' ? 'd' : 'c'}
                    />
                  </p>
                  <p className="console__dim">
                    {exchange.gain} &middot; {exchange.leadTxt}
                  </p>
                </>
              )}
            </div>

            <div className="prompt">
              Round {Math.min(round + 1, puzzle.length)} &middot;{' '}
              {busy ? 'resolving' : 'your move'}
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

            <Legend />
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
function Decode({ value, live, className }) {
  const [txt, setTxt] = useState(live ? scramble(value.length) : value);
  useEffect(() => {
    if (!live) {
      setTxt(value);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      if (i >= value.length + 2) {
        clearInterval(id);
        setTxt(value);
        return;
      }
      setTxt(value.slice(0, i) + scramble(Math.max(0, value.length - i)));
    }, 34);
    return () => clearInterval(id);
  }, [value, live]);
  return <b className={className}>{txt}</b>;
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
            {m}
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
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend" aria-hidden="true">
      <span>
        <i style={{ background: 'var(--good)' }} /> trust <b>+3</b>
      </span>
      <span>
        <i style={{ background: 'var(--gold)' }} /> sting <b>+5</b>
      </span>
      <span>
        <i style={{ background: 'var(--bad)' }} /> suckered <b>0</b>
      </span>
      <span>
        <i style={{ background: 'var(--ink-3)' }} /> deadlock <b>+1</b>
      </span>
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
              <span className={`chip chip--${a}`}>{a}</span>
            </td>
            <td>
              <span className={`chip chip--${b}`}>{b}</span>
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
        <b className="d">DEFECT</b>
      </p>
      <Payoffs />
      <p className="intro__lead">
        <b className="d">DEFECT</b> a <b className="c">COOPERATOR</b> to <strong>WIN BIG</strong>
        <br />
        <b className="d">DEFECT</b> each other and you <strong>BOTH LOSE</strong>
      </p>
      <p className="intro__lead">The last round comes without warning</p>
      <p className="intro__lead">~ 1 in 10 moves flips in transit</p>

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
  const meRef = useRef(null);
  useEffect(() => {
    meRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <section className="result">
      <p className="prompt" style={{ textAlign: 'center', marginBottom: 'var(--sp-4)' }}>
        Match complete &middot; {my.length} rounds
      </p>

      <div className="result__score num">
        {score}
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
        <strong>Defect</strong>. Every pair of choices pays out:
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
        The match ends on a round you can&rsquo;t predict, usually somewhere from 12 to 20. There
        is no safe final defection &mdash; you never know if a round is the last.
      </p>

      <h3>Noise</h3>
      <p>
        Every move has a 1-in-10 chance of flipping on the way out &mdash; yours and the
        opponent&rsquo;s. The pattern is seeded from the date, so it&rsquo;s identical for everyone
        playing that day. It&rsquo;s the condition where forgiving strategies pull ahead of rigid
        ones: a single stray defection shouldn&rsquo;t start a feud.
      </p>

      <h3>The field</h3>
      <p>
        When it&rsquo;s over, the whole roster of named historical strategies is scored against
        your exact opponent under the same rounds and the same noise. Where your score lands among
        them is your placement.
      </p>

      <h3>Nice or nasty</h3>
      <p style={{ marginBottom: 0 }}>
        The opponent is <strong>nice</strong> if it never defects first (Axelrod&rsquo;s term),{' '}
        <strong>nasty</strong> if it will. It&rsquo;s checked by playing it against a pure
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
