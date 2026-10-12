import { readFileSync, lstatSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importAssembly, assemblyDigest } from './assembly-import.mjs';
import { assertExternalState } from './maintainer-journal.mjs';
const [sourceRoot, manifestPath, homeId, canonicalPath, canonicalFileVersion, output, ...extra] =
  process.argv.slice(2);
try {
  if (
    !sourceRoot ||
    !manifestPath ||
    !homeId ||
    !canonicalPath ||
    !canonicalFileVersion ||
    !output ||
    extra.length
  )
    throw Error(
      'Usage: node scripts/import-assembly.mjs SOURCE_ROOT MANIFEST_RELATIVE_PATH HOME_ID CANONICAL_JSON CANONICAL_FILE_VERSION EXISTING_PRIVATE_OUTPUT. Offline preview only; no accepted model or remote writes.'
    );
  const root = resolve(sourceRoot),
    dir = resolve(output),
    repo = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
  const rs = lstatSync(root);
  if (rs.isSymbolicLink() || !rs.isDirectory())
    throw Error('Explicit non-symlink source directory required');
  assertExternalState(dir, repo);
  const ds = lstatSync(dir);
  if (ds.isSymbolicLink() || !ds.isDirectory() || ds.mode & 0o077)
    throw Error('Existing private non-symlink output directory required');
  function bounded(/** @type {string} */ file, /** @type {number} */ max) {
    const st = lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile() || st.size > max)
      throw Error('Bounded regular non-symlink source file required');
    const b = readFileSync(file);
    if (b.length > max) throw Error('Source byte limit exceeded');
    return b;
  }
  function source(/** @type {string} */ relative, /** @type {number} */ max) {
    if (
      typeof relative !== 'string' ||
      isAbsolute(relative) ||
      !relative ||
      relative.length > 500 ||
      relative.includes('\\') ||
      relative.split('/').some((p) => !p || p === '..' || p === '.' || !/^[A-Za-z0-9_.-]+$/.test(p))
    )
      throw Error('Manifest source path must stay inside explicit source root');
    let current = root;
    for (const part of relative.split('/')) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink()) throw Error('Symlink source path not permitted');
    }
    if (!realpathSync(current).startsWith(realpathSync(root) + sep))
      throw Error('Source path escaped root');
    return bounded(current, max);
  }
  const assemblyBytes = source(manifestPath, 3 * 1024 * 1024),
    a = JSON.parse(assemblyBytes.toString('utf8'));
  if (
    !a.baseline?.models ||
    Object.keys(a.baseline.models).length > 20 ||
    typeof a.obj !== 'string' ||
    a.obj.includes('/') ||
    a.obj.includes('\\')
  )
    throw Error('Bounded source manifest references required');
  /** @type {Record<string,Uint8Array>} */ const models = {};
  for (const [level, m] of Object.entries(a.baseline.models)) {
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(level)) throw Error('Source level ID required');
    models[level] = source(m.path, 3 * 1024 * 1024);
  }
  const meshBytes = source(
      (dirname(manifestPath) === '.' ? '' : dirname(manifestPath) + '/') + a.obj,
      16 * 1024 * 1024
    ),
    canonicalBytes = bounded(resolve(canonicalPath), 2 * 1024 * 1024),
    home = JSON.parse(canonicalBytes.toString('utf8'));
  if (
    home?.id !== homeId ||
    !Number.isInteger(home?.revision) ||
    home.revision < 1 ||
    typeof home.ownerUserId !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(home.ownerUserId)
  )
    throw Error('Explicit canonical home baseline required');
  const preview = importAssembly(
    { assemblyBytes, models, meshBytes },
    { homeId, canonicalFileVersion, canonicalDigest: assemblyDigest(canonicalBytes) }
  );
  const previewBytes = Buffer.from(JSON.stringify(preview, null, 2));
  const files = new Map([
    [preview.mesh.filename, meshBytes],
    [assemblyDigest(assemblyBytes) + '.json', assemblyBytes],
    ...Object.values(models).map((b) => [assemblyDigest(b) + '.json', b]),
    ['preview.json', previewBytes]
  ]);
  // Preflight the complete output set before creating any file; never overwrite history.
  for (const [name, b] of files) {
    const path = join(dir, name);
    try {
      const st = lstatSync(path);
      if (
        st.isSymbolicLink() ||
        !st.isFile() ||
        st.mode & 0o077 ||
        st.size !== b.length ||
        !readFileSync(path).equals(b)
      )
        throw Error('Private output already differs; preserve it and choose a new directory');
    } catch (e) {
      if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT')) throw e;
    }
  }
  for (const [name, b] of files) {
    try {
      writeFileSync(join(dir, name), b, { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if (
        !(e && typeof e === 'object' && 'code' in e && e.code === 'EEXIST') ||
        !readFileSync(join(dir, name)).equals(b)
      )
        throw e;
    }
  }
  console.log(
    JSON.stringify({
      status: preview.status,
      homeId,
      preview: join(dir, 'preview.json'),
      previewDigest: assemblyDigest(previewBytes),
      rooms: preview.rooms.length,
      walls: preview.walls.length,
      openings: preview.walls.reduce((n, w) => n + w.openings.length, 0),
      sourceReceipts: preview.sourceReceipts,
      remoteWrites: false
    })
  );
} catch (e) {
  console.error(
    e instanceof Error ? e.message : 'Assembly import held; preserve source and prior output.'
  );
  process.exitCode = 1;
}
