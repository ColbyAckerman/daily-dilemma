// lib/redis.js
// Single Upstash Redis client. Env var names cover both the Vercel "Upstash"
// marketplace integration and the older "Vercel KV" naming.
import { Redis } from '@upstash/redis';

const url =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.REDIS_REST_API_URL ||
  '';

const token =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN ||
  process.env.REDIS_REST_API_TOKEN ||
  '';

let client = null;

export function hasRedis() {
  return Boolean(url && token);
}

export function getRedis() {
  if (client) return client;
  if (!hasRedis()) return null;
  client = new Redis({ url, token });
  return client;
}
