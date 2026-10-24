import { describe, expect, it } from 'vitest';
import { parseNote, splitPlaceLine } from './importNote';
import { SEED_NOTE } from './seedNote';

describe('splitPlaceLine', () => {
  it('separates name and trailing notes', () => {
    expect(splitPlaceLine('Village: -370, 67, 170 (villagers dead)')).toEqual({ name: 'Village', notes: 'villagers dead' });
    expect(splitPlaceLine('Staircase down at 1857, 70, 1219ish')).toEqual({ name: 'Staircase down', notes: 'Approximate.' });
    expect(splitPlaceLine('1845, -41, 1296 (weird end stuff)')).toEqual({ name: 'weird end stuff', notes: '' });
    expect(splitPlaceLine('Small lava/obsidion, -218, -55,300 (cave through sky bridge 1)')).toEqual({
      name: 'Small lava/obsidion',
      notes: 'cave through sky bridge 1',
    });
  });
});

describe('parseNote on the original note', () => {
  const { places, items } = parseNote(SEED_NOTE);
  const byName = (name: string) => places.filter((p) => p.name === name);

  it('finds every coordinate line', () => {
    expect(places).toHaveLength(27);
  });

  it('keeps nesting', () => {
    const cave = byName('Cave').find((p) => p.x === 1663)!;
    const deep = places.find((p) => p.name.startsWith('Deep cave'))!;
    expect(deep.parentKey).toBe(cave.key);
    expect(places.find((p) => p.name === 'Staircase down')!.parentKey).toBe(deep.key);
    expect(places.find((p) => p.name === 'weird end stuff')!.parentKey).toBe(cave.key);
  });

  it('turns un-coordinated sub-items into parent notes', () => {
    expect(places.find((p) => p.name === 'Village untouched')!.notes).toBe('Village breeder, planned trading post');
  });

  it('guesses categories, statuses and nether portals', () => {
    const deep = places.find((p) => p.name.startsWith('Deep cave'))!;
    expect(deep.categoryId).toBe('cave');
    expect(deep.statusId).toBe('danger');
    expect(places.find((p) => p.name === 'Cave mouth')!.statusId).toBe('done');
    const portals = places.filter((p) => p.categoryId === 'portal');
    expect(portals.map((p) => [p.name, p.dimension])).toEqual([
      ['Nether Portal', 'nether'],
      ['Overworld Nether Portral', 'overworld'],
      ['Nether portal', 'nether'],
      ['Nether portal', 'nether'],
    ]);
  });

  it('collects to-dos, notes and links', () => {
    expect(items).toEqual([
      { kind: 'todo', title: 'Nether day 2: ty', url: '', body: '', done: false },
      { kind: 'note', title: 'Nether guide — DrDaveice (YouTube: "NEW Complete Minecraft Nether Guide! (2026)")', url: '', body: '', done: false },
      { kind: 'link', title: 'Nether Calculator', url: 'https://nethercalculator.com/?tool=portal', body: '', done: false },
      { kind: 'link', title: 'Iron farm, take 2', url: 'https://m.youtube.com/watch?v=WlurtUevzFA&ra=m', body: '', done: false },
    ]);
  });
});
