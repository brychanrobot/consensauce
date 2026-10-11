<script lang="ts">
let { class: className = 'w-4 h-4', ...rest }: { class?: string; [key: string]: unknown } =
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
  <path d="M9 3h6v3H9z" />
  <path d="M10 6v2a4 4 0 0 1-2 3.46V19a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7.54A4 4 0 0 1 14 8V6" />
  <path d="M10 14h4" />
</svg>
