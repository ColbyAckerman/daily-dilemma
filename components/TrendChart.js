'use client';

const COLORS = [
  'var(--c1)',
  'var(--c2)',
  'var(--c3)',
  'var(--c4)',
  'var(--c5)',
  'var(--c6)',
];

function fmtDay(d) {
  // "2026-08-28" -> "8/28"
  const [, m, day] = d.split('-');
  return `${Number(m)}/${Number(day)}`;
}

export default function TrendChart({ series = [], window = [] }) {
  const usable = series.filter((s) => s.points && s.points.length >= 2);

  if (window.length < 2 || usable.length === 0) {
    return (
      <p className="hint" style={{ marginTop: 4 }}>
        Not enough history yet — the trend fills in over the coming days.
      </p>
    );
  }

  const W = 640;
  const H = 200;
  const padL = 34;
  const padR = 58;
  const padT = 12;
  const padB = 22;

  const xIndex = new Map(window.map((d, i) => [d, i]));
  const xOf = (d) =>
    padL + (xIndex.get(d) / Math.max(1, window.length - 1)) * (W - padL - padR);

  let lo = Infinity;
  let hi = -Infinity;
  for (const s of usable)
    for (const p of s.points) {
      if (p.avg < lo) lo = p.avg;
      if (p.avg > hi) hi = p.avg;
    }
  const span = hi - lo || 1;
  lo -= span * 0.12;
  hi += span * 0.12;
  const yOf = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);

  const gridVals = [lo + (hi - lo) * 0.15, (lo + hi) / 2, hi - (hi - lo) * 0.15];
  const xTicks = [
    window[0],
    window[Math.floor((window.length - 1) / 2)],
    window[window.length - 1],
  ];

  return (
    <div className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} className="trend__svg" role="img" aria-label="Points leaders over time">
        {gridVals.map((v, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yOf(v)}
              y2={yOf(v)}
              className="trend__grid"
            />
            <text x={4} y={yOf(v) + 3} className="trend__ylab">
              {v.toFixed(2)}
            </text>
          </g>
        ))}
        {xTicks.map((d, i) => (
          <text
            key={i}
            x={xOf(d)}
            y={H - 6}
            className="trend__xlab"
            textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
          >
            {fmtDay(d)}
          </text>
        ))}

        {usable.map((s, i) => {
          const d = s.points
            .map((p, k) => `${k === 0 ? 'M' : 'L'}${xOf(p.day).toFixed(1)},${yOf(p.avg).toFixed(1)}`)
            .join(' ');
          const last = s.points[s.points.length - 1];
          return (
            <g key={s.id}>
              <path
                d={d}
                fill="none"
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={i === 0 ? 2.5 : 1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx={xOf(last.day)}
                cy={yOf(last.avg)}
                r={i === 0 ? 3.5 : 2.5}
                fill={COLORS[i % COLORS.length]}
              />
            </g>
          );
        })}
      </svg>

      <ul className="trend__legend">
        {usable.map((s, i) => (
          <li key={s.id}>
            <span
              className="trend__swatch"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
