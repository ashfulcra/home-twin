<script lang="ts">
  let {
    review,
    loadPreview,
    canApply = false,
    apply = async () => {},
    undo = async () => {},
    actionBusy = false,
    actionError = ''
  }: {
    review: any;
    loadPreview: (review: any) => Promise<any>;
    canApply?: boolean;
    apply?: (review: any) => Promise<any>;
    undo?: (review: any) => Promise<any>;
    actionBusy?: boolean;
    actionError?: string;
  } = $props();
  let displayNote = $derived(
    /^Undo approved model change [a-f0-9-]{36}$/.test(review.note)
      ? 'Undo the saved model change.'
      : review.note
  );
  let applied = $derived(review.progress?.status === 'model-applied');
  let held = $derived(review.progress?.status === 'held-for-review');
  let processing = $derived(review.progress?.operation?.active === true);
  let preview: any = $state(null),
    busy = $state(false),
    failure = $state('');
  let identity = $derived(review.conversationId + '/' + review.actionId + '/' + review.digest);
  let loadedIdentity = $state('');
  $effect(() => {
    if (review.status === 'stale-model' || (loadedIdentity && loadedIdentity !== identity))
      preview = null;
  });
  const fieldNames: Record<string, string> = {
    heightFeet: 'Height',
    widthFeet: 'Width',
    thicknessFeet: 'Thickness',
    offsetFeet: 'Position along the wall',
    sillFeet: 'Height above the floor'
  };
  const length = (w: any) => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);
  const point = (w: any, offset: number) => ({
    x: w.start[0] + ((w.end[0] - w.start[0]) * offset) / length(w),
    y: w.start[1] + ((w.end[1] - w.start[1]) * offset) / length(w)
  });
  const planBox = (w: any) => {
    const pad = Math.max(w.before.thicknessFeet, w.after.thicknessFeet) / 2 + 1;
    return [
      Math.min(w.start[0], w.end[0]) - pad,
      Math.min(w.start[1], w.end[1]) - pad,
      Math.abs(w.end[0] - w.start[0]) + pad * 2,
      Math.abs(w.end[1] - w.start[1]) + pad * 2
    ].join(' ');
  };
  async function open() {
    if (busy || review.status === 'stale-model') return;
    const selected = identity;
    busy = true;
    failure = '';
    preview = null;
    try {
      const p = await loadPreview(review);
      if (p && selected === identity && review.status !== 'stale-model') {
        loadedIdentity = selected;
        preview = p;
      }
    } catch {
      if (selected === identity)
        failure =
          'This preview could not be loaded. The home may have changed; ask for a fresh proposal.';
    } finally {
      if (selected === identity) busy = false;
    }
  }
</script>

<article class="model-review" aria-label="Proposed model correction">
  <h3>Proposed model correction</h3>
  <p>{displayNote}</p>
  <ul>
    {#each review.changes as change}<li>
        {fieldNames[change.field] ?? 'Dimension'}: {change.before} → {change.after} feet
      </li>{/each}
  </ul>
  <p class="model-status" role="status">
    {applied
      ? 'Applied to your home.'
      : held
        ? 'The home or sources need a fresh review.'
        : review.progress?.status === 'checking-model-sources'
          ? 'Checking sources in the background…'
          : review.progress?.status === 'publication-pending'
            ? 'Waiting to confirm the saved change.'
            : 'Not applied to your home.'}
  </p>
  {#if canApply}
    {#if applied}<button
        type="button"
        disabled={actionBusy || review.undo?.operation?.active}
        onclick={() => undo(review)}>Review undo</button
      >
    {:else if !held}<button
        type="button"
        disabled={actionBusy ||
          processing ||
          (!review.progress?.requestSaved && (!preview || review.status === 'stale-model'))}
        onclick={() => apply(review)}
        >{processing
          ? 'Checking…'
          : review.progress?.requestSaved
            ? 'Continue verification'
            : 'Apply change'}</button
      >{/if}
  {/if}
  {#if review.undo?.status === 'preparing-model-undo'}<p role="status">
      Preparing an undo preview…
    </p>{:else if review.undo?.status === 'undo-preview-ready'}<p role="status">
      Undo correction is below.
    </p>{:else if review.undo?.status === 'held-for-review'}<p role="status">
      Undo needs a fresh model review.
    </p>{/if}
  {#if actionError}<p role="alert">{actionError}</p>{/if}
  {#if review.sourceIds?.length}<p class="sources">
      Sources were checked when this proposal was prepared.
    </p>{/if}
  {#if !applied && review.status === 'stale-model'}<p role="status">
      The home has changed. Ask for a fresh proposal.
    </p>
  {:else if !applied}<button type="button" onclick={open} disabled={busy}
      >{busy ? 'Opening preview…' : 'Preview change'}</button
    >{/if}
  {#if failure}<p role="alert">{failure}</p>{/if}
  {#if preview}
    <p>Wall views on this level · dimensions in feet</p>
    {#each preview.walls as wall, index}
      {@const maxHeight = Math.max(wall.before.heightFeet, wall.after.heightFeet)}
      <section aria-label={'Wall ' + (index + 1) + ' comparison'}>
        <h4>Wall {index + 1}</h4>
        <div class="comparison">
          {#each ['before', 'after'] as version}
            {@const dims = wall[version]}
            <div class="view">
              <h5>{version === 'before' ? 'Current' : 'Proposed'}</h5>
              <p>Viewed from above</p>
              <svg
                viewBox={planBox(wall)}
                role="img"
                aria-label={(version === 'before' ? 'Current' : 'Proposed') + ' wall plan'}
              >
                <line
                  x1={wall.start[0]}
                  y1={wall.start[1]}
                  x2={wall.end[0]}
                  y2={wall.end[1]}
                  stroke="#456a64"
                  stroke-width={dims.thicknessFeet}
                />
                {#each dims.openings as opening}
                  {@const start = point(wall, opening.offsetFeet)}{@const end = point(
                    wall,
                    opening.offsetFeet + opening.widthFeet
                  )}
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={version === 'after' ? '#bd5526' : '#c0d6d0'}
                    stroke-width={Math.max(dims.thicknessFeet, 0.1)}
                    ><title>{opening.kind} · {opening.widthFeet} feet wide</title></line
                  >
                {/each}
              </svg>
              <p>Viewed from the side</p>
              <svg
                viewBox={'-1 -1 ' + (length(wall) + 2) + ' ' + (maxHeight + 2)}
                role="img"
                aria-label={(version === 'before' ? 'Current' : 'Proposed') + ' wall elevation'}
              >
                <rect
                  x="0"
                  y={maxHeight - dims.heightFeet}
                  width={length(wall)}
                  height={dims.heightFeet}
                  fill="#dce9e4"
                  stroke="#456a64"
                  stroke-width="0.05"
                />
                {#each dims.openings as opening}<rect
                    x={opening.offsetFeet}
                    y={maxHeight - opening.sillFeet - opening.heightFeet}
                    width={opening.widthFeet}
                    height={opening.heightFeet}
                    fill={version === 'after' ? '#f4d3ba' : '#fff'}
                    stroke={version === 'after' ? '#bd5526' : '#456a64'}
                    stroke-width="0.06"
                    ><title>{opening.kind} · {opening.widthFeet} × {opening.heightFeet} feet</title
                    ></rect
                  >{/each}
                <line
                  x1="-0.3"
                  y1={maxHeight}
                  x2={length(wall) + 0.3}
                  y2={maxHeight}
                  stroke="#456a64"
                  stroke-width="0.05"
                />
              </svg>
              <p class="dimensions">
                Wall height {dims.heightFeet} ft · thickness {dims.thicknessFeet} ft
              </p>
            </div>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</article>

<style>
  .model-review {
    margin: 1rem 0;
    border: 1px solid #bdd0c9;
    background: #f6faf7;
    border-radius: 0.75rem;
    padding: 1rem;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  h3,
  h4,
  h5 {
    font-weight: 650;
    margin: 0 0 0.6rem;
  }
  p,
  ul {
    margin: 0.6rem 0;
  }
  .model-status,
  .sources,
  .dimensions {
    font-size: 0.9rem;
    color: #48645c;
  }
  button {
    border: 1px solid #bccdc6;
    border-radius: 0.6rem;
    background: white;
    padding: 0.65rem 1rem;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .comparison {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .view {
    min-width: 0;
  }
  svg {
    width: 100%;
    height: 140px;
    background: white;
    border: 1px solid #dae6df;
    border-radius: 0.4rem;
  }
  .view p {
    font-size: 0.85rem;
  }
  section {
    margin-top: 1rem;
  }
  @media (max-width: 500px) {
    .comparison {
      grid-template-columns: 1fr;
    }
    .model-review {
      padding: 0.75rem;
    }
  }
</style>
