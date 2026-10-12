import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
export function createSourceGroup() {
  const root = new THREE.Group();
  root.scale.z = -1;
  return root;
}
/** @param {THREE.Object3D[]} objects */
export function sourceViewBounds(objects) {
  const bounds = new THREE.Box3();
  for (const node of objects)
    if (node.visible) {
      node.updateWorldMatrix(true, true);
      bounds.expandByObject(node);
    }
  return bounds;
}
/** Release every allocation after failed initialization, or once after a successful mount.
 * @template T
 * @param {(own:(release:()=>void)=>void,dispose:()=>void)=>T} setup */
export function withAssemblyResources(setup) {
  /** @type {Array<()=>void>} */ const releases = [];
  let done = false;
  const dispose = () => {
    if (done) return;
    done = true;
    for (const release of releases.reverse()) {
      try {
        release();
      } catch {
        /* Continue releasing other resources. */
      }
    }
  };
  try {
    return setup((release) => releases.push(release), dispose);
  } catch (error) {
    dispose();
    throw error;
  }
}
/** Exact source mesh renderer; render-only north reflection, no registration/fitting.
 * @param {HTMLElement} host @param {any} model @param {Uint8Array} bytes @param {(id:string)=>void} onselect */
export function mountAssembly(host, model, bytes, onselect) {
  return withAssemblyResources((own, dispose) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f8faf7');
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000),
      renderer = new THREE.WebGLRenderer({ antialias: true });
    own(() => {
      renderer.dispose();
      renderer.domElement.remove();
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.replaceChildren(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    own(() => controls.dispose());
    controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x818b75, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(50, 90, 30);
    scene.add(light);
    const root = createSourceGroup();
    scene.add(root);
    own(() =>
      root.traverse((n) => {
        if (n instanceof THREE.Mesh) {
          n.geometry.dispose();
          (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => m.dispose());
        }
      })
    );
    const original = new OBJLoader().parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    root.add(original);
    const parts = new Map(model.sceneParts.map((/** @type {any} */ p) => [p.name, p]));
    /** @type {any[]} */ const objects = [];
    /** @type {THREE.Mesh[]} */ const hits = [];
    original.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const p = parts.get(node.name) ?? { kind: 'other', level: null };
      (Array.isArray(node.material) ? node.material : [node.material]).forEach((m) => m.dispose());
      node.material = new THREE.MeshStandardMaterial({
        color:
          p.kind === 'floor'
            ? 0xe6ddc7
            : p.kind === 'stair'
              ? 0xa49677
              : p.kind === 'roof'
                ? 0x9daab4
                : p.kind === 'masonry'
                  ? 0x9d9990
                  : 0xadafaa,
        side: THREE.DoubleSide,
        roughness: 0.9
      });
      node.userData.sourcePart = p;
      objects.push(node);
    });
    for (const r of model.rooms) {
      const shape = new THREE.Shape(
        r.polygon.map((/** @type {number[]} */ p) => new THREE.Vector2(p[0], p[1]))
      );
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(Math.PI / 2);
      geometry.translate(0, r.floorElevationFeet + 0.025, 0);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: 0x55a582,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      mesh.userData.roomId = r.id;
      mesh.userData.level = r.level;
      root.add(mesh);
      hits.push(mesh);
    }
    let level = 'all',
      roofs = false,
      ceilings = false,
      cutaway = true,
      selected = '',
      disposed = false,
      frame = 0;
    own(() => {
      disposed = true;
      cancelAnimationFrame(frame);
    });
    function reset() {
      const bbox = sourceViewBounds(objects);
      if (bbox.isEmpty()) return;
      const center = bbox.getCenter(new THREE.Vector3()),
        size = bbox.getSize(new THREE.Vector3()),
        distance = Math.max(size.x, size.y, size.z) * 0.95;
      camera.position.set(
        center.x + distance * 0.55,
        center.y + distance * 0.7,
        center.z + distance
      );
      controls.target.copy(center);
      controls.update();
    }
    function apply() {
      for (const node of objects) {
        const p = node.userData.sourcePart;
        node.visible =
          (level === 'all' || p.level === level || p.kind === 'roof') &&
          (roofs || p.kind !== 'roof') &&
          (ceilings || p.kind !== 'ceiling');
        node.material.transparent = cutaway && p.kind === 'wall';
        node.material.opacity = cutaway && p.kind === 'wall' ? 0.32 : 1;
        node.material.depthWrite = !node.material.transparent;
      }
      for (const node of hits) {
        node.visible = level === 'all' || node.userData.level === level;
        /** @type {THREE.MeshBasicMaterial} */ (node.material).opacity =
          node.userData.roomId === selected ? 0.4 : 0;
      }
    }
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    function click(/** @type {MouseEvent} */ e) {
      const b = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - b.left) / b.width) * 2 - 1,
        (-(e.clientY - b.top) / b.height) * 2 + 1
      );
      ray.setFromCamera(pointer, camera);
      const h = ray.intersectObjects(hits).find((h) => h.object.visible);
      if (h) onselect(h.object.userData.roomId);
    }
    renderer.domElement.addEventListener('click', click);
    own(() => renderer.domElement.removeEventListener('click', click));
    const observer = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (w && h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
    });
    own(() => observer.disconnect());
    observer.observe(host);
    apply();
    reset();
    function animate() {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }
    animate();
    return {
      reset,
      filter: (/** @type {any} */ o) => {
        const previousLevel = level;
        level = o.level ?? 'all';
        roofs = !!o.roofs;
        ceilings = !!o.ceilings;
        cutaway = o.cutaway !== false;
        selected = o.selected ?? '';
        apply();
        if (previousLevel !== level) reset();
      },
      dispose
    };
  });
}
