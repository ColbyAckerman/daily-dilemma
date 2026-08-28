'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getUid } from '@/lib/uid';

function getName() {
  try {
    return localStorage.getItem('dd-callsign') || 'ANON';
  } catch (e) {
    return 'ANON';
  }
}

const PILL = (m, k) => (
  <span key={k} className={`pill pill--${m}`}>
    {m}
  </span>
);

export default function LiveDuel() {
  const [phase, setPhase] = useState('idle'); // idle | waiting | playing | done
  const [match, setMatch] = useState(null);
  const [youAre, setYouAre] = useState('a');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef({ poll: null, queue: null, timeout: null });
  const cid = useRef(null);

  useEffect(() => {
    cid.current = getUid();
    return () => clearAll();
  }, []);

  function clearAll() {
    Object.values(timers.current).forEach((t) => t && clearInterval(t));
    Object.values(timers.current).forEach((t) => t && clearTimeout(t));
    timers.current = { poll: null, queue: null, timeout: null };
  }

  const pollMatch = useCallback((matchId) => {
    timers.current.poll = setInterval(async () => {
      try {
        const r = await fetch(
          `/api/live/match/${matchId}?clientId=${encodeURIComponent(cid.current)}`,
          { cache: 'no-store' }
        );
        if (!r.ok) return;
        const m = await r.json();
        setMatch(m);
        if (m.status === 'done') {
          clearInterval(timers.current.poll);
          setPhase('done');
        }
      } catch (e) {}
    }, 2000);
  }, []);

  function enterMatch(res) {
    clearAll();
    setYouAre(res.youAre || 'a');
    setPhase('playing');
    setMatch(null);
    // Pull initial state immediately, then poll.
    fetch(
      `/api/live/match/${res.matchId}?clientId=${encodeURIComponent(cid.current)}`,
      { cache: 'no-store' }
    )
      .then((r) => r.json())
      .then((m) => setMatch(m))
      .catch(() => {});
    pollMatch(res.matchId);
  }

  async function findOpponent() {
    setErr(null);
    setBusy(true);
    try {
      const res = await postQueue();
      if (res.status === 'matched') {
        enterMatch(res);
      } else {
        setPhase('waiting');
        // Re-poll the queue endpoint for a pairing.
        timers.current.queue = setInterval(async () => {
          const r = await postQueue();
          if (r.status === 'matched') {
            clearAll();
            enterMatch(r);
          }
        }, 2000);
        // 15s fallback -> solo bot match.
        timers.current.timeout = setTimeout(async () => {
          clearAll();
          const bot = await postBotMatch();
          enterMatch(bot);
        }, 15000);
      }
    } catch (e) {
      setErr('Could not reach the matchmaker.');
      setPhase('idle');
    }
    setBusy(false);
  }

  async function playBotNow() {
    setErr(null);
    setBusy(true);
    try {
      clearAll();
      const bot = await postBotMatch();
      enterMatch(bot);
    } catch (e) {
      setErr('Could not start a bot match.');
    }
    setBusy(false);
  }

  function postQueue() {
    return fetch('/api/live/queue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: cid.current, name: getName() }),
    }).then((r) => r.json());
  }
  function postBotMatch() {
    return fetch('/api/live/bot-match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: cid.current, name: getName() }),
    }).then((r) => r.json());
  }

  async function cancelWait() {
    clearAll();
    setPhase('idle');
    try {
      await fetch('/api/live/queue', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: cid.current }),
      });
    } catch (e) {}
  }

  async function sendMove(move) {
    if (!match) return;
    const myMoves = youAre === 'a' ? match.movesA : match.movesB;
    const round = myMoves.length;
    setBusy(true);
    try {
      const r = await fetch('/api/live/move', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matchId: match.id,
          clientId: cid.current,
          round,
          move,
        }),
      });
      const data = await r.json();
      if (data.match) {
        setMatch(data.match);
        if (data.match.status === 'done') {
          clearAll();
          setPhase('done');
        }
      }
    } catch (e) {
      setErr('Move failed — retry.');
    }
    setBusy(false);
  }

  function reset() {
    clearAll();
    setMatch(null);
    setPhase('idle');
    setErr(null);
  }

  // ---- render ----
  const my = match ? (youAre === 'a' ? match.movesA : match.movesB) : [];
  const opp = match ? (youAre === 'a' ? match.movesB : match.movesA) : [];
  const myScore = match ? (youAre === 'a' ? match.scoreA : match.scoreB) : 0;
  const oppScore = match ? (youAre === 'a' ? match.scoreB : match.scoreA) : 0;
  const oppName = match
    ? youAre === 'a'
      ? match.names.b
      : match.names.a
    : '';
  const rounds = match ? match.rounds : 10;
  const canMove =
    phase === 'playing' &&
    match &&
    match.status === 'active' &&
    my.length < rounds &&
    my.length <= opp.length &&
    !busy;
  const waitingOnOpp =
    phase === 'playing' && match && my.length > opp.length && match.status === 'active';

  return (
    <div>
      <p className="duel-note">
        Experimental. Polled every 2s, not live. No opponent in ~15s → you play a
        bot.
      </p>

      {phase === 'idle' && (
        <div className="btn-row">
          <button className="btn" onClick={findOpponent} disabled={busy}>
            Find Live Opponent
          </button>
          <button className="btn btn--primary" onClick={playBotNow} disabled={busy}>
            Play vs Bot Now
          </button>
        </div>
      )}

      {phase === 'waiting' && (
        <div>
          <p className="notice">
            Waiting for an opponent… auto-matching a bot in a few seconds.
          </p>
          <button className="btn btn--sm" onClick={cancelWait}>
            Cancel
          </button>
        </div>
      )}

      {(phase === 'playing' || phase === 'done') && match && (
        <div>
          <p className="notice">
            vs <strong>{oppName}</strong>
            {match.vsBot ? ' (bot)' : ''} · round{' '}
            {Math.min(my.length, opp.length) + (phase === 'done' ? 0 : 1)} / {rounds}
          </p>

          <div className="duel-score">
            <span>
              You<b className="tnum">{myScore}</b>
            </span>
            <span>
              {oppName}
              <b className="tnum">{oppScore}</b>
            </span>
          </div>

          {phase === 'playing' && (
            <div className="duel-moves">
              <button
                className="duel-btn"
                data-move="C"
                onClick={() => sendMove('C')}
                disabled={!canMove}
              >
                Cooperate
              </button>
              <button
                className="duel-btn"
                data-move="D"
                onClick={() => sendMove('D')}
                disabled={!canMove}
              >
                Defect
              </button>
            </div>
          )}

          {waitingOnOpp && (
            <p className="notice">Move locked in. Waiting on {oppName}…</p>
          )}

          <div className="pips" aria-label="Your moves">
            <span className="k">You</span>
            {my.map((m, i) => PILL(m, 'm' + i))}
          </div>
          <div className="pips" aria-label="Opponent moves">
            <span className="k">{oppName}</span>
            {opp.map((m, i) => PILL(m, 'o' + i))}
          </div>

          {phase === 'done' && (
            <div style={{ marginTop: 14 }}>
              <p className="ok" style={{ fontSize: '1rem' }}>
                {myScore > oppScore
                  ? 'You win the duel.'
                  : myScore < oppScore
                  ? `${oppName} wins the duel.`
                  : 'Dead heat.'}{' '}
                Final {myScore}–{oppScore}.
              </p>
              <button className="btn btn--sm" onClick={reset}>
                New duel
              </button>
            </div>
          )}
        </div>
      )}

      {err && <p className="err">{err}</p>}
    </div>
  );
}
