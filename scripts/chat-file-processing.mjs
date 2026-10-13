import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
let processing = 0;
/** @param {Uint8Array} bytes */
export function processChatText(bytes) {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\0')) throw Error('Source is not text');
  return {
    text: text.slice(0, 16000),
    excerpt: text.length > 16000,
    characterCount: text.length,
    charactersRead: Math.min(16000, text.length)
  };
}
/** Fixed extractor, no caller-supplied paths/commands. @param {Uint8Array} bytes @param {string} mime @param {number[]} [pages] */
export async function processChatFile(bytes, mime, pages = []) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(mime))
    throw Error('Unsupported original format');
  if (
    !bytes.length ||
    bytes.length > 200 * 1024 * 1024 ||
    !Array.isArray(pages) ||
    pages.length > 4 ||
    new Set(pages).size !== pages.length ||
    pages.some((p) => !Number.isSafeInteger(p) || p < 1 || p > 600)
  )
    throw Error('Original or page limit');
  if (processing >= 2) throw Error('File processing busy; retry this same source');
  processing++;
  return new Promise((resolve, reject) => {
    const child = spawn(
      'python3',
      [
        fileURLToPath(new URL('./chat-file-processing.py', import.meta.url)),
        mime,
        JSON.stringify(pages)
      ],
      { stdio: ['pipe', 'pipe', 'ignore'] }
    );
    const parts = /** @type {Buffer[]} */ ([]);
    let count = 0;
    const timer = setTimeout(() => child.kill('SIGKILL'), 45000);
    child.stdout.on('data', (part) => {
      count += part.length;
      if (count > 6 * 1024 * 1024) child.kill('SIGKILL');
      else parts.push(part);
    });
    child.once('error', () => {
      clearTimeout(timer);
      reject(Error('File processing unavailable'));
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || count > 6 * 1024 * 1024) {
        reject(Error('File processing unavailable; original is retained'));
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));
      } catch {
        reject(Error('File processing unavailable'));
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(bytes);
  }).finally(() => {
    processing--;
  });
}
