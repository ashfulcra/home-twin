import { DatabaseSync } from 'node:sqlite';
import { open, lstat } from 'node:fs/promises';
/** Kernel-backed transaction ownership releases after a process crash, without
 * deleting, expiring or stealing another live process's lock. No secrets are
 * stored in the coordination database. Legacy unverifiable locks stay held.
 * @param {string} path @param {()=>Promise<any>} action */
export async function withChatLock(path, action) {
  try {
    await lstat(path + '.lock');
    throw Error('Legacy conversation lock needs verified recovery');
  } catch (e) {
    if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'ENOENT') throw e;
  }
  const file = path + '.coord.sqlite';
  try {
    const f = await open(file, 'wx', 0o600);
    await f.close();
  } catch (e) {
    if (!e || typeof e !== 'object' || !('code' in e) || e.code !== 'EEXIST') throw e;
  }
  const st = await lstat(file);
  if (!st.isFile() || st.isSymbolicLink() || st.mode & 0o077)
    throw Error('Private coordination file required');
  const db = new DatabaseSync(file);
  let locked = false;
  try {
    try {
      db.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE;');
      locked = true;
    } catch {
      throw Error('Conversation locked; retry later');
    }
    return await action();
  } finally {
    if (locked) db.exec('ROLLBACK');
    db.close();
  }
}
