<script lang="ts">
  import { sourceSaveController } from '$lib/home/chat-source-save.js';
  let {
    homeId,
    callerId,
    sourceId,
    enabled = false,
    request,
    onSaved = async () => {}
  } = $props<{
    homeId: string;
    callerId: string;
    sourceId: string;
    enabled?: boolean;
    request: (operation: string, value: any) => Promise<any>;
    onSaved?: (expected: any) => Promise<any>;
  }>();
  let view: any = $state({ status: 'idle', input: null, busy: false, error: '' });
  let controller: any = null;
  $effect(() => {
    view = { status: 'idle', input: null, busy: false, error: '' };
    if (!enabled || !callerId || !sourceId) return;
    let closed = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const key = 'home-source-save:' + homeId + ':' + callerId + ':' + sourceId;
    const current = sourceSaveController({
      request,
      context: () => ({ homeId, callerId, sourceId, enabled, disposed: closed }),
      readSaved: () => {
        try {
          const raw = localStorage.getItem(key) ?? 'null';
          if (raw.length > 4096) return { invalid: true };
          return JSON.parse(raw);
        } catch {
          return null;
        }
      },
      writeSaved: (value: any) => localStorage.setItem(key, JSON.stringify(value)),
      changed: (value: any) => {
        if (closed) return;
        view = value;
        if (timer) clearTimeout(timer);
        if (
          !value.busy &&
          (value.operation?.active === true || (!value.input && value.status === 'checking-source'))
        )
          timer = setTimeout(() => void current.poll(), 900);
      },
      accepted: (expected: any) => onSaved(expected)
    });
    controller = current;
    view = { status: 'idle', input: null, busy: false, error: '' };
    void current.start();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      current.dispose();
      if (controller === current) controller = null;
    };
  });
  let waiting = $derived(view.busy || view.operation?.active === true);
  let message = $derived(
    view.status === 'accepted'
      ? 'Saved to home records.'
      : view.status === 'held-for-review'
        ? 'This save is held for review. Check the file and home details before reviewing it again.'
        : view.status === 'source-review-ready'
          ? view.canReviewAgain
            ? 'Review this file again before saving.'
            : 'Ready to save this file as home evidence.'
          : view.status === 'publication-pending'
            ? 'The save request is retained. Its result still needs verification.'
            : view.status === 'source-save-unconfirmed'
              ? 'The save could not be confirmed. Continue checking the same request.'
              : view.status === 'source-review-unconfirmed'
                ? 'This file could not be checked yet.'
                : view.input
                  ? 'Checking the saved request…'
                  : 'Checking this file…'
  );
</script>

<section class="source-save" aria-label="Save source file">
  {#if view.title}<strong>{view.title}</strong>{/if}
  <p role="status">{message}</p>
  {#if view.error}<p role="alert">{view.error}</p>{/if}
  {#if enabled && view.status !== 'accepted'}
    {#if view.canReviewAgain}<button
        type="button"
        disabled={waiting}
        onclick={() => void controller?.reviewAgain()}>Review file again</button
      >
    {:else if view.input && view.status !== 'held-for-review'}<button
        type="button"
        disabled={waiting}
        onclick={() => void controller?.save()}>Continue verification</button
      >
    {:else if view.status === 'source-review-ready'}<button
        type="button"
        disabled={waiting}
        onclick={() => void controller?.save()}>Save file to home records</button
      >
    {:else if view.status === 'source-review-unconfirmed'}<button
        type="button"
        disabled={waiting}
        onclick={() => void controller?.poll()}>Check file again</button
      >{/if}
  {/if}
</section>

<style>
  .source-save {
    margin: 0.8rem 0;
    padding: 0.8rem;
    border: 1px solid #bfd1c8;
    border-radius: 0.7rem;
    overflow-wrap: anywhere;
  }
  .source-save p {
    margin: 0.35rem 0;
  }
  .source-save button {
    margin-top: 0.35rem;
    padding: 0.55rem 0.8rem;
    border: 1px solid #adc5b8;
    border-radius: 0.45rem;
    background: white;
    color: #294e3e;
    cursor: pointer;
  }
  .source-save button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
</style>
