'use client';

import { useEffect, useMemo, useState } from 'react';
import { describeStrategy } from '@/lib/sentences';

function ExpandRow({ row }) {
  const lines = row.house
    ? [row.blurb || 'House bot — fixed classic strategy.']
    : describeStrategy(row);
  return (
    <tr className="expand">
      <td colSpan={4}>
        <pre className="program">{lines.join('\n')}</pre>
      </td>
    </tr>
  );
}

function Rows({ rows, valueKey, extraKey, isMine }) {
  const [open, setOpen] = useState(null);
  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={4} className="notice" style={{ padding: 16 }}>
            No strategies filed yet — be the first.
          </td>
        </tr>
      </tbody>
    );
  }
  return (
    <tbody>
      {rows.map((row) => {
        const isOpen = open === row.id;
        return (
          <FragmentRow
            key={row.id}
            row={row}
            mine={isMine(row)}
            isOpen={isOpen}
            onToggle={() => setOpen(isOpen ? null : row.id)}
            valueKey={valueKey}
            extraKey={extraKey}
          />
        );
      })}
    </tbody>
  );
}

function FragmentRow({ row, mine, isOpen, onToggle, valueKey, extraKey }) {
  return (
    <>
      <tr className={mine ? 'click is-mine' : 'click'} onClick={onToggle}>
        <td className="rank">{row.rank}</td>
        <td>
          {row.name}
          {mine ? (
            <span className="tag tag--you"> · you</span>
          ) : !row.house && row.author ? (
            <span className="tag"> · {row.author}</span>
          ) : (
            <span className="tag"> · bot</span>
          )}
        </td>
        <td className="num">
          {typeof row[valueKey] === 'number' ? row[valueKey].toFixed(3) : '—'}
        </td>
        <td className="num">{row[extraKey]}</td>
      </tr>
      {isOpen && <ExpandRow row={row} />}
    </>
  );
}

export default function Leaderboard({ state, mine = [], onRefresh }) {
  const [tab, setTab] = useState('today');
  const [allTime, setAllTime] = useState(null);
  const [loading, setLoading] = useState(false);

  const mineKeys = useMemo(
    () =>
      new Set(
        mine.map((m) => `${(m.author || '').toLowerCase()}|${(m.name || '').toLowerCase()}`)
      ),
    [mine]
  );
  const isMine = (row) =>
    !row.house &&
    mineKeys.has(`${(row.author || '').toLowerCase()}|${(row.name || '').toLowerCase()}`);

  useEffect(() => {
    if (tab !== 'alltime' || allTime || loading) return;
    setLoading(true);
    fetch('/api/leaderboard/alltime', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setAllTime)
      .catch(() => setAllTime({ rows: [], error: true }))
      .finally(() => setLoading(false));
  }, [tab, allTime, loading]);

  const mineNote =
    mine.length > 0 ? ' Your strategies are highlighted.' : '';

  return (
    <div>
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
      </div>

      {tab === 'today' && (
        <>
          <p className="hint">
            {state.strategies.length} filed + 10 bots · ≈{state.twist.expectedRounds}{' '}
            rounds · {state.twist.noiseLabel}. Tap a row for its rules.{mineNote}
          </p>
          <table className="list">
            <thead>
              <tr>
                <th>#</th>
                <th>Strategy</th>
                <th className="num">Avg</th>
                <th className="num">Opp</th>
              </tr>
            </thead>
            <Rows
              rows={state.standings}
              valueKey="avg"
              extraKey="opponents"
              isMine={isMine}
            />
          </table>
          <p className="center" style={{ marginTop: 12 }}>
            <button className="btn btn--sm btn--ghost" onClick={onRefresh}>
              Refresh
            </button>
          </p>
        </>
      )}

      {tab === 'alltime' && (
        <>
          <p className="hint">
            {loading
              ? 'Replaying the last 30 days…'
              : allTime
              ? `Averaged across ${allTime.days} day${allTime.days === 1 ? '' : 's'}${
                  allTime.cached ? ' · cached' : ''
                }. Tap a row for its rules.${mineNote}`
              : ''}
          </p>
          {allTime && (
            <table className="list">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Strategy</th>
                  <th className="num">Avg</th>
                  <th className="num">Days</th>
                </tr>
              </thead>
              <Rows
                rows={allTime.rows || []}
                valueKey="avgAllTime"
                extraKey="daysPlayed"
                isMine={isMine}
              />
            </table>
          )}
        </>
      )}
    </div>
  );
}
