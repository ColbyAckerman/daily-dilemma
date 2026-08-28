'use client';

function Pill({ m }) {
  return <span className={`pill pill--${m}`}>{m}</span>;
}

export default function ResultPanel({ result, twist }) {
  const { rank, fieldSize, avg, wins, ties, losses, perOpponent, transcript } = result;

  return (
    <section className="panel">
      <h2 className="panel__title">
        Simulation Result
        <span className="eyebrow">not yet filed</span>
      </h2>

      <div className="result-head">
        <div className="stat">
          <span className="eyebrow">Rank in field</span>
          <div className="bignum">
            {rank}
            <small> / {fieldSize}</small>
          </div>
        </div>
        <div className="stat">
          <span className="eyebrow">Avg score / round</span>
          <div className="bignum">
            {avg.toFixed(3)}
          </div>
        </div>
        <div className="stat">
          <span className="eyebrow">Pairings (W–T–L)</span>
          <div className="bignum mono" style={{ fontSize: '1.7rem' }}>
            {wins}–{ties}–{losses}
          </div>
        </div>
      </div>

      {transcript && (
        <div className="field">
          <label>
            Transcript vs #{transcript.oppRank} {transcript.oppName}
            {'  '}({transcript.myScore} – {transcript.oppScore} over {twist.rounds} rounds)
          </label>
          <div className="transcript" aria-label="Round by round moves">
            {transcript.rounds.map((r, i) => (
              <span className="pair" key={i} title={`Round ${i + 1}`}>
                <Pill m={r.me} />
                <Pill m={r.opp} />
              </span>
            ))}
          </div>
          <p className="notice">Top row: your move · bottom row: their move.</p>
        </div>
      )}

      <div className="field">
        <label>Per-opponent breakdown</label>
        <div className="ledger-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
          <table className="ledger">
            <thead>
              <tr>
                <th>Opponent</th>
                <th></th>
                <th className="num">You</th>
                <th className="num">Them</th>
                <th className="num">Your avg</th>
                <th className="num">Result</th>
              </tr>
            </thead>
            <tbody>
              {perOpponent.map((o, i) => (
                <tr key={i}>
                  <td>{o.oppName}</td>
                  <td>
                    <span className="tag">{o.oppHouse ? 'House Bot' : 'Filed'}</span>
                  </td>
                  <td className="num">{o.myScore}</td>
                  <td className="num">{o.oppScore}</td>
                  <td className="num">{o.myAvg.toFixed(2)}</td>
                  <td className="num">{o.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
