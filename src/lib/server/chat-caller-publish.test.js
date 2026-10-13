import { test, expect, vi } from 'vitest';
vi.mock('node:child_process', () => ({
  execFileSync: () => {
    throw Error('CLI credentials must not be borrowed');
  }
}));
import { createCallerMaintainerClient } from '../../../scripts/fulcra-ingest.mjs';
test('web publication transport requires the current caller and never falls back to CLI authentication', async () => {
  /** @type {any[]} */ const calls = [];
  const send = async (/** @type {any} */ url, /** @type {any} */ options) => {
    calls.push({ url, options });
    return Response.json({ files: [] });
  };
  const client = createCallerMaintainerClient(
    'example',
    { root: '/Example/twin', checkSources: true },
    'current-own-token',
    send
  );
  expect(await client.readSnapshot('/Example/twin/history/' + 'a'.repeat(64) + '.json')).toBeNull();
  expect(calls[0].options.headers.Authorization).toBe('Bearer current-own-token');
  expect(() =>
    createCallerMaintainerClient(
      'example',
      { root: '/Example/twin' },
      /** @type {any} */ (undefined),
      send
    )
  ).toThrow(/caller/i);
  await expect(client.write('/Other/twin/home.json', {}, async () => {})).rejects.toThrow(
    /intended|scope/i
  );
  expect(calls).toHaveLength(1);
});
