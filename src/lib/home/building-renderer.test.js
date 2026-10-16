import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const captured = vi.hoisted(() => ({ scene: /** @type {any} */ (null) }));
// Browser/GPU boundaries only: scene, meshes, triangulation and world bounds are real Three.
vi.mock('three', async () => ({
  ...(await vi.importActual('three')),
  WebGLRenderer: class {
    domElement = { addEventListener() {}, remove() {} };
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    dispose() {}
    render(/** @type {import("three").Scene} */ scene) {
      captured.scene = scene;
    }
  }
}));
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { Vector3 } = /** @type {typeof import('three')} */ (await vi.importActual('three'));
  return {
    OrbitControls: class {
      target = new Vector3();
      update() {}
      saveState() {}
      dispose() {}
    }
  };
});
import { Box3 } from 'three';
import { validateBuilding } from './representative-building.js';
import { mountBuilding } from './building-renderer.js';
beforeEach(() => {
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
});
afterEach(() => vi.unstubAllGlobals());
test.each([false, true])('slab top honors its explicit datum with exploded=%s', (exploded) => {
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10]
  ];
  const model = validateBuilding({
    schemaVersion: 1,
    units: 'feet',
    levels: [
      { id: 'lower', elevationFeet: 0, heightFeet: 10 },
      { id: 'upper', elevationFeet: 10, heightFeet: 10 }
    ],
    rooms: [{ id: 'room', name: 'Room', level: 'upper', polygon: square, heightFeet: 10 }],
    floorEnvelopes: [
      { id: 'sunken-slab', level: 'upper', polygon: square, elevationFeet: 9, thicknessFeet: 0.5 }
    ],
    walls: [],
    features: [],
    roofs: [],
    assumptions: []
  });
  const viewer = mountBuilding(
    /** @type {any} */ ({ append() {}, clientWidth: 640, clientHeight: 480 }),
    model,
    { level: 'all', exploded, roofs: false },
    () => {}
  );
  try {
    /** @type {import("three").Mesh[]} */
    const meshes = [];
    captured.scene.traverse((/** @type {any} */ item) => {
      if (item.isMesh) meshes.push(item);
    });
    const slab = meshes.find((item) => item.userData.roomId === null);
    const room = meshes.find((item) => item.userData.isRoomFloor);
    if (!slab || !room) throw Error('Expected both structural slab and room floor');
    const separation = exploded ? 16 : 0;
    expect(new Box3().setFromObject(slab).max.y).toBeCloseTo(9 + separation, 6);
    expect(new Box3().setFromObject(slab).min.y).toBeCloseTo(8.5 + separation, 6);
    expect(new Box3().setFromObject(room).min.y).toBeCloseTo(10.005 + separation, 6);
  } finally {
    viewer.dispose();
  }
});

test.each([false, true])(
  'a logical floor includes its sunken room without extra exploded separation=%s',
  (exploded) => {
    const square = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ];
    const model = validateBuilding({
      schemaVersion: 1,
      units: 'feet',
      levels: [
        { id: 'main', elevationFeet: 10, heightFeet: 10 },
        { id: 'sunken', logicalGroup: 'main', elevationFeet: 9, heightFeet: 11 }
      ],
      rooms: [
        { id: 'main-room', name: 'Main', level: 'main', polygon: square, heightFeet: 10 },
        {
          id: 'sunken-room',
          name: 'Sunken',
          level: 'sunken',
          polygon: square.map(([x, y]) => [x + 15, y]),
          heightFeet: 11
        }
      ],
      walls: [],
      features: [],
      roofs: [],
      floorEnvelopes: [],
      assumptions: []
    });
    const viewer = mountBuilding(
      /** @type {any} */ ({ append() {}, clientWidth: 640, clientHeight: 480 }),
      model,
      { level: 'main', exploded, roofs: false },
      () => {}
    );
    try {
      /** @type {import('three').Mesh[]} */ const floors = [];
      captured.scene.traverse((/** @type {any} */ item) => {
        if (item.userData.isRoomFloor) floors.push(item);
      });
      expect(floors).toHaveLength(2);
      const main = floors.find((x) => x.userData.roomId === 'main-room'),
        sunken = floors.find((x) => x.userData.roomId === 'sunken-room');
      if (!main || !sunken) throw Error('Both grouped rooms required');
      expect(
        new Box3().setFromObject(main).min.y - new Box3().setFromObject(sunken).min.y
      ).toBeCloseTo(1, 6);
    } finally {
      viewer.dispose();
    }
  }
);
