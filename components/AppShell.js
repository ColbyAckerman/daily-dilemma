'use client';

import { useCallback, useEffect, useState } from 'react';
import Builder from './Builder';
import Leaderboard from './Leaderboard';
import LiveDuel from './LiveDuel';
import HelpContent from './HelpContent';
import Modal from './Modal';

export default function AppShell({ initialState }) {
  const [state, setState] = useState(initialState);
  const [modal, setModal] = useState(null); // 'help' | 'board' | 'duel' | null
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    let t = null;
    try {
      t = localStorage.getItem('dd-theme');
    } catch (e) {}
    if (t !== 'dark' && t !== 'light') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    setTheme(t);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (r.ok) setState(await r.json());
    } catch (e) {}
  }, []);

  const onFiled = useCallback(
    (newState) => {
      if (newState) setState(newState);
      else refresh();
    },
    [refresh]
  );

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('dd-theme', next);
    } catch (e) {}
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
        <h1 className="topbar__title">Daily Dilemma</h1>
        <div className="iconrow">
          <button
            className="iconbtn"
            aria-label="Leaderboard"
            onClick={() => setModal('board')}
          >
            ▤
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
          No. {String(issueNumber).padStart(3, '0')} &nbsp;·&nbsp;{' '}
          <b>{twist.rounds}</b> rounds &nbsp;·&nbsp; <b>{twist.noiseLabel}</b>{' '}
          ({twist.noisePct}% noise)
        </p>

        <Builder state={state} onFiled={onFiled} />

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
          <Leaderboard state={state} onRefresh={refresh} />
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
