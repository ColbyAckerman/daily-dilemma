import { validateStrategyInput } from '@/lib/validate';
import { saveStrategy } from '@/lib/store';
import { getState } from '@/lib/state';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ error: 'bad_json' }, { status: 400 });
  }

  const { ok, errors, value } = validateStrategyInput(body);
  if (!ok) {
    return Response.json({ error: 'invalid', errors }, { status: 400 });
  }

  try {
    const { id, updated } = await saveStrategy(value);
    const state = await getState();
    return Response.json({ ok: true, id, updated, state });
  } catch (err) {
    return Response.json({ error: 'save_failed', detail: String(err) }, { status: 500 });
  }
}
