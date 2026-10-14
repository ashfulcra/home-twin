import { createHash } from 'node:crypto';
import { validateBuilding } from '../home/representative-building.js';
import { validHomeRoot } from '../home/home-root.js';
const maxPackage = 2 * 1024 * 1024;
const hash = (/** @type {Uint8Array} */ b) => createHash('sha256').update(b).digest('hex');
const held = (/** @type {string} */ message, status = 409) =>
  Object.assign(new Error(message), { status });
function owner(/** @type {any} */ a) {
  if (
    !a ||
    a.role !== 'maintainer' ||
    !a.userId ||
    a.userId !== a.ownerUserId ||
    a.home?.ownerUserId !== a.userId ||
    !a.file?.id ||
    typeof a.file.text !== 'string' ||
    !validHomeRoot(a.home?.id, a.root)
  )
    throw held('Current home owner required', 403);
}
function bounded(/** @type {any} */ f, /** @type {number} */ max) {
  if (
    !f ||
    typeof f.id !== 'string' ||
    !f.id ||
    !(f.bytes instanceof Uint8Array) ||
    !f.bytes.length ||
    f.bytes.length > max
  )
    throw held('Comparison bytes unavailable or oversized', 503);
  return f.bytes;
}
/** The archive is data-only: raw HTML or active content never enters the renderer.
 * This loader performs no publication or model acceptance.
 * @param {any} access @param {{read:(path:string,max:number)=>Promise<any>}} reader
 * @param {()=>Promise<any>} recheck @param {string} [expectedDigest] */
export async function loadModelComparison(access, reader, recheck, expectedDigest) {
  owner(access);
  const root = access.root,
    baseline = hash(new TextEncoder().encode(access.file.text)),
    initial = {
      userId: access.userId,
      homeId: access.home.id,
      fileId: access.file.id,
      fileText: access.file.text
    };
  async function canonical() {
    const f = await reader.read(root + '/home.json', 2 * 1024 * 1024);
    if (f?.id !== initial.fileId || hash(bounded(f, 2 * 1024 * 1024)) !== baseline)
      throw held('Home changed during comparison check');
  }
  async function current() {
    await canonical();
    const a = await recheck();
    owner(a);
    if (
      a.userId !== initial.userId ||
      a.root !== root ||
      a.home.id !== initial.homeId ||
      a.file.id !== initial.fileId ||
      a.file.text !== initial.fileText
    )
      throw held('Owner/home changed during comparison check');
  }
  await canonical();
  const pointer = await reader.read(root + '/model-comparison.json', 2048);
  if (pointer === null) {
    await current();
    return null;
  }
  const pointerBytes = bounded(pointer, 2048),
    pointerId = pointer.id,
    pointerHash = hash(pointerBytes);
  let index;
  try {
    index = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(pointerBytes));
  } catch {
    throw held('Comparison pointer needs review');
  }
  if (
    index?.schema !== 'home-twin-model-comparison-pointer/1' ||
    index.homeId !== access.home.id ||
    typeof index.digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(index.digest) ||
    typeof index.frozenAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(index.frozenAt)
  )
    throw held('Comparison pointer needs review');
  if (expectedDigest !== undefined && expectedDigest !== index.digest)
    throw held('Comparison changed; refresh its review');
  const bytes = new Uint8Array(
    bounded(
      await reader.read(root + '/model-comparison/' + index.digest + '.json', maxPackage),
      maxPackage
    )
  );
  if (hash(bytes) !== index.digest) throw held('Comparison archived bytes differ');
  const after = await reader.read(root + '/model-comparison.json', 2048);
  if (after?.id !== pointerId || hash(bounded(after, 2048)) !== pointerHash)
    throw held('Comparison pointer changed');
  let p;
  try {
    p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (
      p.schema !== 'home-twin-model-comparison/1' ||
      p.homeId !== initial.homeId ||
      p.frozenAt !== index.frozenAt ||
      !p.models
    )
      throw Error('Invalid archive');
    for (const key of ['current', 'a', 'b']) p.models[key] = validateBuilding(p.models[key]);
  } catch {
    throw held('Comparison data needs review');
  }
  await current();
  return {
    digest: index.digest,
    frozenAt: index.frozenAt,
    models: { current: p.models.current, a: p.models.a, b: p.models.b }
  };
}
