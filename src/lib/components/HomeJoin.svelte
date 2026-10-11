<script lang="ts">
 let {deployment,join,onrefresh}:{deployment:any;join:any;onrefresh:()=>void}=$props();
 let message=$state('');
 async function copyPrompt(){try{await navigator.clipboard.writeText(join.prompt);message='Prompt copied. Paste it into your agent chat.';}catch{message='Select the prompt below and copy it manually.';}}
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
  <h2>Get help from your agent</h2>
  <p>Paste these instructions into your agent chat. They explain how to verify your account, request the owner’s approval and continue with this home. You don’t need GitHub.</p>
  <label for="join-agent-prompt">Getting-started prompt</label>
  <textarea id="join-agent-prompt" readonly value={join.prompt} rows="13"></textarea>
  <button onclick={copyPrompt}>Copy getting-started prompt</button>
 {/if}
 <button onclick={onrefresh}>Refresh home access</button>
 <p class="note">Signing in doesn’t grant home access. No approval request has been sent by this page.</p>
 <p role="status">{message}</p>
</section>
<style>
 .join-home{max-width:850px}h1{font-size:38px;letter-spacing:-1px}h2{font-size:24px;margin-top:30px}p,li{line-height:1.65}li{margin-bottom:10px}.eyebrow{color:#387367;font-size:13px;text-transform:uppercase}code{overflow-wrap:anywhere;font-size:14px}label{display:block;margin:16px 0 8px}textarea{width:100%;box-sizing:border-box;padding:12px;border:1px solid #becfc5;border-radius:8px;background:white;color:#202c2c;font:14px/1.5 system-ui,sans-serif;margin-bottom:12px}button{padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;background:white;cursor:pointer;color:#254a3c;font-size:14px;margin-right:8px}.note{font-size:14px;color:#62716d}
</style>
