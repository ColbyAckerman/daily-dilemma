'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Seg from './Seg';
import RuleRow, { defaultParams } from './RuleRow';
import ResultPanel from './ResultPanel';
import { PRESETS } from '@/lib/presets';
import { validateStrategyInput, MAX_RULES } from '@/lib/validate';
import { simulateDraft } from '@/lib/engine';

const DRAFT_KEY = 'dd-draft';
const CALLSIGN_KEY = 'dd-callsign';

const BLANK = {
  author: '',
  name: '',
  firstMove: 'C',
  rules: [{ type: 'opp_last', params: { move: 'D' }, action: 'D' }],
  default: 'C',
};

export default function Builder({ state, onFiled }) {
  const [draft, setDraft] = useState(BLANK);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const loaded = useRef(false);

  // Restore callsign + last draft.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      const callsign = localStorage.getItem(CALLSIGN_KEY) || '';
      if (saved) {
        const parsed = JSON.parse(saved);
        setDraft({ ...BLANK, ...parsed, author: parsed.author || callsign });
      } else if (callsign) {
        setDraft((d) => ({ ...d, author: callsign }));
      }
    } catch (e) {}
    loaded.current = true;
  }, []);

  // Persist draft.
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      if (draft.author) localStorage.setItem(CALLSIGN_KEY, draft.author);
    } catch (e) {}
  }, [draft]);

  function patch(p) {
    setDraft((d) => ({ ...d, ...p }));
  }
  function setRule(i, rule) {
    setDraft((d) => {
      const rules = d.rules.slice();
      rules[i] = rule;
      return { ...d, rules };
    });
  }
  function moveRule(i, dir) {
    setDraft((d) => {
      const rules = d.rules.slice();
      const j = i + dir;
      if (j < 0 || j >= rules.length) return d;
      [rules[i], rules[j]] = [rules[j], rules[i]];
      return { ...d, rules };
    });
  }
  function removeRule(i) {
    setDraft((d) => ({ ...d, rules: d.rules.filter((_, k) => k !== i) }));
  }
  function addRule() {
    setDraft((d) =>
      d.rules.length >= MAX_RULES
        ? d
        : {
            ...d,
            rules: [
              ...d.rules,
              { type: 'opp_last', params: defaultParams('opp_last'), action: 'D' },
            ],
          }
    );
  }
  function loadPreset(preset) {
    setDraft((d) => ({
      ...d,
      firstMove: preset.def.firstMove,
      default: preset.def.default,
      rules: preset.def.rules.map((r) => ({
        type: r.type,
        params: { ...r.params },
        action: r.action,
      })),
      name: d.name || preset.label,
    }));
    setResult(null);
    setMsg(null);
  }

  const cleaned = useMemo(() => validateStrategyInput(draft).value, [draft]);

  function runSimulation() {
    setBusy(true);
    setMsg(null);
    // Let the button paint its disabled state before the sync crunch.
    setTimeout(() => {
      try {
        const res = simulateDraft(
          cleaned,
          state.strategies,
          state.twist,
          state.dateStr
        );
        setResult(res);
      } catch (e) {
        setMsg({ kind: 'err', text: 'Simulation failed: ' + String(e) });
      }
      setBusy(false);
    }, 10);
  }

  async function fileToArena() {
    const check = validateStrategyInput(draft);
    if (!check.ok) {
      setMsg({ kind: 'err', text: check.errors.join(' ') });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(check.value),
      });
      const data = await r.json();
      if (!r.ok) {
        setMsg({
          kind: 'err',
          text: (data.errors && data.errors.join(' ')) || data.error || 'Filing failed.',
        });
      } else {
        setMsg({
          kind: 'ok',
          text: data.updated
            ? 'Updated your filed strategy. It plays from today onward.'
            : 'Filed to the arena. It now plays every rival, every day.',
        });
        if (data.state) onFiled(data.state);
        else onFiled(null);
      }
    } catch (e) {
      setMsg({ kind: 'err', text: 'Network error while filing.' });
    }
    setBusy(false);
  }

  return (
    <>
      <section className="panel">
        <h2 className="panel__title">
          Strategy Builder
          <span className="eyebrow">no code</span>
        </h2>
        <p className="panel__hint">
          Rules run top to bottom each round from round 2 onward. The first rule
          that matches decides the move; if none match, the fallback fires.
        </p>

        <div className="row">
          <div className="field">
            <label htmlFor="callsign">Callsign</label>
            <input
              id="callsign"
              className="input input--mono"
              maxLength={20}
              placeholder="e.g. GREY_FOX"
              value={draft.author}
              onChange={(e) => patch({ author: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="sname">Strategy name</label>
            <input
              id="sname"
              className="input"
              maxLength={30}
              placeholder="e.g. Cautious Mirror"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label>First move (round 1)</label>
          <Seg value={draft.firstMove} onChange={(m) => patch({ firstMove: m })} />
        </div>

        <div className="field">
          <label>Start from a classic</label>
          <div className="chips">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className="chip"
                title={p.note}
                onClick={() => loadPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Rule stack</label>
          {draft.rules.length === 0 && (
            <p className="notice">No rules — the fallback move is used every round.</p>
          )}
          {draft.rules.map((rule, i) => (
            <RuleRow
              key={i}
              rule={rule}
              index={i}
              count={draft.rules.length}
              onChange={(r) => setRule(i, r)}
              onMove={moveRule}
              onRemove={removeRule}
            />
          ))}
          <button
            type="button"
            className="btn btn--sm"
            onClick={addRule}
            disabled={draft.rules.length >= MAX_RULES}
          >
            + Add rule{draft.rules.length >= MAX_RULES ? ' (max 12)' : ''}
          </button>
        </div>

        <div className="field">
          <label>Fallback — if no rule matches</label>
          <div className="default-line">
            Otherwise →
            <Seg value={draft.default} onChange={(m) => patch({ default: m })} />
          </div>
        </div>

        <div className="btn-row">
          <button className="btn" onClick={runSimulation} disabled={busy}>
            {busy ? 'Working…' : 'Run Simulation'}
          </button>
          <button className="btn btn--primary" onClick={fileToArena} disabled={busy}>
            File to the Arena
          </button>
        </div>
        {msg && <p className={msg.kind === 'err' ? 'err' : 'ok'}>{msg.text}</p>}
      </section>

      {result && <ResultPanel result={result} twist={state.twist} />}
    </>
  );
}
