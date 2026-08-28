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

const num = {
  type: 'number',
  className: 'input input--num',
};

export default function RuleRow({ rule, index, count, badge, onChange, onMove, onRemove }) {
  const p = rule.params || {};
  const setType = (type) => onChange({ ...rule, type, params: defaultParams(type) });
  const setParam = (patch) => onChange({ ...rule, params: { ...p, ...patch } });
  const setAction = (action) => onChange({ ...rule, action });

  return (
    <div className="rule">
      <div className="rule__head">
        <span className="rule__idx">
          rule {index + 1} of {count}
          {badge ? <span className="rule__badge">{prettyPreset(badge)}</span> : null}
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
        <span className="rule__kw">if</span>
        <select
          className="input"
          style={{ flex: '1 1 100%', width: 'auto' }}
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
          <>
            <span className="rule__kw">was</span>
            <Seg value={p.move} onChange={(m) => setParam({ move: m })} />
          </>
        )}

        {rule.type === 'opp_streak' && (
          <>
            <span className="rule__kw">was</span>
            <Seg value={p.move} onChange={(m) => setParam({ move: m })} />
            <span className="rule__kw">for the last</span>
            <input
              {...num}
              min="1"
              max="50"
              value={p.n}
              onChange={(e) => setParam({ n: e.target.value })}
            />
            <span className="rule__kw">rounds</span>
          </>
        )}

        {rule.type === 'opp_defect_gte' && (
          <>
            <span className="rule__kw">reaches</span>
            <input
              {...num}
              min="1"
              max="999"
              value={p.n}
              onChange={(e) => setParam({ n: e.target.value })}
            />
          </>
        )}

        {rule.type === 'opp_coop_rate' && (
          <>
            <span className="rule__kw">is</span>
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
              {...num}
              min="0"
              max="100"
              value={p.pct}
              onChange={(e) => setParam({ pct: e.target.value })}
            />
            <span className="rule__kw">%</span>
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
              {...num}
              min="1"
              max="1000"
              value={p.n}
              onChange={(e) => setParam({ n: e.target.value })}
            />
          </>
        )}

        {rule.type === 'random_chance' && (
          <>
            <span className="rule__kw">at</span>
            <input
              {...num}
              min="0"
              max="100"
              value={p.pct}
              onChange={(e) => setParam({ pct: e.target.value })}
            />
            <span className="rule__kw">%</span>
          </>
        )}
      </div>

      <div className="rule__controls" style={{ marginTop: 8 }}>
        <span className="rule__kw">then</span>
        <Seg value={rule.action} onChange={setAction} />
      </div>

      <p className="rule__sentence">
        {ruleSentence(normalizeForSentence(rule))} →{' '}
        <strong>{rule.action === 'D' ? 'Defect' : 'Cooperate'}</strong>
      </p>
    </div>
  );
}

function prettyPreset(key) {
  return PRESET_NAMES[key] || key;
}

const PRESET_NAMES = {
  'tit-for-tat': 'Tit for Tat',
  'grim-trigger': 'Grim Trigger',
  'always-cooperate': 'Always Cooperate',
  'always-defect': 'Always Defect',
  'tit-for-two-tats': 'Tit for Two Tats',
  'suspicious-tit-for-tat': 'Suspicious TfT',
  'generous-tit-for-tat': 'Generous TfT',
  joss: 'Joss',
};

function normalizeForSentence(rule) {
  const p = { ...(rule.params || {}) };
  ['n', 'pct'].forEach((k) => {
    if (p[k] !== undefined) p[k] = Number(p[k]) || 0;
  });
  return { ...rule, params: p };
}
