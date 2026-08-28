'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ResultPanel from './ResultPanel';

const BOUT_MS = 900;
const INTRO_MS = 950;

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
}

function useCountUp(target, ms, run) {
  const [v, setV] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) {
      setV(target);
      return;
    }
    let raf;
    let start;
    let done = false;
    // Safety net: rAF is throttled in background tabs, so guarantee the final
    // value even if the frame loop stalls.
    const finish = setTimeout(() => {
      done = true;
      setV(target);
    }, ms + 120);
    const tick = (t) => {
      if (done) return;
      if (start == null) start = t;
      const p = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setV(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        done = true;
        setV(target);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      clearTimeout(finish);
    };
  }, [target, ms, run]);
  return v;
}

function tier(rank, field) {
  if (rank === 1) return { key: 'gold', line: 'Champion of the day.' };
  if (rank <= 3) return { key: 'gold', line: 'On the podium!' };
  if (rank <= Math.ceil(field / 4)) return { key: 'green', line: 'Top of the pack.' };
  if (rank <= Math.ceil(field / 2)) return { key: 'green', line: 'Upper half — solid.' };
  return { key: 'plain', line: 'Room to climb. Tweak and run it again.' };
}

export default function PlayRun({ result, callsign, strategyName, onFile, onClose, onSeeBoard }) {
  const reduced = useMemo(prefersReducedMotion, []);
  const bouts = result.bouts || [];
  const otherAvgs = useMemo(
    () => result.standings.filter((s) => !s.isDraft).map((s) => s.avg),
    [result]
  );

  const [phase, setPhase] = useState('intro'); // intro | bouts | reveal
  const [bi, setBi] = useState(-1);
  const [filing, setFiling] = useState(false);
  const [filed, setFiled] = useState(null); // { rank, updated } | { error }

  // ---- drive the sequence ----
  useEffect(() => {
    if (reduced) {
      setPhase('reveal');
      return;
    }
    const t = setTimeout(() => {
      setPhase('bouts');
      setBi(0);
    }, INTRO_MS);
    return () => clearTimeout(t);
  }, [reduced]);

  useEffect(() => {
    if (phase !== 'bouts' || bi < 0) return;
    if (bi >= bouts.length) {
      setPhase('reveal');
      return;
    }
    const t = setTimeout(() => setBi((n) => n + 1), BOUT_MS);
    return () => clearTimeout(t);
  }, [phase, bi, bouts.length]);

  function skip() {
    setPhase('reveal');
  }

  // ---- running tallies through bout `bi` ----
  const done = phase === 'reveal' ? bouts.length : Math.min(bi + 1, bouts.length);
  const run = bouts.slice(0, done);
  let wins = 0,
    ties = 0,
    losses = 0,
    pts = 0,
    rounds = 0,
    streak = 0,
    bestStreak = 0;
  for (const b of run) {
    pts += b.myScore;
    rounds += b.rounds;
    if (b.result === 'W') {
      wins++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
    } else if (b.result === 'L') {
      losses++;
      streak = 0;
    } else {
      ties++;
      streak = 0;
    }
  }
  const runAvg = rounds ? pts / rounds : 0;
  const projRank = 1 + otherAvgs.filter((a) => a > runAvg).length;
  const cur = phase === 'bouts' && bi >= 0 && bi < bouts.length ? bouts[bi] : null;

  // ---- reveal numbers ----
  const revealing = phase === 'reveal';
  const shownRank = useCountUp(result.rank, 1100, revealing && !reduced);
  const shownAvg = useCountUp(result.avg, 1100, revealing && !reduced);
  const t = tier(result.rank, result.fieldSize);

  const canvasRef = useRef(null);
  useEffect(() => {
    if (!revealing || reduced) return;
    if (result.rank > Math.max(3, Math.ceil(result.fieldSize / 3))) return;
    const cv = canvasRef.current;
    if (!cv) return;
    burstConfetti(cv);
  }, [revealing, reduced, result.rank, result.fieldSize]);

  async function doFile() {
    setFiling(true);
    try {
      const res = await onFile();
      setFiled(res && res.ok ? { rank: res.rank, updated: res.updated } : { error: (res && res.error) || 'Filing failed.' });
    } catch (e) {
      setFiled({ error: 'Network error.' });
    }
    setFiling(false);
  }

  return (
    <div className="playrun" role="dialog" aria-modal="true" aria-label="Simulation run">
      <div className="playrun__bar">
        <div className="playrun__progress">
          <span
            style={{
              width: `${
                phase === 'reveal' ? 100 : ((bi + 1) / Math.max(1, bouts.length)) * 100
              }%`,
            }}
          />
        </div>
        {phase !== 'reveal' && (
          <button className="linkbtn" onClick={skip}>
            Skip ⏭
          </button>
        )}
      </div>

      <div className="playrun__stage">
        {phase === 'intro' && (
          <div className="pr-intro">
            <div className="pr-eyebrow">Entering the arena</div>
            <div className="pr-callsign">{callsign || 'YOU'}</div>
            <div className="pr-strat">“{strategyName || 'Your Strategy'}”</div>
            <div className="pr-sub">
              {bouts.length} bouts · {result.fieldSize - 1} rivals
            </div>
          </div>
        )}

        {phase === 'bouts' && cur && (
          <Bout key={bi} bout={cur} callsign={callsign} />
        )}

        {phase === 'reveal' && (
          <div className={`pr-reveal pr-reveal--${t.key}`}>
            <canvas className="pr-confetti" ref={canvasRef} width={520} height={360} />
            <div className="pr-eyebrow">Projected finish</div>
            <div className="pr-rank">
              #{reduced ? result.rank : Math.round(shownRank)}
              <span className="pr-rank__of"> / {result.fieldSize}</span>
            </div>
            <div className="pr-line">{t.line}</div>
            <div className="pr-statrow">
              <div>
                <b>{(reduced ? result.avg : shownAvg).toFixed(3)}</b>
                <span>avg / round</span>
              </div>
              <div>
                <b>
                  {result.wins}–{result.ties}–{result.losses}
                </b>
                <span>W–T–L</span>
              </div>
              <div>
                <b>{bestStreak}</b>
                <span>best streak</span>
              </div>
            </div>

            {!filed && (
              <div className="pr-cta">
                <button className="btn btn--primary btn--big" onClick={doFile} disabled={filing}>
                  {filing ? 'Filing…' : 'File to the arena'}
                </button>
                <button className="btn btn--ghost" onClick={onClose} disabled={filing}>
                  Back to builder
                </button>
              </div>
            )}
            {filed && filed.error && (
              <div className="pr-cta">
                <p className="err">{filed.error}</p>
                <button className="btn btn--ghost" onClick={onClose}>
                  Back to builder
                </button>
              </div>
            )}
            {filed && !filed.error && (
              <div className="pr-cta">
                <p className="ok pr-filed">
                  {filed.updated ? 'Updated on the board' : 'Filed'} — you’re{' '}
                  <b>#{filed.rank ?? result.rank}</b>.
                </p>
                <button
                  className="btn btn--primary btn--big"
                  onClick={() => {
                    onSeeBoard && onSeeBoard();
                    onClose();
                  }}
                >
                  See the board
                </button>
                <button className="btn btn--ghost" onClick={onClose}>
                  Keep tweaking
                </button>
              </div>
            )}

            <details className="pr-details">
              <summary>Full breakdown</summary>
              <ResultPanel result={result} />
            </details>
          </div>
        )}
      </div>

      {phase !== 'reveal' && (
        <div className="playrun__meter">
          <div className="pr-meter__rank">
            <span className="pr-eyebrow">Projected</span>
            <b>#{projRank}</b>
          </div>
          <div className="pr-meter__mid">
            <span className={streak >= 2 ? 'pr-streak pr-streak--hot' : 'pr-streak'}>
              {streak >= 2 ? `🔥 ${streak} streak` : `${wins}W ${losses}L ${ties}T`}
            </span>
          </div>
          <div className="pr-meter__avg">
            <span className="pr-eyebrow">Avg</span>
            <b>{runAvg.toFixed(2)}</b>
          </div>
        </div>
      )}
    </div>
  );
}

function Bout({ bout, callsign }) {
  const total = bout.myScore + bout.oppScore || 1;
  const mine = Math.round((bout.myScore / total) * 100);
  const [reveal, setReveal] = useState(0);
  useEffect(() => {
    setReveal(0);
    const id = setInterval(
      () => setReveal((n) => (n >= bout.moves.length ? n : n + 3)),
      16
    );
    return () => clearInterval(id);
  }, [bout]);

  return (
    <div className="bout">
      <div className="bout__vs">
        <span className="bout__me">{callsign || 'YOU'}</span>
        <span className="bout__x">vs</span>
        <span className="bout__opp">
          {bout.oppName}
          {bout.oppRank ? <i> #{bout.oppRank}</i> : null}
        </span>
      </div>

      <div className="bout__bar">
        <span className="bout__bar-me" style={{ width: `${mine}%` }} />
        <span className="bout__bar-opp" style={{ width: `${100 - mine}%` }} />
      </div>

      <div className="bout__pips">
        {bout.moves.slice(0, reveal).map((m, i) => (
          <span key={i} className="pair">
            <span className={`pill pill--${m.me}`}>{m.me}</span>
            <span className={`pill pill--${m.opp}`}>{m.opp}</span>
          </span>
        ))}
      </div>

      <div className={`bout__stamp bout__stamp--${bout.result}`}>
        {bout.result === 'W' ? `WIN +${bout.myScore - bout.oppScore}` : bout.result === 'L' ? 'LOSS' : 'TIE'}
        <span className="bout__score">
          {bout.myScore}–{bout.oppScore}
        </span>
      </div>
    </div>
  );
}

// Tiny self-contained confetti burst.
function burstConfetti(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const colors = ['#93711A', '#1F7A6C', '#D8B15E', '#57C9AF', '#B5402C'];
  const N = 130;
  const parts = Array.from({ length: N }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 60,
    y: H / 2,
    vx: (Math.random() - 0.5) * 9,
    vy: Math.random() * -11 - 3,
    g: 0.28 + Math.random() * 0.15,
    s: 3 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    c: colors[(Math.random() * colors.length) | 0],
    life: 0,
  }));
  let frame = 0;
  function step() {
    frame++;
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = frame;
      const a = Math.max(0, 1 - frame / 90);
      if (a <= 0) continue;
      alive++;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 1.6);
      ctx.restore();
    }
    if (alive > 0 && frame < 100) requestAnimationFrame(step);
    else ctx.clearRect(0, 0, W, H);
  }
  step();
}
