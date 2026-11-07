<script lang="ts">
import { setupAuth, setupConvex } from 'convex-svelte';
import type { Snippet } from 'svelte';
import { useClerkContext } from 'svelte-clerk/client';

const props: {
  children: Snippet;
  convexUrl: string;
} = $props();

setupConvex(props.convexUrl);
const ctx = useClerkContext();

setupAuth(() => ({
  isLoading: !ctx.isLoaded,
  isAuthenticated: !!ctx.session,
  fetchAccessToken: async ({ forceRefreshToken }) => {
    if (!ctx.isLoaded || !ctx.session) return null;
    try {
      return (
        (await ctx.session.getToken({
          template: 'convex',
          skipCache: forceRefreshToken,
        })) ?? null
      );
    } catch (err) {
      console.warn('Failed to fetch Convex auth token using template: convex', err);
      try {
        return (
          (await ctx.session.getToken({
            skipCache: forceRefreshToken,
          })) ?? null
        );
      } catch (fallbackErr) {
        console.warn('Failed to fetch fallback Clerk auth token', fallbackErr);
        return null;
      }
    }
  },
}));
</script>

{@render props.children()}
