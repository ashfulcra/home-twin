import { test, expect } from 'vitest';
import { validateModelPatch, buildModelPatchCandidate, inverseModelPatch } from './model-patch.js';
import { modelPatchHome as home, modelPatchDraft as draft } from '../test-fixtures/model-patch.js';
test('a bounded opening patch freezes surrounding geometry and all reconstruction overrides and source metadata', () => {
  const base = home(),
    bytes = JSON.stringify(base),
    d = draft();
  const result = buildModelPatchCandidate(base, d);
  expect(result.candidate.reconstruction.buildingModel.walls[0].openings[0].widthFeet).toBe(3.5);
  expect(JSON.stringify(base)).toBe(bytes);
  const restored = structuredClone(result.candidate);
  restored.reconstruction.buildingModel.walls[0].openings[0].widthFeet = 3;
  expect(restored).toEqual(base);
  expect(result.changes).toEqual([
    {
      target: 'opening',
      wallId: 'wall',
      openingId: 'door',
      field: 'widthFeet',
      before: 3,
      after: 3.5,
      units: 'feet'
    }
  ]);
  expect(result.majorReviewRequired).toBe(true);
});
test('inverse patch restores exactly its fields and never erases a later unrelated change', () => {
  const b = home(),
    d = draft(),
    next = buildModelPatchCandidate(b, d).candidate;
  next.contacts.push({ id: 'later', name: 'Later contact' });
  const restored = buildModelPatchCandidate(next, inverseModelPatch(d)).candidate;
  expect(restored.reconstruction).toEqual(b.reconstruction);
  expect(restored.contacts).toHaveLength(2);
  next.reconstruction.buildingModel.walls[0].openings[0].widthFeet = 4;
  expect(() => buildModelPatchCandidate(next, inverseModelPatch(d))).toThrow(/changed|expected/i);
});
test('host violations, mismatched expected values and attempts to change identity or arbitrary paths fail before mutation', () => {
  for (const change of [
    (/** @type {any} */ d) => (d.edits[0].value = 40),
    (/** @type {any} */ d) => (d.edits[0].expected = 2),
    (/** @type {any} */ d) => (d.edits[0].wallId = 'missing'),
    (/** @type {any} */ d) => (d.edits[0].openingId = 'missing'),
    (/** @type {any} */ d) => (d.edits[0].field = 'id'),
    (/** @type {any} */ d) => (d.edits[0].root = '/other'),
    (/** @type {any} */ d) => (d.root = '/other'),
    (/** @type {any} */ d) => (d.edits[0].value = NaN),
    (/** @type {any} */ d) => d.edits.push({ ...d.edits[0] })
  ]) {
    const d = draft(),
      b = home(),
      raw = JSON.stringify(b);
    change(d);
    expect(() => buildModelPatchCandidate(b, d)).toThrow();
    expect(JSON.stringify(b)).toBe(raw);
  }
});
test('joint wall/opening height changes validate atomically within their existing level', () => {
  const d = {
    ...draft(),
    edits: [
      {
        target: 'wall',
        wallId: 'wall',
        openingId: '',
        field: 'heightFeet',
        expected: 10,
        value: 6
      },
      {
        target: 'opening',
        wallId: 'wall',
        openingId: 'door',
        field: 'heightFeet',
        expected: 7,
        value: 5
      }
    ]
  };
  const c = buildModelPatchCandidate(home(), d).candidate;
  expect(c.reconstruction.buildingModel.walls[0].heightFeet).toBe(6);
  expect(c.reconstruction.buildingModel.walls[0].openings[0].heightFeet).toBe(5);
  expect(() => buildModelPatchCandidate(home(), { ...d, edits: [d.edits[0]] })).toThrow();
  expect(() =>
    buildModelPatchCandidate(home(), { ...d, edits: [{ ...d.edits[0], value: 11 }] })
  ).toThrow();
});
test('patch bounds reject empty/noop, excessive edits, path-like sources and unsupported geometry transforms', () => {
  const d = draft();
  for (const value of [
    { ...d, edits: [] },
    { ...d, edits: Array.from({ length: 9 }, () => d.edits[0]) },
    { ...d, sourceIds: ['/vault/path'] },
    { ...d, edits: [{ ...d.edits[0], value: 3 }] },
    { ...d, edits: [{ ...d.edits[0], target: 'room' }] }
  ])
    expect(() => validateModelPatch(value)).toThrow();
});
test('unsupported baseline dimensions cannot produce a patch whose inverse is unusable', () => {
  const tall = home();
  tall.reconstruction.buildingModel.walls[0].heightFeet = 12;
  expect(() =>
    buildModelPatchCandidate(tall, {
      ...draft(),
      edits: [
        {
          target: 'wall',
          wallId: 'wall',
          openingId: '',
          field: 'heightFeet',
          expected: 12,
          value: 10
        }
      ]
    })
  ).toThrow(/separate geometry review/);
  const raised = home();
  raised.reconstruction.buildingModel.walls[0].openings[0].sillFeet = 1;
  expect(() =>
    buildModelPatchCandidate(raised, {
      ...draft(),
      edits: [
        {
          target: 'opening',
          wallId: 'wall',
          openingId: 'door',
          field: 'sillFeet',
          expected: 1,
          value: 0
        }
      ]
    })
  ).toThrow(/floor/);
});
test('one correction cannot modify separate floors', () => {
  const d = draft();
  d.edits.push({
    target: 'wall',
    wallId: 'fixed-wall',
    openingId: '',
    field: 'thicknessFeet',
    expected: 0.5,
    value: 0.6
  });
  expect(() => buildModelPatchCandidate(home(), d)).toThrow(/one level/);
});
