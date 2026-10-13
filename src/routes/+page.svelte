<script>
  import { env } from '$env/dynamic/public';
  import { user } from '$lib/user';
  import { onMount } from 'svelte';
  import LoginDeviceFlow from '$lib/components/LoginDeviceFlow.svelte';
  import HomeTwinGuide from '$lib/components/HomeTwinGuide.svelte';

  let { data } = $props();
  import HomeDashboard from '$lib/components/HomeDashboard.svelte';
  onMount(async () => {
    if (data.siteMode !== 'guide') await user.init();
  });
</script>

<svelte:head>
  <title
    >{data.siteMode === 'guide'
      ? 'Home Twin · Your home, remembered'
      : env.PUBLIC_APP_NAME || 'Home Twin'}</title
  >
</svelte:head>

{#if data.siteMode === 'guide'}
  <HomeTwinGuide />
{:else if !$user.authenticated}
  <LoginDeviceFlow existingHome={data.existingHome} />
{:else}
  <HomeDashboard />
  <button class="mx-auto my-4 text-fulcra-teal" onclick={user.logout}>Sign Out</button>
{/if}
