<script lang="ts">
  import { onMount } from 'svelte';
  import HomeBuilding from './HomeBuilding.svelte';
  let digest = $state(''),
    frozenAt = $state(''),
    models: any = $state(null),
    message = $state(''),
    loading = $state(false);
  let controller: AbortController | null = null;
  const versions = [
    { id: 'current', name: 'Frozen published model' },
    { id: 'a', name: 'Alternative A' },
    { id: 'b', name: 'Alternative B' }
  ];
  async function load(withModels = false) {
    controller?.abort();
    const c = new AbortController();
    controller = c;
    loading = true;
    message = '';
    models = null;
    const expected = digest;
    if (!withModels) digest = '';
    try {
      const r = await fetch(
        '/api/home/model-comparison' + (withModels ? '?data=1&digest=' + expected : ''),
        { cache: 'no-store', signal: c.signal }
      );
      if (!r.ok)
        throw Error('The private comparison could not be verified. Check it again before viewing.');
      const data = await r.json();
      if (c.signal.aborted) return;
      if (
        data.status === 'ready' &&
        /^[a-f0-9]{64}$/.test(data.digest) &&
        /^\d{4}-\d{2}-\d{2}$/.test(data.frozenAt) &&
        (!withModels || data.digest === expected)
      ) {
        digest = data.digest;
        frozenAt = data.frozenAt;
        if (withModels) {
          if (!data.models?.current || !data.models?.a || !data.models?.b)
            throw Error('The model data needs review.');
          models = data.models;
        }
      } else if (data.status !== 'not-available')
        throw Error('The comparison response needs review.');
    } catch (e) {
      if (!c.signal.aborted) {
        digest = '';
        models = null;
        message = e instanceof Error ? e.message : String(e);
      }
    } finally {
      if (controller === c) loading = false;
    }
  }
  onMount(() => {
    load();
    return () => controller?.abort();
  });
</script>

{#if digest || message}
  <section class="comparison">
    <h2>Compare reconstruction alternatives</h2>
    <p>
      The frozen model from {frozenAt || 'the earlier drawing review'} and two independently built alternatives.
      These are review drafts; viewing them does not replace your accepted house model.
    </p>
    {#if message}<p role="status">{message}</p>
      <button onclick={() => load()} disabled={loading}>Check comparison again</button>{:else}
      <button onclick={() => (models ? (models = null) : load(true))} disabled={loading}
        >{loading
          ? 'Loading comparison…'
          : models
            ? 'Close comparison'
            : 'Compare all three models'}</button
      >
      {#if models}<p>
          Use each view’s floor, 2D/3D, roof and cutaway controls to inspect the same area.
          These drafts can disagree. Compare their source evidence and assumptions before selecting corrections.
        </p>
        <div class="versions">
          {#each versions as v}<article>
              <h3>{v.name}</h3>
              <HomeBuilding model={models[v.id]} readonly={true} />
            </article>{/each}
        </div>{/if}
    {/if}
  </section>
{/if}

<style>
  .comparison {
    margin: 24px 0;
    padding: 20px;
    border: 1px solid #cadbd1;
    border-radius: 12px;
    background: #f5f8f6;
  }
  p {
    line-height: 1.5;
  }
  button {
    background: white;
    padding: 10px 16px;
    border: 1px solid #cadbd1;
    border-radius: 8px;
    color: #254a3c;
    cursor: pointer;
  }
  .versions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    margin-top: 20px;
  }
  article {
    min-width: 0;
    background: white;
    padding: 12px;
    border-radius: 10px;
  }
  h3 {
    font-size: 18px;
  }
  @media (max-width: 1100px) {
    .versions {
      grid-template-columns: 1fr;
    }
    .comparison {
      padding: 12px;
    }
  }
</style>
