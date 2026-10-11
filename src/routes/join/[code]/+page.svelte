<script lang="ts">
import { useQuery } from 'convex-svelte';
import { saveDeviceSessionId } from '#lib';
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { api } from '$convex/_generated/api';

const code = $derived(page.params.code?.toUpperCase() ?? '');
const session = useQuery(api.sessions.getByCode, () => ({ code }));

$effect(() => {
  if (session.data) {
    saveDeviceSessionId(session.data._id);
    goto(`/session/${session.data._id}`, { replaceState: true });
  }
});
</script>

<div class="max-w-md mx-auto text-center py-20 space-y-4">
	{#if session.isLoading}
		<div class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
		<p class="text-sm text-muted-foreground">Joining tasting session {code}...</p>
	{:else if session.data === null}
		<div class="p-6 rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive space-y-3">
			<h2 class="font-bold text-lg">Session Not Found</h2>
			<p class="text-sm">We couldn't find a tasting room with code <strong>{code}</strong>.</p>
			<a
				href="/"
				class="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
			>
				Back to Home
			</a>
		</div>
	{/if}
</div>
