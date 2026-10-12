<script lang="ts">
 import {onMount} from 'svelte';
 let {deployment,onrefresh}:{deployment:any;join?:any;onrefresh:()=>void}=$props();
 let saving=$state(false),message=$state('Submitting your access request…'),status=$state('submitting');
 async function submit(){
  if(saving)return;saving=true;message='Submitting your access request…';
  try{const response=await fetch('/api/home/join',{method:'POST'});const body=await response.json();if(!response.ok)throw new Error(body.message??'Your request could not be confirmed. Please try again.');
   status=body.status;if(status==='already-admitted'){onrefresh();return;}message=status==='request-rejected'?'The owner declined this request. Contact the household if you think this was a mistake.':'Your request is in the owner’s inbox. You can return here after they approve it.';
  }catch(e){status='unconfirmed';message=e instanceof Error?e.message:String(e);}finally{saving=false;}
 }
 onMount(()=>{void submit();});
</script>
<section class="join-home">
 <p class="eyebrow">{status==='request-rejected'?'Access request declined':status==='unconfirmed'?'Request needs another check':'Access request pending'}</p>
 <h1>{deployment.name}</h1>
 <h2>{status==='request-rejected'?'Your request was declined':status==='unconfirmed'?'We couldn’t confirm your request yet':'Waiting for the owner’s approval'}</h2>
 <p>You’re signed in. This home is private, and its owner needs to approve your access.</p>
 <p role="status">{message}</p>
 {#if status==='unconfirmed'}<button disabled={saving} onclick={submit}>{saving?'Checking…':'Retry request'}</button>{/if}
 <button disabled={saving} onclick={onrefresh}>Check for approval</button>
 <p class="note">Only your access request is shared with this home’s owner. No home records are available until they approve you.</p>
</section>
<style>
 .join-home{max-width:720px}h1{font-size:38px;letter-spacing:-1px}h2{font-size:24px;margin-top:30px}p{line-height:1.65}.eyebrow{color:#387367;font-size:13px;text-transform:uppercase}button{padding:10px 16px;border:1px solid #cadbd1;border-radius:8px;background:white;cursor:pointer;color:#254a3c;font-size:14px;margin-right:8px}button:disabled{opacity:.6}.note{font-size:14px;color:#62716d}
</style>
