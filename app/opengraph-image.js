import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Daily Dilemma';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
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
        <div style={{ marginTop: 44, fontSize: 30, color: '#3ecf8e' }}>
          One Prisoner’s Dilemma a day. Read the strategy, out-score the field.
        </div>
      </div>
    ),
    size
  );
}
