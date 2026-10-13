<script lang="ts">
 import {joinApprovalAllowed} from '$lib/home/join-approval-policy.js';
 import {approveJoinRequest} from '$lib/home/one-click-approval.js';
 let {inbox,homeId,ownerUserId,errorMessage='',checking=false,onrefresh,onapproved}:{inbox:any;homeId:string;ownerUserId:string;errorMessage?:string;checking?:boolean;onrefresh:()=>void;onapproved:()=>void}=$props();
 let roles=$state<Record<string,string>>({}),busy=$state(''),messages=$state<Record<string,string>>({}),attempts=$state<Record<string,any>>({});
 function key(request:any){return 'home-join-approval:'+homeId+':'+ownerUserId+':'+request.requestId;}
 function saved(request:any){if(attempts[request.code])return attempts[request.code];if(typeof sessionStorage==='undefined')return null;try{const value=JSON.parse(sessionStorage.getItem(key(request))??'null');return value?.homeId===homeId&&value?.ownerUserId===ownerUserId&&value?.requestCode===request.code?value:null;}catch{return null;}}
 function roleFor(request:any){return saved(request)?.role??roles[request.code]??request.decisionRole??request.requestedRole??'viewer';}
 async function approve(request:any){if(busy)return;busy=request.code;messages[request.code]='Approving…';try{let result=await approveJoinRequest({homeId,ownerUserId,requestCode:request.code,role:roleFor(request),savedReviewCode:['approved-awaiting-application','grant-unconfirmed'].includes(request.state)?request.reviewCode:undefined,loadAttempt:()=>saved(request),saveAttempt:(value:any)=>{attempts[request.code]=value;sessionStorage.setItem(key(request),JSON.stringify(value));},clearAttempt:()=>{delete attempts[request.code];sessionStorage.removeItem(key(request));}});if(result.status==='outgoing-confirmed-member-unverified'){messages[request.code]='Approved';onapproved();}else messages[request.code]='Approval is still saving. Click Approve access to check again.';}catch(e){messages[request.code]=e instanceof Error?e.message:'Approval could not be confirmed. Try again.';}finally{busy='';}}
</script>
<article>
 <h3>Join requests</h3>
 <p>Choose a role, then approve. This shares your home’s household records; original documents stay private.</p>
 <button disabled={checking||!!busy} onclick={onrefresh}>{checking?'Refreshing…':'Refresh requests'}</button>
 {#if errorMessage}<p role="alert">{errorMessage}</p>
 {:else if inbox}
  {#if inbox.more}<p>More requests are available. Refresh to check them.</p>{/if}
  {#if inbox.reviewIncomplete||inbox.unavailableCount||inbox.unsupportedCount}<p role="alert">Some requests could not be verified. Refresh to check again.</p>{/if}
  {#if !inbox.requests.length&&!inbox.more&&!inbox.unavailableCount&&!inbox.unsupportedCount}<p>No pending requests.</p>{/if}
  {#each inbox.requests as request (request.code)}
   <section><p><strong>{request.state==='role-recorded'?'Approved':request.state==='rejected'?'Declined':joinApprovalAllowed(request)?'Request to join':'Needs attention'}</strong></p><p class="account">Account: {request.userId}</p><p>{request.introduction}</p>
   {#if request.state==='role-recorded'}<p>{request.approvedRole==='contributor'?'Can view and contribute':'Can view the home'}</p>
   {:else if joinApprovalAllowed(request)}<div class="actions"><label>Role <select aria-label={'Role for '+request.userId} value={roleFor(request)} disabled={!!busy||!!saved(request)||!!request.reviewCode&&['approved-awaiting-application','grant-unconfirmed'].includes(request.state)} onchange={e=>roles[request.code]=e.currentTarget.value}><option value="viewer">Viewer</option><option value="contributor">Contributor</option></select></label><button disabled={!!busy||checking} onclick={()=>approve(request)}>{busy===request.code?'Approving…':'Approve access'}</button></div>{/if}
   {#if messages[request.code]}<p role="status">{messages[request.code]}</p>{/if}</section>
  {/each}
 {/if}
</article>
<style>
 article{padding:24px;background:white;border:1px solid #dbe4df;border-radius:12px;margin:20px 0}h3{font-size:21px;margin:0 0 12px}p{line-height:1.6}section{border-top:1px solid #dbe4df;padding:16px 0}.account{overflow-wrap:anywhere;font-size:14px;color:#62716d}.actions{display:flex;gap:16px;align-items:end;flex-wrap:wrap}label{display:grid;gap:8px}button,select{padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;background:white;color:#254a3c;font-size:14px}button{cursor:pointer}button:disabled,select:disabled{opacity:.6}
</style>
