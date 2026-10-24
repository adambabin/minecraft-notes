import { useState } from 'react';
import { addItem, restore, trash, updateItem, type ItemInput } from './data';
import type { Item, ItemKind, World } from './types';
import { ImagePicker, ImageStrip, Linkify, Sheet, prettyUrl, settleImages, timeAgo, useToast } from './ui';

const KINDS: { id: ItemKind; label: string; icon: string }[] = [
  { id: 'todo', label: 'To-do', icon: '☑️' },
  { id: 'link', label: 'Link', icon: '🔗' },
  { id: 'note', label: 'Note', icon: '📝' },
  { id: 'photo', label: 'Photos', icon: '🖼️' },
];

const URL_RE = /https?:\/\/\S+/;

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function ItemsView({ world, items }: { world: World; items: Item[] }) {
  const [filter, setFilter] = useState<ItemKind | ''>('');
  const [quick, setQuick] = useState('');
  const [form, setForm] = useState<{ item?: Item; kind?: ItemKind } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const toast = useToast();

  const live = items.filter((i) => !i.deleted && (!filter || i.kind === filter)).sort((a, b) => b.createdAt - a.createdAt);
  const open = live.filter((i) => !(i.kind === 'todo' && i.done));
  const done = live.filter((i) => i.kind === 'todo' && i.done);

  const quickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const text = quick.trim();
    if (!text) return;
    const url = text.match(URL_RE)?.[0] ?? '';
    const input: ItemInput = url
      ? { kind: 'link', url, title: text.replace(url, '').trim(), body: '', done: false, imageIds: [] }
      : { kind: filter === 'note' ? 'note' : 'todo', title: text, url: '', body: '', done: false, imageIds: [] };
    addItem(world.id, input);
    setQuick('');
  };

  return (
    <>
      <form className="toolbar quick" onSubmit={quickAdd}>
        <input
          className="search"
          placeholder="Add a to-do, or paste a link…"
          value={quick}
          enterKeyHint="done"
          onChange={(e) => setQuick(e.target.value)}
        />
        <button type="submit" className="primary" disabled={!quick.trim()}>
          Add
        </button>
        <button type="button" onClick={() => setForm({ kind: 'photo' })} aria-label="Add photos">
          📷
        </button>
      </form>
      <div className="seg small">
        <button type="button" className={filter === '' ? 'on' : ''} onClick={() => setFilter('')}>
          All
        </button>
        {KINDS.map((k) => (
          <button type="button" key={k.id} className={filter === k.id ? 'on' : ''} onClick={() => setFilter(k.id)}>
            {k.label}
          </button>
        ))}
      </div>

      {live.length === 0 && <p className="empty">Nothing here yet.</p>}
      <ul className="list">
        {open.map((i) => (
          <ItemRow key={i.id} world={world} item={i} onEdit={() => setForm({ item: i })} />
        ))}
      </ul>
      {done.length > 0 && (
        <>
          <button type="button" className="link-btn done-toggle" onClick={() => setShowDone(!showDone)}>
            {showDone ? '▾' : '▸'} Done ({done.length})
          </button>
          {showDone && (
            <ul className="list">
              {done.map((i) => (
                <ItemRow key={i.id} world={world} item={i} onEdit={() => setForm({ item: i })} />
              ))}
            </ul>
          )}
        </>
      )}

      <button type="button" className="fab" aria-label="Add note or link" onClick={() => setForm({ kind: filter || 'note' })}>
        +
      </button>

      {form && (
        <ItemForm
          world={world}
          item={form.item}
          kind={form.kind}
          onClose={() => setForm(null)}
          onSaved={(title) => toast(`Saved ${title}`)}
        />
      )}
    </>
  );
}

function ItemRow({ world, item, onEdit }: { world: World; item: Item; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const yt = item.kind === 'link' ? youtubeId(item.url) : null;
  const icon = KINDS.find((k) => k.id === item.kind)?.icon;

  return (
    <li className={`row item ${item.done ? 'is-done' : ''}`}>
      <div className="row-main" onClick={() => setOpen(!open)}>
        <div className="row-top">
          {item.kind === 'todo' ? (
            <input
              type="checkbox"
              className="check"
              checked={item.done}
              aria-label="Done"
              onClick={(e) => e.stopPropagation()}
              onChange={() => updateItem(world.id, item.id, { done: !item.done })}
            />
          ) : (
            <span className="cat">{icon}</span>
          )}
          <span className="name">{item.title || (item.url ? prettyUrl(item.url) : 'Untitled')}</span>
          {item.imageIds?.length > 0 && !open && <span className="meta-icon">📷{item.imageIds.length}</span>}
        </div>
        {item.kind === 'link' && (
          <a className="link-card" href={item.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            {yt && (
              <img
                src={`https://i.ytimg.com/vi/${yt}/mqdefault.jpg`}
                alt=""
                loading="lazy"
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}
            <span>{prettyUrl(item.url)} ↗</span>
          </a>
        )}
        {!open && item.body && <div className="preview">{item.body}</div>}
        {item.kind === 'photo' && !open && <ImageStrip worldId={world.id} ids={item.imageIds ?? []} />}
      </div>
      {open && (
        <div className="row-detail">
          {item.body && (
            <p className="notes">
              <Linkify text={item.body} />
            </p>
          )}
          <ImageStrip worldId={world.id} ids={item.imageIds ?? []} />
          <p className="audit">
            Added by {item.createdBy?.name} {timeAgo(item.createdAt)}
          </p>
          <div className="actions">
            <button type="button" onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                trash(world.id, 'items', item.id);
                toast('Moved to Trash', () => restore(world.id, 'items', item.id));
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function ItemForm({
  world,
  item,
  kind: initialKind,
  onClose,
  onSaved,
}: {
  world: World;
  item?: Item;
  kind?: ItemKind;
  onClose: () => void;
  onSaved: (title: string) => void;
}) {
  const [kind, setKind] = useState<ItemKind>(item?.kind ?? initialKind ?? 'note');
  const [title, setTitle] = useState(item?.title ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [imageIds, setImageIds] = useState<string[]>(item?.imageIds ?? []);

  const close = (saved: boolean) => {
    settleImages(world.id, item?.imageIds ?? [], imageIds, saved);
    onClose();
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const input: ItemInput = { kind, title: title.trim(), url: url.trim(), body: body.trim(), done: item?.done ?? false, imageIds };
    if (!input.title && !input.url && !input.body && !imageIds.length) return close(false);
    if (item) updateItem(world.id, item.id, input);
    else addItem(world.id, input);
    onSaved(input.title || KINDS.find((k) => k.id === kind)!.label.toLowerCase());
    close(true);
  };

  return (
    <Sheet title={item ? 'Edit' : 'New'} onClose={() => close(false)}>
      <form className="form" onSubmit={save}>
        <div className="seg">
          {KINDS.map((k) => (
            <button type="button" key={k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>
        <input className="text" placeholder={kind === 'photo' ? 'Title (e.g. House ideas)' : 'Title'} value={title} onChange={(e) => setTitle(e.target.value)} />
        {kind === 'link' && (
          <input className="text" type="url" inputMode="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        )}
        <textarea className="text" rows={4} placeholder="Notes" value={body} onChange={(e) => setBody(e.target.value)} />
        <ImagePicker worldId={world.id} ids={imageIds} onChange={setImageIds} />
        <div className="form-actions">
          <button type="button" onClick={() => close(false)}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Save
          </button>
        </div>
      </form>
    </Sheet>
  );
}
