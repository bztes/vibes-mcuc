<svelte:options namespace="svg" />

<script lang="ts">
	import type { CaseLayout, Rect } from '../../case/types';
	import { K, deckOf } from './index';

	interface Props {
		layout: CaseLayout;
		/** Shown layer, -1 for the lid. */
		layerIndex: number;
	}

	let { layout, layerIndex }: Props = $props();

	const resolved = $derived(layerIndex >= 0 ? layout.layers[layerIndex] : null);
	const openings = $derived((resolved && deckOf.get(resolved)?.openings) ?? []);

	// SVG y points down, the model's y points back (up on screen)
	const r = (rc: Rect) => ({ x: rc.x0, y: -rc.y1, width: rc.x1 - rc.x0, height: rc.y1 - rc.y0 });
</script>

{#each openings as o, i (i)}
	<rect {...r(o)} rx={K.grid.radius} class="fill-zinc-100 stroke-zinc-300" stroke-width="0.3" />
{/each}
