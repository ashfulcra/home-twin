import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { wallPanels } from './representative-building.js';
/** @param {HTMLElement} host @param {any} model @param {any} options @param {(id:string)=>void} select */
export function mountBuilding(host, model, options, select) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor('#f3f0e9');
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9b8b71, 2.5));
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.position.set(80, 150, 90);
  scene.add(sun);
  /** @type {THREE.MeshStandardMaterial[]} */
  const materials = [];
  /** @param {THREE.ColorRepresentation} color */
  const material = (color, opacity = 1) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide
    });
    materials.push(m);
    return m;
  };
  const floorMat = material('#d8c8a6');
  const wallMat = material('#e6dfd0');
  const roofMat = material('#8a9690');
  const glass = material('#a5d7df', 0.35);
  const wood = material('#907151');
  const fixture = material('#b6b6ac');
  const selected = material('#79b3a0');
  const group = new THREE.Group();
  scene.add(group);
  /** @type {any[]} */
  const levels = model.levels;
  const shown = levels.filter((l) => options.level === 'all' || l.id === options.level);
  /** @param {any} l @param {number} [elevationFeet] */
  const offset = (l, elevationFeet = l.elevationFeet) =>
    elevationFeet + (options.exploded ? levels.indexOf(l) * 16 : 0);
  const levelById = new Map(levels.map((l) => [l.id, l]));
  /** @param {number[][]} polygon @param {number} y @param {number} depth @param {THREE.Material} mat @param {any} id @param {number[][][]} [holes] */
  function slab(polygon, y, depth, mat, id, holes = []) {
    const shape = new THREE.Shape();
    polygon.forEach((p, i) => (i ? shape.lineTo(p[0], -p[1]) : shape.moveTo(p[0], -p[1])));
    shape.closePath();
    for (const hole of holes) {
      const path = new THREE.Path();
      hole.forEach((p, i) => (i ? path.lineTo(p[0], -p[1]) : path.moveTo(p[0], -p[1])));
      path.closePath();
      shape.holes.push(path);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.userData.roomId = id;
    group.add(mesh);
    return mesh;
  }
  /** @param {THREE.Object3D} parent @param {number[]} size @param {number[]} pos @param {THREE.Material} mat @param {any} id */
  function box(parent, size, pos, mat, id) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.userData.roomId = id;
    parent.add(mesh);
    return mesh;
  }
  for (const f of model.floorEnvelopes) {
    if (!shown.some((l) => l.id === f.level)) continue;
    slab(
      f.polygon,
      offset(levelById.get(f.level), f.elevationFeet) - f.thicknessFeet,
      f.thicknessFeet,
      floorMat,
      null,
      f.holes
    );
  }
  for (const r of model.rooms) {
    if (!shown.some((l) => l.id === r.level)) continue;
    const l = levelById.get(r.level);
    const mesh = slab(
      r.polygon,
      offset(l) + 0.005,
      0.01,
      r.id === options.selected ? selected : floorMat,
      r.id,
      r.holes
    );
    mesh.userData.isRoomFloor = true;
  }
  for (const w of model.walls) {
    if (!shown.some((l) => l.id === w.level)) continue;
    const l = levelById.get(w.level),
      g = new THREE.Group();
    g.position.set(w.start[0], offset(l), w.start[1]);
    g.rotation.y = -Math.atan2(w.end[1] - w.start[1], w.end[0] - w.start[0]);
    group.add(g);
    const effective = options.cutaway
      ? {
          ...w,
          heightFeet: Math.min(w.heightFeet, 3),
          openings: w.openings
            .filter(/** @param {any} o */ (o) => o.sillFeet < 3)
            .map(
              /** @param {any} o */ (o) => ({
                ...o,
                heightFeet: Math.min(o.heightFeet, 3 - o.sillFeet)
              })
            )
        }
      : w;
    for (const p of wallPanels(effective))
      box(
        g,
        [p.width, p.height, w.thicknessFeet],
        [p.x + p.width / 2, p.y + p.height / 2, 0],
        wallMat,
        w.roomId
      );
    for (const o of w.openings) {
      if (o.kind === 'passage') continue;
      const h = options.cutaway
        ? Math.min(o.heightFeet, Math.max(0, 3 - o.sillFeet))
        : o.heightFeet;
      if (h > 0)
        box(
          g,
          [o.widthFeet, h, 0.06],
          [o.offsetFeet + o.widthFeet / 2, o.sillFeet + h / 2, 0],
          o.kind === 'window' ? glass : wood,
          w.roomId
        );
    }
  }
  for (const f of model.features) {
    if (!shown.some((l) => l.id === f.level)) continue;
    const l = levelById.get(f.level),
      y = offset(l),
      size = f.size;
    if (f.kind === 'finish') continue;
    if (f.polygon) {
      slab(f.polygon, y, size[2], floorMat, f.roomId);
      continue;
    }
    if (f.kind === 'ceiling' || f.kind === 'skylight') {
      if (!options.roofs) continue;
      const h =
        f.detailsData.clearanceFeet ??
        model.rooms.find((/** @type {any} */ r) => r.id === f.roomId)?.heightFeet ??
        l.heightFeet;
      if (f.kind === 'ceiling') {
        const cols = 4,
          rows = 3;
        for (let i = 0; i <= cols; i++)
          box(
            group,
            [0.3, 0.25, size[1]],
            [f.position[0] - size[0] / 2 + (size[0] * i) / cols, y + h, f.position[1]],
            wallMat,
            f.roomId
          );
        for (let i = 0; i <= rows; i++)
          box(
            group,
            [size[0], 0.25, 0.3],
            [f.position[0], y + h, f.position[1] - size[1] / 2 + (size[1] * i) / rows],
            wallMat,
            f.roomId
          );
      } else
        box(group, [size[0], 0.1, size[1]], [f.position[0], y + h, f.position[1]], glass, f.roomId);
      continue;
    }
    if (f.kind.includes('stair')) {
      const connected = f.detailsData.connectsLevels ?? [];
      const base = levelById.get(connected[0]),
        top = levelById.get(connected[1]);
      const rise = base && top ? top.elevationFeet - base.elevationFeet : size[2];
      const bottom = y - (f.level === connected[1] ? rise : 0);
      const n = 20;
      if (f.detailsData.shape?.includes('curved')) {
        const outer = Math.min(size[0], size[1]) / 2,
          inner = outer * 0.45;
        for (let i = 0; i < n; i++) {
          const a = Math.PI * (0.2 + (i * 1.3) / n),
            b = Math.PI * (0.2 + ((i + 1) * 1.3) / n);
          const polygon = [
            [inner * Math.cos(a), inner * Math.sin(a)],
            [outer * Math.cos(a), outer * Math.sin(a)],
            [outer * Math.cos(b), outer * Math.sin(b)],
            [inner * Math.cos(b), inner * Math.sin(b)]
          ].map((p) => [p[0] + f.position[0], p[1] + f.position[1]]);
          slab(polygon, bottom + (rise * (i + 1)) / n - 0.2, 0.2, wood, f.roomId);
        }
      } else {
        const width = Math.min(5, size[0] / 2),
          run = size[1],
          half = n / 2;
        for (let i = 0; i < n; i++) {
          const forward = i < half,
            j = forward ? i : n - 1 - i;
          box(
            group,
            [width, 0.2, run / half],
            [
              f.position[0] + (forward ? -width / 2 : width / 2),
              bottom + (rise * (i + 1)) / n - 0.1,
              f.position[1] - run / 2 + (run * (j + 0.5)) / half
            ],
            wood,
            f.roomId
          );
        }
      }
    } else {
      const h = options.cutaway ? Math.min(size[2], 3) : size[2];
      box(
        group,
        [size[0], h, size[1]],
        [f.position[0], y + h / 2, f.position[1]],
        f.kind.includes('fire') ? wood : fixture,
        f.roomId
      );
    }
  }
  if (options.roofs)
    for (const r of model.roofs) {
      if (!shown.some((l) => l.id === r.level)) continue;
      const l = levelById.get(r.level);
      slab(
        r.polygon,
        r.elevationFeet + (options.exploded ? levels.indexOf(l) * 16 : 0),
        r.thicknessFeet,
        roofMat,
        null
      );
    }
  const bounds = new THREE.Box3().setFromObject(group),
    center = bounds.getCenter(new THREE.Vector3()),
    size = bounds.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 20);
  camera.position.set(center.x + span * 0.75, center.y + span * 0.85, center.z + span * 0.75);
  controls.target.copy(center);
  controls.update();
  controls.saveState();
  if (options.pose) {
    camera.position.fromArray(options.pose.position);
    controls.target.fromArray(options.pose.target);
    controls.update();
  }
  const ray = new THREE.Raycaster(),
    mouse = new THREE.Vector2();
  /** @type {number[]|null} */
  let down = null;
  /** @param {PointerEvent} e */
  const pointerdown = (e) => (down = [e.clientX, e.clientY]);
  /** @param {PointerEvent} e */
  const pointerup = (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const b = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - b.left) / b.width) * 2 - 1, (-(e.clientY - b.top) / b.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(group.children, true).find((x) => x.object.userData.roomId);
    if (hit) select(hit.object.userData.roomId);
  };
  renderer.domElement.addEventListener('pointerdown', pointerdown);
  renderer.domElement.addEventListener('pointerup', pointerup);
  const observer = new ResizeObserver(() => {
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
  });
  observer.observe(host);
  let frame = 0;
  const animate = () => {
    frame = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
  return {
    selectRoom: (/** @type {string} */ id) =>
      group.traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.isRoomFloor)
          o.material = o.userData.roomId === id ? selected : floorMat;
      }),
    pose: () => ({ position: camera.position.toArray(), target: controls.target.toArray() }),
    reset: () => controls.reset(),
    dispose: () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
