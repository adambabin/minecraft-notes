import { describe, expect, it } from 'vitest';
import { distance, formatCoords, linkedPortal, parseCoords } from './coords';

describe('parseCoords', () => {
  it('reads Bedrock position text', () => {
    expect(parseCoords('Position: 1857, -8, 1219')).toEqual({ x: 1857, y: -8, z: 1219 });
  });
  it('reads Java F3 text and floors decimals', () => {
    expect(parseCoords('XYZ: -12.5 / 64.0 / 30.9')).toEqual({ x: -13, y: 64, z: 30 });
  });
  it('treats two numbers as x and z', () => {
    expect(parseCoords('-21 -310: red biome')).toEqual({ x: -21, y: null, z: -310 });
  });
  it('accepts typographic minus signs', () => {
    expect(parseCoords('−250 –177')).toEqual({ x: -250, y: null, z: -177 });
  });
  it('returns null without coordinates', () => {
    expect(parseCoords('Nether day 2: ty')).toBeNull();
  });
});

describe('helpers', () => {
  it('formats for /tp', () => {
    expect(formatCoords({ x: 1, y: -2, z: 3 })).toBe('1 -2 3');
    expect(formatCoords({ x: 1, y: null, z: 3 })).toBe('1 ~ 3');
  });
  it('converts between overworld and nether', () => {
    expect(linkedPortal({ x: 1857, y: -8, z: -1219 }, 'overworld')).toEqual({ x: 232, y: -8, z: -153, dimension: 'nether' });
    expect(linkedPortal({ x: 57, y: 65, z: 199 }, 'nether')).toEqual({ x: 456, y: 65, z: 1592, dimension: 'overworld' });
    expect(linkedPortal({ x: 0, y: 0, z: 0 }, 'end')).toBeNull();
  });
  it('measures distance across dimensions', () => {
    expect(distance({ x: 0, y: 0, z: 0, dimension: 'overworld' }, { x: 3, y: 0, z: 4, dimension: 'nether' })).toBe(40);
    expect(distance({ x: 0, y: 0, z: 0, dimension: 'overworld' }, { x: 3, y: 0, z: 4, dimension: 'end' })).toBeNull();
  });
});
