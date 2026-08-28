import ThemeToggle from './ThemeToggle';

export default function Masthead({ issueNumber, filedDate, storage }) {
  return (
    <header>
      <div className="masthead__topline">
        <span className="eyebrow">The Daily Dilemma · Field Report</span>
        <ThemeToggle />
      </div>

      <h1 className="masthead__title">Daily Dilemma</h1>

      <div className="masthead__topline">
        <p className="masthead__premise">
          Build a strategy. Test it against the classics. File it into a shared
          arena where it plays every rival ever submitted — under conditions that
          shift with the date.
        </p>
        <div className="masthead__meta">
          Issue No. {String(issueNumber).padStart(3, '0')}
          <br />
          Filed {filedDate} (UTC)
          <br />
          Datastore: {storage === 'redis' ? 'Upstash Redis' : 'in-memory (dev)'}
        </div>
      </div>

      <hr className="rule-double" />
    </header>
  );
}
