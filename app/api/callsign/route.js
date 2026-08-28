import { normalizeCallsign, callsignError } from '@/lib/validate';
import { checkCallsign } from '@/lib/store';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('name') || '';
  const uid = String(url.searchParams.get('uid') || '').slice(0, 64);

  const callsign = normalizeCallsign(raw);
  const formatError = callsignError(callsign);
  if (formatError) {
    return Response.json({ callsign, valid: false, available: false, error: formatError });
  }

  try {
    const { available, ownedByYou } = await checkCallsign(callsign, uid);
    return Response.json({ callsign, valid: true, available, ownedByYou });
  } catch (err) {
    return Response.json(
      { callsign, valid: true, available: true, ownedByYou: false, degraded: true },
      { status: 200 }
    );
  }
}
