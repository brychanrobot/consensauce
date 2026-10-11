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
  <path d="m11 17 2 2a1 1 0 0 0 1.4 0l4.3-4.3a1 1 0 0 0 0-1.4l-3-3a1 1 0 0 0-1.4 0l-1.3 1.3" />
  <path d="m18 10 1.3-1.3a1 1 0 0 0 0-1.4l-3-3a1 1 0 0 0-1.4 0l-4.3 4.3a1 1 0 0 0 0 1.4l2 2" />
  <path d="m2 14 6 6" />
  <path d="m22 10-6-6" />
  <path d="m5 11 3 3" />
  <path d="m16 8 3 3" />
</svg>
