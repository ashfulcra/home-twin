<script>
  import { user } from '$lib/user';
  import { onMount } from 'svelte';
  import LoginDeviceFlow from '$lib/components/LoginDeviceFlow.svelte';

  /** @type {{timezone?: string} | null} */
  import HomeDashboard from '$lib/components/HomeDashboard.svelte';
  onMount(async () => { await user.init(); });
</script>

<svelte:head>
  <title>Home Twin</title>
</svelte:head>

{#if !$user.authenticated}
  <LoginDeviceFlow />
{:else}
  <HomeDashboard />
  <button class="mx-auto my-4 text-fulcra-teal" onclick={user.logout}>Sign Out</button>
{/if}
