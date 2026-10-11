<script lang="ts">
 import {untrack} from 'svelte';
 import {householdPublication} from '$lib/home/household-publication.js';
 import {buildJoinReview,joinIntentID,joinContentDigest} from '$lib/home/joining.js';
 let {homeId,ownerUserId,requestCode='',onreview=()=>{}}:{homeId:string;ownerUserId:string;requestCode?:string;onreview?:()=>void}=$props();
 let publicationOnly:any=$state(null);
 let code=$state('');let preview:any=$state(null);let role=$state('viewer');let confirmed=$state(false);let message=$state('');let loading=$state(false);let pending:any=$state(null);let result:any=$state(null);
 let consumedRequestCode='';let readGeneration=0;
 $effect(()=>{const selected=requestCode,waitingForDecision=!!pending;untrack(()=>{if(selected&&selected!==consumedRequestCode&&!waitingForDecision){consumedRequestCode=selected;code=selected;void readRequest();}});});
 const publication=$derived(preview?householdPublication(preview.publicationBase,{userId:preview.request.authorUserId,role}):publicationOnly);
 async function previewPublication(){const generation=++readGeneration;loading=true;message='';try{const r=await fetch('/api/home/join-review?preview=publication',{cache:'no-store'});const b=await r.json();if(generation!==readGeneration)return;if(!r.ok)throw new Error(b.message??'Publication preview unavailable');publicationOnly=b.publicationBase;message='Preview only. No publication, membership or share changed.';}catch(e){if(generation===readGeneration)message=e instanceof Error?e.message:String(e);}finally{if(generation===readGeneration)loading=false;}}
 async function readRequest(){const generation=++readGeneration,selectedCode=code;loading=true;message='';preview=null;publicationOnly=null;result=null;confirmed=false;try{const response=await fetch('/api/home/join-review?code='+encodeURIComponent(selectedCode),{cache:'no-store'});const body=await response.json();if(generation!==readGeneration)return;if(!response.ok)throw new Error(body.message??'Request unavailable. Ask the applicant to share this exact request file with you.');if(body.request?.homeId!==homeId||body.request?.ownerUserId!==ownerUserId)throw new Error('Home target changed. Refresh Household.');preview=body;role=body.request.requestedRole;}catch(e){if(generation===readGeneration)message=e instanceof Error?e.message:String(e);}finally{if(generation===readGeneration)loading=false;}}
 async function review(decision:string){
  loading=true;message='';
  try{if(!pending){const recordedAt=new Date().toISOString();const publicationDigest=await joinContentDigest(JSON.stringify(publication));const value=buildJoinReview(preview.request,{id:crypto.randomUUID(),decision,role},{homeId,ownerUserId,userId:ownerUserId,homeRevision:preview.homeRevision,homeFileVersion:preview.homeFileVersion,homeDigest:preview.homeDigest,requestDigest:preview.requestDigest,publicationDigest},recordedAt);pending={id:await joinIntentID(value),recordedAt,code,decision,role,scopeConfirmed:confirmed,requestDigest:preview.requestDigest,homeRevision:preview.homeRevision,homeFileVersion:preview.homeFileVersion,homeDigest:preview.homeDigest,publicationDigest};}const response=await fetch('/api/home/join-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)});const body=await response.json();if(!response.ok){if(response.status===400||response.status===409)pending=null;throw new Error(body.message??'Review save could not be confirmed. Retry the same decision.');}result=body;if(body.status==='saved-review-intent')onreview();if(body.status==='pending-readback')message='Review confirmation is pending. Retry this same decision.';else{pending=null;message=body.review.decision==='approve'?'Approval intent saved for your designated home maintainer. Publishing and sharing are still pending; access has not been granted.':'Rejection recorded in your account. No member access or share changed.';}}catch(e){message=e instanceof Error?e.message:String(e);}finally{loading=false;}
 }
</script>
<article>
 <h3>Review a join request</h3>
 <p>Choose a request from the inbox, or paste its code below. The applicant must share that exact request file with your account. Your account reads it directly.</p>
 <button disabled={loading||!!pending} onclick={previewPublication}>Preview household records</button>
 <form onsubmit={(event)=>{event.preventDefault();readRequest();}}><label>Request code <input bind:value={code} required maxlength="300" disabled={loading||!!pending} /></label><button disabled={loading||!!pending} type="submit">Read request</button></form>
 {#if preview}
  <p>Applicant’s Fulcra account: <code>{preview.request.authorUserId}</code></p><p>Requested access: {preview.request.requestedRole}</p><p>Introduction (self-reported): {preview.request.introduction}</p>
  <fieldset disabled={loading||!!pending||result?.status==='saved-review-intent'}>
   <label>Role to approve <select bind:value={role} onchange={()=>confirmed=false}><option value="viewer">Viewer</option><option value="contributor">Contributor</option></select></label>
   <p>Planned access: this home’s curated household record and model at <code>/shared/home-twin/{homeId}/home.json</code>. Original documents, file history, other homes and the private vault are excluded. Contributor return shares and mesh are separate approvals.</p>
   <label class="consent"><input type="checkbox" bind:checked={confirmed} />I reviewed this account, role, scope and exact household contents below.</label>
  </fieldset>
  {#if result?.status!=='saved-review-intent'}
   {#if pending}<button disabled={loading} onclick={()=>review(pending.decision)}>Retry same decision</button>{:else}<button disabled={loading||!confirmed} onclick={()=>review('approve')}>Save approval for maintainer</button><button disabled={loading||!confirmed} onclick={()=>review('reject')}>Record rejection</button>{/if}
  {/if}
 {/if}
 {#if publication}<details open><summary>Exact household publication preview</summary><p>This includes the displayed contacts, equipment identifiers, notes, maintenance records and home model. Original files and private source paths are excluded. Review the text as well as the field names before approving this recipient.</p><textarea readonly rows="14" value={JSON.stringify(publication,null,2)} aria-label="Exact household publication preview"></textarea></details>{/if}
 {#if publicationOnly&&!preview}
  {#if publicationOnly.members?.length}<p><a href="/api/home/household-refresh">Prepare an update for your home agent</a>. Review the downloaded contents and existing household members before authorizing your agent to refresh their shared view. This preparation changes nothing.</p>{:else}<p>No household members are approved yet. Once someone joins, your home agent can prepare reviewed updates for their shared view.</p>{/if}
 {/if}
 {#if result?.status==='saved-review-intent'&&result.review.decision==='approve'}<p><a href={'/api/home/admission-packet?decision='+encodeURIComponent(result.reviewCode)}>Download private maintainer admission packet</a>. It binds this exact review and publication; it does not grant access.</p>{/if}
 <p class="note">This records your decision. It does not publish a home, grant access, change membership, send a message or pair agents. The designated maintainer must apply and verify a scoped publication and share separately.</p>
 <p role="status">{message}</p>
</article>
<style>
 article{padding:24px;background:white;border:1px solid #dbe4df;border-radius:12px;margin:20px 0}h3{font-size:21px;margin:0 0 12px}p{line-height:1.6}label{display:block;margin:15px 0}textarea{width:100%;box-sizing:border-box;font:12px/1.5 monospace;padding:12px;border:1px solid #becfc5;border-radius:8px;background:white;color:#202c2c}summary{margin:20px 0;font-weight:600}input,select{display:block;padding:10px;border:1px solid #becfc5;border-radius:8px;background:white;color:#202c2c;max-width:100%;box-sizing:border-box}input{width:100%}code{overflow-wrap:anywhere;font-size:13px}fieldset{border:0;padding:0}.consent{display:flex;align-items:flex-start;gap:10px;line-height:1.5}.consent input{width:auto}button{padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;background:white;cursor:pointer;color:#254a3c;font-size:14px;margin-right:8px}button:disabled{opacity:.6}.note{color:#62716d;font-size:14px}
</style>
