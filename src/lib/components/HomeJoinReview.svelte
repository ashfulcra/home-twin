<script lang="ts">
 import {untrack} from 'svelte';
 import {householdPublication} from '$lib/home/household-publication.js';
 import {buildJoinReview,joinIntentID,joinContentDigest} from '$lib/home/joining.js';
 let {homeId,ownerUserId,requestCode='',resumeCode='',onreview=()=>{}}:{homeId:string;ownerUserId:string;requestCode?:string;resumeCode?:string;onreview?:()=>void}=$props();
 let publicationOnly:any=$state(null);
 let code=$state('');let preview:any=$state(null);let role=$state('viewer');let confirmed=$state(false);let message=$state('');let loading=$state(false);let pending:any=$state(null);let result:any=$state(null);
 let applyCode=$state('');let resumeContext:any=$state(null);
 let consumedResumeCode='';
 let consumedRequestCode='';let readGeneration=0;
 $effect(()=>{const selected=requestCode,savedResume=resumeCode,waitingForDecision=!!pending||!!applyCode;untrack(()=>{if(savedResume&&savedResume!==consumedResumeCode&&!waitingForDecision){consumedResumeCode=savedResume;applyCode=savedResume;sessionStorage.setItem('home-join-apply:'+homeId+':'+ownerUserId,applyCode);void readSavedDecision();return;}if(selected&&selected!==consumedRequestCode&&!waitingForDecision){consumedRequestCode=selected;code=selected;void readRequest();}});});
 const publication=$derived(preview?householdPublication(preview.publicationBase,{userId:preview.request.authorUserId,role}):publicationOnly);
 async function previewPublication(){const generation=++readGeneration;loading=true;message='';try{const r=await fetch('/api/home/join-review?preview=publication',{cache:'no-store'});const b=await r.json();if(generation!==readGeneration)return;if(!r.ok)throw new Error(b.message??'Publication preview unavailable');publicationOnly=b.publicationBase;message='Preview only. No publication, membership or share changed.';}catch(e){if(generation===readGeneration)message=e instanceof Error?e.message:String(e);}finally{if(generation===readGeneration)loading=false;}}
 async function readRequest(){const generation=++readGeneration,selectedCode=code;loading=true;message='';preview=null;publicationOnly=null;result=null;confirmed=false;try{const response=await fetch('/api/home/join-review?code='+encodeURIComponent(selectedCode),{cache:'no-store'});const body=await response.json();if(generation!==readGeneration)return;if(!response.ok)throw new Error(body.message??'Request unavailable. Ask the applicant to share this exact request file with you.');if(body.request?.homeId!==homeId||body.request?.ownerUserId!==ownerUserId)throw new Error('Home target changed. Refresh Household.');preview=body;role=body.request.requestedRole;}catch(e){if(generation===readGeneration)message=e instanceof Error?e.message:String(e);}finally{if(generation===readGeneration)loading=false;}}
 async function applyDecision(){
  if(!resumeContext){message='Verify the saved decision before continuing.';return;}
  loading=true;message='Applying your decision…';
  try{const response=await fetch('/api/home/admission',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reviewCode:applyCode})});const body=await response.json();if(!response.ok)throw new Error(body.message??'Setup could not be confirmed. Retry this same decision.');if(body.status==='review-required'){
    if(body.noAccessMutationStarted!==true)throw new Error('Saved operation status is unverified; continue the same decision.');
    pending=null;applyCode='';resumeContext=null;result=null;sessionStorage.removeItem('home-join-apply:'+homeId+':'+ownerUserId);code=body.requestCode??code;consumedRequestCode=code;await readRequest();message=body.message??'Access setup did not begin. Review the current contents again.';return;
   }
   result=body;pending=null;applyCode='';sessionStorage.removeItem('home-join-apply:'+homeId+':'+ownerUserId);message=body.status==='rejection-recorded'?'Request declined.':'Approved. The selected home records are shared with this account. They can check for approval to enter the home.';onreview();
  }catch(e){message=e instanceof Error?e.message:String(e);}finally{loading=false;}
 }
 async function review(decision:string){
  loading=true;message='';
  try{
   if(!pending){const recordedAt=new Date().toISOString(),publicationDigest=await joinContentDigest(JSON.stringify(publication));const value=buildJoinReview(preview.request,{id:crypto.randomUUID(),decision,role},{homeId,ownerUserId,userId:ownerUserId,homeRevision:preview.homeRevision,homeFileVersion:preview.homeFileVersion,homeDigest:preview.homeDigest,requestDigest:preview.requestDigest,publicationDigest},recordedAt);pending={id:await joinIntentID(value),recordedAt,code,decision,role,scopeConfirmed:confirmed,requestDigest:preview.requestDigest,homeRevision:preview.homeRevision,homeFileVersion:preview.homeFileVersion,homeDigest:preview.homeDigest,publicationDigest};}
   const response=await fetch('/api/home/join-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)});const body=await response.json();if(!response.ok){if(response.status===400||response.status===409)pending=null;throw new Error(body.message??'Decision could not be confirmed. Retry the same decision.');}
   if(body.status==='pending-readback'){message='Decision confirmation is pending. Retry this same decision.';return;}
   applyCode=body.reviewCode;resumeContext={recipientUserId:preview.request.authorUserId,role:pending.role,decision:pending.decision};sessionStorage.setItem('home-join-apply:'+homeId+':'+ownerUserId,applyCode);await applyDecision();
  }catch(e){message=e instanceof Error?e.message:String(e);}finally{loading=false;}
 }
 async function readSavedDecision(){
  loading=true;
  try{const response=await fetch('/api/home/admission?reviewCode='+encodeURIComponent(applyCode),{cache:'no-store'}),body=await response.json();if(!response.ok||body.status!=='saved-decision')throw new Error(body.message??'Saved decision could not be verified.');resumeContext=body;message='Continue to finish this saved decision for the account shown below.';}catch(e){message=e instanceof Error?e.message:String(e);}finally{loading=false;}
 }
 import {onMount} from 'svelte';
 onMount(()=>{const saved=sessionStorage.getItem('home-join-apply:'+homeId+':'+ownerUserId);if(saved&&/^[a-f0-9-]{36}-[a-f0-9]{64}$/.test(saved)){applyCode=saved;message='A saved decision needs confirmation. Checking its original recipient…';void readSavedDecision();}});

</script>
<article>
 <h3>Review a join request</h3>
 <p>Choose a request from the inbox, or paste its code below. App requests are submitted automatically. An older manual request must have its exact file shared with your account. Your account reads it directly.</p>
 <button disabled={loading||!!pending||!!applyCode} onclick={previewPublication}>Preview household records</button>
 <form onsubmit={(event)=>{event.preventDefault();readRequest();}}><label>Request code <input bind:value={code} required maxlength="300" disabled={loading||!!pending||!!applyCode} /></label><button disabled={loading||!!pending||!!applyCode} type="submit">Read request</button></form>
 {#if preview}
  <p>Applicant’s Fulcra account: <code>{preview.request.authorUserId}</code></p><p>Requested access: {preview.request.requestedRole}</p><p>Introduction (self-reported): {preview.request.introduction}</p>
  <fieldset disabled={loading||!!pending||!!applyCode||['outgoing-confirmed-member-unverified','rejection-recorded'].includes(result?.status)}>
   <label>Role to approve <select bind:value={role} onchange={()=>confirmed=false}><option value="viewer">Viewer</option><option value="contributor">Contributor</option></select></label>
   <p>Planned access: this home’s curated household record and model at <code>/shared/home-twin/{homeId}/home.json</code>. Original documents, file history, other homes and the private vault are excluded. Your decision is also shared with this applicant as an access status. Contributor return shares and mesh are separate approvals.</p>
   <label class="consent"><input type="checkbox" bind:checked={confirmed} />I reviewed this account, role, scope and exact household contents below.</label>
  </fieldset>
  {#if !['outgoing-confirmed-member-unverified','rejection-recorded'].includes(result?.status)&&!applyCode}
   {#if pending}<button disabled={loading} onclick={()=>review(pending.decision)}>Retry same decision</button>{:else}<button disabled={loading||!confirmed} onclick={()=>review('approve')}>Approve access</button><button disabled={loading||!confirmed} onclick={()=>review('reject')}>Decline request</button>{/if}
  {/if}
 {/if}
 {#if publication}<details open><summary>Exact household publication preview</summary><p>This includes the displayed contacts, equipment identifiers, notes, maintenance records and home model. Original files and private source paths are excluded. Review the text as well as the field names before approving this recipient.</p><textarea readonly rows="14" value={JSON.stringify(publication,null,2)} aria-label="Exact household publication preview"></textarea></details>{/if}
 {#if publicationOnly&&!preview}
  {#if publicationOnly.members?.length}<p><a href="/api/home/household-refresh">Prepare an update for your home agent</a>. Review the downloaded contents and existing household members before authorizing your agent to refresh their shared view. This preparation changes nothing.</p>{:else}<p>No household members are approved yet. Once someone joins, your home agent can prepare reviewed updates for their shared view.</p>{/if}
 {/if}
 {#if applyCode}{#if resumeContext}<p>Unfinished {resumeContext.decision==='approve'?'approval':'decline'} for <code>{resumeContext.recipientUserId}</code>{resumeContext.role?' · '+resumeContext.role:''}. This is the original saved decision.</p>{:else}<button disabled={loading} onclick={readSavedDecision}>Verify saved decision</button>{/if}<button disabled={loading||!resumeContext} onclick={applyDecision}>{loading?'Applying…':'Continue access setup'}</button>{/if}
 <p class="note">Approval updates this home’s membership and shares the reviewed household records with this account. No agent is required. Original evidence, contributor return shares and agent pairing remain separate. The applicant can check their current access after approval.</p>
 <p role="status">{message}</p>
</article>
<style>
 article{padding:24px;background:white;border:1px solid #dbe4df;border-radius:12px;margin:20px 0}h3{font-size:21px;margin:0 0 12px}p{line-height:1.6}label{display:block;margin:15px 0}textarea{width:100%;box-sizing:border-box;font:12px/1.5 monospace;padding:12px;border:1px solid #becfc5;border-radius:8px;background:white;color:#202c2c}summary{margin:20px 0;font-weight:600}input,select{display:block;padding:10px;border:1px solid #becfc5;border-radius:8px;background:white;color:#202c2c;max-width:100%;box-sizing:border-box}input{width:100%}code{overflow-wrap:anywhere;font-size:13px}fieldset{border:0;padding:0}.consent{display:flex;align-items:flex-start;gap:10px;line-height:1.5}.consent input{width:auto}button{padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;background:white;cursor:pointer;color:#254a3c;font-size:14px;margin-right:8px}button:disabled{opacity:.6}.note{color:#62716d;font-size:14px}
</style>
