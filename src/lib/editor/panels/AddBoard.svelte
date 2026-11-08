<script lang="ts">
	import Dialog from '#lib/components/ui/Dialog.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import { CATEGORY_LABELS, LIBRARY } from '#lib/stack/library.js';
	import type { PartDefinition } from '#lib/stack/parts.js';
	import { getEditor, layerName } from '../editor.svelte';

	/** The layer to add to; the dialog is open while this is set. */
	let { layerId = $bindable() }: { layerId: string | null } = $props();

	const editor = getEditor();
	const destination = $derived(layerName(editor.data.layers.findIndex((l) => l.id === layerId)));

	let query = $state('');
	const terms = $derived(query.toLowerCase().split(/\s+/).filter(Boolean));
	const matches = (p: PartDefinition) => {
		const text = `${p.name} ${p.description} ${CATEGORY_LABELS[p.category]}`.toLowerCase();
		return terms.every((t) => text.includes(t));
	};
	const groups = $derived(
		Object.entries(CATEGORY_LABELS)
			.map(([cat, label]) => ({
				label,
				parts: LIBRARY.filter((p) => p.category === cat && matches(p))
			}))
			.filter((g) => g.parts.length)
	);
	/** What Enter picks while searching. */
	const first = $derived(terms.length ? groups[0]?.parts[0] : undefined);

	function close() {
		layerId = null;
		query = '';
	}

	function add(partId: string) {
		if (layerId) editor.addBoard(layerId, partId);
		close();
	}
</script>

<Dialog
	bind:open={() => layerId !== null, (open) => !open && close()}
	title="Add board to {destination}"
	size="lg"
>
	<div class="min-h-[calc(70vh-1rem)]">
		<div class="sticky -top-4 z-10 -mx-5 -mt-4 mb-1 bg-white px-5 pt-4 pb-3">
			<TextField
				bind:value={query}
				placeholder="Search boards…"
				aria-label="Search boards"
				autocomplete="off"
				onkeydown={(e) => {
					if (e.key === 'Enter' && first) add(first.id);
				}}
				{@attach (el) => queueMicrotask(() => el.focus())}
			/>
		</div>

		<div class="flex flex-col gap-5">
			{#each groups as g (g.label)}
				<section>
					<h3 class="mb-2 text-xs font-semibold text-zinc-500">{g.label}</h3>
					<ul class="grid grid-cols-2 gap-2 sm:grid-cols-3">
						{#each g.parts as p (p.id)}
							<li>
								<button
									type="button"
									class="flex h-full w-full cursor-pointer flex-col gap-1 rounded-lg border p-2.5 text-left transition-colors hover:border-accent-400 hover:bg-accent-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 {p ===
									first
										? 'border-accent-400 bg-accent-50'
										: 'border-zinc-200'}"
									onclick={() => add(p.id)}
								>
									<span class="flex items-center gap-2 text-[13px] font-medium text-zinc-800">
										<span class="size-2 shrink-0 rounded-full" style:background={p.color}></span>
										<span class="min-w-0 truncate" title={p.name}>{p.name}</span>
									</span>
									<span class="line-clamp-2 text-xs text-zinc-500">{p.description}</span>
									<span class="mt-auto font-mono text-[11px] text-zinc-400">
										{p.length} × {p.width} mm
									</span>
								</button>
							</li>
						{/each}
					</ul>
				</section>
			{:else}
				<p class="py-12 text-center text-sm text-zinc-500">No boards match “{query.trim()}”.</p>
			{/each}
		</div>
	</div>
</Dialog>
