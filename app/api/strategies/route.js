import { validateStrategyInput } from '@/lib/validate';
import { saveStrategy, claimCallsign } from '@/lib/store';
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

  const uid = String(body.uid || '').slice(0, 64);
  if (!uid) {
    return Response.json({ error: 'no_uid' }, { status: 400 });
  }

  const { ok, errors, value } = validateStrategyInput(body);
  if (!ok) {
    return Response.json({ error: 'invalid', errors }, { status: 400 });
  }

  try {
    const claimed = await claimCallsign(value.author, uid);
    if (!claimed) {
      return Response.json(
        {
          error: 'callsign_taken',
          callsign: value.author,
          errors: [`Callsign ${value.author} is already claimed by someone else.`],
        },
        { status: 409 }
      );
    }

    const { id, updated } = await saveStrategy(value);
    const state = await getState();
    return Response.json({ ok: true, id, updated, callsign: value.author, state });
  } catch (err) {
    return Response.json({ error: 'save_failed', detail: String(err) }, { status: 500 });
  }
}
