import { getState } from '@/lib/state';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const state = await getState();
    return Response.json(state);
  } catch (err) {
    return Response.json({ error: 'state_failed', detail: String(err) }, { status: 500 });
  }
}
