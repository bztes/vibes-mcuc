<svelte:options namespace="svg" />

<script lang="ts">
	import { wallRect as wall } from '../../../case/math';
	import type { CaseLayout, Rect } from '../../../case/types';
	import type { Side } from '../../../parts';
	import { clipDims, clipsOf, K, lidClipsOf, lipDims, type LockClip } from './index';

	interface Props {
		layout: CaseLayout;
		/** Shown layer, -1 for the lid. */
		layerIndex: number;
	}

	let { layout, layerIndex }: Props = $props();

	const hx = $derived(layout.inner.length / 2);
	const hy = $derived(layout.inner.width / 2);
	const w = $derived(layout.wall);
	const cd = $derived(clipDims(layout.tolerance));
	const ld = $derived(lipDims(layout.tolerance));
	const resolved = $derived(layerIndex >= 0 ? layout.layers[layerIndex] : null);
	const data = $derived(resolved ? clipsOf.get(resolved) : null);
	const lidPockets = $derived(lidClipsOf.get(layout.lid)?.pocketsDown ?? []);

	// SVG y points down, the model's y points back (up on screen)
	const r = (rc: Rect) => ({ x: rc.x0, y: -rc.y1, width: rc.x1 - rc.x0, height: rc.y1 - rc.y0 });

	/** Rect in wall coordinates: a along the wall (centred on u), d inwards from the inner face. */
	const wallRect = (side: Side, u: number, a0: number, a1: number, d0: number, d1: number) =>
		wall(side, u + a0, u + a1, d0, d1, hx, hy);

	/** Lip rising from the clip section. */
	const clipRect = (c: LockClip) =>
		wallRect(c.side, c.u, -K.clip.width / 2, K.clip.width / 2, cd.lipD0, cd.lipD1);
	/** The two slits that free the clip section. */
	const slitRects = (c: LockClip) =>
		[-1, 1].map((s) => {
			const a = (s * K.clip.width) / 2;
			return wallRect(
				c.side,
				c.u,
				Math.min(a, a + s * K.clip.slit),
				Math.max(a, a + s * K.clip.slit),
				-w,
				0
			);
		});
	/** Recess in the wall for the clip from below. */
	const windowRect = (c: LockClip) =>
		wallRect(c.side, c.u, -cd.pocketWidth / 2, cd.pocketWidth / 2, -cd.recessDepth, 0);

	/** The two legs of every corner, d0 to d1 inwards from the wall, `len` from the corner. */
	const cornerLegs = (d0: number, d1: number, len: number) =>
		[
			[-1, -1],
			[1, -1],
			[1, 1],
			[-1, 1]
		].flatMap(([sx, sy]) => [
			wallRect(sy < 0 ? 'front' : 'back', sx * (hx - len / 2), -len / 2, len / 2, d0, d1),
			wallRect(sx < 0 ? 'left' : 'right', sy * (hy - len / 2), -len / 2, len / 2, d0, d1)
		]);
	const lipLegs = $derived(cornerLegs(ld.d0, ld.d1, K.cornerLip.length));
	const slotLegs = $derived(cornerLegs(0, ld.slotDepth, ld.slotLength));
</script>

<!-- slots for the corner lips from below (tiers and lid), lips going up -->
{#if layerIndex !== 0}
	{#each slotLegs as s, i (i)}
		<rect {...r(s)} class="fill-zinc-200" />
	{/each}
{/if}

{#if data}
	{#each lipLegs as l, i (i)}
		<rect {...r(l)} class="fill-zinc-700" />
	{/each}
	<!-- pockets for the clips from below, clips going up -->
	{#each data.pocketsDown as c, i (i)}
		<rect {...r(windowRect(c))} class="fill-zinc-200 stroke-zinc-400" stroke-width="0.3" />
	{/each}
	{#each data.clipsUp as c, i (i)}
		<rect {...r(clipRect(c))} class="fill-zinc-700" />
		{#each slitRects(c) as sr, j (j)}
			<rect {...r(sr)} class="fill-white" />
		{/each}
	{/each}
{:else if layerIndex < 0}
	<!-- lid: the clips it receives -->
	{#each lidPockets as c, i (i)}
		<rect {...r(windowRect(c))} class="fill-zinc-200 stroke-zinc-400" stroke-width="0.3" />
	{/each}
{/if}
