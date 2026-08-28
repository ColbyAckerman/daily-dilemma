export default function TwistPanel({ twist }) {
  return (
    <section className="twist" aria-label="Today's field conditions">
      <div className="twist__block">
        <span className="eyebrow">Rounds per match</span>
        <div className="twist__value mono">{twist.rounds}</div>
        <div className="twist__sub">every pair plays this many</div>
      </div>

      <div className="twist__block">
        <span className="eyebrow">Signal noise</span>
        <div className="twist__value">{twist.noiseLabel}</div>
        <div className="twist__sub mono">
          {twist.noisePct}% chance each move flips
        </div>
      </div>

      <div className="twist__block twist__payoff-wrap">
        <span className="eyebrow">Payoff (you, them)</span>
        <table className="payoff" aria-label="Payoff matrix">
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
              <td className="cell-cc">3, 3</td>
              <td>0, 5</td>
            </tr>
            <tr>
              <th>You D</th>
              <td>5, 0</td>
              <td className="cell-dd">1, 1</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
