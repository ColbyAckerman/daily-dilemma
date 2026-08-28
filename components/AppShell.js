'use client';

import { useCallback, useEffect, useState } from 'react';
import Builder from './Builder';
import Leaderboard from './Leaderboard';
import LiveDuel from './LiveDuel';
import HelpContent from './HelpContent';
import Modal from './Modal';

const MINE_KEY = 'dd-mine';

export default function AppShell({ initialState }) {
  const [state, setState] = useState(initialState);
  const [modal, setModal] = useState(null); // 'help' | 'board' | 'duel' | null
  const [theme, setTheme] = useState(null);
  const [mine, setMine] = useState([]); // [{ id, name, author }]
  const [nonce, setNonce] = useState(0); // bump to hard-reset the builder

  useEffect(() => {
    let t = null;
    try {
      t = localStorage.getItem('dd-theme');
    } catch (e) {}
    if (t !== 'dark' && t !== 'light') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    setTheme(t);
    try {
      const saved = JSON.parse(localStorage.getItem(MINE_KEY) || '[]');
      if (Array.isArray(saved)) setMine(saved);
    } catch (e) {}
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (r.ok) setState(await r.json());
    } catch (e) {}
  }, []);

  const onFiled = useCallback((newState, filed) => {
    if (newState) setState(newState);
    else refresh();
    if (filed && filed.name) {
      setMine((prev) => {
        const key = (a) => `${(a.author || '').toLowerCase()}|${a.name.toLowerCase()}`;
        if (prev.some((m) => key(m) === key(filed))) return prev;
        const next = [...prev, { id: filed.id, name: filed.name, author: filed.author }];
        try {
          localStorage.setItem(MINE_KEY, JSON.stringify(next));
        } catch (e) {}
        return next;
      });
    }
  }, [refresh]);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('dd-theme', next);
    } catch (e) {}
  }

  function startOver() {
    // Wipe the current attempt. Keep who you are: callsign, device id (dd-uid,
    // which backs callsign ownership + live duel), and theme.
    try {
      localStorage.removeItem('dd-draft');
      localStorage.removeItem(MINE_KEY);
    } catch (e) {}
    setMine([]);
    setModal(null);
    setNonce((n) => n + 1);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }

  const { twist, issueNumber } = state;

  return (
    <>
      <header className="topbar">
        <div className="iconrow">
          <button
            className="iconbtn"
            aria-label="How to play"
            onClick={() => setModal('help')}
          >
            ?
          </button>
        </div>

        <button
          className="topbar__title"
          onClick={startOver}
          title="Start over — clears your draft (keeps your callsign)"
        >
          Daily Dilemma
        </button>

        <div className="iconrow">
          <button
            className="iconbtn"
            aria-label="Leaderboard"
            onClick={() => setModal('board')}
          >
            <BoardIcon />
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
          <span>No. {String(issueNumber).padStart(3, '0')}</span>
          <span>≈{twist.expectedRounds} rounds · random end</span>
          <span>
            {twist.noiseLabel} · {twist.noisePct}% noise
          </span>
        </p>

        <div className="col-main">
          <Builder key={nonce} state={state} mine={mine} onFiled={onFiled} />
        </div>

        <aside className="rail">
          <span className="label">Leaderboard</span>
          <Leaderboard key={nonce} state={state} mine={mine} onRefresh={refresh} />
        </aside>

        <div className="footer-links">
          <button onClick={() => setModal('board')}>Leaderboard</button>
          <span aria-hidden>·</span>
          <button onClick={() => setModal('duel')}>Live Duel</button>
          <span aria-hidden>·</span>
          <button onClick={() => setModal('help')}>How to play</button>
        </div>
      </main>

      {modal === 'help' && (
        <Modal title="How to play" onClose={() => setModal(null)}>
          <HelpContent />
        </Modal>
      )}
      {modal === 'board' && (
        <Modal title="Leaderboard" onClose={() => setModal(null)}>
          <Leaderboard state={state} mine={mine} onRefresh={refresh} />
        </Modal>
      )}
      {modal === 'duel' && (
        <Modal title="Live Duel — experimental" onClose={() => setModal(null)}>
          <LiveDuel />
        </Modal>
      )}
    </>
  );
}

function BoardIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none" aria-hidden="true">
      <rect x="1.5" y="9" width="3.4" height="6.5" rx="1" fill="currentColor" />
      <rect x="6.8" y="5" width="3.4" height="10.5" rx="1" fill="currentColor" />
      <rect x="12.1" y="1.5" width="3.4" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}
