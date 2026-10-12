<script lang="ts">
 import {onMount} from 'svelte';
 let {deployment,onrefresh}:{deployment:any;join?:any;onrefresh:()=>void}=$props();
 let saving=$state(false),message=$state('Sending your request to join this home…'),status=$state('submitting');
 let agentStart=$state<any>(null),copyMessage=$state('');
 async function submit(){
  if(saving)return;saving=true;status='submitting';agentStart=null;copyMessage='';message='Sending your request to join this home…';
  try{const response=await fetch('/api/home/join',{method:'POST'});const body=await response.json();if(!response.ok)throw new Error(body.message??'Your request could not be confirmed. Please try again.');
   status=body.status;if(status==='already-admitted'){onrefresh();return;}
   agentStart=status==='pending-approval'?body.agentStart:null;
   message=status==='request-rejected'?'The owner declined this request. Contact the household if you think this was a mistake.':'The owner can review your request in their dashboard. You can check for approval here at any time.';
  }catch(e){status='unconfirmed';message=e instanceof Error?e.message:String(e);}finally{saving=false;}
 }
 async function copyPrompt(){try{await navigator.clipboard.writeText(agentStart.prompt);copyMessage='Prompt copied. Paste it into your agent.';}catch{copyMessage='Select and copy the prompt below.';}}
 onMount(()=>{void submit();});
</script>
<section class="join-home">
 <p class="eyebrow">{status==='request-rejected'?'Access request declined':status==='unconfirmed'?'Request needs another check':status==='submitting'?'Sending join request':'Request sent · awaiting approval'}</p>
 <h1>{deployment.name}</h1>
 <h2>{status==='request-rejected'?'Your request was declined':status==='unconfirmed'?'We couldn’t confirm your request yet':status==='submitting'?'Sending your join request…':'Your request to join this home has been sent'}</h2>
 <p>You’re signed in. This home is private, and its owner needs to approve your access.</p>
 <p role="status">{message}</p>
 {#if status==='unconfirmed'}<button disabled={saving} onclick={submit}>{saving?'Checking…':'Retry request'}</button>{/if}
 <button disabled={saving} onclick={onrefresh}>Check for approval</button>
 <p class="note">Only your access request is shared with this home’s owner. No home records are available until they approve you.</p>
 {#if status==='pending-approval'&&agentStart?.prompt}
  <details class="agent-check">
   <summary>Have an agent check for approval (optional)</summary>
   <p>Paste this prompt into an agent you use. It will help you connect your own Fulcra account and set up a check every 30 minutes, if it supports scheduled checks. You can also return here yourself; no agent is required.</p>
   <button onclick={copyPrompt}>Copy agent prompt</button>
   <p class="note" role="status">{copyMessage}</p>
   <label for="approval-agent-prompt">Getting-started prompt for your agent</label>
   <textarea id="approval-agent-prompt" readonly value={agentStart.prompt} rows="12"></textarea>
  </details>
 {/if}
</section>
<style>
 .join-home{max-width:720px}h1{font-size:38px;letter-spacing:-1px}h2{font-size:24px;margin-top:30px}p{line-height:1.65}.eyebrow{color:#387367;font-size:13px;text-transform:uppercase}button{padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;background:white;cursor:pointer;color:#254a3c;font-size:14px;margin-right:8px}button:disabled{opacity:.6}.note{font-size:14px;color:#62716d}.agent-check{border-top:1px solid #cadbd1;padding-top:18px;margin-top:24px}summary{cursor:pointer;font-weight:600;color:#254a3c}label{display:block;font-size:14px;margin-bottom:8px}textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #cadbd1;border-radius:8px;font-size:13px;line-height:1.5;background:white;color:#253a35}
</style>
