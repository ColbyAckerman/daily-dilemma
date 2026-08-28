# Daily Dilemma

A daily [Iterated Prisoner's Dilemma](https://en.wikipedia.org/wiki/Prisoner%27s_dilemma#The_iterated_prisoner's_dilemma)
strategy arena. Build a strategy with a no-code rule builder, test it against a
roster of 10 classic game-theory bots, then file it into a shared arena where it
plays every other strategy ever submitted — under that day's randomized
conditions. Daily leaderboard, all-time leaderboard, and a best-effort live 1v1
duel mode.

## Stack

- **Next.js 14** (App Router, plain JavaScript — no TypeScript)
- **Upstash Redis** (`@upstash/redis`, REST) as the only datastore
- Deployed on **Vercel**
- No auth — players pick a callsign; a random client id lives in `localStorage`

## Local development

```bash
npm install
npm run dev
# http://localhost:3000
```

Redis is **optional locally**: with no credentials the app uses an in-process
memory store (fine for a dev session, not persistent, not shared). To exercise
the real datastore locally, copy `.env.example` to `.env.local` and fill in a
pair of Upstash REST credentials.

```bash
npm run build && npm start   # production build
```

## Environment variables

`lib/redis.js` accepts either naming convention that Vercel's marketplace
integrations inject:

| Purpose | Primary name | Alternate name |
| --- | --- | --- |
| REST URL | `KV_REST_API_URL` | `UPSTASH_REDIS_REST_URL` |
| REST token | `KV_REST_API_TOKEN` | `UPSTASH_REDIS_REST_TOKEN` |

## Deploy (Vercel + Upstash)

1. Push this repo to GitHub.
2. In Vercel, **Add New… → Project** and import the repo (framework auto-detects
   as Next.js).
3. Open the project's **Storage** tab → **Create Database** → **Upstash Redis**
   (Marketplace). Connecting it auto-injects the `KV_REST_API_*` env vars.
4. **Redeploy** so the build picks up the new env vars.
5. Smoke test: load the site, file a strategy, confirm it shows on the **Today**
   board, check the twist numbers and payoff matrix render, and try a Live Duel
   solo (bot fallback after ~15s).

## How it works

- **Engine** (`lib/engine.js`) — pure, dependency-free, fully deterministic from
  a seed. No `Math.random()` / `Date.now()` in any scoring path, so every server
  request and every viewer computes identical standings for a given day.
- **Daily twist** — round count `[120…200]` and noise `[0/4/8/12%]` are derived
  from `hashStr('twist:' + YYYY-MM-DD)` where the date is computed **server-side
  in UTC**.
- **Round-robin** — 10 house bots + every strategy with `createdAt <= today`
  play every unique pair once; score is `totalPoints / (rounds × opponents)`.
- **All-time** — the last 30 days are replayed with the roster as it existed on
  each day; each strategy's daily averages are meaned. Result is cached in Redis
  for 15 minutes (`cache:alltime:<date>`).
- **Pool cap** — when the pool exceeds 300 filed strategies the oldest is
  dropped on the next write.

## API

| Route | Purpose |
| --- | --- |
| `GET /api/state` | today's twist + full standings + filed strategies |
| `POST /api/strategies` | validate + upsert a strategy, return fresh standings |
| `GET /api/leaderboard/alltime` | cached (or freshly computed) all-time board |
| `POST /api/live/queue` · `DELETE /api/live/queue` | join / leave the duel queue |
| `POST /api/live/bot-match` | start a solo match vs a bot |
| `GET /api/live/match/:id?clientId=` | poll match state |
| `POST /api/live/move` | submit a move (bot replies in the same call) |

## License

MIT
