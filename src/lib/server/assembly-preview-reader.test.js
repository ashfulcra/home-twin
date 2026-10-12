import { test, expect, vi } from 'vitest';
import { assemblyPreviewReader } from './assembly-preview-reader.js';
test('source reader uses current caller GETs and exact unambiguous own-file metadata', async () => {
  const send = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ files: [{ name: 'preview.json', id: 'current' }] }))
    )
    .mockResolvedValueOnce(new Response('verified'));
  const r = await assemblyPreviewReader('https://example.invalid/', 'own', '/home/twin', send).read(
    '/home/twin/assembly-preview/preview.json',
    100
  );
  if (!r) throw Error('expected verified source');
  expect(new TextDecoder().decode(r.bytes)).toBe('verified');
  expect(r.id).toBe('current');
  expect(
    send.mock.calls.every(
      (c) => !c[1].method && !c[1].body && !String(c[0]).includes('fulcra_userid')
    )
  ).toBe(true);
});
test('unknown metadata, duplicates, foreign paths and streamed oversized bytes hold', async () => {
  for (const kind of ['unknown', 'duplicate', 'path', 'limit']) {
    const send = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            kind === 'unknown'
              ? {}
              : {
                  files:
                    kind === 'duplicate'
                      ? [
                          { name: 'preview.json', id: 'a' },
                          { name: 'preview.json', id: 'b' }
                        ]
                      : [{ name: 'preview.json', id: 'a' }]
                }
          )
        )
      )
      .mockResolvedValueOnce(new Response(new Uint8Array(101)));
    await expect(
      assemblyPreviewReader('https://example.invalid/', 'own', '/home/twin', send).read(
        kind === 'path' ? '/Other/private' : '/home/twin/assembly-preview/preview.json',
        100
      )
    ).rejects.toThrow();
    if (kind === 'path') expect(send).not.toHaveBeenCalled();
  }
});
