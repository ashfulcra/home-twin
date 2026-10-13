import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { chatActionSourceVerifier } from '../../../scripts/chat-action-sources.mjs';
test('approval hashes the exact original and rechecks current authority after reading bytes', async () => {
  const bytes = Buffer.from('Synthetic exact original'),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  const scope = {
    homeId: 'example',
    principalId: '33333333-3333-4333-8333-333333333333',
    ownerUserId: '33333333-3333-4333-8333-333333333333',
    root: '/Example/twin',
    role: 'maintainer'
  };
  const home = {
    id: 'example',
    ownerUserId: scope.ownerUserId,
    sources: [{ id: 'manual', path: '/Example/twin/sources/manual.txt', sha256 }]
  };
  let checks = 0,
    revoked = false;
  const authorize = async () => {
    checks++;
    return {
      home,
      scope: { ...scope, role: revoked ? 'viewer' : 'maintainer' },
      fileVersion: 'v1'
    };
  };
  const verify = chatActionSourceVerifier({
    authorize,
    clientFor: () => ({ fileBytes: async () => ({ bytes }) })
  });
  expect(
    await verify(['manual'], { home, scope, fileVersion: 'v1', token: 'current-caller' })
  ).toEqual([{ id: 'manual', sha256 }]);
  expect(checks).toBe(2);
  const denied = chatActionSourceVerifier({
    authorize,
    clientFor: () => ({
      fileBytes: async () => {
        revoked = true;
        return { bytes };
      }
    })
  });
  await expect(
    denied(['manual'], { home, scope, fileVersion: 'v1', token: 'current-caller' })
  ).rejects.toThrow(/access|role/i);
});
test('unknown or changed originals are explicit blockers, never guessed evidence', async () => {
  const scope = {
      homeId: 'example',
      principalId: '33333333-3333-4333-8333-333333333333',
      ownerUserId: '33333333-3333-4333-8333-333333333333',
      root: '/Example/twin',
      role: 'maintainer'
    },
    home = {
      id: 'example',
      ownerUserId: scope.ownerUserId,
      sources: [{ id: 'manual', path: '/Example/twin/sources/manual.txt', sha256: 'a'.repeat(64) }]
    };
  const verify = chatActionSourceVerifier({
    authorize: async () => ({ home, scope, fileVersion: 'v1' }),
    clientFor: () => ({ fileBytes: async () => ({ bytes: Buffer.from('changed') }) })
  });
  await expect(
    verify(['manual'], { home, scope, fileVersion: 'v1', token: 'current-caller' })
  ).rejects.toThrow(/changed|checksum/i);
  await expect(
    verify(['unknown'], { home, scope, fileVersion: 'v1', token: 'current-caller' })
  ).rejects.toThrow(/original|source/i);
});

test('an accepted legacy owner original under /home remains in the documented audit scope', async () => {
  const bytes = Buffer.from('Synthetic legacy manual'),
    sha256 = createHash('sha256').update(bytes).digest('hex');
  const scope = {
      homeId: 'black-rock',
      principalId: '33333333-3333-4333-8333-333333333333',
      ownerUserId: '33333333-3333-4333-8333-333333333333',
      root: '/home/twin',
      role: 'maintainer'
    },
    home = {
      id: 'black-rock',
      ownerUserId: scope.ownerUserId,
      sources: [{ id: 'manual', path: '/home/manual.txt', sha256 }]
    };
  const verify = chatActionSourceVerifier({
    authorize: async () => ({ home, scope, fileVersion: 'v1' }),
    clientFor: () => ({ fileBytes: async () => ({ bytes }) })
  });
  expect(
    await verify(['manual'], { home, scope, fileVersion: 'v1', token: 'current-caller' })
  ).toEqual([{ id: 'manual', sha256 }]);
});
