<script lang="ts">
	import { AlertTriangle, Box, ChevronDown, ChevronUp, Plus } from '@lucide/svelte';
	import type { Component } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { getEditor, layerName } from '../editor.svelte';
	import AddBoard from './AddBoard.svelte';

	const editor = getEditor();
	const layout = $derived(editor.layout);
	const rows = $derived([...editor.data.layers.map((l, i) => ({ l, i }))].reverse());
	const lidActive = $derived(editor.target.kind === 'lid');
	/** Layer the add-board dialog is open for. */
	let addTo = $state<string | null>(null);

	// exactly one row is solid; a tint marks the part that holds it or is shown in the viewers
	const rowClass = (selected: boolean, context = false) =>
		[
			'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors',
			selected
				? 'bg-accent-600 text-white'
				: context
					? 'bg-accent-100 text-accent-700 hover:bg-accent-200'
					: 'text-zinc-700 hover:bg-zinc-200/70'
		].join(' ');
	const swatch = 'size-2.5 shrink-0 rounded-sm ring-1 ring-black/15';
	const name = 'block truncate font-medium';
	const detail = 'block truncate text-[11px] opacity-70';
	const boardCount = (n: number) => (n ? `${n} board${n > 1 ? 's' : ''}` : 'empty');
</script>

{#snippet rowAction(
	Icon: Component<{ class?: string }>,
	label: string,
	selected: boolean,
	onclick: () => void,
	disabled = false
)}
	<button
		type="button"
		class="flex size-6 cursor-pointer items-center justify-center rounded transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-500 disabled:pointer-events-none disabled:opacity-30 {selected
			? 'text-white hover:bg-white/20'
			: 'text-zinc-500 hover:bg-zinc-300/60 hover:text-zinc-900'}"
		title={label}
		aria-label={label}
		{disabled}
		{onclick}
	>
		<Icon class="size-3.5" />
	</button>
{/snippet}

<div class="flex flex-col gap-3 p-2">
	<button
		type="button"
		class="{rowClass(editor.caseSelected)} py-1.5"
		aria-current={editor.caseSelected ? 'true' : undefined}
		onclick={() => editor.selectCase()}
	>
		<Box class="size-3.5 shrink-0" />
		<span class="min-w-0 flex-1">
			<span class={name}>Case</span>
			<span class={detail}>
				{layout.outer.length.toFixed(0)} × {layout.outer.width.toFixed(0)} × {layout.outer.height.toFixed(
					0
				)} mm
			</span>
		</span>
	</button>

	<div>
		<div class="flex items-center justify-between pr-0.5 pb-1 pl-2.5">
			<h2 class="text-xs font-semibold text-zinc-500">Layers</h2>
			{#if !editor.readonly}
				<Button
					size="sm"
					variant="ghost"
					onclick={() => editor.addLayer()}
					title="Add a layer above the selected one"
				>
					<Plus /> Add
				</Button>
			{/if}
		</div>

		<ul class="flex flex-col gap-0.5">
			<li>
				<button
					type="button"
					class="{rowClass(lidActive && !editor.caseSelected, lidActive)} py-1.5"
					aria-current={lidActive && !editor.caseSelected ? 'true' : undefined}
					onclick={() => editor.show({ kind: 'lid' })}
				>
					<span class="{swatch} bg-[#6fc2b8]"></span>
					<span class="min-w-0 flex-1">
						<span class={name}>Lid</span>
						<span class={detail}>{layout.lid.height.toFixed(1)} mm</span>
					</span>
				</button>
			</li>
			{#each rows as { l, i } (l.id)}
				{@const r = layout.layers[i]}
				{@const active = editor.target.kind === 'layer' && editor.target.id === l.id}
				{@const selected = active && !editor.board && !editor.caseSelected}
				<li>
					<div class="relative">
						<button
							type="button"
							class="{rowClass(selected, active)} py-1.5 pr-20"
							aria-current={selected ? 'true' : undefined}
							onclick={() => editor.show({ kind: 'layer', id: l.id })}
						>
							<span class="{swatch} {i % 2 ? 'bg-[#d9e2ec]' : 'bg-[#e9e6df]'}"></span>
							<span class="min-w-0 flex-1">
								<span class="flex items-center gap-1.5">
									<span class={name}>{layerName(i)}</span>
									{#if r?.warnings.length}
										<span title="Needs a check – select this layer for details">
											<AlertTriangle
												class="size-3.5 {selected ? 'text-white' : 'text-amber-600'}"
											/>
										</span>
									{/if}
								</span>
								<span class={detail}>{r?.height.toFixed(1)} mm · {boardCount(l.boards.length)}</span
								>
							</span>
						</button>
						<div
							class="absolute top-1/2 right-1 flex -translate-y-1/2 items-center"
							hidden={editor.readonly}
						>
							{@render rowAction(
								ChevronUp,
								`Move ${layerName(i)} up`,
								selected,
								() => editor.moveLayer(l.id, 1),
								i === editor.data.layers.length - 1
							)}
							{@render rowAction(
								ChevronDown,
								`Move ${layerName(i)} down`,
								selected,
								() => editor.moveLayer(l.id, -1),
								i === 0
							)}
							{@render rowAction(
								Plus,
								`Add board to ${layerName(i)}`,
								selected,
								() => (addTo = l.id)
							)}
						</div>
					</div>

					{#if l.boards.length}
						<ul class="mt-0.5 ml-3.75 flex flex-col gap-0.5 border-l border-zinc-300 pl-1.5">
							{#each l.boards as b (b.uid)}
								{@const part = r?.boards.find((q) => q.board.uid === b.uid)}
								{@const boardSelected = editor.selectedBoard === b.uid}
								<li>
									<button
										type="button"
										class="{rowClass(boardSelected)} py-1"
										aria-current={boardSelected ? 'true' : undefined}
										onclick={() => editor.selectBoard(b.uid)}
									>
										<span class="size-2 shrink-0 rounded-full" style:background={part?.def.color}
										></span>
										<span class="min-w-0 flex-1 truncate text-[13px]">
											{part?.def.name ?? b.defId}
										</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
</div>

<AddBoard bind:layerId={addTo} />
