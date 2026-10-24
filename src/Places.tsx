import { useMemo, useState } from 'react';
import { distance, formatCoords, linkedPortal, parseCoords } from './coords';
import { addPlace, restore, trash, updatePlace, type PlaceInput } from './data';
import { DIMENSIONS, type Dimension, type Place, type World } from './types';
import {
  CoordInput,
  ImagePicker,
  ImageStrip,
  Linkify,
  Sheet,
  coordFrom,
  coordTo,
  copyText,
  emptyCoord,
  settleImages,
  timeAgo,
  useToast,
  type CoordValue,
} from './ui';

const DIM_KEY = 'mc.lastDimension';
const lastDimension = (): Dimension => {
  try {
    return (localStorage.getItem(DIM_KEY) as Dimension) || 'overworld';
  } catch {
    return 'overworld';
  }
};

/**
 * iOS only raises the keyboard when focus happens inside the tap itself, but the
 * form mounts a moment later. Focusing this hidden field during the tap keeps
 * the keyboard up so the X field can take over focus once it renders.
 */
export function primeKeyboard() {
  document.getElementById('focus-proxy')?.focus();
}

type Sort = 'recent' | 'name' | 'near';

export function PlacesView({ world, places }: { world: World; places: Place[] }) {
  const [search, setSearch] = useState('');
  const [dim, setDim] = useState<Dimension | ''>('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [here, setHere] = useState<{ x: CoordValue; z: CoordValue; dim: Dimension }>({
    x: emptyCoord(),
    z: emptyCoord(),
    dim: 'overworld',
  });
  const [form, setForm] = useState<{ place?: Place; parentId?: string } | null>(null);

  const live = useMemo(() => places.filter((p) => !p.deleted), [places]);
  const byId = useMemo(() => new Map(live.map((p) => [p.id, p])), [live]);

  const hereCoords =
    sort === 'near' && here.x.abs && here.z.abs
      ? { x: coordTo(here.x)!, y: null, z: coordTo(here.z)!, dimension: here.dim }
      : null;
  const dist = (p: Place) => (hereCoords ? distance(hereCoords, p) : null);

  const q = search.trim().toLowerCase();
  const filtering = !!(q || dim || cat || status || sort === 'near');
  const matches = (p: Place) =>
    (!dim || p.dimension === dim) &&
    (!cat || p.categoryId === cat) &&
    (!status || p.statusId === status) &&
    (!q || `${p.name} ${p.notes} ${p.x} ${p.y ?? ''} ${p.z}`.toLowerCase().includes(q));

  const compare = (a: Place, b: Place) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'near') return (dist(a) ?? Infinity) - (dist(b) ?? Infinity);
    return b.createdAt - a.createdAt;
  };

  const children = useMemo(() => {
    const m = new Map<string | null, Place[]>();
    for (const p of live) {
      const parent = p.parentId && byId.has(p.parentId) ? p.parentId : null;
      m.set(parent, [...(m.get(parent) ?? []), p]);
    }
    return m;
  }, [live, byId]);

  const rows: { place: Place; depth: number }[] = [];
  if (filtering) {
    for (const p of live.filter(matches).sort(compare)) rows.push({ place: p, depth: 0 });
  } else {
    const walk = (parent: string | null, depth: number) => {
      for (const p of [...(children.get(parent) ?? [])].sort(compare)) {
        rows.push({ place: p, depth });
        walk(p.id, depth + 1);
      }
    };
    walk(null, 0);
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          type="search"
          placeholder={`Search ${live.length} places`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filters">
          <select value={dim} onChange={(e) => setDim(e.target.value as Dimension | '')} aria-label="Dimension">
            <option value="">All dims</option>
            {DIMENSIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Type">
            <option value="">All types</option>
            {world.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="">All statuses</option>
            {world.statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="recent">Newest</option>
            <option value="name">A–Z</option>
            <option value="near">Nearest to…</option>
          </select>
        </div>
        {sort === 'near' && (
          <div className="near">
            <span>I'm at</span>
            <CoordInput axis="X" value={here.x} onChange={(x) => setHere({ ...here, x })} />
            <CoordInput axis="Z" value={here.z} onChange={(z) => setHere({ ...here, z })} />
            <select value={here.dim} onChange={(e) => setHere({ ...here, dim: e.target.value as Dimension })} aria-label="My dimension">
              {DIMENSIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.short}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="empty">{live.length ? 'Nothing matches.' : 'No places yet. Tap + to save your first coordinates.'}</p>
      ) : (
        <ul className="list">
          {rows.map(({ place, depth }) => (
            <PlaceRow
              key={place.id}
              world={world}
              place={place}
              depth={depth}
              parent={filtering && place.parentId ? byId.get(place.parentId) : undefined}
              childCount={children.get(place.id)?.length ?? 0}
              filtering={filtering}
              distance={dist(place)}
              onEdit={() => setForm({ place })}
              onAddInside={() => {
                primeKeyboard();
                setForm({ parentId: place.id });
              }}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        className="fab"
        aria-label="Add coordinates"
        onClick={() => {
          primeKeyboard();
          setForm({});
        }}
      >
        +
      </button>

      {form && (
        <PlaceForm
          world={world}
          places={live}
          place={form.place}
          parentId={form.parentId}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}

function Coords({ x, y, z }: { x: number; y: number | null; z: number }) {
  const n = (axis: string, v: number | null) => (
    <span className="c">
      <small>{axis}</small>
      <b className={v !== null && v < 0 ? 'minus' : ''}>{v ?? '–'}</b>
    </span>
  );
  return (
    <span className="coords">
      {n('X', x)}
      {n('Y', y)}
      {n('Z', z)}
    </span>
  );
}

function PlaceRow({
  world,
  place,
  depth,
  parent,
  childCount,
  filtering,
  distance,
  onEdit,
  onAddInside,
}: {
  world: World;
  place: Place;
  depth: number;
  parent?: Place;
  childCount: number;
  filtering: boolean;
  distance: number | null;
  onEdit: () => void;
  onAddInside: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const toast = useToast();
  const status = world.statuses.find((s) => s.id === place.statusId);
  const category = world.categories.find((c) => c.id === place.categoryId);
  const other = linkedPortal(place, place.dimension);

  const setStatus = (statusId: string) => {
    const before = place.statusId;
    setPicking(false);
    if (statusId === before) return;
    updatePlace(world.id, place.id, { statusId });
    toast(`${place.name}: ${world.statuses.find((s) => s.id === statusId)?.label}`, () =>
      updatePlace(world.id, place.id, { statusId: before }),
    );
  };

  return (
    <li className={`row ${open ? 'open' : ''}`} style={{ marginLeft: Math.min(depth, 4) * 14 }}>
      <div className="row-main" onClick={() => setOpen(!open)}>
        <div className="row-top">
          <span className="cat" title={category?.label}>
            {depth > 0 && <span className="branch">↳</span>}
            {category?.icon ?? '📍'}
          </span>
          <span className="name">{place.name}</span>
          <button
            type="button"
            className="status"
            style={{ '--c': status?.color ?? '#888' } as React.CSSProperties}
            onClick={(e) => {
              e.stopPropagation();
              setPicking(!picking);
            }}
          >
            {status?.label ?? 'No status'}
          </button>
        </div>
        <div className="row-coords">
          <Coords {...place} />
          {place.dimension !== 'overworld' && <span className={`dim dim-${place.dimension}`}>{DIMENSIONS.find((d) => d.id === place.dimension)?.label}</span>}
          {distance !== null && <span className="dist">{distance.toLocaleString()} blocks</span>}
          {place.imageIds?.length > 0 && <span className="meta-icon">📷{place.imageIds.length}</span>}
        </div>
        {parent && <div className="crumb">in {parent.name}</div>}
        {!open && place.notes && <div className="preview">{place.notes}</div>}
        {!open && childCount > 0 && filtering && <div className="crumb">{childCount} inside</div>}
      </div>

      {picking && (
        <div className="status-picker">
          {world.statuses.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`status ${s.id === place.statusId ? 'current' : ''}`}
              style={{ '--c': s.color } as React.CSSProperties}
              onClick={() => setStatus(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="row-detail">
          {place.notes && (
            <p className="notes">
              <Linkify text={place.notes} />
            </p>
          )}
          <ImageStrip worldId={world.id} ids={place.imageIds ?? []} />
          {other && (
            <p className="linked">
              {other.dimension === 'nether' ? 'Nether side' : 'Overworld side'}: <Coords {...other} />
            </p>
          )}
          <p className="audit">
            Added by {place.createdBy?.name} {timeAgo(place.createdAt)}
            {place.updatedAt - place.createdAt > 5000 && ` · edited by ${place.updatedBy?.name} ${timeAgo(place.updatedAt)}`}
          </p>
          <div className="actions">
            <button
              type="button"
              onClick={async () => toast((await copyText(formatCoords(place))) ? `Copied ${formatCoords(place)}` : "Couldn't copy")}
            >
              Copy
            </button>
            <button type="button" onClick={onEdit}>
              Edit
            </button>
            <button type="button" onClick={onAddInside}>
              + Inside
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                trash(world.id, 'places', place.id);
                toast(`Moved “${place.name}” to Trash`, () => restore(world.id, 'places', place.id));
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

function PlaceForm({
  world,
  places,
  place,
  parentId,
  onClose,
}: {
  world: World;
  places: Place[];
  place?: Place;
  parentId?: string;
  onClose: () => void;
}) {
  const parentPlace = parentId ? places.find((p) => p.id === parentId) : undefined;
  const [x, setX] = useState(place ? coordFrom(place.x) : emptyCoord());
  const [y, setY] = useState(place ? coordFrom(place.y) : emptyCoord());
  const [z, setZ] = useState(place ? coordFrom(place.z) : emptyCoord());
  const [name, setName] = useState(place?.name ?? '');
  const [dimension, setDimension] = useState<Dimension>(place?.dimension ?? parentPlace?.dimension ?? lastDimension());
  const [categoryId, setCategoryId] = useState(place?.categoryId ?? '');
  const [statusId, setStatusId] = useState(place?.statusId ?? world.statuses[0]?.id ?? '');
  const [notes, setNotes] = useState(place?.notes ?? '');
  const [parent, setParent] = useState(place?.parentId ?? parentId ?? '');
  const [imageIds, setImageIds] = useState<string[]>(place?.imageIds ?? []);
  const [error, setError] = useState('');
  const toast = useToast();

  const fill = (text: string) => {
    const c = parseCoords(text);
    if (!c) return false;
    setX(coordFrom(c.x));
    setY(coordFrom(c.y));
    setZ(coordFrom(c.z));
    return true;
  };

  // Places this one could sit under: anything except itself and its own descendants.
  const parentOptions = useMemo(() => {
    const blocked = new Set<string>();
    if (place) {
      blocked.add(place.id);
      let grew = true;
      while (grew) {
        grew = false;
        for (const p of places) if (p.parentId && blocked.has(p.parentId) && !blocked.has(p.id)) blocked.add(p.id), (grew = true);
      }
    }
    const depthOf = (p: Place): number => (p.parentId ? 1 + depthOf(places.find((o) => o.id === p.parentId) ?? { ...p, parentId: null }) : 0);
    return places
      .filter((p) => !blocked.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ id: p.id, label: `${'  '.repeat(Math.min(depthOf(p), 3))}${p.name} (${p.x}, ${p.z})` }));
  }, [places, place]);

  const close = (saved: boolean) => {
    settleImages(world.id, place?.imageIds ?? [], imageIds, saved);
    onClose();
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!x.abs || !z.abs) {
      setError('X and Z are needed.');
      return;
    }
    const input: PlaceInput = {
      name: name.trim() || `${world.categories.find((c) => c.id === categoryId)?.label ?? 'Spot'} ${coordTo(x)}, ${coordTo(z)}`,
      x: coordTo(x)!,
      y: coordTo(y),
      z: coordTo(z)!,
      dimension,
      categoryId: categoryId || 'landmark',
      statusId,
      notes: notes.trim(),
      parentId: parent || null,
      imageIds,
    };
    try {
      localStorage.setItem(DIM_KEY, dimension);
    } catch {
      /* fine */
    }
    if (place) updatePlace(world.id, place.id, input);
    else addPlace(world.id, input);
    toast(place ? 'Saved changes' : `Saved ${input.name}`);
    close(true);
  };

  return (
    <Sheet title={place ? 'Edit place' : parentPlace ? `Add inside ${parentPlace.name}` : 'New place'} onClose={() => close(false)}>
      <form onSubmit={save} className="form">
        <div className="coord-row">
          <CoordInput axis="X" value={x} onChange={setX} onPasteAll={fill} autoFocus={!place} />
          <CoordInput axis="Y" value={y} onChange={setY} onPasteAll={fill} optional />
          <CoordInput axis="Z" value={z} onChange={setZ} onPasteAll={fill} />
        </div>
        <div className="hint-row">
          <span className="hint">Tap ± to make a number negative.</span>
          <button
            type="button"
            className="link-btn"
            onClick={async () => {
              try {
                if (!fill(await navigator.clipboard.readText())) toast('No coordinates on the clipboard');
              } catch {
                toast('Clipboard not available');
              }
            }}
          >
            Paste coords
          </button>
        </div>
        {error && <p className="error">{error}</p>}

        <input
          className="text"
          placeholder="Name (e.g. Amethyst cave)"
          value={name}
          enterKeyHint="next"
          onChange={(e) => setName(e.target.value)}
        />

        <div className="seg" role="radiogroup" aria-label="Dimension">
          {DIMENSIONS.map((d) => (
            <button
              type="button"
              key={d.id}
              role="radio"
              aria-checked={dimension === d.id}
              className={dimension === d.id ? `on dim-${d.id}` : ''}
              onClick={() => setDimension(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="chips" aria-label="Type">
          {world.categories.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip ${categoryId === c.id ? 'on' : ''}`}
              onClick={() => setCategoryId(categoryId === c.id ? '' : c.id)}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        <div className="chips" aria-label="Status">
          {world.statuses.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`chip status-chip ${statusId === s.id ? 'on' : ''}`}
              style={{ '--c': s.color } as React.CSSProperties}
              onClick={() => setStatusId(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <textarea className="text" rows={3} placeholder="Notes, links…" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <label className="field">
          <span>Inside / near</span>
          <select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">— Nothing (top level) —</option>
            {parentOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

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
