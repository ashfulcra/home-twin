<script>
  import {env} from '$env/dynamic/public';
  import { user } from '$lib/user';
  import { onMount } from 'svelte';
  import LoginDeviceFlow from '$lib/components/LoginDeviceFlow.svelte';

  let {data}=$props();
  import HomeDashboard from '$lib/components/HomeDashboard.svelte';
  onMount(async () => { await user.init(); });
</script>

<svelte:head>
  <title>{env.PUBLIC_APP_NAME || 'Home Twin'}</title>
</svelte:head>

{#if !$user.authenticated}
  <LoginDeviceFlow existingHome={data.existingHome} />
{:else}
  <HomeDashboard />
  <button class="mx-auto my-4 text-fulcra-teal" onclick={user.logout}>Sign Out</button>
{/if}
