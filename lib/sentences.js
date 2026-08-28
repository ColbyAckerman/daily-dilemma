// lib/sentences.js
// Plain-English rendering of rule definitions. Shared by the Builder (live
// row labels) and the Leaderboard (expanded strategy transparency view).

export function moveWord(m) {
  return m === 'D' ? 'Defect' : 'Cooperate';
}

export function ruleSentence(rule) {
  if (!rule || !rule.type) return 'Unknown rule';
  const p = rule.params || {};
  switch (rule.type) {
    case 'opp_last':
      return `If opponent's last move was ${moveWord(p.move)}`;
    case 'my_last':
      return `If your last move was ${moveWord(p.move)}`;
    case 'opp_streak':
      return `If opponent has played ${moveWord(p.move)} for the last ${p.n} rounds in a row`;
    case 'opp_defect_gte':
      return `If opponent has defected ${p.n} or more times total`;
    case 'opp_coop_rate':
      return `If opponent's cooperation rate is at ${
        p.cmp === 'lte' ? 'most' : 'least'
      } ${p.pct}%`;
    case 'round_is': {
      const verb =
        p.cmp === 'eq'
          ? 'equals'
          : p.cmp === 'multiple'
          ? 'is a multiple of'
          : 'is at least';
      return `If this round's number ${verb} ${p.n}`;
    }
    case 'random_chance':
      return `With ${p.pct}% random chance`;
    default:
      return 'Unknown rule';
  }
}

export function actionSentence(action) {
  return action === 'D' ? 'Defect' : 'Cooperate';
}

// Full readable program for a filed strategy.
export function describeStrategy(s) {
  const lines = [];
  lines.push(`Round 1: ${moveWord(s.firstMove)}`);
  const rules = Array.isArray(s.rules) ? s.rules : [];
  rules.forEach((r) => {
    lines.push(`${ruleSentence(r)} → ${actionSentence(r.action)}`);
  });
  lines.push(`Otherwise → ${moveWord(s.default)}`);
  return lines;
}
