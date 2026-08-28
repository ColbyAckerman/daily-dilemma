import { submitMove } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }
  const { matchId, clientId, round, move } = body || {};
  if (!matchId || !clientId) {
    return Response.json({ error: 'missing_fields' }, { status: 400 });
  }
  try {
    const res = await submitMove(
      String(matchId),
      String(clientId),
      round,
      move
    );
    if (res.error) return Response.json(res, { status: 409 });
    return Response.json(res);
  } catch (err) {
    return Response.json({ error: 'move_failed', detail: String(err) }, { status: 500 });
  }
}
