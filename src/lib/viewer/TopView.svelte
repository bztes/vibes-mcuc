<script lang="ts">
	import { getEditor } from '#lib/editor/editor.svelte.js';
	import type { Rect } from '#lib/stack/case/types.js';
	import { topOverlays } from '#lib/stack/components/overlays.js';

	const editor = getEditor();

	const layout = $derived(editor.layout);
	const hx = $derived(layout.inner.length / 2);
	const hy = $derived(layout.inner.width / 2);
	const w = $derived(layout.wall);
	const pad = 14;
	const viewBox = $derived(
		`${-hx - w - pad} ${-hy - w - pad} ${2 * (hx + w + pad)} ${2 * (hy + w + pad)}`
	);

	const resolved = $derived(editor.layerIndex >= 0 ? layout.layers[editor.layerIndex] : null);
	const below = $derived(
		editor.layerIndex > 0
			? layout.layers[editor.layerIndex - 1]
			: editor.layerIndex < 0
				? layout.layers[layout.layers.length - 1]
				: null
	);

	// SVG y points down, the model's y points back (up on screen)
	const r = (rc: Rect) => ({ x: rc.x0, y: -rc.y1, width: rc.x1 - rc.x0, height: rc.y1 - rc.y0 });

	// ── dragging ────────────────────────────────────────────────────────
	let svg = $state<SVGSVGElement>();
	let drag: { uid: string; x0: number; y0: number; bx: number; by: number } | null = null;

	function toModel(e: PointerEvent) {
		const m = svg!.getScreenCTM()!.inverse();
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
		return { x: p.x, y: -p.y };
	}

	function startDrag(e: PointerEvent, uid: string) {
		const b = editor.layer?.boards.find((q) => q.uid === uid);
		if (!b) return;
		e.stopPropagation();
		editor.selectBoard(uid);
		if (editor.readonly) return;
		const p = toModel(e);
		drag = { uid, x0: p.x, y0: p.y, bx: b.x, by: b.y };
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
	}

	function moveDrag(e: PointerEvent) {
		if (!drag) return;
		const b = editor.layer?.boards.find((q) => q.uid === drag!.uid);
		if (!b) return;
		const p = toModel(e);
		b.x = Math.round((drag.bx + p.x - drag.x0) * 2) / 2;
		b.y = Math.round((drag.by + p.y - drag.y0) * 2) / 2;
	}
</script>

<div class="relative h-full w-full bg-zinc-50">
	<svg
		bind:this={svg}
		{viewBox}
		class="h-full w-full touch-none select-none"
		role="presentation"
		onpointerdown={() => editor.selectBoard(null)}
		onpointermove={moveDrag}
		onpointerup={() => (drag = null)}
	>
		<!-- walls -->
		<rect
			x={-hx - w}
			y={-hy - w}
			width={2 * (hx + w)}
			height={2 * (hy + w)}
			rx={layout.cornerRadius}
			class="fill-zinc-300"
		/>
		<rect
			x={-hx}
			y={-hy}
			width={2 * hx}
			height={2 * hy}
			rx={Math.max(0.5, layout.cornerRadius - w)}
			class="fill-white"
		/>

		<!-- what the components add: floor and wall openings, the joint, lid openings -->
		{#each topOverlays(layout) as Overlay, i (i)}
			<Overlay {layout} layerIndex={editor.layerIndex} />
		{/each}

		<!-- layer below, for orientation -->
		{#if below}
			{#each below.boards as b (b.board.uid)}
				<rect
					{...r(b.rect)}
					class="fill-none stroke-zinc-400"
					stroke-width="0.4"
					stroke-dasharray="1.5 1.5"
				/>
			{/each}
		{/if}

		{#if resolved}
			<!-- boards -->
			{#each resolved.boards as b (b.board.uid)}
				{@const selected = editor.selectedBoard === b.board.uid}
				{@const bw = b.rect.x1 - b.rect.x0}
				{@const bh = b.rect.y1 - b.rect.y0}
				{@const turned = bw < bh - 4}
				{@const fs = Math.min(3, ((turned ? bh : bw) * 0.9) / (b.def.name.length * 0.55))}
				<g
					role="button"
					tabindex="-1"
					class="cursor-grab active:cursor-grabbing"
					onpointerdown={(e) => startDrag(e, b.board.uid)}
				>
					<rect
						{...r(b.outer)}
						fill={b.def.color}
						fill-opacity={selected ? 0.9 : 0.75}
						class={selected ? 'stroke-accent-500' : 'stroke-black/30'}
						stroke-width={selected ? 0.8 : 0.3}
					/>
					<text
						x={b.cx}
						y={-b.cy}
						text-anchor="middle"
						dominant-baseline="central"
						class="pointer-events-none fill-white font-medium"
						font-size={fs}
						transform={turned ? `rotate(-90 ${b.cx} ${-b.cy})` : undefined}>{b.def.name}</text
					>
					{#each b.pinPoints as [px, py], i (i)}
						<circle cx={px} cy={-py} r="0.45" class="pointer-events-none fill-amber-300" />
					{/each}
				</g>
			{/each}
		{/if}

		<!-- wall labels -->
		<text x="0" y={hy + w + 6} text-anchor="middle" class="fill-zinc-400 text-[3.5px]">front</text>
		<text x="0" y={-hy - w - 3} text-anchor="middle" class="fill-zinc-400 text-[3.5px]">back</text>
	</svg>

	<p class="pointer-events-none absolute bottom-2 left-3 text-[11px] text-zinc-400">
		{#if resolved}
			Drag boards to arrange them · R rotate · Del remove · the case fits itself around them
		{:else}
			Top view of the lid
		{/if}
	</p>
</div>
