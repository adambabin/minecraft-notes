import { useEffect, useRef, useState } from 'react';
import { createWorld, rememberWorld, rememberedWorldId, useAuthUser, useItems, useOnline, usePlaces, useSyncState, useWorlds } from './data';
import { signIn, signOut } from './firebase';
import { ItemsView } from './Items';
import { PlacesView } from './Places';
import { SettingsView } from './Settings';
import type { World } from './types';

type Tab = 'places' | 'items' | 'settings';

export function Root() {
  const user = useAuthUser();
  if (user === undefined) return <div className="center">Loading…</div>;
  if (user === null) return <SignIn />;
  return <Home key={user.uid} />;
}

function SignIn() {
  const [error, setError] = useState('');
  return (
    <div className="center">
      <h1>⛏️ Rebadam Coords</h1>
      <p>Shared coordinates, notes and links.</p>
      <button
        type="button"
        className="primary big"
        onClick={() => signIn().catch((e: Error) => setError(e.message))}
      >
        Sign in with Google
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function Home() {
  const worlds = useWorlds();
  const [worldId, setWorldId] = useState<string | null>(rememberedWorldId());
  const [tab, setTab] = useState<Tab>('places');
  const creating = useRef(false);

  // First run: make the Rebadam realm so there's somewhere to save.
  useEffect(() => {
    if (!worlds.loading && !worlds.error && worlds.data.length === 0 && !creating.current) {
      creating.current = true;
      setWorldId(createWorld('Rebadam'));
    }
  }, [worlds]);

  const sorted = [...worlds.data].sort((a, b) => a.createdAt - b.createdAt);
  const world = sorted.find((w) => w.id === worldId) ?? sorted[0];

  if (worlds.error === 'permission-denied') return <NotAllowed />;
  if (!world) return <div className="center">{worlds.error ? `Can't load: ${worlds.error}` : 'Loading…'}</div>;

  const switchWorld = (id: string) => {
    rememberWorld(id);
    setWorldId(id);
    setTab('places');
  };

  return <WorldScreen world={world} worlds={sorted} tab={tab} setTab={setTab} onSwitch={switchWorld} />;
}

function WorldScreen({
  world,
  worlds,
  tab,
  setTab,
  onSwitch,
}: {
  world: World;
  worlds: World[];
  tab: Tab;
  setTab: (t: Tab) => void;
  onSwitch: (id: string) => void;
}) {
  const places = usePlaces(world.id);
  const items = useItems(world.id);
  const openTodos = items.data.filter((i) => !i.deleted && i.kind === 'todo' && !i.done).length;

  return (
    <div className="app">
      <header>
        <button type="button" className="world" onClick={() => setTab('settings')}>
          ⛏️ {world.name}
          {worlds.length > 1 && <span className="caret">▾</span>}
        </button>
        <SyncBadge loading={places.loading} />
      </header>
      <main>
        {places.error && <p className="error">Couldn't load places: {places.error}</p>}
        {tab === 'places' && <PlacesView world={world} places={places.data} />}
        {tab === 'items' && <ItemsView world={world} items={items.data} />}
        {tab === 'settings' && <SettingsView world={world} worlds={worlds} places={places.data} items={items.data} onSwitch={onSwitch} />}
      </main>
      <nav>
        <button type="button" className={tab === 'places' ? 'on' : ''} onClick={() => setTab('places')}>
          <span>📍</span>Places
        </button>
        <button type="button" className={tab === 'items' ? 'on' : ''} onClick={() => setTab('items')}>
          <span>📝</span>Notes &amp; links{openTodos > 0 && <i className="badge">{openTodos}</i>}
        </button>
        <button type="button" className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>
          <span>⚙️</span>More
        </button>
      </nav>
      {/* Receives focus during a tap so iOS raises the keyboard (see primeKeyboard). */}
      <input id="focus-proxy" inputMode="numeric" aria-hidden="true" tabIndex={-1} />
    </div>
  );
}

function SyncBadge({ loading }: { loading: boolean }) {
  const { pending, error } = useSyncState();
  const online = useOnline();
  if (error) return <span className="sync err" title={error}>⚠ Save failed</span>;
  if (!online) return <span className="sync off">Offline · saved on phone{pending ? ` (${pending})` : ''}</span>;
  if (pending || loading) return <span className="sync busy">Syncing…</span>;
  return <span className="sync ok">✓ Synced</span>;
}

function NotAllowed() {
  return (
    <div className="center">
      <h1>🚫 Not on the list</h1>
      <p>This Google account isn't allowed in. Ask Adam to add your email to firestore.rules.</p>
      <button type="button" onClick={() => signOut()}>
        Use a different account
      </button>
    </div>
  );
}
