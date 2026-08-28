import { getMatch } from '@/lib/live';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request, { params }) {
  const { id } = params;
  const clientId = new URL(request.url).searchParams.get('clientId') || '';
  try {
    const match = await getMatch(id, clientId);
    if (!match) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json(match);
  } catch (err) {
    return Response.json({ error: 'match_failed', detail: String(err) }, { status: 500 });
  }
}
