<script lang="ts">
 let {inbox,errorMessage='',checking=false,onrefresh,onselect}:{inbox:any;errorMessage?:string;checking?:boolean;onrefresh:()=>void;onselect:(code:string,reviewCode?:string)=>void}=$props();
 const states:Record<string,string>={'unreviewed':'Needs your review','approval-needs-review':'Approval is stale; review current contents again','approved-awaiting-application':'Approval saved; finish access setup','grant-unconfirmed':'Approval unfinished; access sharing needs confirmation','role-recorded':'Approved role is recorded; member access is checked separately','rejected':'Rejected','conflicting-decisions':'Decisions conflict; review before proceeding','review-unverified':'Previous decisions could not be fully verified'};
</script>
<article>
 <h3>Join requests</h3>
 <p>New app users submit a request automatically when they sign in. Review and approve access here. Older manual requests appear after the applicant shares that exact request file. Email and push alerts are not enabled.</p>
 <button disabled={checking} onclick={onrefresh}>{checking?'Checking requests…':'Refresh join requests'}</button>
 {#if errorMessage}<p role="alert">{errorMessage} This does not mean there are no requests.</p>
 {:else if inbox}
  {#if inbox.more}<p role="alert">Showing up to 20 shared requests. More are available; additional requests can be reviewed using their request codes below.</p>{/if}
  {#if inbox.reviewIncomplete}<p role="alert">Some saved decisions could not be checked. Review their records before approving or applying access.</p>{/if}
  {#if inbox.unavailableCount||inbox.unsupportedCount}<p role="alert">{inbox.unavailableCount} request files could not be verified; {inbox.unsupportedCount} request shares need their scope checked. Ask applicants to confirm an exact, direct, current-file-only share and keep their request codes.</p>{/if}
  {#if !inbox.requests.length&&!inbox.more&&!inbox.unavailableCount&&!inbox.unsupportedCount}<p>No currently shared join requests for this home.</p>{/if}
  {#each inbox.requests as request (request.code)}
   <section><p><strong>{states[request.state]??'Review required'}</strong></p><p>Fulcra account: <code>{request.userId}</code></p><p>Requested role: {request.requestedRole==='contributor'?'View and contribute':'View the home'}</p><p>Introduction (self-reported): {request.introduction}</p><p class="note">Request date (provided by applicant): {request.recordedAt}</p>{#if request.reviewCode&&['approved-awaiting-application','grant-unconfirmed'].includes(request.state)}<button onclick={()=>onselect(request.code,request.reviewCode)}>Continue access setup</button>{:else}<button onclick={()=>onselect(request.code)}>Open request for review</button>{/if}</section>
  {/each}
 {/if}
</article>
<style>
 article{padding:24px;background:white;border:1px solid #dbe4df;border-radius:12px;margin:20px 0}h3{font-size:21px;margin:0 0 12px}p{line-height:1.6}section{border-top:1px solid #dbe4df;padding:16px 0}code{overflow-wrap:anywhere;font-size:13px}.note{color:#62716d;font-size:14px}button{padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;background:white;cursor:pointer;color:#254a3c;font-size:14px}button:disabled{opacity:.6}
</style>
