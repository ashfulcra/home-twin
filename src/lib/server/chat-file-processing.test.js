import { test, expect } from 'vitest';
import { processChatFile } from '../../../scripts/chat-file-processing.mjs';
import { execFileSync } from 'node:child_process';
test('PDF text and selected page images are real evidence and page coverage is explicit', async () => {
  const bytes = execFileSync('python3', [
    '-c',
    "import fitz,sys; d=fitz.open(); p=d.new_page(); p.insert_text((40,40),'Synthetic furnace H200'); d.new_page(); sys.stdout.buffer.write(d.tobytes())"
  ]);
  const result = await processChatFile(bytes, 'application/pdf', [1]);
  expect(result.pageCount).toBe(2);
  expect(result.text).toContain('Synthetic furnace H200');
  expect(result.media[0]).toMatchObject({ mimeType: 'image/jpeg', page: 1 });
  expect(Buffer.from(result.media[0].data, 'base64').subarray(0, 2)).toEqual(
    Buffer.from([255, 216])
  );
  await expect(processChatFile(bytes, 'application/pdf', [3])).rejects.toThrow(/processing|page/i);
});
test('unsupported type, oversized page batch and malformed originals are rejected', async () => {
  await expect(processChatFile(Buffer.from('not pdf'), 'application/pdf')).rejects.toThrow(
    /processing/i
  );
  await expect(processChatFile(Buffer.from('test'), 'text/html')).rejects.toThrow(/format/i);
  await expect(
    processChatFile(Buffer.from('test'), 'application/pdf', [1, 2, 3, 4, 5])
  ).rejects.toThrow(/page/i);
});
