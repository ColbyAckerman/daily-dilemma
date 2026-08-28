'use client';

import Seg from './Seg';
import { ruleSentence } from '@/lib/sentences';
import { RULE_SPECS } from '@/lib/validate';

const TYPE_LABELS = [
  ['opp_last', "Opponent's last move"],
  ['my_last', 'Your last move'],
  ['opp_streak', "Opponent's recent streak"],
  ['opp_defect_gte', "Opponent's total defections"],
  ['opp_coop_rate', "Opponent's cooperation rate"],
  ['round_is', 'The round number'],
  ['random_chance', 'Random chance'],
];

export function defaultParams(type) {
  return RULE_SPECS[type] ? RULE_SPECS[type]({}) : {};
}

export default function RuleRow({ rule, index, count, onChange, onMove, onRemove }) {
  const p = rule.params || {};

  function setType(type) {
    onChange({ ...rule, type, params: defaultParams(type) });
  }
  function setParam(patch) {
    onChange({ ...rule, params: { ...p, ...patch } });
  }
  function setAction(action) {
    onChange({ ...rule, action });
  }

  return (
    <div className="rule">
      <div className="rule__head">
        <span className="rule__idx mono">
          {index + 1} / {count}
        </span>
        <span style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="rule__mini"
            aria-label="Move up"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="rule__mini"
            aria-label="Move down"
            disabled={index === count - 1}
            onClick={() => onMove(index, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="rule__mini"
            aria-label="Remove rule"
            onClick={() => onRemove(index)}
          >
            ✕
          </button>
        </span>
      </div>

      <div className="rule__controls">
        <select
          className="input"
          style={{ flex: '0 0 auto', width: 'auto' }}
          value={rule.type}
          onChange={(e) => setType(e.target.value)}
        >
          {TYPE_LABELS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>

        {(rule.type === 'opp_last' || rule.type === 'my_last') && (
          <Seg value={p.move} onChange={(m) => setParam({ move: m })} size="sm" />
        )}

        {rule.type === 'opp_streak' && (
          <>
            <Seg value={p.move} onChange={(m) => setParam({ move: m })} size="sm" />
            <label className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              for last{' '}
              <input
                type="number"
                min="1"
                max="50"
                className="input input--num"
                value={p.n}
                onChange={(e) => setParam({ n: e.target.value })}
              />{' '}
              rounds
            </label>
          </>
        )}

        {rule.type === 'opp_defect_gte' && (
          <label className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            ≥{' '}
            <input
              type="number"
              min="1"
              max="999"
              className="input input--num"
              value={p.n}
              onChange={(e) => setParam({ n: e.target.value })}
            />{' '}
            defections
          </label>
        )}

        {rule.type === 'opp_coop_rate' && (
          <>
            <select
              className="input"
              style={{ flex: '0 0 auto', width: 'auto' }}
              value={p.cmp}
              onChange={(e) => setParam({ cmp: e.target.value })}
            >
              <option value="gte">at least</option>
              <option value="lte">at most</option>
            </select>
            <input
              type="number"
              min="0"
              max="100"
              className="input input--num"
              value={p.pct}
              onChange={(e) => setParam({ pct: e.target.value })}
            />
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              %
            </span>
          </>
        )}

        {rule.type === 'round_is' && (
          <>
            <select
              className="input"
              style={{ flex: '0 0 auto', width: 'auto' }}
              value={p.cmp}
              onChange={(e) => setParam({ cmp: e.target.value })}
            >
              <option value="eq">equals</option>
              <option value="gte">is at least</option>
              <option value="multiple">is a multiple of</option>
            </select>
            <input
              type="number"
              min="1"
              max="1000"
              className="input input--num"
              value={p.n}
              onChange={(e) => setParam({ n: e.target.value })}
            />
          </>
        )}

        {rule.type === 'random_chance' && (
          <label className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
            <input
              type="number"
              min="0"
              max="100"
              className="input input--num"
              value={p.pct}
              onChange={(e) => setParam({ pct: e.target.value })}
            />{' '}
            % chance
          </label>
        )}

        <span className="mono" style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
          →
        </span>
        <Seg value={rule.action} onChange={setAction} size="sm" />
      </div>

      <p className="rule__sentence">
        “{ruleSentence(normalizeForSentence(rule))} → {rule.action === 'D' ? 'Defect' : 'Cooperate'}”
      </p>
    </div>
  );
}

// Coerce string number inputs to numbers just for the preview sentence.
function normalizeForSentence(rule) {
  const p = { ...(rule.params || {}) };
  ['n', 'pct'].forEach((k) => {
    if (p[k] !== undefined) p[k] = Number(p[k]) || 0;
  });
  return { ...rule, params: p };
}
