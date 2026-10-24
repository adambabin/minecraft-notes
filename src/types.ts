export type Dimension = 'overworld' | 'nether' | 'end';

export const DIMENSIONS: { id: Dimension; label: string; short: string }[] = [
  { id: 'overworld', label: 'Overworld', short: 'OW' },
  { id: 'nether', label: 'Nether', short: 'N' },
  { id: 'end', label: 'End', short: 'End' },
];

export interface Status {
  id: string;
  label: string;
  color: string;
}

export interface Category {
  id: string;
  label: string;
  icon: string;
}

export interface Person {
  uid: string;
  name: string;
}

export interface Audit {
  createdAt: number;
  createdBy: Person;
  updatedAt: number;
  updatedBy: Person;
  /** Soft delete: entries go to Trash and can be restored. */
  deleted?: boolean;
  deletedAt?: number | null;
}

export interface Member {
  name: string;
  joinedAt: number;
}

export interface World {
  id: string;
  name: string;
  statuses: Status[];
  categories: Category[];
  createdAt: number;
  /** Firebase user ids allowed to see and edit this world. */
  members: string[];
  memberInfo: Record<string, Member>;
}

/** Stored at invites/{token}; opening ?join=<token> lets someone add themselves. */
export interface Invite {
  id: string;
  worldId: string;
  worldName: string;
  createdAt: number;
  createdBy: Person;
  active: boolean;
}

export interface Place extends Audit {
  id: string;
  name: string;
  x: number;
  y: number | null;
  z: number;
  dimension: Dimension;
  categoryId: string;
  statusId: string;
  notes: string;
  /** Lets a place sit under another one, e.g. a portal inside a cave. */
  parentId: string | null;
  imageIds: string[];
}

export type ItemKind = 'todo' | 'link' | 'note' | 'photo';

export interface Item extends Audit {
  id: string;
  kind: ItemKind;
  title: string;
  url: string;
  body: string;
  done: boolean;
  imageIds: string[];
}

export interface ImageDoc {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  createdAt: number;
  createdBy: Person;
}

export const DEFAULT_STATUSES: Status[] = [
  { id: 'unexplored', label: 'Unexplored', color: '#8a8f98' },
  { id: 'partial', label: 'Partly explored', color: '#d9a400' },
  { id: 'done', label: 'Cleared / mined', color: '#3fa34d' },
  { id: 'danger', label: 'Dangerous', color: '#d6453d' },
  { id: 'project', label: 'Project planned', color: '#3d7dd6' },
];

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'village', label: 'Village', icon: '🏘️' },
  { id: 'cave', label: 'Cave', icon: '🕳️' },
  { id: 'portal', label: 'Nether portal', icon: '🟪' },
  { id: 'spawner', label: 'Spawner / XP', icon: '💀' },
  { id: 'resource', label: 'Resource', icon: '💎' },
  { id: 'base', label: 'Base / build', icon: '🏠' },
  { id: 'landmark', label: 'Landmark', icon: '📍' },
];
