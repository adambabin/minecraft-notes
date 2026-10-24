import { COORD_RUN, normalizeMinus, parseCoords } from './coords';
import type { Dimension, ItemKind } from './types';

/** A place parsed from note text, before it has an id in the database. */
export interface DraftPlace {
  key: number;
  parentKey: number | null;
  name: string;
  x: number;
  y: number | null;
  z: number;
  dimension: Dimension;
  categoryId: string;
  statusId: string;
  notes: string;
}

export interface DraftItem {
  kind: ItemKind;
  title: string;
  url: string;
  body: string;
  done: boolean;
}

export interface ParsedNote {
  places: DraftPlace[];
  items: DraftItem[];
}

const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ['village', /village/i],
  ['portal', /portal|portral/i],
  ['cave', /cave|crevasse|staircase|ravine|mineshaft/i],
  ['spawner', /spawn|xp\b|zombie|skeleton|spider|blaze/i],
  ['resource', /lava|amethyst|obsid|diamond|iron|gold|ore/i],
  ['base', /base|house|farm|build/i],
];

export function guessCategory(name: string): string {
  const plain = name.replace(/\([^)]*\)/g, '');
  for (const [id, re] of CATEGORY_KEYWORDS) if (re.test(plain)) return id;
  for (const [id, re] of CATEGORY_KEYWORDS) if (re.test(name)) return id;
  return 'landmark';
}

function guessStatus(text: string, checked: boolean): string {
  if (/death|mobs|danger/i.test(text)) return 'danger';
  if (/planned|project/i.test(text)) return 'project';
  if (checked) return 'done';
  return 'unexplored';
}

const SKIP_LINES = new Set(['minecraft', 'coordinates']);
const URL_RE = /https?:\/\/\S+/;

interface Line {
  depth: number;
  checkbox: boolean;
  checked: boolean;
  text: string;
}

function readLine(raw: string): Line | null {
  const m = raw.match(/^(\s*)(?:[-*•]\s*)?(\[( |x|X)\]\s*)?(.*)$/);
  if (!m || !m[4].trim()) return null;
  const indent = m[1].replace(/\t/g, '    ').length;
  return { depth: Math.floor(indent / 2), checkbox: !!m[2], checked: /x/i.test(m[3] ?? ''), text: m[4].trim() };
}

/** Split "Village: -370, 67, 170 (villagers dead)" into name, coords and notes. */
export function splitPlaceLine(text: string): { name: string; notes: string } | null {
  const norm = normalizeMinus(text);
  const m = norm.match(COORD_RUN);
  if (!m || m.index === undefined) return null;
  let name = norm.slice(0, m.index).replace(/[\s:,-]+$/, '').replace(/\s+(at|near)$/i, '').trim();
  let notes = norm.slice(m.index + m[0].length).trim();
  if (/^ish\b/i.test(notes)) notes = `Approximate. ${notes.slice(3).trim()}`.trim();
  notes = notes.replace(/^\((.*)\)$/, '$1').trim();
  if (!name) {
    name = notes || 'Unnamed spot';
    notes = '';
  }
  return { name, notes };
}

/**
 * Turns the old Apple Notes checklist (pasted as text) into places and items.
 * Indentation becomes parent/child, lines with coordinates become places, URLs
 * become links and everything else becomes a to-do or note.
 */
export function parseNote(text: string): ParsedNote {
  const places: DraftPlace[] = [];
  const items: DraftItem[] = [];
  const stack: { depth: number; key: number | null }[] = [];
  let pending: string[] = [];

  const flushPending = () => {
    if (pending.length) items.push({ kind: 'note', title: pending.join(' — '), url: '', body: '', done: false });
    pending = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = readLine(raw);
    if (!line) {
      flushPending();
      continue;
    }
    if (SKIP_LINES.has(line.text.toLowerCase())) continue;

    const url = line.text.match(URL_RE);
    if (url) {
      const title = line.text.replace(URL_RE, '').trim() || pending.join(' — ') || url[0];
      pending = [];
      items.push({ kind: 'link', title, url: url[0], body: '', done: false });
      continue;
    }

    while (stack.length && stack[stack.length - 1].depth >= line.depth) stack.pop();
    const parentKey = stack.length ? stack[stack.length - 1].key : null;

    const coords = parseCoords(line.text);
    const split = coords && splitPlaceLine(line.text);
    if (coords && split) {
      flushPending();
      const key = places.length;
      places.push({
        key,
        parentKey,
        ...split,
        ...coords,
        dimension: 'overworld',
        categoryId: guessCategory(split.name),
        statusId: guessStatus(line.text, line.checked),
      });
      stack.push({ depth: line.depth, key });
      continue;
    }

    if (line.checkbox) {
      flushPending();
      const parent = parentKey === null ? undefined : places[parentKey];
      if (parent) {
        parent.notes = [parent.notes, line.text].filter(Boolean).join('\n');
      } else {
        items.push({ kind: 'todo', title: line.text, url: '', body: '', done: line.checked });
      }
      stack.push({ depth: line.depth, key: parentKey });
      continue;
    }

    pending.push(line.text);
  }
  flushPending();

  markNetherPortals(places);
  return { places, items };
}

/**
 * A portal whose coordinates are roughly 1/8th of another spot's is the Nether
 * side of that spot, e.g. "Nether portal: 57, 65, 199" under an island at 396, 1568.
 */
function markNetherPortals(places: DraftPlace[]) {
  for (const p of places) {
    if (p.categoryId !== 'portal' || /overworld/i.test(p.name)) continue;
    const near = places.some(
      (o) => o !== p && Math.abs(o.x / 8 - p.x) <= 16 && Math.abs(o.z / 8 - p.z) <= 16 && Math.hypot(o.x, o.z) > 64,
    );
    if (near) p.dimension = 'nether';
  }
}
