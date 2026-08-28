import { botMatch } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }
  const clientId = String(body.clientId || '').slice(0, 64);
  if (!clientId) return Response.json({ error: 'no_client' }, { status: 400 });
  try {
    const res = await botMatch(clientId, String(body.name || 'Anon'));
    return Response.json(res);
  } catch (err) {
    return Response.json({ error: 'botmatch_failed', detail: String(err) }, { status: 500 });
  }
}
