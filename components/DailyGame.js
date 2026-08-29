'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { hashStr, mulberry32, payoff, revealOpponent } from '@/lib/engine';
import { resolveOpponent } from '@/lib/opponents';
import Modal from './Modal';

const HKEY = 'dd:history';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const COMMIT_MS = 430;
const REVEAL_MS = 800;

// outcome, from your point of view: [yourMove][theirMove]
const OUTCOME = {
  CC: { word: 'Trust', plate: 'trust', gain: '+3', gainCls: 'good' },
  DC: { word: 'Sting', plate: 'sting', gain: '+5', gainCls: 'big' },
  CD: { word: 'Suckered', plate: 'betray', gain: '+0', gainCls: 'zero' },
  DD: { word: 'Stalemate', plate: 'stale', gain: '+1', gainCls: 'meh' },
};

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
function shortDate(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
function buzz(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {}
}

function computeStats(history) {
  const days = Object.keys(history)
    .filter((d) => history[d] && history[d].done)
    .sort();
  const played = days.length;
  const done = new Set(days);
  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const ds = new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10);
    if (done.has(ds)) streak++;
    else if (i === 0) continue; // today not played yet doesn't break it
    else break;
  }
  let max = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    const cont = prev && Date.parse(d) - Date.parse(prev) === 86400000;
    run = cont ? run + 1 : 1;
    max = Math.max(max, run);
    prev = d;
  }
  return { played, streak, max };
}

function tileFor(me, opp) {
  if (me === 'C' && opp === 'C') return '\u{1F7E9}';
  if (me === 'D' && opp === 'C') return '\u{1F7E5}';
  if (me === 'C' && opp === 'D') return '\u{1F7E8}';
  return '⬛';
}
function shareText(puzzle, myMoves, oppMoves, score, rankLine) {
  const grid = myMoves.map((m, i) => tileFor(m, oppMoves[i])).join('');
  return `Daily Dilemma #${puzzle.issue}\nScored ${score}${rankLine ? ` · ${rankLine}` : ''}\n${grid}`;
}

function Pip({ m, dim, fresh }) {
  return <span className={`pip pip--${m}${dim ? ' pip--dim' : ''}${fresh ? ' pip--fresh' : ''}`}>{m}</span>;
}

function ScoreKey() {
  return (
    <div className="key" aria-hidden="true">
      <span className="key__i">
        <i className="sw sw--trust" /> trust <b>+3</b>
      </span>
      <span className="key__i">
        <i className="sw sw--sting" /> sting <b>+5</b>
      </span>
      <span className="key__i">
        <i className="sw sw--sucker" /> sucker <b>+0</b>
      </span>
      <span className="key__i">
        <i className="sw sw--stale" /> deadlock <b>+1</b>
      </span>
    </div>
  );
}

export default function DailyGame({ puzzle }) {
  const opp = useMemo(() => resolveOpponent(puzzle.oppRef), [puzzle.oppRef]);
  const rngRef = useRef(null);
  const timers = useRef([]);

  const [phase, setPhase] = useState('intro'); // intro | playing | done
  const [myMoves, setMyMoves] = useState([]);
  const [oppMoves, setOppMoves] = useState([]);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(null); // 'C' | 'D' while a choice resolves
  const [flash, setFlash] = useState(null); // opp move driving the screen wash
  const [plate, setPlate] = useState(null); // { word, cls }
  const [gain, setGain] = useState(null); // { text, cls, k }
  const [shake, setShake] = useState(false);
  const [modal, setModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState({});
  const [theme, setTheme] = useState(null);

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
    const rng = mulberry32(hashStr(puzzle.seed));
    rngRef.current = rng;
    if (saved) {
      const mv = typeof saved.moves === 'string' ? saved.moves.split('') : [];
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

  function start() {
    const record = { moves: '', score: 0, oppRef: puzzle.oppRef, done: false };
    writeDay(puzzle.dateStr, record);
    setHistory((h) => ({ ...h, [puzzle.dateStr]: record }));
    setPhase('playing');
  }

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
    if (phase !== 'playing' || busy) return;
    setBusy(true);
    setArmed(move);
    setGain(null);

    const r = myMoves.length;
    const rng = rngRef.current;
    const raw = r === 0 ? opp.first(rng) : opp.move(oppMoves, myMoves, r, rng);
    const om = raw === 'D' ? 'D' : 'C';

    const t1 = setTimeout(() => {
      const nextMy = [...myMoves, move];
      const nextOpp = [...oppMoves, om];
      setMyMoves(nextMy);
      setOppMoves(nextOpp);

      const spec = OUTCOME[move + om];
      setFlash(om);
      setPlate({ word: spec.word, cls: spec.plate });
      setGain({ text: spec.gain, cls: spec.gainCls, k: r });
      if (om === 'D') {
        setShake(true);
        buzz([0, 35, 22, 38]);
      } else {
        buzz(14);
      }

      let me = 0;
      for (let i = 0; i < nextMy.length; i++) me += payoff(nextMy[i], nextOpp[i])[0];
      const finished = nextMy.length >= puzzle.length;
      const record = {
        moves: nextMy.join(''),
        score: me,
        oppRef: puzzle.oppRef,
        done: finished,
      };
      writeDay(puzzle.dateStr, record);
      setHistory((h) => ({ ...h, [puzzle.dateStr]: record }));

      const t2 = setTimeout(() => {
        setFlash(null);
        setPlate(null);
        setShake(false);
        setArmed(null);
        setBusy(false);
        if (finished) setPhase('done');
      }, REVEAL_MS);
      timers.current.push(t2);
    }, COMMIT_MS);
    timers.current.push(t1);
  }

  async function doShare(rankLine) {
    const text = shareText(puzzle, myMoves, oppMoves, scores.me, rankLine);
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) {
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
  const canPlay = phase === 'playing' && !busy && round < puzzle.length;
  const lead = scores.me - scores.them;

  return (
    <>
      {flash && <div className={`flash flash--${flash}`} />}
      {plate && <div className={`plate plate--${plate.cls}`}>{plate.word}</div>}

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

      <main className={`wrap${shake ? ' shake' : ''}`}>
        {phase === 'intro' && <Intro issue={puzzle.issue} onPlay={start} />}

        {phase !== 'intro' && (
          <p className="stamp">
            {shortDate(puzzle.dateStr)} &nbsp;&middot;&nbsp; No. {puzzle.issue}
          </p>
        )}

        {phase === 'playing' && (
          <section>
            <div className="board">
              <div className="board__me">
                <b key={scores.me} className="tnum pop">
                  {scores.me}
                </b>
                <span>You</span>
              </div>
              <div className="board__mid">
                <span
                  className={`board__lead ${lead > 0 ? 'ahead' : lead < 0 ? 'behind' : ''}`}
                >
                  {lead > 0 ? `+${lead}` : lead < 0 ? lead : 'even'}
                </span>
                <span className="board__round">round {round + 1}</span>
              </div>
              <div className="board__them">
                <b className="tnum">{scores.them}</b>
                <span>&#8203;???</span>
              </div>
            </div>

            <div className="gain">
              {gain && (
                <span key={gain.k} className={`gain--${gain.cls}`}>
                  {gain.text}
                </span>
              )}
            </div>

            <div className="tape" aria-label="Round history">
              <div className="tape__row">
                <span className="tape__k">You</span>
                {myMoves.map((m, i) => (
                  <Pip key={i} m={m} fresh={i === myMoves.length - 1} />
                ))}
              </div>
              <div className="tape__row">
                <span className="tape__k">???</span>
                {oppMoves.map((m, i) => (
                  <Pip key={i} m={m} dim fresh={i === oppMoves.length - 1} />
                ))}
              </div>
            </div>

            <div className="choices">
              <button
                className={`choice choice--c${armed === 'C' ? ' armed' : ''}`}
                onClick={() => playMove('C')}
                disabled={!canPlay}
              >
                Cooperate
              </button>
              <button
                className={`choice choice--d${armed === 'D' ? ' armed' : ''}`}
                onClick={() => playMove('D')}
                disabled={!canPlay}
              >
                Defect
              </button>
            </div>

            <ScoreKey />
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

function PayoffGrid() {
  return (
    <table className="payoff">
      <thead>
        <tr>
          <th />
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
  );
}

function Intro({ issue, onPlay }) {
  return (
    <section className="intro">
      <p className="intro__no">No. {issue}</p>
      <p className="intro__lead">
        Each round, you and a hidden opponent choose: <b>cooperate</b> or{' '}
        <b className="betray">defect</b>.
      </p>
      <ScoreKey />
      <p className="intro__lead">
        It ends on a round you won&rsquo;t see coming.
      </p>
      <button className="choice choice--play" onClick={onPlay}>
        Play
      </button>
    </section>
  );
}

function ResultScreen({ puzzle, reveal, my, opp, score, them, streak, onShare, copied }) {
  const field = (puzzle.field || [])
    .map((b) => ({ name: b.name, score: b.score, nice: b.nice, you: false }))
    .concat([{ name: 'You', score, nice: null, you: true }])
    .sort((a, b) => b.score - a.score || (a.you ? -1 : b.you ? 1 : a.name < b.name ? -1 : 1));
  const rank = field.findIndex((r) => r.you) + 1;
  const youRef = useRef(null);
  useEffect(() => {
    youRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <section className="done">
      <div className="res__score">
        {score}
        <span>your score</span>
      </div>
      <p className="res__vs">
        vs <b>{reveal.name}</b> &nbsp;&middot;&nbsp; they scored {them}
      </p>

      <div className={`reveal reveal--${reveal.nice ? 'nice' : 'nasty'}`}>
        <div className="reveal__head">
          <span className="reveal__name">{reveal.name}</span>
          <span className="reveal__tag">{reveal.nice ? 'NICE' : 'NASTY'}</span>
        </div>
        <p className="reveal__blurb">{reveal.blurb}</p>
        {reveal.origin && <p className="reveal__origin">{reveal.origin}</p>}
      </div>

      <p className="field__cap">
        The field vs {reveal.name} &nbsp;·&nbsp; you placed{' '}
        <b>#{rank}</b> of {field.length}
      </p>
      <div className="field">
        <table>
          <tbody>
            {field.map((r, i) => (
              <tr key={i} ref={r.you ? youRef : null} className={r.you ? 'you' : undefined}>
                <td className="r">{i + 1}</td>
                <td>
                  {r.you ? null : (
                    <i className={`fdot ${r.nice ? 'n' : 'x'}`} aria-hidden="true" />
                  )}
                  {r.name}
                </td>
                <td className="n">{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tape">
        <div className="tape__row">
          <span className="tape__k">You</span>
          {my.map((m, i) => (
            <Pip key={i} m={m} />
          ))}
        </div>
        <div className="tape__row">
          <span className="tape__k">Them</span>
          {opp.map((m, i) => (
            <Pip key={i} m={m} />
          ))}
        </div>
      </div>

      {streak > 1 && <p className="done__streak">{'\u{1F525}'} {streak}-day streak</p>}

      <button
        className="choice choice--share"
        onClick={() => onShare(`#${rank} of ${field.length}`)}
      >
        {copied ? 'Copied' : 'Share'}
      </button>
    </section>
  );
}

function HelpBody() {
  return (
    <div className="prose">
      <p>
        Every round you and a hidden opponent secretly pick{' '}
        <strong>Cooperate</strong> or <strong>Defect</strong>, and score:
      </p>
      <PayoffGrid />
      <p>
        One opponent a day, the same for everyone, hidden until the game ends.
        The match runs an unpredictable number of rounds — no safe final-round
        betrayal.
      </p>
      <p style={{ marginBottom: 0 }}>
        When it&rsquo;s over you&rsquo;ll see how the textbook strategies scored
        against the same opponent, and whether it was <strong>nice</strong>{' '}
        (never defects first) or <strong>nasty</strong>.
      </p>
    </div>
  );
}

function StatsBody({ stats }) {
  return (
    <div className="statgrid">
      <div>
        <b>{stats.played}</b>
        <span>Played</span>
      </div>
      <div>
        <b>{stats.streak}</b>
        <span>Streak</span>
      </div>
      <div>
        <b>{stats.max}</b>
        <span>Best</span>
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
