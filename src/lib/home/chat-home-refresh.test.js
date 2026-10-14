import { test, expect } from 'vitest';
import * as refresh from './chat-home-refresh.js';
const scope = {
  homeId: 'example',
  callerId: 'caller',
  generation: 1,
  revision: 7,
  disposed: false
};
const expected = { homeId: 'example', callerId: 'caller', revision: 8 };
const ready = {
  status: 'ready',
  callerId: 'caller',
  role: 'maintainer',
  home: { id: 'example', revision: 8 }
};
function fixture() {
  let context = { ...scope };
  /** @type {any[]} */ const accepted = [];
  /** @type {any[]} */ const denied = [];
  /** @type {()=>Promise<any>} */ let reply = async () => ({
    ok: true,
    status: 200,
    json: async () => ready
  });
  expect(typeof refresh.homeProjectionRefresh).toBe('function');
  const run = refresh.homeProjectionRefresh(
    () => reply(),
    () => context,
    (d) => accepted.push(d),
    (s) => denied.push(s)
  );
  return {
    run,
    accepted,
    denied,
    context: (/** @type {any} */ x) => (context = { ...context, ...x }),
    reply: (/** @type {()=>Promise<any>} */ x) => (reply = x)
  };
}
test('confirmed save reads a newer projection without changing the current dashboard context', async () => {
  const f = fixture();
  expect(await f.run(expected)).toBe(true);
  expect(f.accepted[0].home.revision).toBe(8);
  expect(f.denied).toEqual([]);
});
test('a delayed projection from an old home or caller never replaces the current view', async () => {
  for (const change of [
    { homeId: 'other' },
    { callerId: 'other' },
    { generation: 2 },
    { disposed: true }
  ]) {
    const f = fixture();
    /** @type {(v:any)=>void} */ let release = () => {};
    f.reply(() => new Promise((r) => (release = r)));
    const p = f.run(expected);
    f.context(change);
    release({ ok: true, status: 200, json: async () => ready });
    expect(await p).toBe(false);
    expect(f.accepted).toEqual([]);
    expect(f.denied).toEqual([]);
  }
});
test('revoked, expired or changed-scope projection clears private view instead of accepting stale data', async () => {
  for (const r of [
    { ok: false, status: 401, json: async () => ({}) },
    { ok: false, status: 403, json: async () => ({}) },
    { ok: true, status: 200, json: async () => ({ ...ready, callerId: 'other' }) },
    { ok: true, status: 200, json: async () => ({ ...ready, home: { id: 'other', revision: 8 } }) }
  ]) {
    const f = fixture();
    f.reply(async () => r);
    expect(await f.run(expected)).toBe(false);
    expect(f.accepted).toEqual([]);
    expect(f.denied).toHaveLength(1);
  }
});
test('already current, older or unconfirmed result does not downgrade the dashboard', async () => {
  const f = fixture();
  f.reply(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ...ready, home: { id: 'example', revision: 7 } })
  }));
  expect(await f.run(expected)).toBe(false);
  expect(f.accepted).toEqual([]);
  f.context({ revision: 9 });
  expect(await f.run(expected)).toBe(true);
  expect(f.accepted).toEqual([]);
});
test('only an exact inactive saved model result notifies once per current caller and home', async () => {
  expect(typeof refresh.modelSavedNotifier).toBe('function');
  /** @type {any[]} */ const sent = [];
  const context = { ...scope, conversationId: 'conversation', enabled: true };
  const notify = refresh.modelSavedNotifier(
    (x) => sent.push(x),
    () => context
  );
  const input = { conversationId: 'conversation', actionId: 'action', digest: 'digest' },
    saved = { ...input, status: 'model-applied', revision: 8, operation: { active: false } };
  notify(input, { ...saved, operation: { active: true } });
  notify(input, { ...saved, status: 'publication-pending' });
  notify(input, { ...saved, digest: 'wrong' });
  expect(sent).toEqual([]);
  notify(input, saved);
  notify(input, saved);
  expect(sent).toEqual([expected]);
  context.enabled = false;
  notify(input, { ...saved, revision: 9 });
  expect(sent).toHaveLength(1);
});
test('historical save notifications cannot cancel a pending newer projection refresh', async () => {
  const f = fixture();
  /** @type {(v:any)=>void} */ let release = () => {};
  f.reply(() => new Promise((r) => (release = r)));
  const newer = f.run(expected);
  expect(await f.run({ ...expected, revision: 6 })).toBe(true);
  release({ ok: true, status: 200, json: async () => ready });
  expect(await newer).toBe(true);
  expect(f.accepted[0].home.revision).toBe(8);
});
