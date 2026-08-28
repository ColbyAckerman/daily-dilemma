'use client';

import { useEffect, useMemo, useState } from 'react';
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
  rules: [],
  default: 'C',
};

// Identity of a rule for de-duping stacked presets (ignores the _preset tag).
function sig(r) {
  return r.type + '|' + r.action + '|' + JSON.stringify(r.params || {});
}

export default function Builder({ state, onFiled }) {
  const [draft, setDraft] = useState(BLANK);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  // `hydrated` must be state (not a ref) so the persist effect below doesn't
  // fire — and clobber the restored draft with BLANK — on the same commit
  // the restore runs in.
  const [hydrated, setHydrated] = useState(false);

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
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      if (draft.author) localStorage.setItem(CALLSIGN_KEY, draft.author);
    } catch (e) {}
  }, [draft, hydrated]);

  // Which presets are currently stacked — derived from rule tags so it stays
  // in sync even after the user edits or deletes individual rows.
  const appliedPresets = useMemo(
    () => new Set(draft.rules.map((r) => r._preset).filter(Boolean)),
    [draft.rules]
  );

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
  function clearRules() {
    setDraft((d) => ({ ...d, rules: [] }));
    setResult(null);
  }

  function togglePreset(preset) {
    setResult(null);
    setMsg(null);
    setDraft((d) => {
      const isOn = d.rules.some((r) => r._preset === preset.key);
      if (isOn) {
        return { ...d, rules: d.rules.filter((r) => r._preset !== preset.key) };
      }
      const seen = new Set(d.rules.map(sig));
      const room = MAX_RULES - d.rules.length;
      const tagged = preset.def.rules
        .filter((r) => !seen.has(sig(r))) // skip rules already in the stack
        .slice(0, Math.max(0, room))
        .map((r) => ({
          type: r.type,
          params: { ...r.params },
          action: r.action,
          _preset: preset.key,
        }));
      const firstStack = d.rules.every((r) => !r._preset);
      return {
        ...d,
        rules: [...d.rules, ...tagged],
        firstMove: firstStack ? preset.def.firstMove : d.firstMove,
        default: firstStack ? preset.def.default : d.default,
      };
    });
  }

  const cleaned = useMemo(() => validateStrategyInput(draft).value, [draft]);

  function runSimulation() {
    setBusy(true);
    setMsg(null);
    setTimeout(() => {
      try {
        const res = simulateDraft(cleaned, state.strategies, state.twist, state.dateStr);
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
            ? 'Updated. Your strategy plays from today onward.'
            : 'Filed. It now plays every rival, every day.',
        });
        onFiled(data.state || null, {
          id: data.id,
          name: check.value.name,
          author: check.value.author,
        });
      }
    } catch (e) {
      setMsg({ kind: 'err', text: 'Network error while filing.' });
    }
    setBusy(false);
  }

  return (
    <>
      <div className="section">
        <div className="row">
          <div className="field">
            <label htmlFor="callsign">Callsign</label>
            <input
              id="callsign"
              className="input input--mono"
              maxLength={20}
              placeholder="GREY_FOX"
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
              placeholder="Cautious Mirror"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="section">
        <span className="label">Round 1 — open with</span>
        <Seg value={draft.firstMove} onChange={(m) => patch({ firstMove: m })} />
      </div>

      <div className="section">
        <span className="label">Stack the classics</span>
        <p className="hint">
          Click to add a classic’s rules to your stack. Click again to remove.
          Combine as many as you like.
        </p>
        <div className="chips">
          {PRESETS.map((p) => {
            const on = appliedPresets.has(p.key);
            return (
              <button
                key={p.key}
                type="button"
                className={on ? 'chip chip--on' : 'chip'}
                aria-pressed={on}
                title={p.note}
                onClick={() => togglePreset(p)}
              >
                {on ? '✓ ' : ''}
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="section">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <span className="label">Rules — checked top to bottom</span>
          {draft.rules.length > 0 && (
            <button
              type="button"
              className="linkbtn"
              onClick={clearRules}
            >
              Clear
            </button>
          )}
        </div>
        {draft.rules.length === 0 && (
          <p className="hint">
            No rules yet — stack a classic above, add your own, or just rely on
            the fallback.
          </p>
        )}
        {draft.rules.map((rule, i) => (
          <RuleRow
            key={i}
            rule={rule}
            index={i}
            count={draft.rules.length}
            badge={rule._preset}
            onChange={(r) => setRule(i, r)}
            onMove={moveRule}
            onRemove={removeRule}
          />
        ))}
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={addRule}
          disabled={draft.rules.length >= MAX_RULES}
        >
          + Add rule{draft.rules.length >= MAX_RULES ? ' (max 12)' : ''}
        </button>
      </div>

      <div className="section">
        <span className="label">Otherwise</span>
        <div className="default-line">
          Fall back to
          <Seg value={draft.default} onChange={(m) => patch({ default: m })} />
        </div>
      </div>

      <div className="btn-row">
        <button className="btn" onClick={runSimulation} disabled={busy}>
          {busy ? '…' : 'Test'}
        </button>
        <button className="btn btn--primary" onClick={fileToArena} disabled={busy}>
          File to arena
        </button>
      </div>
      {msg && <p className={msg.kind === 'err' ? 'err' : 'ok'}>{msg.text}</p>}

      {result && (
        <div className="section" style={{ marginTop: 26 }}>
          <ResultPanel result={result} twist={state.twist} />
        </div>
      )}
    </>
  );
}
