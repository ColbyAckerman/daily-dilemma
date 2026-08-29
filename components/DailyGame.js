'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { hashStr, mulberry32, payoff, revealOpponent } from '@/lib/engine';
import { resolveOpponent } from '@/lib/opponents';
import Modal from './Modal';

const HKEY = 'dd:history';

// ---- localStorage helpers -------------------------------------------------
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

function computeStats(history) {
  const days = Object.keys(history)
    .filter((d) => history[d] && history[d].done)
    .sort();
  const played = days.length;
  let beat = 0;
  for (const d of days) if (history[d].score >= history[d].par) beat++;

  // current streak: consecutive days ending today (or yesterday) that met par
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const ds = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    const rec = history[ds];
    if (rec && rec.done && rec.score >= rec.par) streak++;
    else if (i === 0) continue; // today not played yet doesn't break the streak
    else break;
  }
  // max streak
  let max = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    const cont = prev && Date.parse(d) - Date.parse(prev) === 86400000;
    if (history[d].score >= history[d].par) {
      run = cont ? run + 1 : 1;
      max = Math.max(max, run);
    } else run = 0;
    prev = d;
  }
  return { played, beat, streak, max };
}

// ---- tiles + share ------------------------------------------------------
function tileFor(me, opp) {
  if (me === 'C' && opp === 'C') return '\u{1F7E9}'; // 🟩 mutual cooperate
  if (me === 'D' && opp === 'C') return '\u{1F7E5}'; // 🟥 you took them
  if (me === 'C' && opp === 'D') return '\u{1F7E8}'; // 🟨 you got suckered
  return '⬛'; // ⬛ mutual defection
}

function shareText(puzzle, myMoves, oppMoves, score) {
  const diff = score - puzzle.par;
  const sign = diff > 0 ? '+' : '';
  const grid = myMoves.map((m, i) => tileFor(m, oppMoves[i])).join('');
  return `Daily Dilemma #${puzzle.issue} — ${score} (par ${puzzle.par}, ${sign}${diff})\n${grid}\n\u{1F91D}`;
}

// ---- move pills -------------------------------------------------------
function Pip({ m, dim }) {
  return (
    <span className={`pip pip--${m}${dim ? ' pip--dim' : ''}`}>{m}</span>
  );
}

export default function DailyGame({ puzzle }) {
  const opp = useMemo(() => resolveOpponent(puzzle.oppRef), [puzzle.oppRef]);
  const rngRef = useRef(null);

  // Default to a fresh playable board so first paint is never blank; hydration
  // swaps in a saved (finished or partial) game if there is one.
  const [phase, setPhase] = useState('playing'); // playing | done
  const [myMoves, setMyMoves] = useState([]);
  const [oppMoves, setOppMoves] = useState([]);
  const [modal, setModal] = useState(null); // 'help' | 'stats' | null
  const [theme, setTheme] = useState(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState({});

  // hydrate: theme + today's saved game (resumes a partial game too)
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
    // Fresh rng; replay any saved moves through it so it's positioned for the
    // next real move.
    const rng = mulberry32(hashStr(puzzle.seed));
    rngRef.current = rng;
    if (saved && typeof saved.moves === 'string' && saved.moves.length > 0) {
      const mv = saved.moves.split('');
      const om = [];
      for (let r = 0; r < mv.length; r++) {
        const raw = r === 0 ? opp.first(rng) : opp.move(om, mv.slice(0, r), r, rng);
        om.push(raw === 'D' ? 'D' : 'C');
      }
      setMyMoves(mv);
      setOppMoves(om);
      setPhase(saved.done || mv.length >= puzzle.length ? 'done' : 'playing');
    }
  }, [puzzle.dateStr, puzzle.seed, puzzle.length, opp]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('dd-theme', next);
    } catch (e) {}
  }

  const scores = useMemo(() => {
    let me = 0;
    let them = 0;
    for (let i = 0; i < oppMoves.length; i++) {
      const [a, b] = payoff(myMoves[i], oppMoves[i]);
      me += a;
      them += b;
    }
    return { me, them };
  }, [myMoves, oppMoves]);

  function playMove(move) {
    if (phase !== 'playing') return;
    const r = myMoves.length;
    const rng = rngRef.current;
    const raw = r === 0 ? opp.first(rng) : opp.move(oppMoves, myMoves, r, rng);
    const om = raw === 'D' ? 'D' : 'C';
    const nextMy = [...myMoves, move];
    const nextOpp = [...oppMoves, om];
    setMyMoves(nextMy);
    setOppMoves(nextOpp);

    const finished = nextMy.length >= puzzle.length;
    let me = 0;
    for (let i = 0; i < nextMy.length; i++) me += payoff(nextMy[i], nextOpp[i])[0];
    const record = {
      moves: nextMy.join(''),
      score: me,
      par: puzzle.par,
      oppRef: puzzle.oppRef,
      done: finished,
    };
    writeDay(puzzle.dateStr, record);
    setHistory((h) => ({ ...h, [puzzle.dateStr]: record }));
    if (finished) setPhase('done');
  }

  async function doShare() {
    const text = shareText(puzzle, myMoves, oppMoves, scores.me);
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      // last-ditch: select a hidden textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch (e2) {}
      ta.remove();
    }
  }

  const stats = useMemo(() => computeStats(history), [history]);
  const round = myMoves.length;
  const canPlay = phase === 'playing' && round < puzzle.length;

  return (
    <>
      <header className="topbar">
        <button className="iconbtn" aria-label="How to play" onClick={() => setModal('help')}>
          ?
        </button>
        <h1 className="topbar__title">Daily Dilemma</h1>
        <div className="iconrow">
          <button className="iconbtn" aria-label="Stats" onClick={() => setModal('stats')}>
            <BarsIcon />
          </button>
          <button
            className="iconbtn"
            aria-label="Toggle theme"
            onClick={toggleTheme}
            suppressHydrationWarning
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>
      </header>

      <main className="wrap">
        <p className="conditions">
          <span>No. {String(puzzle.issue).padStart(3, '0')}</span>
          <span>{puzzle.prettyDate}</span>
          <span>~{puzzle.expected} rounds &middot; random end</span>
        </p>


        {phase === 'playing' && (
          <section className="dg">
            <div className="dg__score">
              <div>
                <b className="tnum">{scores.me}</b>
                <span>You</span>
              </div>
              <div className="dg__vs">round {round + 1}</div>
              <div>
                <b className="tnum">{scores.them}</b>
                <span>???</span>
              </div>
            </div>

            <Transcript my={myMoves} opp={oppMoves} />

            <div className="dg__buttons">
              <button
                className="choice choice--c"
                onClick={() => playMove('C')}
                disabled={!canPlay}
              >
                Cooperate
              </button>
              <button
                className="choice choice--d"
                onClick={() => playMove('D')}
                disabled={!canPlay}
              >
                Defect
              </button>
            </div>
            <p className="dg__hint">
              You don’t know which round is the last, or who you’re playing. Read them.
            </p>
          </section>
        )}

        {phase === 'done' && (
          <ResultScreen
            puzzle={puzzle}
            reveal={revealOpponent(puzzle.oppRef)}
            my={myMoves}
            opp={oppMoves}
            score={scores.me}
            them={scores.them}
            streak={stats.streak}
            onShare={doShare}
            copied={copied}
          />
        )}
      </main>

      {modal === 'help' && (
        <Modal title="How to play" onClose={() => setModal(null)}>
          <HelpBody />
        </Modal>
      )}
      {modal === 'stats' && (
        <Modal title="Your record" onClose={() => setModal(null)}>
          <StatsBody stats={stats} />
        </Modal>
      )}
    </>
  );
}

function Transcript({ my, opp }) {
  if (my.length === 0) {
    return <p className="dg__empty">Make your first move.</p>;
  }
  return (
    <div className="dg__tape" aria-label="Round history">
      <div className="dg__row">
        <span className="dg__rowk">You</span>
        {my.map((m, i) => (
          <Pip key={i} m={m} />
        ))}
      </div>
      <div className="dg__row">
        <span className="dg__rowk">???</span>
        {opp.map((m, i) => (
          <Pip key={i} m={m} dim />
        ))}
      </div>
    </div>
  );
}

function ResultScreen({ puzzle, reveal, my, opp, score, them, streak, onShare, copied }) {
  const diff = score - puzzle.par;
  const beat = diff >= 0;
  const headline = beat
    ? diff === 0
      ? 'You matched par.'
      : `You beat par by ${diff}.`
    : `You came in ${-diff} under par.`;

  return (
    <section className="dg dg--done">
      <div className="dg__final">
        <div>
          <b className="tnum">{score}</b>
          <span>You</span>
        </div>
        <div className="dg__dash">–</div>
        <div>
          <b className="tnum">{them}</b>
          <span>{reveal.name}</span>
        </div>
      </div>

      <p className={`dg__verdict ${beat ? 'is-good' : 'is-miss'}`}>{headline}</p>

      <div className="dg__pars">
        <span>Par (Tit-for-Tat) <b>{puzzle.par}</b></span>
        <span>Always cooperate <b>{puzzle.allCoop}</b></span>
        <span>Always defect <b>{puzzle.allDefect}</b></span>
      </div>

      <div className={`reveal reveal--${reveal.nice ? 'nice' : 'nasty'}`}>
        <div className="reveal__head">
          <span className="reveal__name">{reveal.name}</span>
          <span className="reveal__tag">{reveal.nice ? 'NICE' : 'NASTY'}</span>
        </div>
        <p className="reveal__blurb">{reveal.blurb}</p>
        <p className="reveal__note">
          {reveal.nice
            ? 'Nice — it never defected before you did.'
            : 'Nasty — it was willing to defect first.'}
        </p>
        {reveal.origin && <p className="reveal__origin">{reveal.origin}</p>}
      </div>

      <div className="dg__tape dg__tape--done">
        <div className="dg__row">
          <span className="dg__rowk">You</span>
          {my.map((m, i) => (
            <Pip key={i} m={m} />
          ))}
        </div>
        <div className="dg__row">
          <span className="dg__rowk">Them</span>
          {opp.map((m, i) => (
            <Pip key={i} m={m} />
          ))}
        </div>
      </div>

      {streak > 0 && (
        <p className="dg__streak">🔥 {streak}-day par streak</p>
      )}

      <button className="choice choice--share" onClick={onShare}>
        {copied ? 'Copied!' : 'Share result'}
      </button>
      <p className="dg__hint">A new opponent unlocks at midnight UTC.</p>
    </section>
  );
}

function HelpBody() {
  return (
    <div className="prose">
      <p>
        Each round you and a hidden opponent secretly pick{' '}
        <strong>Cooperate</strong> or <strong>Defect</strong>. Points that round:
      </p>
      <table className="payoff">
        <thead>
          <tr>
            <th></th>
            <th>They C</th>
            <th>They D</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>You C</th>
            <td className="cc">3, 3</td>
            <td>0, 5</td>
          </tr>
          <tr>
            <th>You D</th>
            <td>5, 0</td>
            <td className="dd">1, 1</td>
          </tr>
        </tbody>
      </table>
      <p>
        One puzzle a day, the same for everyone. The opponent is drawn from a
        deep roster of classic and generated strategies — <strong>you won’t know
        which</strong> until the game ends. The match runs an unknown number of
        rounds (about a dozen and a half), so there’s no safe last-round
        betrayal.
      </p>
      <p>
        <strong>Par</strong> is what plain Tit-for-Tat scores against today’s
        opponent. Beat par and your streak grows. After the reveal you’ll learn
        whether the opponent was <strong>nice</strong> (never defects first) or{' '}
        <strong>nasty</strong> — Axelrod’s tournaments found nice strategies win
        the long game.
      </p>
      <p style={{ marginBottom: 0 }}>No accounts. Everything is saved on this device.</p>
    </div>
  );
}

function StatsBody({ stats }) {
  const pct = stats.played ? Math.round((stats.beat / stats.played) * 100) : 0;
  return (
    <div className="statgrid">
      <div>
        <b>{stats.played}</b>
        <span>Played</span>
      </div>
      <div>
        <b>{pct}%</b>
        <span>Beat par</span>
      </div>
      <div>
        <b>{stats.streak}</b>
        <span>Streak</span>
      </div>
      <div>
        <b>{stats.max}</b>
        <span>Best streak</span>
      </div>
    </div>
  );
}

function BarsIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
      <rect x="1.5" y="9" width="3.4" height="6.5" rx="1" fill="currentColor" />
      <rect x="6.8" y="5" width="3.4" height="10.5" rx="1" fill="currentColor" />
      <rect x="12.1" y="1.5" width="3.4" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}
