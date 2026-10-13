import { test, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { withChatLock } from '../../../scripts/chat-lock.mjs';
test('a crashed lock holder releases coordination without unlinking any live lock', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'chat-lock-')),
    path = join(dir, 'conversation.json'),
    module = new URL('../../../scripts/chat-lock.mjs', import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import {withChatLock} from ${JSON.stringify(module)};await withChatLock(${JSON.stringify(path)},async()=>{process.stdout.write('held');setInterval(()=>{},1000);await new Promise(()=>{});});`
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] }
  );
  await once(child.stdout, 'data');
  try {
    await expect(withChatLock(path, async () => true)).rejects.toThrow(/locked/i);
  } finally {
    const ended = once(child, 'exit');
    child.kill('SIGKILL');
    await ended;
  }
  expect(await withChatLock(path, async () => true)).toBe(true);
});
