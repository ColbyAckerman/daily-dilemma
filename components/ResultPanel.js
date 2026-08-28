'use client';

function Pill({ m }) {
  return <span className={`pill pill--${m}`}>{m}</span>;
}

export default function ResultPanel({ result, twist }) {
  const { rank, fieldSize, avg, wins, ties, losses, perOpponent, transcript } = result;

  return (
    <div className="result">
      <div className="result__stats">
        <div>
          <div className="n">
            {rank}
            <span style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
              /{fieldSize}
            </span>
          </div>
          <div className="k">Rank</div>
        </div>
        <div>
          <div className="n">{avg.toFixed(2)}</div>
          <div className="k">Avg / round</div>
        </div>
        <div>
          <div className="n mono" style={{ fontSize: '1.5rem' }}>
            {wins}-{ties}-{losses}
          </div>
          <div className="k">W–T–L</div>
        </div>
      </div>

      {transcript && (
        <div style={{ marginTop: 16 }}>
          <span className="label">
            vs #{transcript.oppRank} {transcript.oppName} · {transcript.myScore}–
            {transcript.oppScore} · {transcript.roundsCount} rounds
          </span>
          <div className="transcript">
            {transcript.rounds.map((r, i) => (
              <span className="pair" key={i} title={`Round ${i + 1}`}>
                <Pill m={r.me} />
                <Pill m={r.opp} />
              </span>
            ))}
          </div>
          <p className="notice" style={{ marginTop: 6, textAlign: 'left' }}>
            top = you · bottom = them
          </p>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <span className="label">Every opponent</span>
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          <table className="list">
            <thead>
              <tr>
                <th>Opponent</th>
                <th className="num">You</th>
                <th className="num">Them</th>
                <th className="num">R</th>
              </tr>
            </thead>
            <tbody>
              {perOpponent.map((o, i) => (
                <tr key={i}>
                  <td>
                    {o.oppName}{' '}
                    {o.oppHouse ? <span className="tag">bot</span> : null}
                  </td>
                  <td className="num">{o.myScore}</td>
                  <td className="num">{o.oppScore}</td>
                  <td className="num">{o.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
