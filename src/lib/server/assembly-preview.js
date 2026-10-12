import { importAssembly, assemblyDigest } from '../../../scripts/assembly-import.mjs';
import { canonicalJSON } from '../home/canonical-json.js';
import { validHomeRoot } from '../home/home-root.js';
const hex = /^[a-f0-9]{64}$/;
function held(/** @type {string} */ message, /** @type {number} */ status = 409) {
  return Object.assign(new Error(message), { status });
}
function owner(/** @type {any} */ a) {
  if (
    !a ||
    a.role !== 'maintainer' ||
    a.userId !== a.ownerUserId ||
    a.home?.ownerUserId !== a.userId ||
    !a.file?.id ||
    typeof a.file.text !== 'string' ||
    !validHomeRoot(a.home?.id, a.root)
  )
    throw held('Only the current home owner can read its private source preview', 403);
}
function data(/** @type {any} */ file, /** @type {number} */ max) {
  if (
    !file ||
    typeof file.id !== 'string' ||
    !(file.bytes instanceof Uint8Array) ||
    !file.bytes.length ||
    file.bytes.length > max
  )
    throw held('Preview source is missing or exceeds its bound', 503);
  return file.bytes;
}
function json(/** @type {any} */ file, /** @type {number} */ max) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data(file, max)));
}
/** Read-only, current-owner source package validation. Source text never confers authority.
 * @param {any} access @param {{read:(path:string,max:number)=>Promise<any>}} reader
 * @param {()=>Promise<any>} recheck @param {string} [expectedDigest] */
export async function loadAssemblyPreview(access, reader, recheck, expectedDigest) {
  owner(access);
  const root = access.root,
    baselineDigest = assemblyDigest(new TextEncoder().encode(access.file.text));
  async function canonical() {
    const file = await reader.read(root + '/home.json', 2 * 1024 * 1024),
      bytes = data(file, 2 * 1024 * 1024);
    if (file.id !== access.file.id || assemblyDigest(bytes) !== baselineDigest)
      throw held('Home baseline changed; refresh before viewing this source preview');
  }
  async function current() {
    const a = await recheck();
    owner(a);
    if (
      a.userId !== access.userId ||
      a.root !== root ||
      a.home.id !== access.home.id ||
      a.file.id !== access.file.id ||
      a.file.text !== access.file.text
    )
      throw held('Current owner/home changed during source preview');
    await canonical();
  }
  await canonical();
  const pointer = await reader.read(root + '/assembly-preview.json', 2048);
  if (pointer === null) {
    await current();
    return null;
  }
  const index = json(pointer, 2048);
  if (
    index.schema !== 'home-twin-assembly-preview-pointer/1' ||
    index.homeId !== access.home.id ||
    typeof index.digest !== 'string' ||
    !hex.test(index.digest)
  )
    throw held('Private source preview pointer needs review');
  if (expectedDigest !== undefined && expectedDigest !== index.digest)
    throw held('Source preview changed; refresh the model');
  const folder = root + '/assembly-preview/',
    file = await reader.read(folder + index.digest + '.json', 512 * 1024),
    bytes = data(file, 512 * 1024);
  if (assemblyDigest(bytes) !== index.digest) throw held('Private source preview bytes differ');
  const p = json(file, 512 * 1024),
    binding = p.homeBinding;
  if (
    p.schema !== 'home-twin-assembly-preview/1' ||
    p.status !== 'source-preview-needs-review' ||
    binding?.homeId !== access.home.id ||
    typeof binding?.canonicalFileVersion !== 'string' ||
    !binding.canonicalFileVersion ||
    binding.canonicalFileVersion.length > 300 ||
    typeof binding?.canonicalDigest !== 'string' ||
    !hex.test(binding.canonicalDigest)
  )
    throw held('Source preview has an invalid home baseline binding');
  if (
    !Array.isArray(p.sourceReceipts) ||
    p.sourceReceipts.length < 3 ||
    p.sourceReceipts.length > 22
  )
    throw held('Bounded source receipts required');
  const seen = new Set();
  /** @type {Record<string,Uint8Array>} */ const sources = {};
  for (const receipt of p.sourceReceipts) {
    if (
      typeof receipt?.id !== 'string' ||
      !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(receipt.id) ||
      seen.has(receipt.id) ||
      typeof receipt.sha256 !== 'string' ||
      !hex.test(receipt.sha256)
    )
      throw held('Source receipt identity differs');
    seen.add(receipt.id);
    const mesh = receipt.id === 'mesh',
      source = data(
        await reader.read(
          folder + receipt.sha256 + (mesh ? '.obj' : '.json'),
          mesh ? 16 * 1024 * 1024 : 3 * 1024 * 1024
        ),
        mesh ? 16 * 1024 * 1024 : 3 * 1024 * 1024
      );
    if (assemblyDigest(source) !== receipt.sha256) throw held('Archived source bytes differ');
    sources[receipt.id] = source;
  }
  if (!sources.assembly || !sources.mesh)
    throw held('Original assembly and mesh receipts required');
  const { assembly: assemblyBytes, mesh: meshBytes, ...models } = sources;
  const rebuilt = importAssembly({ assemblyBytes, models, meshBytes }, binding);
  if (canonicalJSON(rebuilt) !== canonicalJSON(p))
    throw held('Source preview projection differs from original evidence');
  await current();
  const after = await reader.read(root + '/assembly-preview.json', 2048);
  if (
    !after ||
    after.id !== pointer.id ||
    assemblyDigest(data(after, 2048)) !== assemblyDigest(data(pointer, 2048))
  )
    throw held('Source preview pointer changed during the check');
  // Historical source provenance is readable, but never current model acceptance authority.
  const baselineCurrent =
    binding.canonicalFileVersion === access.file.id && binding.canonicalDigest === baselineDigest;
  return { previewDigest: index.digest, model: rebuilt, meshBytes, baselineCurrent };
}
