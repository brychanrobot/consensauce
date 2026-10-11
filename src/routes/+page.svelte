<script lang="ts">
import { useMutation, useQuery } from 'convex-svelte';
import { useClerkContext } from 'svelte-clerk/client';
import {
  getDeviceRecentSessionIds,
  getOrCreateClientUserId,
  getStoredUserName,
  SparklesIcon,
  saveDeviceSessionId,
  TicketIcon,
} from '#lib';
import { goto } from '$app/navigation';
import { api } from '$convex/_generated/api';
import type { Id } from '$convex/_generated/dataModel';

const clerk = useClerkContext();
let deviceSessionIds = $state<Id<'sessions'>[]>([]);

$effect(() => {
  deviceSessionIds = getDeviceRecentSessionIds() as Id<'sessions'>[];
});

const recentSessions = useQuery(api.sessions.listRecent, () => ({
  deviceSessionIds: !clerk.user ? deviceSessionIds : undefined,
}));
const createSession = useMutation(api.sessions.create);

let title = $state('');
let joinCode = $state('');
let isCreating = $state(false);
let isJoining = $state(false);
let joinError = $state('');

async function handleCreate(e: SubmitEvent) {
  e.preventDefault();
  const sessionTitle = title.trim();
  if (!sessionTitle || isCreating) return;

  isCreating = true;
  try {
    const clientUserId = clerk.user?.id || getOrCreateClientUserId();
    const hostName = clerk.user?.fullName || clerk.user?.firstName || getStoredUserName() || 'Host';
    const result = await createSession({
      title: sessionTitle,
      hostName,
      clientUserId,
    });
    if (result?.sessionId) {
      saveDeviceSessionId(result.sessionId);
      goto(`/session/${result.sessionId}`);
    }
  } catch (err: unknown) {
    console.error('Failed to create session:', err);
  } finally {
    isCreating = false;
  }
}

async function handleJoin(e: SubmitEvent) {
  e.preventDefault();
  const code = joinCode.trim().toUpperCase();
  if (!code || isJoining) return;

  isJoining = true;
  joinError = '';
  try {
    // Find session by code
    goto(`/join/${code}`);
  } finally {
    isJoining = false;
  }
}
</script>

<div class="space-y-12">
	<!-- Hero Section -->
	<section class="text-center max-w-3xl mx-auto pt-4 pb-6 space-y-4">
		<div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-semibold tracking-wide uppercase">
			<span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
			Real-Time Tasting Nights
		</div>
		<h1 class="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-foreground leading-[1.1]">
			Find common ground on <span class="bg-gradient-to-r from-rose-500 via-amber-500 to-yellow-500 bg-clip-text text-transparent">uncommon flavors</span>.
		</h1>
		<p class="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
			Snap pictures of each item as you taste. Rank privately on your phones.
			Reveal the live consensus and discover your spiciest disagreements.
		</p>
	</section>

	<!-- Actions Grid -->
	<div class="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
		<!-- Start New Tasting -->
		<div class="rounded-2xl border border-border/70 bg-card p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-6 relative overflow-hidden">
			<div class="absolute -right-8 -top-8 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl pointer-events-none"></div>
			<div class="space-y-2">
				<div class="w-10 h-10 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500">
					<SparklesIcon class="w-5 h-5 text-rose-500" />
				</div>
				<h2 class="text-xl font-bold tracking-tight">Start a Tasting Night</h2>
				<p class="text-sm text-muted-foreground">
					Create a shared session for Trader Joe's snacks, craft beers, dips, or anything you're rating.
				</p>
			</div>

			<form onsubmit={handleCreate} class="space-y-3">
				<div>
					<label for="session-title" class="sr-only">Tasting Title</label>
					<input
						id="session-title"
						type="text"
						bind:value={title}
						placeholder="e.g. Trader Joe's Dips Showdown"
						disabled={isCreating}
						class="w-full h-11 px-3.5 rounded-xl border border-input bg-background/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all disabled:opacity-50"
					/>
				</div>
				<button
					type="submit"
					disabled={isCreating || !title.trim()}
					class="w-full h-11 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 text-white font-semibold text-sm shadow-md shadow-rose-500/15 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
				>
					{#if isCreating}
						<span>Creating Session...</span>
					{:else}
						<span>Create Tasting Room</span>
						<span>→</span>
					{/if}
				</button>
			</form>
		</div>

		<!-- Join Existing Session -->
		<div class="rounded-2xl border border-border/70 bg-card p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-6 relative overflow-hidden">
			<div class="absolute -right-8 -top-8 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none"></div>
			<div class="space-y-2">
				<div class="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
					<TicketIcon class="w-5 h-5 text-amber-500" />
				</div>
				<h2 class="text-xl font-bold tracking-tight">Join with Code</h2>
				<p class="text-sm text-muted-foreground">
					Have a 6-letter room code from your host or a friend? Enter it here to jump right in.
				</p>
			</div>

			<form onsubmit={handleJoin} class="space-y-3">
				<div>
					<label for="join-code" class="sr-only">Room Code</label>
					<input
						id="join-code"
						type="text"
						maxlength={6}
						bind:value={joinCode}
						placeholder="ENTER 6-LETTER CODE"
						disabled={isJoining}
						class="w-full h-11 px-3.5 rounded-xl border border-input bg-background/50 text-sm font-mono tracking-widest uppercase text-center focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all disabled:opacity-50"
					/>
				</div>
				{#if joinError}
					<p class="text-xs text-destructive">{joinError}</p>
				{/if}
				<button
					type="submit"
					disabled={isJoining || !joinCode.trim()}
					class="w-full h-11 rounded-xl bg-secondary hover:bg-secondary/80 text-secondary-foreground font-semibold text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
				>
					<span>Join Session</span>
					<span>→</span>
				</button>
			</form>
		</div>
	</div>

	<!-- Recent Sessions -->
	<section class="max-w-3xl mx-auto space-y-4 pt-6">
		<div class="flex items-center justify-between border-b border-border/40 pb-3">
			<h2 class="text-lg font-bold tracking-tight text-foreground">Recent Tasting Sessions</h2>
			<span class="text-xs text-muted-foreground">Live Synced</span>
		</div>

		{#if recentSessions.isLoading}
			<div class="grid grid-cols-1 gap-3">
				{#each Array(2) as _}
					<div class="h-20 rounded-xl border border-border/50 bg-muted/20 animate-pulse"></div>
				{/each}
			</div>
		{:else if recentSessions.error}
			<div class="p-6 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-sm text-center">
				Failed to load sessions: {recentSessions.error.toString()}
			</div>
		{:else if !recentSessions.data || recentSessions.data.length === 0}
			<div class="p-10 rounded-2xl border border-dashed border-border/70 text-center space-y-2">
				<p class="text-sm font-medium text-foreground">No tasting sessions yet.</p>
				<p class="text-xs text-muted-foreground">
					{#if !clerk.user}
						Sign in to sync your rooms across devices, or create a new tasting room above!
					{:else}
						Create your first tasting room above to start snapping items and ranking!
					{/if}
				</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{#each recentSessions.data as session (session._id)}
					<a
						href={`/session/${session._id}`}
						class="group p-4 rounded-xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-md transition-all flex flex-col justify-between space-y-3"
					>
						<div class="flex items-start justify-between gap-2">
							<h3 class="font-bold text-base group-hover:text-primary transition-colors line-clamp-1">
								{session.title}
							</h3>
							<span
								class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider {session.status ===
								'revealed'
									? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
									: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'}"
							>
								{session.status === 'revealed' ? 'Revealed' : 'Ranking'}
							</span>
						</div>

						<div class="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
							<span class="font-mono">Code: <strong class="text-foreground">{session.code}</strong></span>
							<span>Host: {session.hostName}</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>
