import { test, expect } from 'vitest';
import { floorLevels, levelMatches, levelSeparation } from './building-levels.js';
import { validateBuilding } from './representative-building.js';
const levels = [
  { id: 'lower', elevationFeet: 0, heightFeet: 10 },
  { id: 'raised', logicalGroup: 'lower', elevationFeet: 1, heightFeet: 9 },
  { id: 'main', elevationFeet: 14, heightFeet: 10 },
  { id: 'sunken', logicalGroup: 'main', elevationFeet: 13, heightFeet: 11 },
  { id: 'upper', elevationFeet: 27, heightFeet: 10 }
];
test('floor plan filters keep raised and sunken spaces with their floor', () => {
  expect(floorLevels(levels).map((l) => l.id)).toEqual(['lower', 'main', 'upper']);
  expect(['main', 'sunken', 'raised'].filter((id) => levelMatches(levels, id, 'main'))).toEqual([
    'main',
    'sunken'
  ]);
  expect(levelMatches(levels, 'main', 'sunken')).toBe(true);
  expect(levelMatches(levels, 'raised', 'main')).toBe(false);
});
test('display separation keeps physical split datums on the same logical floor', () => {
  expect(levelSeparation(levels, 'lower')).toBe(0);
  expect(levelSeparation(levels, 'raised')).toBe(0);
  expect(levelSeparation(levels, 'main')).toBe(16);
  expect(levelSeparation(levels, 'sunken')).toBe(16);
  expect(levelSeparation(levels, 'upper')).toBe(32);
});
test.each(['missing', 'sunken'])('unknown or cyclic logical group is rejected: %s', (group) => {
  expect(() =>
    validateBuilding({
      schemaVersion: 1,
      units: 'feet',
      levels: levels.map((l) => (l.id === 'main' ? { ...l, logicalGroup: group } : l)),
      rooms: [
        {
          id: 'r',
          name: 'Room',
          level: 'main',
          polygon: [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10]
          ],
          heightFeet: 10
        }
      ]
    })
  ).toThrow('Invalid logical floor group');
});
