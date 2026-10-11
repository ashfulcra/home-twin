import { describe, it, expect } from 'vitest';
import { validateBuilding, wallPanels } from './representative-building.js';
/** @returns {any} */
const sample = () => ({
  schemaVersion: 1,
  units: 'feet',
  levels: [{ id: 'ground', elevationFeet: 0, heightFeet: 10 }],
  rooms: [
    {
      id: 'living',
      name: 'Living',
      level: 'ground',
      polygon: [
        [0, 0],
        [20, 0],
        [20, 15],
        [0, 15]
      ],
      heightFeet: 10,
      sourcePage: 1,
      sourceSheet: 'A1',
      basis: 'source trace'
    }
  ],
  walls: [
    {
      id: 'south',
      level: 'ground',
      start: [0, 15],
      end: [20, 15],
      heightFeet: 10,
      thicknessFeet: 0.5,
      basis: 'estimated',
      openings: [
        {
          id: 'door',
          kind: 'door',
          offsetFeet: 4,
          widthFeet: 3,
          sillFeet: 0,
          heightFeet: 7,
          basis: 'estimated'
        }
      ]
    }
  ],
  features: [],
  roofs: [],
  assumptions: [
    { id: 'wall-thickness', subject: 'Walls', value: '6 inches', reason: 'Representative estimate' }
  ]
});
describe('representative building', () => {
  it('preserves physical levels, room footprints and explicit assumptions', () => {
    const m = validateBuilding(sample());
    expect(m.levels[0].heightFeet).toBe(10);
    expect(m.rooms[0].polygon[2]).toEqual([20, 15]);
    expect(m.assumptions[0].reason).toContain('estimate');
  });
  it('makes an actual door void with a lintel, not an opaque wall', () => {
    const w = sample().walls[0];
    const panels = wallPanels(w);
    expect(panels).toEqual([
      { x: 0, y: 0, width: 4, height: 10 },
      { x: 4, y: 7, width: 3, height: 3 },
      { x: 7, y: 0, width: 13, height: 10 }
    ]);
    expect(panels.some((p) => p.x === 4 && p.y === 0)).toBe(false);
  });
  it('retains window sill and head wall areas', () => {
    const w = sample().walls[0];
    w.openings[0] = { ...w.openings[0], kind: 'window', sillFeet: 3, heightFeet: 4 };
    expect(wallPanels(w)).toContainEqual({ x: 4, y: 0, width: 3, height: 3 });
    expect(wallPanels(w)).toContainEqual({ x: 4, y: 7, width: 3, height: 3 });
  });
  it('rejects off-host or intersecting openings', () => {
    const m = sample();
    m.walls[0].openings[0].offsetFeet = 19;
    expect(() => validateBuilding(m)).toThrow();
    m.walls[0].openings[0].offsetFeet = 4;
    m.walls[0].openings.push({ ...m.walls[0].openings[0], id: 'other', offsetFeet: 5 });
    expect(() => validateBuilding(m)).toThrow();
  });
  it('rejects crossed roof and feature polygons', () => {
    const m = sample();
    m.roofs = [
      {
        id: 'roof',
        level: 'ground',
        polygon: [
          [0, 0],
          [10, 10],
          [0, 10],
          [10, 0]
        ],
        elevationFeet: 10,
        thicknessFeet: 0.5
      }
    ];
    expect(() => validateBuilding(m)).toThrow();
    m.roofs = [];
    m.features = [
      {
        id: 'terrace',
        level: 'ground',
        position: [0, 0],
        size: [0, 0, 0.5],
        polygon: [
          [0, 0],
          [10, 10],
          [0, 10],
          [10, 0]
        ]
      }
    ];
    expect(() => validateBuilding(m)).toThrow();
  });
  it('keeps absent drawing references absent', () => {
    const m = sample();
    delete m.rooms[0].sourcePage;
    delete m.rooms[0].sourceSheet;
    expect(validateBuilding(m).rooms[0].sourcePage).toBeNull();
  });
  it('retains slab voids for open-to-below areas', () => {
    const m = sample();
    m.rooms[0].holes = [
      [
        [2, 2],
        [4, 2],
        [4, 4],
        [2, 4]
      ]
    ];
    m.floorEnvelopes = [
      {
        id: 'floor',
        level: 'ground',
        polygon: [
          [0, 0],
          [20, 0],
          [20, 15],
          [0, 15]
        ],
        holes: m.rooms[0].holes,
        elevationFeet: 0,
        thicknessFeet: 0.5
      }
    ];
    expect(validateBuilding(m).floorEnvelopes[0].holes).toHaveLength(1);
  });
  it('rejects holes outside a slab or overlapping another void', () => {
    const m = sample();
    m.rooms[0].holes = [
      [
        [30, 30],
        [32, 30],
        [32, 32],
        [30, 32]
      ]
    ];
    expect(() => validateBuilding(m)).toThrow();
    m.rooms[0].holes = [
      [
        [2, 2],
        [6, 2],
        [6, 6],
        [2, 6]
      ],
      [
        [4, 4],
        [8, 4],
        [8, 8],
        [4, 8]
      ]
    ];
    expect(() => validateBuilding(m)).toThrow();
  });
  it('rejects malformed renderer metadata', () => {
    const m = sample();
    m.features = [
      {
        id: 'stair',
        name: 'Stair',
        kind: 'stair',
        level: 'ground',
        position: [10, 10],
        size: [4, 10, 10],
        details: { shape: 42 }
      }
    ];
    expect(() => validateBuilding(m)).toThrow();
    m.features[0].details = { clearanceFeet: '12' };
    expect(() => validateBuilding(m)).toThrow();
  });
  it('rejects invalid geometry and undeclared levels', () => {
    const m = sample();
    m.walls[0].start[0] = NaN;
    expect(() => validateBuilding(m)).toThrow();
    const b = sample();
    b.rooms[0].level = 'missing';
    expect(() => validateBuilding(b)).toThrow();
  });
});
