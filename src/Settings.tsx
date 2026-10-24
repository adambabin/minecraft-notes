import { useState } from 'react';
import {
  addItem,
  addPlace,
  createInvite,
  createWorld,
  download,
  exportAll,
  importAll,
  inviteUrl,
  me,
  purge,
  removeMember,
  restore,
  slug,
  turnOffInvite,
  updateWorld,
  useInvites,
  type ExportFile,
} from './data';
import { signOut, auth } from './firebase';
import { parseNote } from './importNote';
import { SEED_NOTE } from './seedNote';
import { DIMENSIONS, type Category, type Item, type Place, type Status, type World } from './types';
import { copyText, timeAgo, useToast } from './ui';

const newId = (label: string) => `${slug(label)}-${Math.random().toString(36).slice(2, 6)}`;

export function SettingsView({
  world,
  worlds,
  places,
  items,
  onSwitch,
}: {
  world: World;
  worlds: World[];
  places: Place[];
  items: Item[];
  onSwitch: (id: string) => void;
}) {
  return (
    <div className="settings">
      <WorldsSection world={world} worlds={worlds} onSwitch={onSwitch} />
      <MembersSection world={world} worlds={worlds} onSwitch={onSwitch} />
      <ListEditor
        title="Statuses"
        hint="Tap a place's status chip to change it."
        entries={world.statuses}
        inUse={(id) => places.some((p) => !p.deleted && p.statusId === id)}
        render={(s, set) => (
          <input type="color" value={s.color} aria-label="Colour" onChange={(e) => set({ ...s, color: e.target.value })} />
        )}
        blank={(label) => ({ id: newId(label), label, color: '#7a7f88' })}
        onSave={(statuses) => updateWorld(world.id, { statuses })}
      />
      <ListEditor
        title="Place types"
        entries={world.categories}
        inUse={(id) => places.some((p) => !p.deleted && p.categoryId === id)}
        render={(c, set) => (
          <input className="emoji" value={c.icon} aria-label="Icon" onChange={(e) => set({ ...c, icon: e.target.value })} />
        )}
        blank={(label) => ({ id: newId(label), label, icon: '📍' })}
        onSave={(categories) => updateWorld(world.id, { categories })}
      />
      <TrashSection world={world} places={places} items={items} />
      <BackupSection />
      <NoteImportSection world={world} hasPlaces={places.some((p) => !p.deleted)} />
      <section>
        <h3>Account</h3>
        <p>Signed in as {auth.currentUser?.email}</p>
        <button type="button" onClick={() => signOut()}>
          Sign out
        </button>
      </section>
    </div>
  );
}

function WorldsSection({ world, worlds, onSwitch }: { world: World; worlds: World[]; onSwitch: (id: string) => void }) {
  const [name, setName] = useState('');
  const [rename, setRename] = useState(world.name);
  return (
    <section>
      <h3>Worlds / realms</h3>
      <p className="hint">The one you pick is remembered on this device.</p>
      <ul className="plain">
        {[...worlds]
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((w) => (
            <li key={w.id}>
              <button type="button" className={w.id === world.id ? 'chip on' : 'chip'} onClick={() => onSwitch(w.id)}>
                {w.id === world.id ? '✓ ' : ''}
                {w.name}
              </button>
            </li>
          ))}
      </ul>
      <div className="inline-form">
        <input className="text" value={rename} onChange={(e) => setRename(e.target.value)} aria-label="World name" />
        <button type="button" disabled={!rename.trim() || rename === world.name} onClick={() => updateWorld(world.id, { name: rename.trim() })}>
          Rename
        </button>
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSwitch(createWorld(name.trim()));
          setName('');
        }}
      >
        <input className="text" placeholder="New world name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={!name.trim()}>
          Add
        </button>
      </form>
    </section>
  );
}

function MembersSection({ world, worlds, onSwitch }: { world: World; worlds: World[]; onSwitch: (id: string) => void }) {
  const invites = useInvites(world.id);
  const toast = useToast();
  const myId = me().uid;
  const members = Object.entries(world.memberInfo ?? {}).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
  const live = invites.data.filter((i) => i.active).sort((a, b) => b.createdAt - a.createdAt);

  const share = async (token: string) => {
    const url = inviteUrl(token);
    const text = `Join my Minecraft world “${world.name}”: ${url}`;
    try {
      if (navigator.share) return await navigator.share({ title: `Join ${world.name}`, text, url });
    } catch {
      /* share sheet closed: fall back to copying */
    }
    toast((await copyText(url)) ? 'Invite link copied' : url);
  };

  return (
    <section>
      <h3>Members of {world.name}</h3>
      <p className="hint">Everyone here can see and edit everything in this world. Nobody else can.</p>
      <ul className="plain editor">
        {members.map(([uid, m]) => (
          <li key={uid} className="trash-row">
            <span>
              {m.name}
              {uid === myId && ' (you)'} <small>joined {timeAgo(m.joinedAt)}</small>
            </span>
            {uid === myId ? (
              <button
                type="button"
                className="danger"
                onClick={() => {
                  const last = world.members.length <= 1;
                  if (!confirm(last ? `You're the only member. Leaving means nobody can open “${world.name}” again. Leave anyway?` : `Leave “${world.name}”? You'll need a new invite to come back.`)) return;
                  removeMember(world.id, uid);
                  const next = worlds.find((w) => w.id !== world.id);
                  if (next) onSwitch(next.id);
                }}
              >
                Leave
              </button>
            ) : (
              <button
                type="button"
                className="danger"
                onClick={() => confirm(`Remove ${m.name} from “${world.name}”?`) && removeMember(world.id, uid)}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <h4>Invite links</h4>
      <p className="hint">Anyone who opens a link and signs in with Google can join. Turn a link off once your friends have joined.</p>
      <ul className="plain editor">
        {live.map((i) => (
          <li key={i.id} className="trash-row">
            <span>
              Link by {i.createdBy.name} <small>{timeAgo(i.createdAt)}</small>
            </span>
            <button type="button" onClick={() => share(i.id)}>
              Share
            </button>
            <button type="button" className="danger" onClick={() => turnOffInvite(i.id)}>
              Turn off
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="primary" onClick={() => share(createInvite(world))}>
        + Create invite link
      </button>
    </section>
  );
}

function ListEditor<T extends Status | Category>({
  title,
  hint,
  entries,
  inUse,
  render,
  blank,
  onSave,
}: {
  title: string;
  hint?: string;
  entries: T[];
  inUse: (id: string) => boolean;
  render: (entry: T, set: (next: T) => void) => React.ReactNode;
  blank: (label: string) => T;
  onSave: (entries: T[]) => void;
}) {
  const [draft, setDraft] = useState<T[] | null>(null);
  const [adding, setAdding] = useState('');
  const toast = useToast();
  const list = draft ?? entries;
  const set = (i: number, next: T) => setDraft(list.map((e, j) => (j === i ? next : e)));
  const move = (i: number, by: number) => {
    const next = [...list];
    const [e] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, e);
    setDraft(next);
  };

  return (
    <section>
      <h3>{title}</h3>
      {hint && <p className="hint">{hint}</p>}
      <ul className="plain editor">
        {list.map((e, i) => (
          <li key={e.id}>
            {render(e, (n) => set(i, n))}
            <input className="text" value={e.label} aria-label="Name" onChange={(ev) => set(i, { ...e, label: ev.target.value })} />
            <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
              ↑
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Remove"
              onClick={() => {
                if (inUse(e.id)) return toast(`“${e.label}” is still used. Change those places first.`);
                setDraft(list.filter((_, j) => j !== i));
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="inline-form"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (!adding.trim()) return;
          setDraft([...list, blank(adding.trim())]);
          setAdding('');
        }}
      >
        <input className="text" placeholder={`New ${title.toLowerCase().replace(/s$/, '')}`} value={adding} onChange={(e) => setAdding(e.target.value)} />
        <button type="submit" disabled={!adding.trim()}>
          Add
        </button>
      </form>
      {draft && (
        <div className="form-actions">
          <button type="button" onClick={() => setDraft(null)}>
            Discard
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onSave(draft.filter((e) => e.label.trim()));
              setDraft(null);
              toast(`${title} saved`);
            }}
          >
            Save {title.toLowerCase()}
          </button>
        </div>
      )}
    </section>
  );
}

function TrashSection({ world, places, items }: { world: World; places: Place[]; items: Item[] }) {
  const trashed = [
    ...places.filter((p) => p.deleted).map((p) => ({ kind: 'places' as const, entry: p as Place | Item, label: p.name })),
    ...items.filter((i) => i.deleted).map((i) => ({ kind: 'items' as const, entry: i as Place | Item, label: i.title || i.url || 'Untitled' })),
  ].sort((a, b) => (b.entry.deletedAt ?? 0) - (a.entry.deletedAt ?? 0));

  return (
    <section>
      <h3>Trash ({trashed.length})</h3>
      <p className="hint">Deleted things stay here until you remove them for good.</p>
      <ul className="plain">
        {trashed.map(({ kind, entry, label }) => (
          <li key={entry.id} className="trash-row">
            <span>
              {label} <small>{entry.deletedAt ? timeAgo(entry.deletedAt) : ''}</small>
            </span>
            <button type="button" onClick={() => restore(world.id, kind, entry.id)}>
              Restore
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => confirm(`Delete “${label}” forever?`) && purge(world.id, kind, entry)}
            >
              Erase
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BackupSection() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <section>
      <h3>Backup</h3>
      <p className="hint">
        Everything is stored in the cloud and synced to both of you. A nightly backup also runs on GitHub. You can download your own copy any time.
      </p>
      <div className="actions">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const data = await exportAll();
              download(`minecraft-notes-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1));
            } catch (err) {
              toast(`Export failed: ${(err as Error).message}`);
            }
            setBusy(false);
          }}
        >
          ⬇ Download backup
        </button>
        <label className="button">
          ⬆ Restore from file
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const data = JSON.parse(await f.text()) as ExportFile;
                if (data.version !== 1 || !Array.isArray(data.worlds)) throw new Error('Not a backup file');
                if (!confirm(`Restore backup from ${data.exportedAt}? Entries with the same id are overwritten; nothing else is removed.`)) return;
                toast(`Restored ${await importAll(data)} entries`);
              } catch (err) {
                toast(`Restore failed: ${(err as Error).message}`);
              }
            }}
          />
        </label>
      </div>
    </section>
  );
}

function NoteImportSection({ world, hasPlaces }: { world: World; hasPlaces: boolean }) {
  // The original Apple Note is only offered in the realm it came from.
  const seed = !hasPlaces && world.name.trim().toLowerCase() === 'rebadam';
  const [text, setText] = useState(seed ? SEED_NOTE : '');
  const [open, setOpen] = useState(seed);
  const toast = useToast();
  const parsed = parseNote(text);

  const run = () => {
    // Parents come first in the parsed list, so their new ids exist for children.
    const ids = new Map<number, string>();
    const now = Date.now();
    for (const p of parsed.places) {
      const { key, parentKey, ...rest } = p;
      const categoryId = world.categories.some((c) => c.id === rest.categoryId) ? rest.categoryId : world.categories.at(-1)?.id ?? '';
      const statusId = world.statuses.some((s) => s.id === rest.statusId) ? rest.statusId : world.statuses[0]?.id ?? '';
      ids.set(key, addPlace(world.id, { ...rest, categoryId, statusId, parentId: parentKey === null ? null : ids.get(parentKey) ?? null, imageIds: [] }, now - key * 1000));
    }
    parsed.items.forEach((i, n) => addItem(world.id, { ...i, imageIds: [] }, now - n * 1000));
    toast(`Imported ${parsed.places.length} places and ${parsed.items.length} notes/links`);
    setText('');
    setOpen(false);
  };

  return (
    <section>
      <h3>
        <button type="button" className="link-btn" onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} Import from a note
        </button>
      </h3>
      {open && (
        <>
          <p className="hint">
            Paste a checklist like the old Apple Note. Lines with coordinates become places (indented lines go inside the one above), links become links, and other lines become to-dos.
          </p>
          <textarea className="text mono" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          {parsed.places.length + parsed.items.length > 0 && (
            <>
              <details>
                <summary>
                  Preview: {parsed.places.length} places, {parsed.items.length} notes/links
                </summary>
                <ul className="plain preview-list">
                  {parsed.places.map((p) => (
                    <li key={p.key}>
                      {p.parentKey !== null && '↳ '}
                      {world.categories.find((c) => c.id === p.categoryId)?.icon} <b>{p.name}</b> {p.x} {p.y ?? '~'} {p.z}{' '}
                      <small>
                        {DIMENSIONS.find((d) => d.id === p.dimension)?.short} · {world.statuses.find((s) => s.id === p.statusId)?.label}
                        {p.notes && ` · ${p.notes}`}
                      </small>
                    </li>
                  ))}
                  {parsed.items.map((i, n) => (
                    <li key={`i${n}`}>
                      {i.kind}: {i.title} {i.url}
                    </li>
                  ))}
                </ul>
              </details>
              <button
                type="button"
                className="primary"
                onClick={() => (!hasPlaces || confirm('You already have places. Import these as well?')) && run()}
              >
                Import
              </button>
            </>
          )}
        </>
      )}
    </section>
  );
}
