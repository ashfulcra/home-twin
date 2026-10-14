import { test, expect } from 'vitest';
import { render } from 'svelte/server';
import HomeModelReview from '../components/HomeModelReview.svelte';
const review = {
  conversationId: '11111111-1111-4111-8111-111111111111',
  actionId: '22222222-2222-4222-8222-222222222222',
  digest: 'a'.repeat(64),
  note: 'Synthetic change',
  changes: [],
  sourceIds: [],
  status: 'needs-model-review'
};
test('model card exposes owner Apply and describes actual saved progress separately from stale preview', () => {
  const props = /** @type {any} */ ({
    review: { ...review, progress: { status: 'model-applied' } },
    canApply: true,
    loadPreview: async () => null,
    apply: async () => {},
    undo: async () => {}
  });
  const body = render(HomeModelReview, { props }).body;
  expect(body).toContain('Applied to your home');
  expect(body).toContain('Review undo');
  expect(body).not.toContain('Not applied to your home');
});
import HomeChat from '../components/HomeChat.svelte';
test('chat shell renders before browser mount while model operation state is unconfigured', () => {
  expect(render(HomeChat, { props: { home: { id: 'example', sources: [] } } }).body).toContain(
    'Ask your home'
  );
});

test('saved historical correction does not ask to redo an already applied proposal', () => {
  const body = render(HomeModelReview, {
    props: {
      review: {
        ...review,
        status: 'stale-model',
        progress: { status: 'model-applied', revision: 8 }
      },
      canApply: true,
      loadPreview: async () => null
    }
  }).body;
  expect(body).toContain('Applied to your home');
  expect(body).toContain('Review undo');
  expect(body).not.toContain('Ask for a fresh proposal');
  expect(body).not.toContain('Preview change');
});

test('inverse card describes Undo without exposing its internal action identifier', () => {
  const body = render(HomeModelReview, {
    props: {
      review: {
        ...review,
        note: 'Undo approved model change 22222222-2222-4222-8222-222222222222'
      },
      loadPreview: async () => null
    }
  }).body;
  expect(body).toContain('Undo the saved model change.');
  expect(body).not.toContain('Undo approved model change 22222222');
});

test('a source awaiting admission explains the next step and does not offer an unusable Apply', () => {
  const body = render(HomeModelReview, {
    props: {
      review: { ...review, sourceAdmission: { required: true, sourceIds: ['uploaded'] } },
      canApply: true,
      loadPreview: async () => null
    }
  }).body;
  expect(body).toContain('Save a home record using the supporting file');
  expect(body).toContain('Preview change');
  expect(body).not.toContain('Apply change');
});

test('source admission guidance never hides reconciliation or rewrites a historical saved result', () => {
  const pending = render(HomeModelReview, {
    props: {
      review: {
        ...review,
        sourceAdmission: { required: true, sourceIds: ['uploaded'] },
        progress: { status: 'publication-pending', requestSaved: true }
      },
      canApply: true,
      loadPreview: async () => null
    }
  }).body;
  expect(pending).toContain('Continue verification');
  const saved = render(HomeModelReview, {
    props: {
      review: {
        ...review,
        sourceAdmission: { required: true, sourceIds: ['uploaded'] },
        progress: { status: 'model-applied' }
      },
      canApply: true,
      loadPreview: async () => null
    }
  }).body;
  expect(saved).toContain('Applied to your home');
  expect(saved).toContain('Review undo');
  expect(saved).not.toContain('Save a home record using the supporting file');
});
