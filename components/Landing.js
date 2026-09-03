'use client';

function issueFromDate(date) {
  const a = Date.parse('2026-08-29T00:00:00Z');
  const b = Date.parse(String(date) + 'T00:00:00Z');
  return Number.isFinite(b) ? Math.max(1, Math.floor((b - a) / 86400000) + 1) : 1;
}
function ordinal(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
}

export default function Landing({ date, beat }) {
  const issue = issueFromDate(date);
  const n = beat != null && beat !== '' ? Math.min(99, Math.max(1, parseInt(beat, 10) || 0)) : null;

  return (
    <main className="page page--center">
      <section className="landing">
        <h1 className="landing__title">Daily Dilemma</h1>
        <p className="landing__no">No. {issue}</p>

        {n != null && (
          <p className="landing__brag">
            Someone hit the <b>{ordinal(n)}</b> percentile today.
            <br />
            Your turn.
          </p>
        )}

        <p className="landing__blurb">
          One Prisoner&rsquo;s Dilemma a day. Read the hidden strategy, choose{' '}
          <b className="c">cooperate</b> or <b className="d">defect</b> each round, and see which
          percentile you land in.
        </p>

        <a className="btn btn--accent" href="/">
          Play today&rsquo;s
        </a>
      </section>
    </main>
  );
}
