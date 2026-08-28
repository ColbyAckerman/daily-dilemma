'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { describeStrategy } from '@/lib/sentences';
import TrendChart from './TrendChart';

const keyOf = (a, n) => `${(a || '').toLowerCase()}|${(n || '').toLowerCase()}`;

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

function Rows({ rows, valueKey, extraKey, isMine, focusKey }) {
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
            focused={!!focusKey && keyOf(row.author, row.name) === focusKey}
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

function FragmentRow({ row, mine, focused, isOpen, onToggle, valueKey, extraKey }) {
  const ref = useRef(null);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!focused || !ref.current) return;
    ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 1600);
    return () => clearTimeout(t);
  }, [focused]);

  const cls = ['click'];
  if (mine) cls.push('is-mine');
  if (pulse) cls.push('pulse');

  return (
    <>
      <tr ref={ref} className={cls.join(' ')} onClick={onToggle}>
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

export default function Leaderboard({ state, mine = [], focusKey, onRefresh }) {
  const [tab, setTab] = useState('today');
  const [allTime, setAllTime] = useState(null);
  const [loading, setLoading] = useState(false);

  const mineKeys = useMemo(
    () => new Set(mine.map((m) => keyOf(m.author, m.name))),
    [mine]
  );
  const isMine = (row) => !row.house && mineKeys.has(keyOf(row.author, row.name));

  useEffect(() => {
    if (tab === 'today' || allTime || loading) return;
    setLoading(true);
    fetch('/api/leaderboard/alltime', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setAllTime)
      .catch(() => setAllTime({ rows: [], error: true }))
      .finally(() => setLoading(false));
  }, [tab, allTime, loading]);

  // If a freshly-filed row should be spotlighted, jump to whichever tab shows it.
  useEffect(() => {
    if (focusKey) setTab('today');
  }, [focusKey]);

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
        <button
          role="tab"
          aria-selected={tab === 'trend'}
          onClick={() => setTab('trend')}
        >
          Trend
        </button>
      </div>

      {tab === 'today' && (
        <>
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
              focusKey={focusKey}
            />
          </table>
          <button className="linkbtn" style={{ marginTop: 10 }} onClick={onRefresh}>
            Refresh
          </button>
        </>
      )}

      {tab === 'alltime' && (
        <>
          {loading && <p className="hint">Replaying the last 30 days…</p>}
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
                focusKey={focusKey}
              />
            </table>
          )}
        </>
      )}

      {tab === 'trend' && (
        <>
          {loading && <p className="hint">Building the trend…</p>}
          {allTime && (
            <TrendChart series={allTime.series || []} window={allTime.window || []} />
          )}
        </>
      )}
    </div>
  );
}
