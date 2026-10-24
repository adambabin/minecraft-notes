import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { auth, db } from './firebase';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_STATUSES,
  type Audit,
  type ImageDoc,
  type Item,
  type Person,
  type Place,
  type World,
} from './types';

// ---------------------------------------------------------------------------
// Save tracking. Firestore writes resolve only once the server has them, so we
// never await them in the UI (that would hang offline). Instead we count the
// writes in flight and surface failures, so nothing is lost silently.

type SyncState = { pending: number; error: string | null };
let sync: SyncState = { pending: 0, error: null };
const syncListeners = new Set<() => void>();
const setSync = (next: Partial<SyncState>) => {
  sync = { ...sync, ...next };
  syncListeners.forEach((l) => l());
};

export function track(write: Promise<unknown>): Promise<unknown> {
  setSync({ pending: sync.pending + 1 });
  return write
    .then(() => setSync({ pending: sync.pending - 1, error: null }))
    .catch((err: Error) => {
      console.error(err);
      setSync({ pending: sync.pending - 1, error: err.message });
    });
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => (syncListeners.add(l), () => syncListeners.delete(l)),
    () => sync,
  );
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener('online', l);
      window.addEventListener('offline', l);
      return () => {
        window.removeEventListener('online', l);
        window.removeEventListener('offline', l);
      };
    },
    () => navigator.onLine,
  );
}

// ---------------------------------------------------------------------------
// Auth

export function useAuthUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(auth.currentUser ?? undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}

export function me(): Person {
  const u = auth.currentUser;
  return { uid: u?.uid ?? 'unknown', name: u?.displayName?.split(' ')[0] || 'Someone' };
}

const stamp = () => ({ updatedAt: Date.now(), updatedBy: me() });
const created = (at = Date.now()) => ({ createdAt: at, createdBy: me(), updatedAt: at, updatedBy: me(), deleted: false, deletedAt: null });

// ---------------------------------------------------------------------------
// Live collections

interface Live<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

function useLiveCollection<T>(path: string[] | null): Live<T> {
  const key = path?.join('/') ?? '';
  const [state, setState] = useState<Live<T>>({ data: [], loading: true, error: null });
  useEffect(() => {
    if (!path) return;
    setState({ data: [], loading: true, error: null });
    const [first, ...rest] = path;
    return onSnapshot(
      query(collection(db, first, ...rest)),
      (snap) => setState({ data: snap.docs.map((d) => ({ ...(d.data() as DocumentData), id: d.id }) as T), loading: false, error: null }),
      (err) => setState((s) => ({ ...s, loading: false, error: err.code })),
    );
  }, [key]);
  return state;
}

export const useWorlds = () => useLiveCollection<World>(['worlds']);
export const usePlaces = (worldId: string | null) => useLiveCollection<Place>(worldId ? ['worlds', worldId, 'places'] : null);
export const useItems = (worldId: string | null) => useLiveCollection<Item>(worldId ? ['worlds', worldId, 'items'] : null);

// ---------------------------------------------------------------------------
// Worlds

const WORLD_KEY = 'mc.worldId';

export function rememberedWorldId(): string | null {
  try {
    return localStorage.getItem(WORLD_KEY);
  } catch {
    return null;
  }
}

export function rememberWorld(id: string) {
  try {
    localStorage.setItem(WORLD_KEY, id);
  } catch {
    /* private mode: just means picking the world again next time */
  }
}

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'world';
}

export function createWorld(name: string, id = slug(name)): string {
  const world: Omit<World, 'id'> = { name, statuses: DEFAULT_STATUSES, categories: DEFAULT_CATEGORIES, createdAt: Date.now() };
  track(setDoc(doc(db, 'worlds', id), world));
  return id;
}

export function updateWorld(id: string, patch: Partial<Omit<World, 'id'>>) {
  track(updateDoc(doc(db, 'worlds', id), patch));
}

// ---------------------------------------------------------------------------
// Places and items

export type PlaceInput = Omit<Place, 'id' | keyof Audit>;
export type ItemInput = Omit<Item, 'id' | keyof Audit>;

/** `at` lets an import keep the original order under the "Recent" sort. */
export function addPlace(worldId: string, input: PlaceInput, at?: number): string {
  const ref = doc(collection(db, 'worlds', worldId, 'places'));
  track(setDoc(ref, { ...input, ...created(at) }));
  return ref.id;
}

export function updatePlace(worldId: string, id: string, patch: Partial<PlaceInput>) {
  track(updateDoc(doc(db, 'worlds', worldId, 'places', id), { ...patch, ...stamp() }));
}

export function addItem(worldId: string, input: ItemInput, at?: number): string {
  const ref = doc(collection(db, 'worlds', worldId, 'items'));
  track(setDoc(ref, { ...input, ...created(at) }));
  return ref.id;
}

export function updateItem(worldId: string, id: string, patch: Partial<ItemInput>) {
  track(updateDoc(doc(db, 'worlds', worldId, 'items', id), { ...patch, ...stamp() }));
}

type Kind = 'places' | 'items';

/** Moves an entry to Trash. Nothing is erased until it is emptied from there. */
export function trash(worldId: string, kind: Kind, id: string) {
  track(updateDoc(doc(db, 'worlds', worldId, kind, id), { deleted: true, deletedAt: Date.now(), ...stamp() }));
}

export function restore(worldId: string, kind: Kind, id: string) {
  track(updateDoc(doc(db, 'worlds', worldId, kind, id), { deleted: false, deletedAt: null, ...stamp() }));
}

export function purge(worldId: string, kind: Kind, entry: Place | Item) {
  for (const imageId of entry.imageIds ?? []) track(deleteDoc(doc(db, 'worlds', worldId, 'images', imageId)));
  track(deleteDoc(doc(db, 'worlds', worldId, kind, entry.id)));
}

// ---------------------------------------------------------------------------
// Images live in their own documents so lists stay fast; they are compressed to
// fit Firestore's 1 MB document limit, which keeps us on the free plan.

export function saveImage(worldId: string, image: Omit<ImageDoc, 'id' | 'createdAt' | 'createdBy'>): string {
  const ref = doc(collection(db, 'worlds', worldId, 'images'));
  track(setDoc(ref, { ...image, createdAt: Date.now(), createdBy: me() }));
  imageCache.set(ref.id, Promise.resolve({ ...image, id: ref.id, createdAt: Date.now(), createdBy: me() }));
  return ref.id;
}

export function deleteImage(worldId: string, id: string) {
  imageCache.delete(id);
  track(deleteDoc(doc(db, 'worlds', worldId, 'images', id)));
}

const imageCache = new Map<string, Promise<ImageDoc | null>>();

export function loadImage(worldId: string, id: string): Promise<ImageDoc | null> {
  let p = imageCache.get(id);
  if (!p) {
    p = getDoc(doc(db, 'worlds', worldId, 'images', id)).then((d) => (d.exists() ? ({ ...d.data(), id } as ImageDoc) : null));
    p.catch(() => imageCache.delete(id));
    imageCache.set(id, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Backup and restore

export interface ExportFile {
  version: 1;
  exportedAt: string;
  worlds: { world: World; places: Place[]; items: Item[]; images: ImageDoc[] }[];
}

export async function exportAll(): Promise<ExportFile> {
  const worlds = await getDocs(collection(db, 'worlds'));
  const out: ExportFile = { version: 1, exportedAt: new Date().toISOString(), worlds: [] };
  for (const w of worlds.docs) {
    const sub = async <T,>(name: string) =>
      (await getDocs(collection(db, 'worlds', w.id, name))).docs.map((d) => ({ ...d.data(), id: d.id }) as T);
    out.worlds.push({
      world: { ...(w.data() as World), id: w.id },
      places: await sub<Place>('places'),
      items: await sub<Item>('items'),
      images: await sub<ImageDoc>('images'),
    });
  }
  return out;
}

/** Restores an export. Entries are written by id, so re-importing never duplicates. */
export async function importAll(file: ExportFile): Promise<number> {
  let count = 0;
  for (const { world, places, items, images } of file.worlds) {
    const { id: worldId, ...worldData } = world;
    track(setDoc(doc(db, 'worlds', worldId), worldData, { merge: true }));
    const entries: [string, { id: string }][] = [
      ...places.map((p) => ['places', p] as [string, { id: string }]),
      ...items.map((i) => ['items', i] as [string, { id: string }]),
      ...images.map((i) => ['images', i] as [string, { id: string }]),
    ];
    // Batches are capped at 500 writes; images are big, so keep batches small.
    for (let i = 0; i < entries.length; i += 20) {
      const batch = writeBatch(db);
      for (const [kind, { id, ...data }] of entries.slice(i, i + 20)) batch.set(doc(db, 'worlds', worldId, kind, id), data);
      track(batch.commit());
      count += entries.slice(i, i + 20).length;
    }
  }
  return count;
}

export function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
