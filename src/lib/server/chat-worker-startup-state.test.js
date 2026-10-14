import { test, expect, vi } from 'vitest';
import { mkdtemp, mkdir, access, lstat, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const transport = vi.hoisted(() => ({ realListeners: 0, closed: 0 }));
vi.mock('node:http', () => ({
  createServer: () => ({
    once() {},
    listen(_port, _host, ready) {
      ready();
    },
    close() {
      transport.closed++;
    }
  })
}));
vi.mock('../../../scripts/chat-model-settings.mjs', () => ({
  loadHouseModels: async () => new Map()
}));
import { startChatService } from '../../../scripts/home-chat-service.mjs';

async function config(/** @type {boolean} */ existing) {
  const root = await mkdtemp(join(tmpdir(), 'chat-startup-state-'));
  const directory = join(root, 'runtime'),
    state = join(root, 'maintainer');
  await mkdir(directory, { mode: 0o700 });
  if (existing) {
    await mkdir(state, { mode: 0o700 });
    await writeFile(join(state, 'checkpoint.json'), 'Retained synthetic native history.', {
      mode: 0o600
    });
  }
  return {
    key: 'synthetic-service-key-for-an-isolated-startup-test',
    directory,
    port: 0,
    homes: [
      {
        homeId: 'example',
        ownerUserId: '33333333-3333-4333-8333-333333333333',
        root: '/Example/twin',
        recordActions: true,
        modelReviews: true,
        modelActions: true,
        sourceActions: true,
        maintainerDirectory: state
      }
    ]
  };
}

test('whole service startup rejects a missing designated state before record setup can recreate it', async () => {
  const c = await config(false),
    state = c.homes[0].maintainerDirectory;
  await expect(startChatService(c)).rejects.toThrow(/ENOENT|existing|maintainer/i);
  await expect(access(state)).rejects.toMatchObject({ code: 'ENOENT' });
  expect(transport.realListeners).toBe(0);
});

test('whole service startup preserves existing native state identity and history', async () => {
  const c = await config(true),
    state = c.homes[0].maintainerDirectory;
  const before = await lstat(state),
    history = await readFile(join(state, 'checkpoint.json'));
  const server = await startChatService(c);
  server.close();
  const after = await lstat(state);
  expect({ dev: after.dev, ino: after.ino }).toEqual({ dev: before.dev, ino: before.ino });
  expect(await readFile(join(state, 'checkpoint.json'))).toEqual(history);
  expect(transport.realListeners).toBe(0);
});
