'use client';

import { useCallback, useState } from 'react';
import Builder from './Builder';
import Leaderboard from './Leaderboard';

export default function Console({ initialState }) {
  const [state, setState] = useState(initialState);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/state', { cache: 'no-store' });
      if (r.ok) setState(await r.json());
    } catch (e) {}
  }, []);

  const onFiled = useCallback(
    (newState) => {
      if (newState) setState(newState);
      else refresh();
    },
    [refresh]
  );

  return (
    <div className="console">
      <div className="console__main">
        <Builder state={state} onFiled={onFiled} />
      </div>
      <aside className="console__rail">
        <Leaderboard state={state} onRefresh={refresh} />
      </aside>
    </div>
  );
}
