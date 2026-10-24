import { useEffect, useState } from 'react';
import {
  clearPendingJoin,
  createWorld,
  getInvite,
  joinWorld,
  pendingJoin,
  rememberWorld,
  rememberedWorldId,
  useAuthUser,
  useItems,
  useOnline,
  usePlaces,
  useSyncState,
  useWorlds,
} from './data';
import { signIn } from './firebase';
import { ItemsView } from './Items';
import { PlacesView } from './Places';
import { SettingsView } from './Settings';
import type { Invite, World } from './types';

type Tab = 'places' | 'items' | 'settings';

export function Root() {
  const user = useAuthUser();
  if (user === undefined) return <div className="center">Loading…</div>;
  if (user === null) return <SignIn />;
  return <Home key={user.uid} uid={user.uid} />;
}

function SignIn() {
  const [error, setError] = useState('');
  return (
    <div className="center">
      <h1>⛏️ Minecraft Coords</h1>
      <p>Save coordinates, notes and links, and share them with the people you play with.</p>
      {pendingJoin() && <p className="hint">Sign in to accept your invite.</p>}
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

function Home({ uid }: { uid: string }) {
  const worlds = useWorlds(uid);
  const [worldId, setWorldId] = useState<string | null>(rememberedWorldId());
  const [tab, setTab] = useState<Tab>('places');
  const [joinToken, setJoinToken] = useState(pendingJoin);

  const switchWorld = (id: string) => {
    rememberWorld(id);
    setWorldId(id);
    setTab('places');
  };

  if (worlds.loading) return <div className="center">Loading…</div>;
  if (worlds.error) return <div className="center error">Can't load your worlds: {worlds.error}</div>;

  if (joinToken) {
    return (
      <JoinScreen
        token={joinToken}
        worlds={worlds.data}
        onDone={(id) => {
          clearPendingJoin();
          setJoinToken(null);
          if (id) switchWorld(id);
        }}
      />
    );
  }

  const sorted = [...worlds.data].sort((a, b) => a.createdAt - b.createdAt);
  const world = sorted.find((w) => w.id === worldId) ?? sorted[0];
  if (!world) return <FirstWorld onCreate={(name) => switchWorld(createWorld(name))} />;

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

function FirstWorld({ onCreate }: { onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  return (
    <form
      className="center"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
      }}
    >
      <h1>⛏️ Name your world</h1>
      <p>Your world is private to you. Invite friends to it later from More → Members.</p>
      <input className="text narrow" placeholder="e.g. Survival realm" value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="primary big" disabled={!name.trim()}>
        Create world
      </button>
      <p className="hint">Got an invite link from a friend? Open it now instead.</p>
    </form>
  );
}

function JoinScreen({ token, worlds, onDone }: { token: string; worlds: World[]; onDone: (worldId: string | null) => void }) {
  const [invite, setInvite] = useState<Invite | null | undefined>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getInvite(token).then(setInvite, (e: Error) => setError(e.message));
  }, [token]);

  const already = invite && worlds.some((w) => w.id === invite.worldId);
  useEffect(() => {
    if (already) onDone(invite.worldId);
  }, [already, invite, onDone]);

  if (error) return <JoinMessage title="Couldn't open the invite" text={`Check your connection and try the link again. (${error})`} onDone={onDone} />;
  if (invite === undefined || already) return <div className="center">Opening invite…</div>;
  if (!invite || !invite.active)
    return <JoinMessage title="Invite link turned off" text="Ask whoever sent it for a new link." onDone={onDone} />;

  return (
    <div className="center">
      <h1>⛏️ Join “{invite.worldName}”?</h1>
      <p>
        {invite.createdBy.name} invited you. You'll be able to see and edit everything in this world.
      </p>
      <button
        type="button"
        className="primary big"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await joinWorld(invite);
            onDone(invite.worldId);
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? 'Joining…' : 'Join world'}
      </button>
      <button type="button" className="link-btn" onClick={() => onDone(null)}>
        Not now
      </button>
    </div>
  );
}

function JoinMessage({ title, text, onDone }: { title: string; text: string; onDone: (id: null) => void }) {
  return (
    <div className="center">
      <h1>{title}</h1>
      <p>{text}</p>
      <button type="button" onClick={() => onDone(null)}>
        Continue
      </button>
    </div>
  );
}
