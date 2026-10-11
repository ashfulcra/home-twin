<script lang="ts">
  import { untrack } from 'svelte';
  import { validateBuilding } from '$lib/home/representative-building.js';
  import { footprintBounds } from '$lib/home/reconstruction.js';
  let {
    model,
    oncorrect,
    readonly = false
  } = $props<{ model: any; oncorrect?: (room: any) => void; readonly?: boolean }>();
  let mode = $state('3D');
  let level = $state('all');
  let selected = $state('');
  let roofs = $state(false);
  let cutaway = $state(true);
  let exploded = $state(true);
  let query = $state('');
  let host = $state<HTMLDivElement>();
  let error = $state('');
  let viewer = $state<any>();
  let pose: any;
  let framing = '';
  let parsed = $derived.by(() => {
    try {
      return validateBuilding(model);
    } catch (e) {
      return null;
    }
  });
  let room = $derived(parsed?.rooms.find((r) => r.id === selected));
  let features = $derived(
    parsed?.features.filter(
      (f) =>
        (!selected || f.roomId === selected) &&
        (level === 'all' || f.level === level) &&
        (!query || `${f.name} ${f.kind} ${f.details}`.toLowerCase().includes(query.toLowerCase()))
    ) ?? []
  );
  let floor = $derived(level === 'all' ? (parsed?.levels[0]?.id ?? '') : level);
  let floorRooms = $derived(parsed?.rooms.filter((r) => r.level === floor) ?? []);
  let walls = $derived(parsed?.walls.filter((w) => w.level === floor) ?? []);
  let fixtures = $derived(
    parsed?.features.filter(
      (f) => f.level === floor && !['ceiling', 'skylight', 'finish'].includes(f.kind)
    ) ?? []
  );
  let envelopes = $derived(parsed?.floorEnvelopes.filter((f) => f.level === floor) ?? []);
  let bounds = $derived(
    footprintBounds(
      [
        ...floorRooms.flatMap((r) => r.polygon),
        ...envelopes.flatMap((f) => f.polygon),
        ...fixtures.flatMap((f) => f.polygon ?? [])
      ],
      4
    )
  );
  const heightLabel = (n: number | null) =>
    n === null ? 'Unknown' : `${Math.floor(n)}′ ${Math.round((n % 1) * 12 * 100) / 100}″`;
  let selectableRooms = $derived(
    parsed?.rooms.filter((r) => level === 'all' || r.level === level) ?? []
  );
  $effect(() => {
    if (
      level !== 'all' &&
      selected &&
      parsed?.rooms.find((r) => r.id === selected)?.level !== level
    )
      selected = '';
  });
  const points = (p: number[][]) => p.map((x) => x.join(',')).join(' ');
  const center = (p: number[][]) => [
    p.reduce((n, x) => n + x[0], 0) / p.length,
    p.reduce((n, x) => n + x[1], 0) / p.length
  ];
  const polygonPath = (p: number[][]) => 'M' + p.map((x) => x.join(' ')).join(' L') + ' Z';
  function openingPoints(w: any, o: any) {
    const len = Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]),
      dx = (w.end[0] - w.start[0]) / len,
      dy = (w.end[1] - w.start[1]) / len;
    return [
      w.start[0] + dx * o.offsetFeet,
      w.start[1] + dy * o.offsetFeet,
      w.start[0] + dx * (o.offsetFeet + o.widthFeet),
      w.start[1] + dy * (o.offsetFeet + o.widthFeet)
    ];
  }
  $effect(() => {
    if (!host || mode !== '3D' || !parsed) return;
    const element = host;
    const data = parsed;
    const frame = level + ':' + exploded;
    const options = {
      level,
      roofs,
      cutaway,
      exploded,
      selected: untrack(() => selected),
      pose: frame === framing ? pose : undefined
    };
    framing = frame;
    let cancelled = false;
    let instance: any;
    error = '';
    import('$lib/home/building-renderer.js')
      .then(({ mountBuilding }) => {
        if (cancelled) return;
        try {
          instance = mountBuilding(element, data, options, (id) => (selected = id));
          viewer = instance;
        } catch (e) {
          error =
            'The 3D view is unavailable on this device. The floor plans and architectural details are still available.';
        }
      })
      .catch(() => {
        if (!cancelled) error = 'The 3D view could not load. You can still use the floor plans.';
      });
    return () => {
      cancelled = true;
      if (instance) {
        pose = instance.pose();
        instance.dispose();
      }
    };
  });
  $effect(() => {
    viewer?.selectRoom(selected);
  });
</script>

<section class="building">
  <h2>Explore the residence</h2>
  <p>Representative architecture · source details and labeled estimates · refine over time</p>
  {#if parsed}<div class="toolbar">
      <button class:active={mode === '3D'} onclick={() => (mode = '3D')}>3D house</button><button
        class:active={mode === '2D'}
        onclick={() => {
          mode = '2D';
          if (level === 'all') level = parsed.levels[0].id;
        }}>Floor plan</button
      ><label
        >Level <select bind:value={level}
          ><option value="all">Whole house</option>{#each parsed.levels as l}<option value={l.id}
              >{l.label}</option
            >{/each}</select
        ></label
      ><label
        >Room <select bind:value={selected}
          ><option value="">All rooms</option>{#each selectableRooms as r}<option value={r.id}
              >{r.name}</option
            >{/each}</select
        ></label
      >
    </div>
    {#if mode === '3D'}<div class="toolbar">
        <label><input type="checkbox" bind:checked={cutaway} /> Cutaway walls</label><label
          ><input type="checkbox" bind:checked={exploded} /> Separate levels</label
        ><label><input type="checkbox" bind:checked={roofs} /> Show roofs</label><button
          onclick={() => viewer?.reset()}>Reset view</button
        >
      </div>
      <p>Drag to orbit · scroll to zoom · right-drag to pan · click a room</p>
      <div
        class="canvas"
        bind:this={host}
        aria-label="Interactive representative house model"
      ></div>
      {#if error}<p role="alert">{error}</p>{/if}
    {:else}<svg
        viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
        aria-label="Architectural floor plan"
        role="group"
        >{#each envelopes as f}<path
            d={polygonPath(f.polygon) + f.holes.map(polygonPath).join(' ')}
            fill="#ebe3d1"
            fill-rule="evenodd"
            stroke="#c9bb9e"
            stroke-width="0.15"
          />{/each}{#each floorRooms as r (r.id)}<path
            d={polygonPath(r.polygon) + r.holes.map(polygonPath).join(' ')}
            fill-rule="evenodd"
            fill={r.id === selected ? '#c8e3d4' : '#f5eddc'}
            stroke="#c9bb9e"
            stroke-width="0.12"
            role="button"
            tabindex="0"
            aria-label={r.name}
            onclick={() => (selected = r.id)}
            onkeydown={(e) => {
              if (e.key === 'Enter') selected = r.id;
            }}
          /><text
            x={center(r.polygon)[0]}
            y={center(r.polygon)[1]}
            text-anchor="middle"
            font-size="0.85">{r.name}</text
          >{/each}{#each walls as w (w.id)}<line
            x1={w.start[0]}
            y1={w.start[1]}
            x2={w.end[0]}
            y2={w.end[1]}
            stroke="#5b574e"
            stroke-width={w.thicknessFeet}
          />{#each w.openings as o}{@const p = openingPoints(w, o)}<line
              x1={p[0]}
              y1={p[1]}
              x2={p[2]}
              y2={p[3]}
              stroke={o.kind === 'window' ? '#6ea8be' : '#f5eddc'}
              stroke-width={w.thicknessFeet + 0.15}
            />{/each}{/each}{#each fixtures as f (f.id)}{#if f.polygon}<polygon
              points={points(f.polygon)}
              fill="#ded7be"
              stroke="#807d70"
              stroke-width="0.1"><title>{f.name} · {f.basis}</title></polygon
            >{:else}<rect
              x={f.position[0] - f.size[0] / 2}
              y={f.position[1] - f.size[1] / 2}
              width={f.size[0]}
              height={f.size[1]}
              fill="#c7c8bb"
              stroke="#807d70"
              stroke-width="0.1"><title>{f.name} · {f.basis}</title></rect
            >{/if}{/each}</svg
      >{/if}
    {#if room}<article>
        <h3>{room.name}</h3>
        <p>{room.level} · representative ceiling {heightLabel(room.heightFeet)} · {room.basis}</p>
        <p>
          {#if room.sourcePage && room.sourceSheet}Drawing {room.sourceSheet}, page {room.sourcePage}.{:else}Estimated
            geometry, with no drawing reference.{/if} Select another room or submit a correction through
          the household evidence workflow.
        </p>
        {#if oncorrect && !readonly}<button onclick={() => oncorrect?.(room)}
            >Correct this room</button
          >{/if}
      </article>{/if}
    <details open>
      <summary>Architectural details ({features.length})</summary><label
        >Find a feature <input
          bind:value={query}
          placeholder="Fireplace, stair, kitchen, ceiling…"
        /></label
      >
      <div class="details">
        {#each features as f}<article>
            <h3>{f.name}</h3>
            <p>{f.kind} · {f.level} · {f.basis}</p>
            <p>{f.details}</p>
            {#if f.sourcePage}<small>Drawing page {f.sourcePage}</small>{/if}
          </article>{/each}
      </div>
    </details>
    <details>
      <summary>Model assumptions ({parsed.assumptions.length})</summary
      >{#each parsed.assumptions as a}<article>
          <strong>{a.subject}: {a.value}</strong>
          <p>{a.reason}</p>
        </article>{/each}
    </details>
    <p>
      Assumptions describe this visualization. They do not establish installed equipment,
      maintenance history or verified measurements.
    </p>
  {:else}<p>The representative model format needs checking. Saved evidence is preserved.</p>{/if}
</section>

<style>
  .building {
    margin: 30px 0;
  }
  h2 {
    font-size: 27px;
  }
  p {
    line-height: 1.5;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin: 12px 0;
  }
  button,
  select,
  input:not([type='checkbox']) {
    padding: 9px 12px;
    border: 1px solid #bdb7a5;
    border-radius: 7px;
    background: white;
    color: #273c30;
  }
  .active {
    background: #d7e9df;
  }
  .canvas {
    height: 600px;
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #cec6b5;
    touch-action: none;
  }
  svg {
    width: 100%;
    height: 600px;
    background: #faf8f0;
    border: 1px solid #cec6b5;
    border-radius: 12px;
  }
  text {
    pointer-events: none;
    fill: #3c4439;
  }
  polygon {
    cursor: pointer;
  }
  article {
    padding: 12px 16px;
    background: #f1eee5;
    border-radius: 8px;
    margin: 10px 0;
  }
  .details {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 10px;
    max-height: 450px;
    overflow: auto;
  }
  summary {
    cursor: pointer;
    font-size: 18px;
    margin: 15px 0;
  }
  label {
    display: inline-flex;
    gap: 7px;
    align-items: center;
  }
</style>
