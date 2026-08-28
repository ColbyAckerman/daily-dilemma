export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <h3>The payoff matrix</h3>
          <p className="prose">
            Each round both sides secretly pick Cooperate or Defect. Mutual
            cooperation pays 3 apiece. Mutual defection pays only 1. If one
            defects while the other cooperates, the defector takes 5 and the
            cooperator gets nothing. Your score is total points ÷ (rounds ×
            opponents) — the average you earn per round across the whole field.
          </p>
        </div>
        <div>
          <h3>How the daily conditions are set</h3>
          <p className="prose">
            The round count (120–200) and the noise level (0–12% chance any move
            is flipped in transmission) are drawn from a seed derived from
            today’s UTC date. Everyone sees the same conditions on the same
            calendar day, and the same pool of strategies can rank differently
            from one day to the next.
          </p>
        </div>
        <div>
          <h3>How the all-time board works</h3>
          <p className="prose">
            For each of the last 30 days we replay that day’s tournament using
            only the strategies that existed then, under that day’s conditions,
            and average each strategy’s daily result. Nothing is stored per day —
            it’s all re-derived from the strategy list and when each was filed.
          </p>
        </div>
      </div>
      <p className="notice" style={{ marginTop: 18 }}>
        🤝 Daily Dilemma · Iterated Prisoner’s Dilemma, Axelrod-tournament style ·
        no accounts, all state public.
      </p>
    </footer>
  );
}
