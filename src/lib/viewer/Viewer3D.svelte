<script lang="ts">
	import { Blend, Eye, EyeOff, Focus } from '@lucide/svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Segmented from '#lib/components/ui/Segmented.svelte';
	import { getEditor } from '#lib/editor/editor.svelte.js';
	import { StackScene } from './scene';

	const editor = getEditor();

	let scene = $state.raw<StackScene | null>(null);
	let explode = $state(0.5);
	let showBoards = $state(true);
	let transparent = $state(false);

	$effect(() => {
		const b = editor.build;
		scene?.update({
			layout: editor.layout,
			meshes: b ? { layers: b.layers, lid: b.lid } : null,
			mode: editor.view3d,
			index: editor.layerIndex,
			explode,
			selectedBoard: editor.selectedBoard,
			showBoards,
			transparent
		});
	});

	const modes = [
		{ value: 'layer', label: 'Layer', title: 'Only the selected layer' },
		{ value: 'stack', label: 'Stack', title: 'All layers' },
		{ value: 'print', label: 'Print', title: 'Parts as they go on the print bed' }
	] as const;
</script>

<div class="relative h-full w-full overflow-hidden bg-gradient-to-b from-zinc-100 to-zinc-200/80">
	<div
		class="absolute inset-0"
		{@attach (el) => {
			const s = new StackScene(el);
			s.onPick = (uid) => editor.selectBoard(uid);
			scene = s;
			return () => {
				s.destroy();
				scene = null;
			};
		}}
	></div>

	<div class="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
		<div class="pointer-events-auto rounded-lg bg-white/80 p-1 shadow-sm backdrop-blur">
			<Segmented bind:value={editor.view3d} options={modes} size="sm" />
		</div>
		<div
			class="pointer-events-auto flex gap-0.5 rounded-lg bg-white/80 p-1 shadow-sm backdrop-blur"
		>
			{#if editor.view3d !== 'print'}
				<Button
					variant="ghost"
					size="icon-sm"
					title={showBoards ? 'Hide boards (case only)' : 'Show boards'}
					active={!showBoards}
					aria-pressed={!showBoards}
					onclick={() => (showBoards = !showBoards)}
				>
					{#if showBoards}<Eye />{:else}<EyeOff />{/if}
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					title={transparent ? 'Solid case' : 'Transparent case'}
					active={transparent}
					aria-pressed={transparent}
					onclick={() => (transparent = !transparent)}
				>
					<Blend />
				</Button>
			{/if}
			<Button variant="ghost" size="icon-sm" title="Fit to view" onclick={() => scene?.fit()}>
				<Focus />
			</Button>
		</div>
	</div>

	{#if editor.view3d === 'stack'}
		<div
			class="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-white/85 px-3 py-1.5 text-xs shadow-sm backdrop-blur"
		>
			<span class="text-zinc-500">Closed</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				bind:value={explode}
				class="w-36 accent-teal-600"
			/>
			<span class="text-zinc-500">Apart</span>
		</div>
	{/if}

	<div class="pointer-events-none absolute right-3 bottom-3 text-[11px] text-zinc-500">
		{#if editor.building}
			<span class="flex items-center gap-1.5 rounded bg-white/80 px-2 py-1 shadow-sm">
				<span class="size-1.5 animate-pulse rounded-full bg-accent-500"></span> Generating…
			</span>
		{/if}
	</div>

	{#if editor.buildError}
		<div
			class="absolute bottom-12 left-3 max-w-sm rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
		>
			Geometry error: {editor.buildError}
		</div>
	{/if}
</div>
