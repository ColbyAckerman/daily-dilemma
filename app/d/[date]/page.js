import Landing from '@/components/Landing';

export const dynamic = 'force-dynamic';

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

export function generateMetadata({ params, searchParams }) {
  const issue = issueFromDate(params.date);
  const raw = searchParams?.b;
  const p = raw != null && raw !== '' ? Math.min(99, Math.max(1, parseInt(raw, 10) || 0)) : null;
  const desc =
    p != null
      ? `Someone hit the ${ordinal(p)} percentile on DD#${issue}. Can you do better?`
      : 'One Prisoner’s Dilemma a day. Read the hidden strategy, out-score the field.';
  return {
    title: `DD#${issue}`,
    description: desc,
    openGraph: { title: `DD#${issue}`, description: desc },
  };
}

export default function Page({ params, searchParams }) {
  return <Landing date={params.date} beat={searchParams?.b} />;
}
