<svelte:options namespace="svg" />

<script lang="ts">
	import { wallRect as wall } from '../../../case/math';
	import type { CaseLayout, Rect } from '../../../case/types';
	import type { Side } from '../../../parts';
	import { K, lidSlideOf, lockDims, slideOf, type Seam } from './index';

	interface Props {
		layout: CaseLayout;
		/** Shown layer, -1 for the lid. */
		layerIndex: number;
	}

	let { layout, layerIndex }: Props = $props();

	const hx = $derived(layout.inner.length / 2);
	const hy = $derived(layout.inner.width / 2);
	const ld = $derived(lockDims(layout.wall, layout.tolerance));
	const resolved = $derived(layerIndex >= 0 ? layout.layers[layerIndex] : null);
	const data = $derived(resolved ? slideOf.get(resolved) : null);
	/** The seam below the shown part (none for the base). */
	const down = $derived<Seam | null>(
		(resolved ? data?.down : lidSlideOf.get(layout.lid)?.down) ?? null
	);

	// SVG y points down, the model's y points back (up on screen)
	const r = (rc: Rect) => ({ x: rc.x0, y: -rc.y1, width: rc.x1 - rc.x0, height: rc.y1 - rc.y0 });

	/** Rect over the world span [a0, a1] along a wall, d0..d1 inwards from the inner face. */
	const wallRect = (side: Side, [a0, a1]: [number, number], d0: number, d1: number): Rect =>
		wall(side, a0, a1, d0, d1, hx, hy);
	const nose = K.nose.base;
</script>

<!-- from below: hollows in the wall where the hooks drop in and slide -->
{#if down}
	{#each down.hooks as h, i (i)}
		<rect
			{...r(wallRect(h.side, ld.sweep(h.u), -ld.stem - layout.tolerance, 0))}
			class="fill-zinc-200"
		/>
		<rect {...r(wallRect(h.side, ld.entry(h.u), -ld.outer, 0))} class="fill-zinc-200" />
	{/each}
{/if}

<!-- going up: hooks with their noses -->
{#if data}
	{#each data.up.hooks as h, i (i)}
		<rect {...r(wallRect(h.side, ld.locked(h.u), -ld.stem - ld.reach, 0))} class="fill-zinc-700">
			<title>Slide hook – its nose clicks it in place</title>
		</rect>
		<rect
			{...r(wallRect(h.side, [h.u - nose, h.u + nose], -ld.stem - ld.nose.out, -ld.stem))}
			class="fill-zinc-900"
		/>
	{/each}
{/if}
