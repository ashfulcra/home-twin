<script lang="ts">
  import { user } from '$lib/user';
  import { page } from '$app/state';

  // The owner's id lives server-side only; ask the backend whether we're the
  // owner (re-checking whenever auth state changes) instead of comparing ids.
  let isOwner = $state(false);

  async function checkOwner() {
    try {
      const res = await fetch('/api/harness/owner');
      isOwner = res.ok && (await res.json()).isOwner === true;
    } catch (e) {
      isOwner = false;
    }
  }

  $effect(() => {
    if ($user.authenticated) {
      checkOwner();
    } else {
      isOwner = false;
    }
  });
</script>

{#if isOwner}
  <nav class="border-b border-fulcra-gray/20 bg-fulcra-black/50">
    <div class="mx-auto max-w-7xl px-4 py-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <a
            href={page.data.householdUrl ?? '/'}
            class="font-medium text-fulcra-teal hover:text-fulcra-teal/80"
          >
            Home
          </a>
          <a href="/harness" class="font-medium text-fulcra-teal hover:text-fulcra-teal/80">
            Harness Dashboard
          </a>
        </div>
        <div class="text-sm text-fulcra-gray">Owner</div>
      </div>
    </div>
  </nav>
{/if}

<style>
  nav {
    position: sticky;
    top: 0;
    z-index: 50;
  }
</style>
