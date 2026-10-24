import { useEffect, useState } from 'react';
import { isConfigured } from './firebaseConfig';
import { Overlays } from './ui';

export function App() {
  if (!isConfigured) return <SetupNeeded />;
  return (
    <Overlays>
      <Signed />
    </Overlays>
  );
}

function SetupNeeded() {
  return (
    <div className="center">
      <h1>⛏️ Almost there</h1>
      <p>Firebase isn't connected yet. Fill in src/firebaseConfig.ts (see the README) and deploy again.</p>
    </div>
  );
}

// Firebase is only started once there's a config for it.
function Signed() {
  const [mod, setMod] = useState<typeof import('./Root') | null>(null);
  useEffect(() => {
    import('./Root').then(setMod);
  }, []);
  if (!mod) return <div className="center">Loading…</div>;
  return <mod.Root />;
}
