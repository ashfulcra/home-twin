import { test, expect } from 'vitest';
import { mkdtemp, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadHouseModels } from '../../../scripts/chat-model-settings.mjs';
test('private key file is consumed only for its configured home and never returned in status', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'model-key-'));
  const keyFile = join(dir, 'key.txt');
  await writeFile(keyFile, 'synthetic-anthropic-key\n', { mode: 0o600 });
  const map = await loadHouseModels([
    { homeId: 'example', model: { provider: 'anthropic', model: 'explicit-model', keyFile } },
    { homeId: 'second' }
  ]);
  expect(map.get('example')).toHaveProperty('stream');
  expect(map.has('second')).toBe(false);
});
test('publicly readable or linked credential files are rejected', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'model-key-')),
    keyFile = join(dir, 'key.txt');
  await writeFile(keyFile, 'synthetic-anthropic-key', { mode: 0o644 });
  await expect(
    loadHouseModels([
      { homeId: 'example', model: { provider: 'anthropic', model: 'explicit-model', keyFile } }
    ])
  ).rejects.toThrow(/private/i);
  const link = join(dir, 'link.txt');
  await symlink(keyFile, link);
  await expect(
    loadHouseModels([
      {
        homeId: 'example',
        model: { provider: 'anthropic', model: 'explicit-model', keyFile: link }
      }
    ])
  ).rejects.toThrow(/private/i);
});
