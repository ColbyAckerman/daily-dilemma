# Daily Dilemma

One [Prisoner's Dilemma](https://en.wikipedia.org/wiki/Prisoner%27s_dilemma#The_iterated_prisoner's_dilemma)
puzzle a day. A hidden opponent plays a fixed strategy; you choose **Cooperate**
or **Defect** each round, trying to read what it's doing and beat par before the
match ends at a round you can't predict. Same puzzle for everyone, Wordle-style.

Live: **https://daily-dilemma-nine.vercel.app**

## The game

- **One opponent a day**, drawn deterministically from the UTC date so everyone
  faces the same one. It's **hidden** until the game ends.
- Each round pays out on the standard matrix: `CC 3,3 · DD 1,1 · CD 0,5 · DC 5,0`.
- The match runs an **unknown number of rounds** (~12–20, geometric random
  ending) — there's no safe last-round betrayal.
- **Par** is what plain Tit-for-Tat scores against today's opponent. The result
  screen also shows what always-cooperate and always-defect would have scored.
- After the reveal you learn the opponent's name, exactly what it did, and
  whether it was **nice** (never defects first) or **nasty** — Axelrod's
  tournaments found nice strategies win the long game.
- **Beat-par streak** and a small stats card. **Wordle-style share string.**
- No accounts, no backend. Everything is in `localStorage` on your device.

## The opponent roster (`lib/opponents.js`)

Two tiers, ~300 opponents total, so the daily opponent hasn't been seen in at
least 30 days:

- **`NAMED`** — 40 hand-built strategies, most straight from Axelrod's 1980/1984
  tournaments (Tit for Tat, Grim/Friedman, Tester, Tranquilizer, Downing,
  Feld, Graaskamp, Grofman, Joss…), plus Gradual (Beaufils 1996) and the
  Zero-Determinant "Extortion" strategy (Press & Dyson 2012).
- **`GENERATED`** — a large space assembled from ~10 parametrised archetypes
  (reciprocators, grudgers, cyclers, majority-voters, turncoats, probers,
  scorekeepers, sneaks, Pavlov variants, pattern-readers). Each draw produces a
  concrete opponent with a generated name and a plain-English description of
  exactly how it behaved.

Every opponent's `nice`/`nasty` tag is **computed**, not asserted — by playing
it against a pure cooperator and checking whether it ever defects first.

## Engine (`lib/engine.js`)

Pure, deterministic, no framework deps. No `Math.random()` / `Date.now()` in any
scoring path — the whole puzzle (opponent, length, par, benchmarks) is a pure
function of the date string.

| Export | Purpose |
| --- | --- |
| `dailyPuzzle(dateStr?)` | today's spec: opponent ref, length, par, all-C / all-D benchmarks |
| `simulate(oppRef, playerMoves, seedStr)` | replay a full game from a move list |
| `revealOpponent(oppRef)` | name / blurb / nice flag / historical origin (post-game only) |

## Local development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
```

No environment variables. No database.

## History

The earlier version — a no-code strategy builder feeding a shared, cumulative
arena with daily and all-time leaderboards, a trend chart, and a live-duel mode
— lives on the **`strategy-arena`** branch. The engine here is a slimmed
descendant of that one; the plan is to bring a real strategy builder back as an
expert mode on top of the daily game.

## License

MIT
