<script lang="ts">
  import type { WithElementRef } from '$lib/utils/types.js';
  import type { SVGAttributes } from 'svelte/elements';

  let {
    size = 16,
    ref = $bindable(null),
    ...rest
  }: WithElementRef<SVGAttributes<SVGElement> & { size?: number }, SVGElement> = $props();
</script>

<svg
  height={size}
  viewBox="0 0 24 24"
  width={size}
  style="color: currentColor;"
  bind:this={ref}
  {...rest}
>
  <!-- Antenna -->
  <line x1="17" y1="2" x2="12" y2="7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  <!-- Radio body -->
  <rect x="3" y="7" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" />
  <!-- Speaker grille -->
  <rect x="5.5" y="9.5" width="9" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1" />
  <!-- PTT button area -->
  <rect x="6" y="16" width="4" height="2.5" rx="0.5" fill="currentColor" />
  <!-- Channel knob -->
  <circle cx="16" cy="11" r="1" fill="currentColor" />
  <!-- Side grip lines -->
  <line x1="18" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
  <line x1="18" y1="14" x2="20" y2="14" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
  <line x1="18" y1="16" x2="20" y2="16" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
  <!-- Sound waves from antenna -->
  <path d="M18 4a3 3 0 0 1 0 4" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
  <path d="M20 3a5 5 0 0 1 0 6" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" />
</svg>
