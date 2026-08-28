// lib/presets.js
// Starter templates for the no-code builder. Every classic below is expressed
// purely with the shipped rule types, proving the builder can reproduce them.

export const PRESETS = [
  {
    key: 'tit-for-tat',
    label: 'Tit for Tat',
    note: 'Copy the opponent’s last move.',
    def: {
      firstMove: 'C',
      rules: [{ type: 'opp_last', params: { move: 'D' }, action: 'D' }],
      default: 'C',
    },
  },
  {
    key: 'grim-trigger',
    label: 'Grim Trigger',
    note: 'One betrayal and it’s war forever.',
    def: {
      firstMove: 'C',
      rules: [{ type: 'opp_defect_gte', params: { n: 1 }, action: 'D' }],
      default: 'C',
    },
  },
  {
    key: 'always-cooperate',
    label: 'Always Cooperate',
    note: 'Unconditional trust.',
    def: { firstMove: 'C', rules: [], default: 'C' },
  },
  {
    key: 'always-defect',
    label: 'Always Defect',
    note: 'Unconditional betrayal.',
    def: { firstMove: 'D', rules: [], default: 'D' },
  },
  {
    key: 'tit-for-two-tats',
    label: 'Tit for Two Tats',
    note: 'Only retaliate after two defections in a row.',
    def: {
      firstMove: 'C',
      rules: [{ type: 'opp_streak', params: { move: 'D', n: 2 }, action: 'D' }],
      default: 'C',
    },
  },
  {
    key: 'suspicious-tit-for-tat',
    label: 'Suspicious Tit for Tat',
    note: 'Open cold, then mirror.',
    def: {
      firstMove: 'D',
      rules: [{ type: 'opp_last', params: { move: 'D' }, action: 'D' }],
      default: 'C',
    },
  },
  {
    key: 'generous-tit-for-tat',
    label: 'Generous Tit for Tat',
    note: 'Mirror, but forgive 10% of defections.',
    def: {
      firstMove: 'C',
      rules: [
        { type: 'random_chance', params: { pct: 10 }, action: 'C' },
        { type: 'opp_last', params: { move: 'D' }, action: 'D' },
      ],
      default: 'C',
    },
  },
  {
    key: 'joss',
    label: 'Joss',
    note: 'Mirror, but sneak in a sly defection 10% of the time.',
    def: {
      firstMove: 'C',
      rules: [
        { type: 'opp_last', params: { move: 'D' }, action: 'D' },
        { type: 'random_chance', params: { pct: 10 }, action: 'D' },
      ],
      default: 'C',
    },
  },
];

export function presetByKey(key) {
  return PRESETS.find((p) => p.key === key) || null;
}
