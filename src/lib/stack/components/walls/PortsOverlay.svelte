<svelte:options namespace="svg" />

<script lang="ts">
	import { wallRect } from '../../case/math';
	import type { CaseLayout, Rect } from '../../case/types';
	import { portsOf } from './ports';

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
	const notches = $derived((resolved && portsOf.get(resolved)?.notches) ?? []);

	// SVG y points down, the model's y points back (up on screen)
	const r = (rc: Rect) => ({ x: rc.x0, y: -rc.y1, width: rc.x1 - rc.x0, height: rc.y1 - rc.y0 });
</script>

{#each notches as n, i (i)}
	<rect
		{...r(wallRect(n.side, n.u - n.width / 2, n.u + n.width / 2, -w - 0.01, 0.01, hx, hy))}
		class="fill-amber-500"
	>
		<title>{n.label}</title>
	</rect>
{/each}
