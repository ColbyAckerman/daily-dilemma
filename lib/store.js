// lib/store.js
// High-level strategy persistence. Uses Upstash Redis when configured,
// otherwise an in-process memory store so local dev works without credentials
// (memory does NOT persist across serverless invocations — Redis is required
// for a real deployment).

import { getRedis, hasRedis } from './redis';
import { todayStr } from './engine';

const MAX_POOL = 300;

// ---- in-memory fallback -----------------------------------------------------
const mem = globalThis.__ddMem || (globalThis.__ddMem = {
  nextId: 0,
  ids: [], // submission order
  byId: new Map(), // id -> strategy object
  byKey: new Map(), // "author|name" -> id
  callsigns: new Map(), // UPPERCASE callsign -> owner uid
});

function keyOf(author, name) {
  return (author + '|' + name).toLowerCase();
}

function normalize(s) {
  if (!s) return null;
  return {
    id: String(s.id),
    name: s.name,
    author: s.author || 'Anonymous',
    firstMove: s.firstMove === 'D' ? 'D' : 'C',
    rules: Array.isArray(s.rules) ? s.rules : [],
    default: s.default === 'D' ? 'D' : 'C',
    createdAt: s.createdAt || todayStr(),
  };
}

// ---- callsign ownership -------------------------------------------------
// A callsign belongs to the first device (uid) that files under it.
export async function checkCallsign(callsign, uid) {
  const r = getRedis();
  const owner = r
    ? await r.hget('callsigns', callsign)
    : mem.callsigns.get(callsign) || null;
  return {
    owner: owner || null,
    ownedByYou: !!owner && owner === uid,
    available: !owner || owner === uid,
  };
}

// Atomically claim the callsign if it is free. Returns true if `uid` owns it
// afterwards (either just claimed, or already owned).
export async function claimCallsign(callsign, uid) {
  const r = getRedis();
  if (!r) {
    const owner = mem.callsigns.get(callsign);
    if (owner && owner !== uid) return false;
    mem.callsigns.set(callsign, uid);
    return true;
  }
  const set = await r.hsetnx('callsigns', callsign, uid);
  if (set === 1) return true;
  const owner = await r.hget('callsigns', callsign);
  return owner === uid;
}

// ---- reads ----------------------------------------------------------------
export async function getAllStrategies() {
  const r = getRedis();
  if (!r) {
    return mem.ids.map((id) => normalize(mem.byId.get(id))).filter(Boolean);
  }
  const ids = await r.lrange('strategies:ids', 0, -1);
  if (!ids || ids.length === 0) return [];
  const pipe = r.pipeline();
  ids.forEach((id) => pipe.get('strategy:' + id));
  const rows = await pipe.exec();
  return rows.map(normalize).filter(Boolean);
}

export async function getStrategy(id) {
  const r = getRedis();
  if (!r) return normalize(mem.byId.get(String(id)));
  return normalize(await r.get('strategy:' + id));
}

// ---- write (upsert) -----------------------------------------------------
// input: { author, name, firstMove, rules, default } (already validated)
export async function saveStrategy(input) {
  const now = todayStr();
  const r = getRedis();
  const key = keyOf(input.author, input.name);

  if (!r) {
    const existing = mem.byKey.get(key);
    if (existing) {
      const prev = mem.byId.get(existing);
      mem.byId.set(existing, {
        ...input,
        id: existing,
        createdAt: (prev && prev.createdAt) || now,
      });
      return { id: existing, updated: true };
    }
    const id = String(++mem.nextId);
    mem.byId.set(id, { ...input, id, createdAt: now });
    mem.byKey.set(key, id);
    mem.ids.push(id);
    while (mem.ids.length > MAX_POOL) {
      const old = mem.ids.shift();
      const o = mem.byId.get(old);
      mem.byId.delete(old);
      if (o) mem.byKey.delete(keyOf(o.author, o.name));
    }
    return { id, updated: false };
  }

  const existingId = await r.hget('strategies:bykey', key);
  if (existingId) {
    const id = String(existingId);
    const prev = await r.get('strategy:' + id);
    const createdAt = (prev && prev.createdAt) || now;
    await r.set('strategy:' + id, { ...input, id, createdAt });
    return { id, updated: true };
  }

  const id = String(await r.incr('strategies:nextId'));
  await r.set('strategy:' + id, { ...input, id, createdAt: now });
  await r.rpush('strategies:ids', id);
  await r.hset('strategies:bykey', { [key]: id });

  const len = await r.llen('strategies:ids');
  if (len > MAX_POOL) {
    const oldest = await r.lpop('strategies:ids');
    if (oldest) {
      const old = await r.get('strategy:' + oldest);
      await r.del('strategy:' + oldest);
      if (old) await r.hdel('strategies:bykey', keyOf(old.author, old.name));
    }
  }
  return { id, updated: false };
}

// ---- all-time cache -----------------------------------------------------
export async function getAllTimeCache(dateStr) {
  const r = getRedis();
  if (!r) return null;
  return (await r.get('cache:alltime:' + dateStr)) || null;
}

export async function setAllTimeCache(dateStr, payload) {
  const r = getRedis();
  if (!r) return;
  await r.set('cache:alltime:' + dateStr, payload, { ex: 900 });
}

export { hasRedis };
