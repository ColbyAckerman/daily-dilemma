import { computeAllTime, todayStr, LAUNCH_DATE } from '@/lib/engine';
import { getAllStrategies, getAllTimeCache, setAllTimeCache } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const dateStr = todayStr();
  try {
    const cached = await getAllTimeCache(dateStr);
    if (cached) return Response.json({ ...cached, cached: true });

    const strategies = await getAllStrategies();
    const result = computeAllTime(strategies, dateStr, LAUNCH_DATE);
    const payload = { dateStr, days: result.days, rows: result.rows };
    await setAllTimeCache(dateStr, payload);
    return Response.json({ ...payload, cached: false });
  } catch (err) {
    return Response.json({ error: 'alltime_failed', detail: String(err) }, { status: 500 });
  }
}
