// lib/state.js
// Assemble the full "today" payload used by both app/page.js (server render)
// and GET /api/state (client refresh).

import {
  computeTwist,
  computeStandings,
  buildRoster,
  todayStr,
  issueNumber,
  filedDate,
  LAUNCH_DATE,
} from './engine';
import { getAllStrategies, hasRedis } from './store';

export async function getState() {
  const dateStr = todayStr();
  const twist = computeTwist(dateStr);
  const all = await getAllStrategies();
  const strategies = all.filter((s) => s.createdAt <= dateStr);
  const roster = buildRoster(strategies);
  const standings = computeStandings(roster, twist, dateStr);

  return {
    dateStr,
    filedDate: filedDate(dateStr),
    issueNumber: issueNumber(dateStr, LAUNCH_DATE),
    twist,
    storage: hasRedis() ? 'redis' : 'memory',
    strategies,
    standings: standings.map((r) => ({
      id: r.id,
      rank: r.rank,
      name: r.name,
      house: r.house,
      author: r.author,
      rules: r.rules,
      firstMove: r.firstMove,
      default: r.default,
      blurb: r.blurb,
      createdAt: r.createdAt,
      avg: r.avg,
      wins: r.wins,
      ties: r.ties,
      losses: r.losses,
      opponents: r.opponents,
    })),
  };
}
