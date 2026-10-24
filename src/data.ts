import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Query,
} from 'firebase/firestore';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { auth, db } from './firebase';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_STATUSES,
  type Audit,
  type ImageDoc,
  type Invite,
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

/** `key` identifies the query; it is rebuilt only when the key changes. */
function useLiveQuery<T>(key: string | null, build: () => Query): Live<T> {
  const [state, setState] = useState<Live<T>>({ data: [], loading: true, error: null });
  useEffect(() => {
    if (!key) return;
    setState({ data: [], loading: true, error: null });
    let stop = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const listen = (attempt: number) => {
      stop = onSnapshot(
        build(),
        (snap) => setState({ data: snap.docs.map((d) => ({ ...(d.data() as DocumentData), id: d.id }) as T), loading: false, error: null }),
        (err) => {
          // A world created or joined a moment ago may not have reached the
          // server yet, so its rules check fails at first: try again shortly.
          if (err.code === 'permission-denied' && attempt < 6) timer = setTimeout(() => listen(attempt + 1), 500 * 2 ** attempt);
          else setState((s) => ({ ...s, loading: false, error: err.code }));
        },
      );
    };
    listen(0);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [key]);
  return state;
}

const worldsOf = (uid: string) => query(collection(db, 'worlds'), where('members', 'array-contains', uid));

/** Only the worlds this person is a member of. */
export const useWorlds = (uid: string) => useLiveQuery<World>(`worlds:${uid}`, () => worldsOf(uid));
export const usePlaces = (worldId: string | null) =>
  useLiveQuery<Place>(worldId && `places:${worldId}`, () => collection(db, 'worlds', worldId!, 'places'));
export const useItems = (worldId: string | null) =>
  useLiveQuery<Item>(worldId && `items:${worldId}`, () => collection(db, 'worlds', worldId!, 'items'));
export const useInvites = (worldId: string) =>
  useLiveQuery<Invite>(`invites:${worldId}`, () => query(collection(db, 'invites'), where('worldId', '==', worldId)));

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

export function createWorld(name: string): string {
  const { uid, name: who } = me();
  const ref = doc(collection(db, 'worlds'));
  const world: Omit<World, 'id'> = {
    name,
    statuses: DEFAULT_STATUSES,
    categories: DEFAULT_CATEGORIES,
    createdAt: Date.now(),
    members: [uid],
    memberInfo: { [uid]: { name: who, joinedAt: Date.now() } },
  };
  track(setDoc(ref, world));
  return ref.id;
}

// ---------------------------------------------------------------------------
// Members and invite links

const JOIN_KEY = 'mc.joinToken';

/** Holds on to ?join=<token> through the Google sign-in. */
export function pendingJoin(): string | null {
  const url = new URL(location.href);
  const token = url.searchParams.get('join');
  try {
    if (token) {
      sessionStorage.setItem(JOIN_KEY, token);
      url.searchParams.delete('join');
      history.replaceState(null, '', url);
    }
    return token ?? sessionStorage.getItem(JOIN_KEY);
  } catch {
    return token;
  }
}

export function clearPendingJoin() {
  try {
    sessionStorage.removeItem(JOIN_KEY);
  } catch {
    /* nothing stored */
  }
}

export function inviteUrl(token: string): string {
  const url = new URL(import.meta.env.BASE_URL, location.origin);
  url.searchParams.set('join', token);
  return url.toString();
}

export function createInvite(world: World): string {
  const ref = doc(collection(db, 'invites'));
  const invite: Omit<Invite, 'id'> = { worldId: world.id, worldName: world.name, createdAt: Date.now(), createdBy: me(), active: true };
  track(setDoc(ref, invite));
  return ref.id;
}

export function turnOffInvite(token: string) {
  track(deleteDoc(doc(db, 'invites', token)));
}

export async function getInvite(token: string): Promise<Invite | null> {
  const snap = await getDoc(doc(db, 'invites', token));
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as Invite) : null;
}

/** Adds the signed-in person to the invite's world. Needs a connection. */
export async function joinWorld(invite: Invite) {
  const { uid, name } = me();
  await updateDoc(doc(db, 'worlds', invite.worldId), {
    members: arrayUnion(uid),
    [`memberInfo.${uid}`]: { name, joinedAt: Date.now() },
    joinedWith: invite.id,
  });
}

/** Removes someone (or yourself, to leave) from a world. */
export function removeMember(worldId: string, uid: string) {
  track(updateDoc(doc(db, 'worlds', worldId), { members: arrayRemove(uid), [`memberInfo.${uid}`]: deleteField() }));
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
  const worlds = await getDocs(worldsOf(me().uid));
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
  const { uid, name } = me();
  for (const { world, places, items, images } of file.worlds) {
    // Membership is never restored from a file: you can restore into worlds
    // you're already in, and anything else comes back as a new world of yours.
    const { id: backupId, members: _m, memberInfo: _mi, ...worldData } = world;
    const mine = await getDoc(doc(db, 'worlds', backupId)).then((d) => d.exists(), () => false);
    const worldId = mine ? backupId : doc(collection(db, 'worlds')).id;
    if (mine) track(setDoc(doc(db, 'worlds', worldId), worldData, { merge: true }));
    else track(setDoc(doc(db, 'worlds', worldId), { ...worldData, members: [uid], memberInfo: { [uid]: { name, joinedAt: Date.now() } } }));
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
