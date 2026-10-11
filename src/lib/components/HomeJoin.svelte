<script lang="ts">
 import {createJoinRequest,joinIntentID} from '$lib/home/joining.js';
 let {deployment,join,onrefresh}:{deployment:any;join:any;onrefresh:()=>void}=$props();
 let message=$state('');
 let introduction=$state('');let requestedRole=$state('viewer');let saving=$state(false);let pending:any=$state(null);let saved:any=$state(null);
 const prompt=$derived(saved?.prompt??join?.prompt??'');
 async function saveRequest(){
  saving=true;message='';
  try{if(!pending){const recordedAt=new Date().toISOString();const value=createJoinRequest({id:crypto.randomUUID(),introduction,requestedRole},deployment,join.context.userId,recordedAt);pending={id:await joinIntentID(value),introduction,requestedRole,recordedAt};}const response=await fetch('/api/home/join-request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending)});const result=await response.json();if(!response.ok){if(response.status===400)pending=null;throw new Error(result.message??'Request save could not be confirmed. Retry this same request.');}saved=result;if(result.status==='pending-readback')message='Save confirmation is pending. Retry this same request before sharing it.';else{pending=null;message='Saved in your own account. Ask your agent to share this exact request with the owner, then pass the code to the owner. No notification or home access was created.';}}catch(e){message=e instanceof Error?e.message:String(e);}finally{saving=false;}
 }
 async function copyPrompt(){try{await navigator.clipboard.writeText(prompt);message='Prompt copied. Paste it into your agent chat.';}catch{message='Select the prompt below and copy it manually.';}}
</script>
<section class="join-home">
 <p class="eyebrow">Join this home</p>
 <h1>{deployment.name}</h1>
 <p>You’re signed in. This home’s owner still needs to approve your access and share its records with you.</p>
 <ol>
  <li>Give the owner your Fulcra account ID below and ask for viewer or contributor access.</li>
  <li>The owner approves your role and shares this home’s selected records. Contributors separately approve sharing their contributions back.</li>
  <li>Return here and refresh. Once you have contributor access, Household explains how to connect your agent to the owner’s home agent.</li>
 </ol>
 <p>Home: <strong>{deployment.homeId}</strong><br />Owner’s Fulcra account: <code>{deployment.ownerUserId}</code></p>
 {#if join}
  <p>Your Fulcra account: <code>{join.context.userId}</code></p>
  <h2>Prepare an access request</h2>
  <p>Save it privately in your own Fulcra account. Your agent can then help you share just this request with the owner.</p>
  <form onsubmit={(event)=>{event.preventDefault();saveRequest();}}>
   <fieldset disabled={saving||!!pending||saved?.status==='saved-private-request'}>
    <label>Access requested <select bind:value={requestedRole}><option value="viewer">View the home</option><option value="contributor">View and contribute</option></select></label>
    <label>How do you know the household? <textarea bind:value={introduction} required maxlength="1000" rows="3"></textarea></label>
   </fieldset>
   {#if saved?.status!=='saved-private-request'}<button disabled={saving} type="submit">{saving?'Saving…':pending?'Retry same request':'Save request in my account'}</button>{/if}
  </form>
  {#if saved}<p>Request code: <code>{saved.code}</code></p><p class="note">The owner can read this request after you explicitly share its exact file with their account. A saved request is not a granted share.</p>{/if}
  <h2>Get help from your agent</h2>
  <p>Paste these instructions into your agent chat. They explain how to verify your account, request the owner’s approval and continue with this home. You don’t need GitHub.</p>
  <label for="join-agent-prompt">Getting-started prompt</label>
  <textarea id="join-agent-prompt" readonly value={prompt} rows="13"></textarea>
  <button onclick={copyPrompt}>Copy getting-started prompt</button>
 {/if}
 <button onclick={onrefresh}>Refresh home access</button>
 <p class="note">Signing in doesn’t grant home access. This page never sends an owner notification or creates a share.</p>
 <p role="status">{message}</p>
</section>
<style>
 .join-home{max-width:850px}h1{font-size:38px;letter-spacing:-1px}h2{font-size:24px;margin-top:30px}p,li{line-height:1.65}li{margin-bottom:10px}.eyebrow{color:#387367;font-size:13px;text-transform:uppercase}code{overflow-wrap:anywhere;font-size:14px}label{display:block;margin:16px 0 8px}fieldset{border:0;padding:0}select{display:block;padding:10px;background:white;color:#202c2c;border:1px solid #becfc5;border-radius:8px}textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #becfc5;border-radius:8px;background:white;color:#202c2c;font:14px/1.5 system-ui,sans-serif;margin-bottom:12px}button{padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;background:white;cursor:pointer;color:#254a3c;font-size:14px;margin-right:8px}.note{font-size:14px;color:#62716d}
</style>
