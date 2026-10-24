import type { Dimension } from './types';

export interface ParsedCoords {
  x: number;
  y: number | null;
  z: number;
}

const NUM = String.raw`-?\d+(?:\.\d+)?`;
const SEP = String.raw`\s*[,/ ]\s*`;
/** Two or three numbers in a row: "x, y, z", "x y z", "x / y / z" or just "x z". */
export const COORD_RUN = new RegExp(`(${NUM})${SEP}(${NUM})(?:${SEP}(${NUM}))?`);

/** Phones like to "smart" a hyphen into a dash; Minecraft only ever means minus. */
export function normalizeMinus(text: string): string {
  return text.replace(/[‐-―−﹣－]/g, '-');
}

/**
 * Pull coordinates out of whatever got pasted: Bedrock's "Position: 12, 64, -30",
 * Java's F3 "XYZ: 12.5 / 64 / -30.2", or a texted "74 -312" (x and z only).
 */
export function parseCoords(text: string): ParsedCoords | null {
  const m = normalizeMinus(text).match(COORD_RUN);
  if (!m) return null;
  const nums = [m[1], m[2], m[3]].filter((n): n is string => n !== undefined).map((n) => Math.floor(Number(n)));
  if (nums.length === 3) return { x: nums[0], y: nums[1], z: nums[2] };
  return { x: nums[0], y: null, z: nums[1] };
}

/** Space separated, ready for Bedrock's /tp command. */
export function formatCoords(c: ParsedCoords): string {
  return c.y === null ? `${c.x} ~ ${c.z}` : `${c.x} ${c.y} ${c.z}`;
}

/** Where the matching portal should go in the other dimension. Y stays the same. */
export function linkedPortal(c: ParsedCoords, dimension: Dimension): (ParsedCoords & { dimension: Dimension }) | null {
  if (dimension === 'overworld') return { x: Math.floor(c.x / 8), y: c.y, z: Math.floor(c.z / 8), dimension: 'nether' };
  if (dimension === 'nether') return { x: c.x * 8, y: c.y, z: c.z * 8, dimension: 'overworld' };
  return null;
}

/** Horizontal distance in blocks, comparing across dimensions in overworld units. */
export function distance(
  a: ParsedCoords & { dimension: Dimension },
  b: ParsedCoords & { dimension: Dimension },
): number | null {
  if ((a.dimension === 'end') !== (b.dimension === 'end')) return null;
  const scale = (d: Dimension) => (d === 'nether' ? 8 : 1);
  const dx = a.x * scale(a.dimension) - b.x * scale(b.dimension);
  const dz = a.z * scale(a.dimension) - b.z * scale(b.dimension);
  return Math.round(Math.hypot(dx, dz));
}
