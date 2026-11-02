<script lang="ts">
import '../app.css';
import type { Snippet } from 'svelte';
import { ClerkProvider, Show, SignInButton, UserButton } from 'svelte-clerk';
import { InstallIcon, SauceLogo, theme } from '#lib';
import ConvexClerkProvider from '#lib/components/ConvexClerkProvider.svelte';
import { PUBLIC_CLERK_PUBLISHABLE_KEY, PUBLIC_CONVEX_URL } from '$app/env/public';

const { children }: { children: Snippet } = $props();

const convexUrl =
  PUBLIC_CONVEX_URL || (typeof process !== 'undefined' ? process.env?.PUBLIC_CONVEX_URL : '') || '';
const clerkPubKey =
  PUBLIC_CLERK_PUBLISHABLE_KEY ||
  (typeof process !== 'undefined' ? process.env?.PUBLIC_CLERK_PUBLISHABLE_KEY : '') ||
  '';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// PWA Install prompt state
let installPrompt = $state<BeforeInstallPromptEvent | null>(null);
let isInstalled = $state(false);

$effect(() => {
  if (typeof window !== 'undefined') {
    if ('serviceWorker' in navigator && !import.meta.env.DEV) {
      navigator.serviceWorker.register('/service-worker.js').catch((err) => {
        console.warn('ServiceWorker registration error:', err);
      });
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      installPrompt = e as BeforeInstallPromptEvent;
    };
    const handleAppInstalled = () => {
      isInstalled = true;
      installPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }
});

async function triggerInstall() {
  if (!installPrompt) return;
  installPrompt.prompt();
  const choice = await installPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    isInstalled = true;
  }
  installPrompt = null;
}
</script>

<svelte:head>
	<title>Consensauce — Real-Time Taste Tests & Live Tier Lists</title>
	<meta name="description" content="Collaborative taste-testing and real-time tier lists for food, drinks, and friendly debates." />
</svelte:head>

<ClerkProvider publishableKey={clerkPubKey}>
	<ConvexClerkProvider {convexUrl}>
	<div class="min-h-screen flex flex-col bg-background text-foreground antialiased selection:bg-primary selection:text-primary-foreground overflow-x-clip">
		<header class="relative sm:sticky sm:top-0 z-50 w-full max-w-full border-b border-border/50 bg-background/90 backdrop-blur-md">
			<div class="max-w-6xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
				<a href="/" class="flex items-center gap-2 sm:gap-2.5 font-black text-lg sm:text-xl tracking-tight hover:opacity-90 transition-opacity shrink-0">
					<SauceLogo class="w-8 h-8 sm:w-9 sm:h-9 shadow-sm shadow-rose-500/20 shrink-0" />
					<span class="bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text">
						Consensauce
					</span>
				</a>

				<nav class="flex items-center gap-1.5 sm:gap-3 shrink-0">
					{#if installPrompt}
						<button
							type="button"
							onclick={triggerInstall}
							class="inline-flex items-center gap-1.5 p-1.5 sm:px-3 sm:py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 animate-pulse"
							title="Install Consensauce as a progressive web app"
						>
							<InstallIcon class="w-3.5 h-3.5 text-rose-500 shrink-0" />
							<span class="hidden sm:inline">Install App</span>
						</button>
					{/if}

					<a
						href="/"
						class="hidden md:inline-flex text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted/50"
					>
						Sessions
					</a>

					<button
						type="button"
						onclick={() => theme.toggle()}
						class="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border border-border/70 bg-card hover:bg-muted text-foreground flex items-center justify-center transition-all cursor-pointer shadow-xs active:scale-95 shrink-0"
						title={theme.isDark ? 'Switch to light mode' : 'Switch to dark mode'}
						aria-label="Toggle dark/light theme"
					>
						{#if theme.isDark}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="12" cy="12" r="4"/>
								<path d="M12 2v2"/>
								<path d="M12 20v2"/>
								<path d="m4.93 4.93 1.41 1.41"/>
								<path d="m17.66 17.66 1.41 1.41"/>
								<path d="M2 12h2"/>
								<path d="M20 12h2"/>
								<path d="m6.34 17.66-1.41 1.41"/>
								<path d="m19.07 4.93-1.41 1.41"/>
							</svg>
						{:else}
							<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
							</svg>
						{/if}
					</button>

					<Show when="signed-out">
						<SignInButton
							mode="modal"
							class="inline-flex items-center justify-center rounded-lg text-xs sm:text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 h-8 sm:h-9 px-3 sm:px-4 py-1.5 sm:py-2 transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0"
						>
							Sign In
						</SignInButton>
					</Show>
					<Show when="signed-in">
						<div class="flex items-center gap-2 pl-0.5 sm:pl-1 shrink-0">
							<UserButton afterSignOutUrl="/" />
						</div>
					</Show>
				</nav>
			</div>
		</header>

		<main class="flex-1 max-w-6xl w-full mx-auto px-4 py-6 md:py-8">
			{@render children?.()}
		</main>

		<footer class="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
			<div class="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
				<p>Consensauce — The collaborative, real-time taste-testing & tier list platform</p>
				<p class="text-muted-foreground/80">Built with SvelteKit, Convex & Clerk</p>
			</div>
		</footer>
	</div>
	</ConvexClerkProvider>
</ClerkProvider>
