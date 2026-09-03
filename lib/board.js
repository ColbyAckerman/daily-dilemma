// Real-player leaderboard, backed by Vercel KV.
// Falls back to "empty / disabled" whenever KV isn't configured, so the app
// runs fine locally and before the store is connected.
import { createClient } from '@vercel/kv';
import { dailyPuzzle, simulate, NOISE_RATE } from './engine.js';

// Works with either the classic Vercel KV vars or the Upstash-branded ones
// that the current Vercel marketplace integration injects.
function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
let _kv = null;
function kv() {
  if (_kv) return _kv;
  const c = creds();
  _kv = c ? createClient(c) : null;
  return _kv;
}
export function boardEnabled() {
  return !!creds();
}

const KEY = (date) => `dd:board:${date}`;
const TTL_SECONDS = 60 * 60 * 24 * 45;
const MAX_ENTRIES = 500;

function cleanName(s) {
  return String(s || '')
    .replace(/[^\p{L}\p{N} _.\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}

// every real entry for a day, best score first
export async function boardEntries(date) {
  if (!boardEnabled()) return [];
  try {
    const raw = await kv().hgetall(KEY(date));
    if (!raw) return [];
    return Object.values(raw)
      .map((v) => (typeof v === 'string' ? safeParse(v) : v))
      .filter((e) => e && typeof e.score === 'number' && typeof e.name === 'string')
      .sort((a, b) => b.score - a.score || (a.at || 0) - (b.at || 0))
      .slice(0, MAX_ENTRIES);
  } catch (e) {
    return [];
  }
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

// Verify a submitted playthrough and record it under the device id (one row
// per device per day). The score is recomputed server-side from the intended
// moves — the client's number is never trusted.
export async function boardSubmit({ date, name, moves, device }) {
  if (!boardEnabled()) return { ok: false, error: 'disabled' };

  const nm = cleanName(name);
  if (nm.length < 1) return { ok: false, error: 'name' };
  if (typeof moves !== 'string' || !/^[CD]{1,40}$/.test(moves)) return { ok: false, error: 'moves' };
  if (typeof device !== 'string' || device.length < 8 || device.length > 80)
    return { ok: false, error: 'device' };

  let puzzle;
  try {
    puzzle = dailyPuzzle(date);
  } catch (e) {
    return { ok: false, error: 'date' };
  }
  if (moves.length !== puzzle.length) return { ok: false, error: 'length' };

  let score;
  try {
    score = simulate(puzzle.oppRef, moves, puzzle.seed, puzzle.dateStr, NOISE_RATE).me;
  } catch (e) {
    return { ok: false, error: 'sim' };
  }
  if (!Number.isFinite(score) || score < 0 || score > moves.length * 5) {
    return { ok: false, error: 'score' };
  }

  try {
    await kv().hset(KEY(date), {
      [device]: JSON.stringify({ name: nm, score, at: Date.now() }),
    });
    await kv().expire(KEY(date), TTL_SECONDS);
  } catch (e) {
    return { ok: false, error: 'store' };
  }
  return { ok: true, name: nm, score };
}
