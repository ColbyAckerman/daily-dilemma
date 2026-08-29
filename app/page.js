import DailyGame from '@/components/DailyGame';
import { dailyPuzzle } from '@/lib/engine';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  // Computed server-side so "today" is UTC, identical for every player.
  const puzzle = dailyPuzzle();
  return <DailyGame puzzle={puzzle} />;
}
