'use client';

// Two-state Cooperate / Defect segmented control.
export default function Seg({ value, onChange, labelC = 'Cooperate', labelD = 'Defect', size }) {
  return (
    <span className="seg" role="group">
      <button
        type="button"
        data-move="C"
        aria-pressed={value === 'C'}
        onClick={() => onChange('C')}
        style={size === 'sm' ? { padding: '5px 10px' } : undefined}
      >
        {labelC}
      </button>
      <button
        type="button"
        data-move="D"
        aria-pressed={value === 'D'}
        onClick={() => onChange('D')}
        style={size === 'sm' ? { padding: '5px 10px' } : undefined}
      >
        {labelD}
      </button>
    </span>
  );
}
