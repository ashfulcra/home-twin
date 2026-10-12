<script lang="ts">
 import {searchHomeKnowledge} from '$lib/home/knowledge-search.js';
 import {projectHomeNotes} from '$lib/home/home-notes.js';
 let {home,onEquipment}:{home:any,onEquipment:(id:string)=>void}=$props();
 let query=$state('');
 let results=$derived(searchHomeKnowledge(home,query));
 let notes=$derived(projectHomeNotes(home,home?.asOf??new Date().toISOString()));
</script>
<section>
 <h2>Find your home records</h2>
 <p>Look up equipment, providers, service history, schedules and household notes. Results come from this home’s current records; missing information stays unknown.</p>
 {#if ['partial','size-limited','unverified'].includes(notes.status)}<p role="status">Some household notes could not be included in search. Review the original notes with your home maintainer; an empty search does not establish that a fact is missing.</p>{/if}
 <label>Search home knowledge <input type="search" bind:value={query} maxlength="120" placeholder="Equipment, provider, model or care task" /></label>
 {#if !query.trim()}<p class="muted">Try a system name like heating or plumbing, a provider’s name, or a model number.</p>{:else}
 <p role="status">{results.length} matching records{results.length===40?' (showing up to 40)':''}</p>
 {#each results as result}<article>
 <p class="kind">{result.kind==='history'?'Service history':result.kind}</p><h3>{result.title}</h3><p>{result.detail}</p>
 {#if result.kind==='equipment'}<p>Last completed service: {result.lastServiceAt??'Not recorded'}</p><p>Who to call: {result.providerName??'Not recorded'}</p>{/if}
 {#if result.kind==='provider'}<p>Phone: {result.phone??'Not recorded'}</p><p>Email: {result.email??'Not recorded'}</p>{/if}
 {#if result.kind==='history'}<p>Recorded date: {result.performedAt??'Not recorded'} · status: {result.status}</p>{/if}
 {#if result.kind==='schedule'}<p>Next due: {result.dueAt??'Not recorded'} · {result.status}</p>{/if}
 {#if result.kind==='note'}<p>Note recorded: {result.recordedAt??'Not recorded'}. This is not a service date.</p>{#if result.textTruncated}<p>Showing an excerpt. Read the original note with your home maintainer.</p>{/if}{/if}
 {#if result.entityId}<button onclick={()=>onEquipment(result.entityId)}>View equipment</button>{/if}
 {#each result.sources as source}<a href={'/api/home/source?id='+encodeURIComponent(source.id)} target="_blank" rel="noreferrer">Read source: {source.title}</a>{/each}
 </article>{/each}
 {#if !results.length}<p>No matching records. This does not mean the system or its service history does not exist. Add the original record in Sources or ask your home maintainer.</p>{/if}
 {/if}
</section>
<style>
 section{margin-top:32px}h2{font-size:25px}p{line-height:1.6}input{display:block;width:100%;max-width:480px;box-sizing:border-box;padding:12px;margin:8px 0;border:1px solid #becfc5;border-radius:8px;background:white;color:#202c2c}article{background:white;border:1px solid #dbe4df;padding:22px;border-radius:12px;margin:12px 0}.kind{font-size:12px;text-transform:uppercase;color:#387367}.muted{color:#62716d}button{padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;background:white;color:#254a3c;cursor:pointer}a{display:block;margin-top:8px;color:#216c58}
</style>
