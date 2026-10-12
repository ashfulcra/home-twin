<script lang="ts">
  import { onMount } from 'svelte';
  import { planPoint, loadPreviewMesh } from '$lib/home/assembly-view.js';
  let info: any = $state(null),
    message = $state(''),
    loading = $state(false),
    mode = $state('3D'),
    level = $state('all'),
    selected = $state(''),
    roofs = $state(false),
    ceilings = $state(false),
    cutaway = $state(true),
    host = $state<HTMLDivElement>(),
    viewer = $state<any>(),
    meshError = $state('');
  let controller: AbortController | undefined;
  let room = $derived(info?.model.rooms.find((r: any) => r.id === selected));
  let floor = $derived(level === 'all' ? (info?.model.levels[0]?.id ?? '') : level);
  let rooms = $derived(info?.model.rooms.filter((r: any) => r.level === floor) ?? []);
  let walls = $derived(info?.model.walls.filter((w: any) => w.level === floor) ?? []);
  let bounds = $derived.by(() => {
    const p = rooms.flatMap((r: any) => r.polygon.map(planPoint));
    if (!p.length) return { x: 0, y: 0, w: 40, h: 30 };
    const x = Math.min(...p.map((p: number[]) => p[0])) - 3,
      y = Math.min(...p.map((p: number[]) => p[1])) - 3;
    return {
      x,
      y,
      w: Math.max(...p.map((p: number[]) => p[0])) - x + 3,
      h: Math.max(...p.map((p: number[]) => p[1])) - y + 3
    };
  });
  const path = (p: number[][]) => 'M' + p.map((p) => planPoint(p).join(' ')).join(' L') + ' Z';
  const centroid = (p: number[][]) =>
    planPoint([
      p.reduce((a, p) => a + p[0], 0) / p.length,
      p.reduce((a, p) => a + p[1], 0) / p.length
    ]);
  function aperture(w: any, o: any) {
    const length = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]),
      dx = (w.end[0] - w.start[0]) / length,
      dy = (w.end[1] - w.start[1]) / length;
    return [
      planPoint([w.start[0] + dx * o.offsetFeet, w.start[1] + dy * o.offsetFeet]),
      planPoint([
        w.start[0] + dx * (o.offsetFeet + o.widthFeet),
        w.start[1] + dy * (o.offsetFeet + o.widthFeet)
      ])
    ];
  }
  async function load() {
    controller?.abort();
    const c = new AbortController();
    controller = c;
    loading = true;
    info = null;
    message = '';
    try {
      const r = await fetch('/api/home/assembly-preview', { cache: 'no-store', signal: c.signal });
      const body = await r.json();
      if (c.signal.aborted) return;
      if (!r.ok) throw Error(body.message ?? 'The source model could not be checked.');
      if (body.status === 'source-preview-needs-review') {
        info = body;
        level = body.model.levels[0].id;
        selected = body.model.rooms[0]?.id ?? '';
      }
    } catch (e) {
      if (!c.signal.aborted) message = e instanceof Error ? e.message : String(e);
    } finally {
      if (!c.signal.aborted) loading = false;
    }
  }
  onMount(() => {
    void load();
    return () => controller?.abort();
  });
  $effect(() => {
    if (selected && level !== 'all' && room?.level !== level) selected = '';
  });
  $effect(() => {
    if (!host || !info || mode !== '3D') return;
    const element = host,
      data = info,
      c = new AbortController();
    let instance: any;
    meshError = '';
    (async () => {
      try {
        const [{ mountAssembly }, bytes] = await Promise.all([
          import('$lib/home/assembly-renderer.js'),
          loadPreviewMesh(data, fetch, c.signal)
        ]);
        if (c.signal.aborted) return;
        instance = mountAssembly(element, data.model, bytes, (id) => (selected = id));
        viewer = instance;
        instance.filter({ level, roofs, ceilings, cutaway, selected });
      } catch (e) {
        if (!c.signal.aborted)
          meshError =
            'The 3D source view is unavailable. You can still inspect its floor plans, rooms and source notes.';
      }
    })();
    return () => {
      c.abort();
      instance?.dispose();
      viewer = undefined;
    };
  });
  $effect(() => {
    viewer?.filter({ level, roofs, ceilings, cutaway, selected });
  });
</script>

{#if loading}<p>Checking the imported house model…</p>{/if}
{#if message}<p role="alert">
    {message} <button onclick={load}>Check source preview again</button>
  </p>{/if}
{#if info}<section class="source-preview">
    <h2>Existing house model</h2>
    <p><strong>Source preview · awaiting model review</strong></p>
    <p>
      Original reconstructed shapes and familiar room names. Source estimates and unresolved details
      remain visible.
    </p>
    <div class="controls">
      <button aria-pressed={mode === '3D'} onclick={() => (mode = '3D')}>3D source model</button
      ><button aria-pressed={mode === '2D'} onclick={() => (mode = '2D')}>Source floor plan</button
      ><label
        >Floor <select bind:value={level}
          ><option value="all">Whole house</option>{#each info.model.levels as l}<option
              value={l.id}>{l.label}</option
            >{/each}</select
        ></label
      ><label
        >Space <select bind:value={selected}
          ><option value="">All spaces</option
          >{#each info.model.rooms.filter((r: any) => level === 'all' || r.level === level) as r}<option
              value={r.id}>{r.name}</option
            >{/each}</select
        ></label
      >
    </div>
    {#if mode === '3D'}<div class="controls">
        <label><input type="checkbox" bind:checked={cutaway} />See through walls</label><label
          ><input type="checkbox" bind:checked={roofs} />Show roofs</label
        ><label><input type="checkbox" bind:checked={ceilings} />Show ceilings</label><button
          onclick={() => viewer?.reset()}>Reset view</button
        >
      </div>
      <p>
        Drag to orbit · scroll to zoom · right-drag to pan · choose a floor or click a space. Colors
        are illustrative.
      </p>
      <div class="canvas" bind:this={host} aria-label="Original source house model"></div>
      {#if meshError}<p role="alert">{meshError}</p>{/if}
    {:else}<p>North ↑ · East → · model coordinates in feet</p>
      <svg
        viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
        role="group"
        aria-label="Original source floor plan"
      >
        {#each rooms as r (r.id)}<path
            d={path(r.polygon)}
            fill={selected === r.id ? '#b9dfcb' : '#efe8d8'}
            stroke="#b2aa99"
            stroke-width="0.1"
            role="button"
            tabindex="0"
            aria-label={r.name}
            onclick={() => (selected = r.id)}
            onkeydown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selected = r.id;
              }
            }}><title>{r.name}</title></path
          >{#if selected === r.id}{@const c = centroid(r.polygon)}<text
              x={c[0]}
              y={c[1]}
              text-anchor="middle"
              font-size="0.8">{r.name}</text
            >{/if}{/each}
        {#each walls as w (w.id)}{@const a = planPoint(w.start)}{@const b = planPoint(w.end)}<line
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            stroke="#62645d"
            stroke-width={w.thicknessFeet}
          />{#each w.openings as o}{@const p = aperture(w, o)}<line
              x1={p[0][0]}
              y1={p[0][1]}
              x2={p[1][0]}
              y2={p[1][1]}
              stroke={o.kind.includes('window') ? '#619bb3' : '#faf9f3'}
              stroke-width={w.thicknessFeet + 0.1}
            />{/each}{/each}</svg
      >{/if}
    {#if room}<article>
        <h3>{room.name}</h3>
        <p>{room.level} · source space {room.nativeId}</p>
        <p>
          Floor elevation {room.floorElevationFeet.toFixed(2)} ft · ceiling datum {room.ceilingElevationFeet.toFixed(
            2
          )} ft · {room.verticalProvisional === true
            ? 'vertical estimate'
            : room.verticalProvisional === false
              ? 'source-marked vertical datum'
              : 'vertical certainty unmarked'}. Sloped surfaces follow the original 3D mesh.
        </p>
        <p>
          {room.provisional === true
            ? 'Source marks this footprint provisional.'
            : room.provisional === false
              ? 'Source marks this footprint established.'
              : 'Footprint certainty is unmarked.'}
        </p>
      </article>{/if}
    <details>
      <summary>Source estimates and unresolved details ({info.model.uncertainties.length})</summary
      >{#each info.model.uncertainties as note}<p>{note}</p>{/each}
    </details>
    <p>
      This preview remains separate from accepted home facts and household publication. Model
      acceptance needs its own review.
    </p>
    <button onclick={load}>Refresh source preview</button>
  </section>{/if}

<style>
  .source-preview {
    margin: 24px 0;
    padding: 20px;
    border: 1px solid #c8d7cc;
    border-radius: 12px;
    background: #fafbf8;
  }
  h2 {
    font-size: 25px;
  }
  p {
    line-height: 1.6;
  }
  .controls {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    margin: 14px 0;
  }
  label {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  button,
  select {
    padding: 9px 12px;
    border: 1px solid #b8cabb;
    border-radius: 7px;
    background: white;
    color: #254a3c;
  }
  .canvas,
  svg {
    width: 100%;
    height: 560px;
    border: 1px solid #bbcbbf;
    border-radius: 10px;
    background: #faf9f3;
    touch-action: none;
  }
  text {
    pointer-events: none;
    fill: #284936;
  }
  article {
    padding: 12px 16px;
    margin-top: 16px;
    background: #edf5ed;
    border-radius: 8px;
  }
  summary {
    cursor: pointer;
    font-weight: 600;
  }
  details {
    margin: 18px 0;
  }
  @media (max-width: 600px) {
    .source-preview {
      padding: 12px;
    }
    .canvas,
    svg {
      height: 430px;
    }
  }
</style>
