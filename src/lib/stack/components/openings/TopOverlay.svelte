<svelte:options namespace="svg" />

<script lang="ts">
	import { wallRect } from '../../case/math';
	import type { CaseLayout, Rect } from '../../case/types';
	import { ventSpans } from '../cutouts';
	import PlateOpenings from '../PlateOpenings.svelte';
	import { lidOpeningsOf, openingsOf } from './index';

	interface Props {
		layout: CaseLayout;
		/** Shown layer, -1 for the lid. */
		layerIndex: number;
	}

	let { layout, layerIndex }: Props = $props();

	const hx = $derived(layout.inner.length / 2);
	const hy = $derived(layout.inner.width / 2);
	const w = $derived(layout.wall);
	const resolved = $derived(layerIndex >= 0 ? layout.layers[layerIndex] : null);
	const data = $derived(resolved ? openingsOf.get(resolved) : null);
	const plate = $derived(
		(data ? data.floor : layerIndex < 0 ? lidOpeningsOf.get(layout.lid)?.top : null) ?? []
	);

	// SVG y points down, the model's y points back (up on screen)
	const r = (rc: Rect) => ({ x: rc.x0, y: -rc.y1, width: rc.x1 - rc.x0, height: rc.y1 - rc.y0 });
</script>

<PlateOpenings openings={plate} class="fill-accent-500/70" />
<!-- wall openings, seen from above: where they go through the wall -->
{#each data?.walls ?? [] as o, i (i)}
	{#each ventSpans(o.width, o.type === 'vent') as [a0, a1], j (j)}
		<rect
			{...r(wallRect(o.side, o.u + a0, o.u + a1, -w - 0.01, 0.01, hx, hy))}
			class="fill-accent-500"
		/>
	{/each}
{/each}
