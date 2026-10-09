<script>
 import {user} from '$lib/user';
 import {onMount} from 'svelte';
 import LoginDeviceFlow from '$lib/components/LoginDeviceFlow.svelte';
 import HomeOnboarding from '$lib/components/HomeOnboarding.svelte';
 onMount(()=>user.init());
</script>
<svelte:head><title>Set up your home — Home Twin</title></svelte:head>
{#if $user.authenticated}<HomeOnboarding />{:else}<LoginDeviceFlow />{/if}
