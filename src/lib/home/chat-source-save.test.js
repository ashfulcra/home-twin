import { test, expect } from 'vitest';
import { sourceSaveController } from './chat-source-save.js';
const owner = '33333333-3333-4333-8333-333333333333',
  actionId = '11111111-1111-4111-8111-111111111111',
  sourceId = 'evidence-' + actionId,
  digest = 'a'.repeat(64),
  input = { actionId, digest },
  review = {
    ...input,
    sourceId,
    title: 'Synthetic file',
    status: 'source-review-ready',
    requestSaved: false
  };
function fixture(/** @type {any} */ request) {
  /** @type {any} */ let saved = null;
  /** @type {any} */ let context = {
    homeId: 'example',
    callerId: owner,
    sourceId,
    enabled: true,
    disposed: false
  };
  /** @type {any[]} */ const states = [];
  /** @type {any[]} */ const accepted = [];
  /** @type {any[]} */ const calls = [];
  const make = () =>
    sourceSaveController({
      context: () => context,
      request: async (/** @type {string} */ operation, /** @type {any} */ value) => {
        calls.push({ operation, value });
        return request(operation, value);
      },
      readSaved: () => saved,
      writeSaved: (/** @type {any} */ value) => {
        saved = value;
      },
      changed: (/** @type {any} */ value) => states.push(value),
      accepted: (/** @type {any} */ value) => accepted.push(value)
    });
  return {
    make,
    states,
    accepted,
    calls,
    context: (/** @type {any} */ value) => (context = value),
    get saved() {
      return saved;
    }
  };
}
test('one click stores the exact request before saving and confirms through read-only polling', async () => {
  let posted = 0;
  const f = fixture(async (/** @type {string} */ operation, /** @type {any} */ value) => {
    if (operation === 'review') return review;
    if (operation === 'save') {
      expect(f.saved).toEqual({ ...input, sourceId });
      posted++;
      return {
        ...review,
        status: 'checking-source',
        requestSaved: true,
        operation: { active: true }
      };
    }
    return {
      ...review,
      status: 'accepted',
      requestSaved: true,
      revision: 2,
      operation: { active: false }
    };
  });
  const c = f.make();
  await c.start();
  expect(c.state.status).toBe('source-review-ready');
  await c.save();
  await c.poll();
  expect(c.state.status).toBe('accepted');
  expect(posted).toBe(1);
  expect(f.accepted).toEqual([{ homeId: 'example', callerId: owner, revision: 2 }]);
  await c.poll();
  expect(f.accepted).toHaveLength(1);
});
test('lost reply retains the same request and restart only reads status until explicit continuation', async () => {
  let posted = 0;
  const f = fixture(async (/** @type {string} */ operation) => {
    if (operation === 'review') return review;
    if (operation === 'save') {
      posted++;
      throw Error('Lost reply');
    }
    return {
      ...review,
      status: 'publication-pending',
      requestSaved: true,
      operation: { active: false }
    };
  });
  const c = f.make();
  await c.start();
  await c.save();
  expect(c.state.status).toBe('publication-pending');
  expect(f.saved).toEqual({ ...input, sourceId });
  c.dispose();
  const restarted = f.make();
  await restarted.start();
  expect(restarted.state.status).toBe('publication-pending');
  expect(posted).toBe(1);
  await restarted.save();
  expect(posted).toBe(2);
  expect(f.calls.filter((x) => x.operation === 'save').map((x) => x.value)).toEqual([input, input]);
});
test('a late accepted reply from a previous caller cannot change the current file view or refresh home', async () => {
  /** @type {(x:any)=>void} */ let release = () => {};
  const gate = new Promise((r) => (release = r)),
    f = fixture(async () => gate),
    c = f.make();
  const pending = c.start();
  f.context({
    homeId: 'example',
    callerId: '44444444-4444-4444-8444-444444444444',
    sourceId,
    enabled: true,
    disposed: false
  });
  release({ actionId, sourceId, status: 'accepted', revision: 2, alreadyAccepted: true });
  await pending;
  expect(f.accepted).toHaveLength(0);
  expect(f.states.some((x) => x.status === 'accepted')).toBe(false);
});
test('disabled access never reads or saves private file state', async () => {
  const f = fixture(async () => review);
  f.context({ homeId: 'example', callerId: owner, sourceId, enabled: false, disposed: false });
  const c = f.make();
  await c.start();
  await c.save();
  await c.poll();
  expect(f.calls).toHaveLength(0);
});
test('foreign or malformed progress never becomes a saved-home success', async () => {
  const f = fixture(async () => ({
      ...review,
      actionId: '22222222-2222-4222-8222-222222222222',
      status: 'accepted',
      revision: 2
    })),
    c = f.make();
  await c.start();
  expect(c.state.status).toBe('source-review-unconfirmed');
  expect(f.accepted).toHaveLength(0);
});

test('foreign checking progress cannot replace an exact saved request', async () => {
  const f = fixture(async (/** @type {string} */ operation) =>
      operation === 'review'
        ? review
        : { ...review, digest: 'b'.repeat(64), status: 'checking-source', requestSaved: true }
    ),
    c = f.make();
  await c.start();
  await c.save();
  expect(c.state.status).toBe('source-save-unconfirmed');
  expect(f.accepted).toHaveLength(0);
});

test('a stale unadmitted save checks its exact status before explicit fresh review and new consent', async () => {
  const next = { ...review, digest: 'b'.repeat(64) };
  let fresh = false;
  const f = fixture(async (/** @type {string} */ op, /** @type {any} */ value) => {
    if (op === 'review') return fresh ? next : review;
    if (op === 'status') return { ...review, operation: { active: false } };
    if (value.digest === digest) throw Error('Source review stale; prepare a new review');
    return {
      ...next,
      status: 'accepted',
      requestSaved: true,
      revision: 2,
      operation: { active: false }
    };
  });
  const c = f.make();
  await c.start();
  await c.save();
  expect(c.state.canReviewAgain).toBe(true);
  expect(f.calls.map((x) => x.operation)).toEqual(['review', 'save', 'status']);
  expect(f.saved).toEqual({ ...input, sourceId });
  fresh = true;
  await c.reviewAgain();
  expect(c.state.input).toBe(null);
  expect(f.saved).toBe(null);
  expect(c.state.digest).toBe(next.digest);
  expect(f.calls.filter((x) => x.operation === 'save')).toHaveLength(1);
  await c.save();
  expect(f.calls.filter((x) => x.operation === 'save').map((x) => x.value)).toEqual([
    input,
    { actionId, digest: next.digest }
  ]);
  expect(c.state.status).toBe('accepted');
});

test('unknown or pending saved requests cannot clear local consent or prepare a different review', async () => {
  const f = fixture(async (/** @type {string} */ op) => {
    if (op === 'review') return review;
    if (op === 'save') throw Error('Lost reply');
    return {
      ...review,
      status: 'publication-pending',
      requestSaved: true,
      operation: { active: false }
    };
  });
  const c = f.make();
  await c.start();
  await c.save();
  const count = f.calls.length;
  await c.reviewAgain();
  expect(f.calls).toHaveLength(count);
  expect(f.saved).toEqual({ ...input, sourceId });
  expect(c.state.canReviewAgain).toBe(false);
});

test('terminal held status permits only an explicit data-only fresh review', async () => {
  const f = fixture(async (/** @type {string} */ op) =>
    op === 'review'
      ? review
      : { ...review, status: 'held-for-review', requestSaved: true, operation: { active: false } }
  );
  const c = f.make();
  await c.start();
  await c.save();
  expect(c.state.canReviewAgain).toBe(true);
  await c.reviewAgain();
  expect(c.state.input).toBe(null);
  expect(f.calls.map((x) => x.operation)).toEqual(['review', 'save', 'status', 'review']);
});

test('fresh review rechecks saved status and preserves a request admitted since the earlier check', async () => {
  let admitted = false;
  const f = fixture(async (/** @type {string} */ op) => {
    if (op === 'review') return review;
    if (op === 'save') throw Error('Stale');
    return admitted
      ? {
          ...review,
          status: 'publication-pending',
          requestSaved: true,
          operation: { active: false }
        }
      : { ...review, operation: { active: false } };
  });
  const c = f.make();
  await c.start();
  await c.save();
  expect(c.state.canReviewAgain).toBe(true);
  admitted = true;
  await c.reviewAgain();
  expect(c.state.status).toBe('publication-pending');
  expect(c.state.canReviewAgain).toBe(false);
  expect(f.saved).toEqual({ ...input, sourceId });
  expect(f.calls.filter((x) => x.operation === 'review')).toHaveLength(1);
});

test('failed save and unavailable status preserve an unknown exact request until verified', async () => {
  const f = fixture(async (/** @type {string} */ op) => {
    if (op === 'review') return review;
    throw Error('Offline');
  });
  const c = f.make();
  await c.start();
  await c.save();
  expect(c.state.status).toBe('source-save-unconfirmed');
  expect(c.state.canReviewAgain).toBe(false);
  const count = f.calls.length;
  await c.reviewAgain();
  expect(f.calls).toHaveLength(count);
  expect(f.saved).toEqual({ ...input, sourceId });
});

test('data-only review restores an existing pending server request without inventing consent', async () => {
  const pending = {
    ...review,
    status: 'publication-pending',
    requestSaved: true,
    operation: { active: false }
  };
  const f = fixture(async () => pending),
    c = f.make();
  await c.start();
  expect(c.state.input).toEqual(input);
  expect(f.saved).toEqual({ ...input, sourceId });
  expect(c.state.canReviewAgain).toBe(false);
  expect(f.calls.map((x) => x.operation)).toEqual(['review']);
  await c.poll();
  expect(f.calls.map((x) => x.operation)).toEqual(['review', 'status']);
});

test('an unchanged terminal held review retains its exact request and can be reviewed later after the baseline changes', async () => {
  let changed = false;
  const held = {
    ...review,
    status: 'held-for-review',
    requestSaved: true,
    operation: { active: false }
  };
  const next = { ...review, digest: 'b'.repeat(64), operation: { active: false } };
  const f = fixture(async (/** @type {string} */ op) => (op === 'review' && changed ? next : held)),
    c = f.make();
  await c.start();
  expect(c.state.canReviewAgain).toBe(true);
  await c.reviewAgain();
  expect(c.state.status).toBe('held-for-review');
  expect(c.state.input).toEqual(input);
  expect(f.saved).toEqual({ ...input, sourceId });
  expect(c.state.canReviewAgain).toBe(true);
  changed = true;
  await c.reviewAgain();
  expect(c.state.status).toBe('source-review-ready');
  expect(c.state.input).toBe(null);
  expect(f.calls.some((x) => x.operation === 'save')).toBe(false);
});
