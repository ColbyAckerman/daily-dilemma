import { NextResponse } from 'next/server';
import { boardEnabled, boardEntries, boardSubmit } from '@/lib/board';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  const date = new URL(req.url).searchParams.get('date') || '';
  const enabled = boardEnabled();
  if (!enabled || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ enabled, entries: [] });
  }
  const entries = await boardEntries(date);
  return NextResponse.json({
    enabled,
    entries: entries.map((e) => ({ name: e.name, score: e.score })),
  });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'body' }, { status: 400 });
  }
  const res = await boardSubmit(body || {});
  return NextResponse.json(res, { status: res.ok ? 200 : 400 });
}
