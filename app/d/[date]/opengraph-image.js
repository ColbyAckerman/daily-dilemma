import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Daily Dilemma';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function issueFromDate(date) {
  const a = Date.parse('2026-08-29T00:00:00Z');
  const b = Date.parse(String(date) + 'T00:00:00Z');
  return Number.isFinite(b) ? Math.max(1, Math.floor((b - a) / 86400000) + 1) : 1;
}

export default function Image({ params }) {
  const issue = issueFromDate(params.date);
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0b',
          color: '#f1f1f2',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: 14 }}>DAILY DILEMMA</div>
        <div style={{ marginTop: 18, fontSize: 34, color: '#9c9ca4', letterSpacing: 4 }}>
          {`NO. ${issue}`}
        </div>
        <div style={{ marginTop: 44, fontSize: 30, color: '#3ecf8e' }}>
          Read the strategy. Out-score the field.
        </div>
      </div>
    ),
    size
  );
}
