<script lang="ts">
 let {homeId,role}:{homeId:string;role:string}=$props();
 let prompt=$state('');let message=$state('');let loading=$state(false);
 async function showPrompt(){
  loading=true;message='';prompt='';
  try{
   const response=await fetch('/api/home/agent-request',{cache:'no-store'});
   if(!response.ok)throw new Error('We couldn’t verify your current home access. Refresh your home or ask its owner to check membership and sharing.');
   const brief=await response.json();const start=brief.gettingStarted;
   if(brief.home?.id!==homeId||brief.permissions?.role!==role)throw new Error('Your home connection or role changed. Refresh the dashboard before getting instructions.');
   if(start?.status!=='ready'||typeof start.prompt!=='string')throw new Error('Your home’s owner or account details need verification before we can prepare instructions.');
   prompt=start.prompt;
  }catch(e){message=e instanceof Error?e.message:String(e);}finally{loading=false;}
 }
 async function copyPrompt(){try{await navigator.clipboard.writeText(prompt);message='Prompt copied. Paste it into your agent chat.';}catch{message='Select the prompt below and copy it manually.';}}
</script>

<article class="agent-start">
 <h3>Getting started with your agent</h3>
 <p>Use your own agent connected to Fulcra. The instructions keep it working on this home and include the records it should read first. You don’t need a GitHub account.</p>
 {#if role==='contributor'}
  <p>They also explain how to share this home’s contributions with its owner and connect your agent to the owner’s home agent. You approve each share. Pairing stays pending until both agents confirm it.</p>
 {:else if role==='viewer'}
  <p>Your agent can help you explore the home. Ask the owner for contributor access before setting it up to submit changes or connect for contributions.</p>
 {:else}
  <p>Your instructions continue the existing home. Members receive their own instructions for contributing and pairing with your home agent after they have contributor access.</p>
 {/if}
 <button disabled={loading} onclick={showPrompt}>{loading?'Checking access…':prompt?'Refresh getting-started prompt':'Get getting-started prompt'}</button>
 {#if prompt}
  <label for="home-agent-start-prompt">Paste this into your agent chat</label>
  <textarea id="home-agent-start-prompt" readonly value={prompt} rows="14"></textarea>
  <button onclick={copyPrompt}>Copy getting-started prompt</button>
  <p><a href="/api/home/agent-request">Download the private brief and prompt</a></p>
 {/if}
 <p class="note">These instructions don’t launch an agent, grant home access, create shares or start background checks.</p>
 <p role="status">{message}</p>
</article>

<style>
 .agent-start{padding:24px;background:white;border:1px solid #dbe4df;border-radius:12px;margin:20px 0}h3{font-size:21px;margin:0 0 12px}p{line-height:1.6}button{padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;background:white;cursor:pointer;color:#254a3c;font-size:14px}button:disabled{opacity:.65}label{display:block;margin:18px 0 8px;font-size:14px}textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #becfc5;border-radius:8px;background:#f7faf8;color:#202c2c;font:14px/1.5 system-ui,sans-serif;resize:vertical;margin-bottom:12px}.note{color:#62716d;font-size:14px}a{color:#216c58;text-underline-offset:3px}
</style>
