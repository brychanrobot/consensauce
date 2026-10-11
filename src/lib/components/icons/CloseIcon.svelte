<script lang="ts">
let { class: className = 'w-3.5 h-3.5', ...rest }: { class?: string; [key: string]: unknown } =
  $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  aria-hidden="true"
  {...rest}
>
  <path d="M18 6 6 18" />
  <path d="m6 6 12 12" />
</svg>
