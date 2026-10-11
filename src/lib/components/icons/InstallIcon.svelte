<script lang="ts">
let { class: className = 'w-3.5 h-3.5', ...rest }: { class?: string; [key: string]: unknown } =
  $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  aria-hidden="true"
  {...rest}
>
  <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
  <path d="M12 18h.01" />
  <path d="m9 10 3 3 3-3" />
  <path d="M12 6v7" />
</svg>
