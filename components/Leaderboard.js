'use client';

import { useEffect, useState } from 'react';
import { describeStrategy } from '@/lib/sentences';
import LiveDuel from './LiveDuel';

function ProgramRow({ row }) {
  const lines = row.house
    ? [row.blurb || 'House bot — fixed classic strategy.']
    : describeStrategy(row);
  return (
    <tr className="expand">
      <td colSpan={6}>
        <pre className="program">{lines.join('\n')}</pre>
      </td>
    </tr>
  );
}

function LedgerTable({ rows, valueKey, valueLabel, extraKey, extraLabel }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="ledger-wrap">
      <table className="ledger">
        <thead>
          <tr>
            <th style={{ width: 34 }}>#</th>
            <th>Strategy</th>
            <th></th>
            <th className="num">{valueLabel}</th>
            <th className="num">{extraLabel}</th>
            <th className="num">W–T–L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = open === row.id;
            return (
              <FragmentRow
                key={row.id}
                row={row}
                isOpen={isOpen}
                onToggle={() => setOpen(isOpen ? null : row.id)}
                valueKey={valueKey}
                extraKey={extraKey}
              />
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="notice" style={{ padding: 14 }}>
                No strategies yet — be the first to file one.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FragmentRow({ row, isOpen, onToggle, valueKey, extraKey }) {
  return (
    <>
      <tr className="is-clickable" onClick={onToggle}>
        <td className="rank">{row.rank}</td>
        <td>
          {row.name}
          {row.author && !row.house ? (
            <div className="notice" style={{ padding: 0, fontSize: 11 }}>
              filed by {row.author}
            </div>
          ) : null}
        </td>
        <td>
          <span className="tag">{row.house ? 'House Bot' : 'Filed'}</span>
        </td>
        <td className="num">{fmt(row[valueKey])}</td>
        <td className="num">{row[extraKey]}</td>
        <td className="num">
          {row.wins != null ? `${row.wins}–${row.ties}–${row.losses}` : '—'}
        </td>
      </tr>
      {isOpen && <ProgramRow row={row} />}
    </>
  );
}

function fmt(v) {
  return typeof v === 'number' ? v.toFixed(3) : v;
}

export default function Leaderboard({ state, onRefresh }) {
  const [tab, setTab] = useState('today');
  const [allTime, setAllTime] = useState(null);
  const [loadingAT, setLoadingAT] = useState(false);

  useEffect(() => {
    if (tab !== 'alltime' || allTime || loadingAT) return;
    setLoadingAT(true);
    fetch('/api/leaderboard/alltime', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setAllTime(d))
      .catch(() => setAllTime({ rows: [], error: true }))
      .finally(() => setLoadingAT(false));
  }, [tab, allTime, loadingAT]);

  return (
    <section className="panel">
      <h2 className="panel__title">Leaderboard</h2>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'today'} onClick={() => setTab('today')}>
          Today
        </button>
        <button
          role="tab"
          aria-selected={tab === 'alltime'}
          onClick={() => setTab('alltime')}
        >
          All-Time
        </button>
        <button role="tab" aria-selected={tab === 'live'} onClick={() => setTab('live')}>
          Live Duel
        </button>
      </div>

      {tab === 'today' && (
        <>
          <p className="panel__hint">
            {state.strategies.length} filed{' '}
            {state.strategies.length === 1 ? 'strategy' : 'strategies'} + 10 house
            bots · {state.twist.rounds} rounds · {state.twist.noiseLabel}. Click a
            row to read its rules.
          </p>
          <LedgerTable
            rows={state.standings}
            valueKey="avg"
            valueLabel="Avg / rd"
            extraKey="opponents"
            extraLabel="Opp."
          />
          <div className="btn-row">
            <button className="btn btn--sm" onClick={onRefresh}>
              Refresh
            </button>
          </div>
        </>
      )}

      {tab === 'alltime' && (
        <>
          <p className="panel__hint">
            {loadingAT
              ? 'Replaying the last 30 days…'
              : allTime
              ? `Averaged across ${allTime.days} day${allTime.days === 1 ? '' : 's'}${
                  allTime.cached ? ' · cached' : ''
                }.`
              : ''}
          </p>
          {allTime && (
            <LedgerTable
              rows={(allTime.rows || []).map((r) => ({ ...r, wins: null }))}
              valueKey="avgAllTime"
              valueLabel="Avg / rd"
              extraKey="daysPlayed"
              extraLabel="Days"
            />
          )}
        </>
      )}

      {tab === 'live' && <LiveDuel />}
    </section>
  );
}
