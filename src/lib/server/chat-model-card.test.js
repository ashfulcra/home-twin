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
