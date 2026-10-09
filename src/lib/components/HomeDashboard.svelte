<script lang="ts">
 import HomeFeeds from './HomeFeeds.svelte';
 import HomeLayout from './HomeLayout.svelte';
 import HomeCare from './HomeCare.svelte';
 import SharedHomeConnect from './SharedHomeConnect.svelte';
 import { onMount } from 'svelte';
 let home: any = $state(null);
 let loadState = $state('loading');
 let errorMessage = $state('');
 let agentStatus=$state('');
 async function requestAgent(){try{const response=await fetch('/api/home/agent-request',{method:'POST'});if(!response.ok)throw new Error('Request could not be saved');agentStatus='Request saved in your Fulcra account. Connect your agent to Fulcra and give it home ID '+home.id+'. Saving this request does not launch an agent.';}catch(e){agentStatus=e instanceof Error?e.message:String(e);}}
 async function ownHome(){const response=await fetch('/api/home/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'own'})});if(response.ok)await load();}
 let role=$state('maintainer');
 let review: any[] = $state([]);
 let kind=$state('note');let entityId=$state('');let field=$state('serial');let value=$state('');let text=$state('');let contactId=$state('');let performedAt=$state('');let saveMessage=$state('');let saving=$state(false);let pending: any=$state(null);
 async function contribute(){
  pending??={id:crypto.randomUUID(),homeId:home.id,baseRevision:home.revision,kind,...(entityId?{entityId}:{}),...(kind==='fact'?{field,value}:{text}),...(kind==='maintenance'?{performedAt,...(contactId?{contactId}:{})}: {})};
  saving=true;saveMessage='';
  try{const response=await fetch('/api/home/contributions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)});const result=await response.json();if(!response.ok){if(response.status===400)pending=null;throw new Error(result.message??'Save could not be confirmed. Retry this contribution.');}if(result.status==='pending-readback'){saveMessage='Submitted; storage confirmation is pending. Retry this same contribution.';}else{pending=null;text='';value='';saveMessage='Saved. Routine additions appear below; contradictions stay in review.';await load();}}catch(e){saveMessage=e instanceof Error?e.message:String(e);}finally{saving=false;}
 }
 let query = $state('');
 let section = $state('Overview');
 const sections = ['Overview','Equipment','Maintenance','History','Care','Layout','Devices','Contributions','Sources','Household'];
 let equipment = $derived((home?.equipment ?? []).filter((item: any) => `${item.name} ${item.system} ${item.model} ${item.room?.name ?? ''}`.toLowerCase().includes(query.toLowerCase())));
 async function load() {
  loadState='loading';errorMessage='';agentStatus='';
  try {
   const response=await fetch('/api/home');
   if(!response.ok)throw new Error(response.status===401?'Please sign in again.':'Your home data is temporarily unavailable.');
   const data=await response.json();home=data.home;role=data.role??'maintainer';review=data.review??[];loadState=data.status;
  }catch(e){loadState='error';errorMessage=e instanceof Error?e.message:String(e);}
 }
 onMount(load);
</script>

<main class="home-dashboard">
 {#if loadState==='loading'}
  <p>Loading your home…</p>
 {:else if loadState==='error'}
  <h1>We couldn’t load your home</h1><p>{errorMessage} Your saved records are unchanged.</p><button onclick={load}>Try again</button>
 {:else if loadState==='empty'}
  <h1>Start with what you know</h1><p>Your home doesn’t need a perfect floor plan. Equipment, contacts and maintenance records can come first.</p><a href="/onboarding">Start guided home setup →</a><SharedHomeConnect onconnected={load} />
 {:else if home}
  <header>
   <div><p class="eyebrow">Your home, remembered</p><h1>{home.name}</h1><p>Equipment, care and the knowledge that keeps your home running.</p></div>
   {#if home.model?.url}<a class="model-link" href={home.model.url} target="_blank" rel="noreferrer">{home.model.label} ↗</a>{/if}
  </header>
  <nav aria-label="Home sections">{#each sections as name}<button class:active={section===name} onclick={()=>section=name}>{name}</button>{/each}</nav>
  {#if section==='Overview'}
   <div class="stats"><article><span>{home.equipment.length}</span><p>Equipment records</p></article><article><span>{home.schedules.filter((s:any)=>s.kind==='maintenance'&&s.state==='past-due').length}</span><p>Known maintenance past due</p></article><article><span>{home.history.filter((h:any)=>h.kind==='maintenance'&&h.status==='completed').length}</span><p>Recorded service visits</p></article></div>
   <section><h2>What needs a little attention</h2><p class="muted">Missing information stays visible. It won’t stop you using your home.</p><ul>{#each home.knowledgeGaps??[] as gap}<li>{gap}</li>{/each}</ul></section>
   <section><h2>At a glance</h2><div class="cards">{#each home.equipment as item}<article><p class="eyebrow">{item.system}</p><h3 id={'equipment-'+item.id}>{item.name}</h3><p>{item.manufacturer??'Manufacturer unknown'} {item.model??'· model unknown'}</p><p class="muted">Last service: {item.lastService?.performedAt??'Not recorded'}</p><p class="muted">Who to call: {item.provider?.name??'Not recorded'}</p><button onclick={()=>{section='Equipment';query=item.name;}}>View equipment</button></article>{/each}</div></section>
  {:else if section==='Equipment'}
   <section><h2>Equipment</h2><label>Find equipment <input type="search" bind:value={query} placeholder="Name, system, model or room" /></label><div class="cards">{#each equipment as item}<article><p class="eyebrow">{item.system}</p><h3 id={'equipment-'+item.id}>{item.name}</h3><p>{item.manufacturer??'Manufacturer unknown'} · {item.model??'Model unknown'} · {item.capacity??''}</p><p>Location: {item.room?.name??'Not placed yet'}</p>{#if item.room?.viewerUrl}<a href={item.room.viewerUrl} target="_blank" rel="noreferrer">Open viewer — select {item.room.name} ↗</a>{/if}<dl>{#each item.facts??[] as fact}<dt>{fact.name}</dt><dd>{fact.value}</dd>{/each}<dt>Last maintenance</dt><dd>{item.lastService?.performedAt??'Not recorded'}</dd><dt>Service provider</dt><dd>{item.provider?.name??'Not recorded'}</dd></dl><p class="muted">Contributed field evidence</p>{#each item.fieldContributions as entry}<p class="muted">{entry.field}: {entry.value} · contributed by {entry.authorUserId} · {entry.recordedAt??'Time not recorded'} · contribution {entry.contributionId}</p>{/each}<p class="muted">Original record sources</p>{#each item.sources as source}<a class="source-link" href={'/api/home/source?id='+encodeURIComponent(source.id)} target="_blank" rel="noreferrer">{source.title} · {source.freshness}</a>{/each}</article>{/each}</div>{#if equipment.length===0}<p>No equipment matches that search.</p>{/if}</section>
  {:else if section==='Maintenance'}
   <section><h2>Maintenance and schedules</h2><p class="muted">A schedule describes what should happen. Service history records what actually happened.</p>{#if home.schedules.length===0}<p>No maintenance schedules recorded yet.</p>{/if}{#each home.schedules as schedule}<article><p class="eyebrow">{schedule.kind} · {schedule.state}</p><h3>{schedule.name}</h3><p>{schedule.description??''}</p><p>Next due: {schedule.dueAt??'Not recorded'}</p>{#each schedule.sources as source}<a href={'/api/home/source?id='+encodeURIComponent(source.id)} target="_blank" rel="noreferrer">Read schedule source</a>{/each}</article>{/each}</section>
  {:else if section==='History'}
   <section><h2>Service history</h2>{#if home.history.length===0}<p>No completed maintenance recorded in the imported evidence. This means the date is unknown, not that maintenance never happened.</p>{/if}{#each home.history as event}<article><h3>{event.title??event.kind}</h3><p>{event.performedAt} · {event.status}</p><p>{event.summary??''}</p></article>{/each}</section>
  {:else if section==='Devices'}
   <HomeFeeds onEquipment={(id)=>{section='Equipment';query=home.equipment.find((e:any)=>e.id===id)?.name??'';}} />
  {:else if section==='Layout'}
   <HomeLayout {home} {role} />
  {:else if section==='Care'}
   <HomeCare {home} {role} onchanged={load} onEquipment={(id)=>{section='Equipment';query=home.equipment.find((e:any)=>e.id===id)?.name??'';}} />
  {:else if section==='Contributions'}
   <section><h2>Add what you know</h2><p>Notes and routine facts help immediately. Contradictions and floor-plan changes wait for the home maintainer’s review.</p>
    {#if role==='viewer'}<p>Your household has given you view access. Ask the maintainer for contributor access to add information.</p>{:else}<form onsubmit={(event)=>{event.preventDefault();contribute();}}>
     <fieldset disabled={saving||!!pending}><label>Type <select bind:value={kind}><option value="note">Note</option><option value="fact">Equipment fact</option><option value="maintenance">Completed maintenance</option><option value="geometry">Layout correction</option></select></label>
     <label>Equipment <select bind:value={entityId}><option value="">Whole home</option>{#each home.equipment as item}<option value={item.id}>{item.name}</option>{/each}</select></label>
     {#if kind==='fact'}<label>Fact <select bind:value={field}>{#each ['model','manufacturer','serial','capacity','installedAt'] as name}<option value={name}>{name}</option>{/each}</select></label><label>Value <input bind:value required maxlength="500" /></label>{:else}<label>Description <textarea bind:value={text} required maxlength="10000"></textarea></label>{/if}
     {#if kind==='maintenance'}<label>Actual service date <input type="date" bind:value={performedAt} required /></label><label>Service provider (optional) <select bind:value={contactId}><option value="">Not recorded</option>{#each home.contacts??[] as c}<option value={c.id}>{c.name}</option>{/each}</select></label>{/if}</fieldset>
     <button disabled={saving} type="submit">{saving?'Saving…':pending?'Retry same contribution':'Save contribution'}</button>
    </form>{/if}<p role="status">{saveMessage}</p>
   </section><section><h2>Household notes</h2>{#if !(home.notes??[]).length}<p>No notes yet.</p>{/if}{#each home.notes??[] as note}<article><p>{note.text}</p><p class="muted">Recorded {note.recordedAt} · author {note.authorUserId}</p></article>{/each}</section>
   <section><h2>Needs review ({review.length})</h2>{#if !review.length}<p>No contributions waiting for review.</p>{/if}{#each review as item}<article><p class="eyebrow">{item.reason}</p><p>{item.contribution.text??`${item.contribution.field}: ${item.contribution.value}`}</p><p class="muted">Contribution {item.contribution.id}</p></article>{/each}<p class="muted">The maintainer reviews these against their sources before updating the accepted home record.</p></section>
  {:else if section==='Household'}
   <section><h2>Your household</h2><p><a href="/onboarding">Set up another home</a></p><p>Your role: {role}</p><p>Home ID: {home.id}</p><button onclick={requestAgent}>Save request for a home agent</button><p role="status">{agentStatus}</p><button onclick={ownHome}>Open my original home record</button><p>The home maintainer reviews conflicting facts and layout changes. Each contributor keeps their own originals in Fulcra and shares only this home’s contributions.</p><p>Changing a share in Fulcra changes future access. Previously viewed or downloaded information cannot be recalled.</p><SharedHomeConnect onconnected={load} /></section>
  {:else if section==='Sources'}
   <section><h2>Your home knowledge</h2><p class="muted">“Recent” means the source reports verification within 30 days. Importing an old document doesn’t verify its contents.</p>{#each home.sources as source}<article><h3>{source.title}</h3><p>{source.path}</p><p>Verified: {source.verifiedAt??'Not recorded'} · {source.freshness}</p><a href={'/api/home/source?id='+encodeURIComponent(source.id)} target="_blank" rel="noreferrer">Read original source ↗</a></article>{/each}</section>
  {/if}
 {/if}
</main>

<style>
 .home-dashboard{max-width:1120px;margin:0 auto;padding:36px 24px 80px;color:#202c2c;font-family:system-ui,sans-serif;background:#f7faf8;min-height:100vh;width:100%;box-sizing:border-box}header{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-bottom:28px}h1{font-size:40px;letter-spacing:-1.4px;margin:8px 0}h2{font-size:25px;margin:0 0 12px}h3{font-size:20px;margin:8px 0}p{line-height:1.6}.eyebrow{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#387367;font-weight:650}.muted{color:#62716d;font-size:14px}nav{display:flex;gap:6px;border-bottom:1px solid #d5e0d9;padding-bottom:12px;flex-wrap:wrap}button,.model-link{padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;background:white;cursor:pointer;color:#254a3c;font-size:14px}nav button{border:0;background:transparent}nav button.active{background:#dceee4}.stats,.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(235px,1fr));gap:18px;margin:24px 0}article{background:white;border:1px solid #dbe4df;padding:22px;border-radius:12px;margin:12px 0}.stats article{margin:0}.stats span{font-size:34px;font-weight:650}section{margin-top:32px}a{color:#216c58;text-decoration:underline;text-underline-offset:3px}.model-link{text-decoration:none;white-space:nowrap}.source-link{display:block;margin-top:8px;font-size:13px}li{line-height:1.7;margin-bottom:8px}label{display:block;font-size:14px}fieldset{border:0;padding:0}select,textarea{display:block;padding:12px;margin:8px 0 16px;border:1px solid #becfc5;border-radius:8px;max-width:100%;background:white;color:#202c2c}textarea{width:90%;min-height:100px}input{display:block;width:100%;max-width:480px;padding:12px;border:1px solid #becfc5;border-radius:8px;margin-top:8px;background:white;color:#202c2c}dt{font-size:13px;color:#63736c;margin-top:14px}dd{margin:3px 0;font-size:14px}@media(max-width:600px){header{display:block}.model-link{display:inline-block}.home-dashboard{padding:24px 16px}h1{font-size:32px}}
</style>
