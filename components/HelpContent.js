export default function HelpContent() {
  return (
    <div className="prose">
      <p>
        Every round, you and an opponent each secretly pick{' '}
        <strong>Cooperate</strong> or <strong>Defect</strong>. Points per round:
      </p>
      <table className="payoff">
        <thead>
          <tr>
            <th></th>
            <th>They C</th>
            <th>They D</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>You C</th>
            <td className="cc">3, 3</td>
            <td>0, 5</td>
          </tr>
          <tr>
            <th>You D</th>
            <td>5, 0</td>
            <td className="dd">1, 1</td>
          </tr>
        </tbody>
      </table>
      <p>
        You <strong>build a strategy</strong> — a first move, an ordered list of
        “if … then Cooperate/Defect” rules, and a fallback. Rules are checked top
        to bottom each round from round 2 on; the first match wins.
      </p>
      <p>
        <strong>File it to the arena</strong> and it plays a full round-robin
        against 10 classic bots and every other strategy ever filed — forever,
        every day.
      </p>
      <p>
        <strong>Conditions change daily.</strong> The day’s expected match
        length (≈160–240 rounds, averaging 200) and the noise level (0–12%
        chance any move flips in transmission) are drawn from today’s date, in
        UTC, so everyone gets the same puzzle.
      </p>
      <p>
        <strong>Matches end at a random round.</strong> Each pairing keeps going
        with a fixed probability after every round — like Axelrod’s tournament —
        so no strategy ever knows it’s the final round and can’t defect for free
        at the end.
      </p>
      <p>
        <strong>All-Time</strong> replays the last 30 days with the roster as it
        stood on each day and averages the results. <strong>Live Duel</strong> is
        an experimental poll-based 1v1 — if nobody joins in ~15s you play a bot.
      </p>
      <p style={{ marginBottom: 0 }}>
        No accounts. Pick a callsign; everything is public.
      </p>
    </div>
  );
}
