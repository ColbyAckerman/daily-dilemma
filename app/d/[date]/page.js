import Landing from '@/components/Landing';

export const dynamic = 'force-dynamic';

function issueFromDate(date) {
  const a = Date.parse('2026-08-29T00:00:00Z');
  const b = Date.parse(String(date) + 'T00:00:00Z');
  return Number.isFinite(b) ? Math.max(1, Math.floor((b - a) / 86400000) + 1) : 1;
}

export function generateMetadata({ params, searchParams }) {
  const issue = issueFromDate(params.date);
  const b = searchParams?.b;
  const desc =
    b != null && b !== ''
      ? `Someone beat ${b} of 100 on Daily Dilemma No. ${issue}. Can you do better?`
      : 'One Prisoner’s Dilemma a day. Read the hidden strategy, out-score the field.';
  return {
    title: `Daily Dilemma No. ${issue}`,
    description: desc,
    openGraph: { title: `Daily Dilemma No. ${issue}`, description: desc },
  };
}

export default function Page({ params, searchParams }) {
  return <Landing date={params.date} beat={searchParams?.b} />;
}
