<script lang="ts">
	import { AlertTriangle, Plus, RotateCw, Trash2 } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import NumberField from '#lib/components/ui/NumberField.svelte';
	import Segmented from '#lib/components/ui/Segmented.svelte';
	import Select from '#lib/components/ui/Select.svelte';
	import Switch from '#lib/components/ui/Switch.svelte';
	import { WALLS } from '#lib/stack/components/index.js';
	import { topOf } from '#lib/stack/components/top/index.js';
	import { computeLayout } from '#lib/stack/index.js';
	import { SIDES, type OpeningType, type PinSide } from '#lib/stack/parts.js';
	import { WALL_IDS, type PlateOpening } from '#lib/stack/schema.js';
	import { getEditor, layerName } from '../editor.svelte';

	const editor = getEditor();
	const layout = $derived(editor.layout);
	const resolved = $derived(editor.layerIndex >= 0 ? layout.layers[editor.layerIndex] : null);

	const wallOptions = WALL_IDS.map((c) => ({
		value: c,
		label: WALLS[c].label,
		title: WALLS[c].note
	}));
	const walls = $derived(WALLS[editor.data.walls]);
	const sideOptions = SIDES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }));
	const typeOptions = [
		{ value: 'rect', label: 'Rect' },
		{ value: 'circle', label: 'Circle' },
		{ value: 'vent', label: 'Vent' }
	] as const;

	const pinOptions: readonly { value: PinSide; label: string; title: string }[] = [
		{ value: 'bottom', label: 'Bottom', title: 'Header pins point down' },
		{ value: 'top', label: 'Top', title: 'Header pins point up' },
		{ value: 'none', label: 'None', title: 'No header soldered' }
	];

	const heading = 'mb-2 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase';
	const body = 'flex flex-col gap-6 p-4';
	const rounded = (mm: number) => Math.round(mm * 10) / 10;
	/** What letting the boards reach into the lid saves on the top layer, and if not, why. */
	const lidGain = $derived.by(() => {
		// only the clips let the boards reach into the lid
		if (editor.layerIndex >= 0 || editor.caseSelected || !walls.lidRoom) return null;
		const top = layout.layers[layout.layers.length - 1];
		const other = computeLayout({
			...editor.data,
			lid: { ...editor.data.lid, boardsInside: !editor.data.lid.boardsInside }
		});
		const otherTop = other.layers[other.layers.length - 1];
		const saved = Math.abs(top.height - otherTop.height);
		if (saved > 0.01) return { saved, why: '' };
		const why =
			top.layer.height !== null
				? 'The top layer has a fixed height.'
				: editor.data.size.height !== null
					? 'The case has a fixed height.'
					: top.boards.length && Math.max(top.minHeight, otherTop.minHeight) >= top.height - 0.5
						? `The top layer is already as low as the ${walls.label.toLowerCase()} walls allow (${rounded(top.minHeight)} mm).`
						: 'The top layer needs its full height.';
		return { saved: 0, why };
	});
	const autoOpenings = $derived(topOf.get(layout.lid)?.openings.length ?? 0);
</script>

{#snippet head(title: string, note: string, actions?: Snippet)}
	<header
		class="sticky top-0 z-10 flex items-start gap-2 border-t-2 border-b border-t-accent-600 border-b-zinc-200 bg-white px-4 py-3"
	>
		<div class="min-w-0 flex-1">
			<p class="text-[11px] font-medium text-accent-700">Selected</p>
			<h2 class="truncate text-sm font-semibold" {title}>{title}</h2>
			<p class="text-xs text-zinc-500">{note}</p>
		</div>
		{#if actions}<div class="flex shrink-0 items-center">{@render actions()}</div>{/if}
	</header>
{/snippet}

{#snippet size(o: { type: OpeningType; width: number; height: number })}
	<NumberField
		label={o.type === 'circle' ? 'Diameter' : 'Width'}
		bind:value={o.width}
		min={1}
		max={300}
		compact
	/>
	{#if o.type !== 'circle'}
		<NumberField label="Height" bind:value={o.height} min={1} max={300} compact />
	{/if}
{/snippet}

{#snippet remove(id: string)}
	<Button size="sm" variant="danger" class="col-span-2" onclick={() => editor.removeOpening(id)}
		><Trash2 /> Remove</Button
	>
{/snippet}

{#snippet plate(o: PlateOpening)}
	<Segmented class="col-span-2" bind:value={o.type} options={typeOptions} size="sm" />
	<NumberField label="X" bind:value={o.x} compact />
	<NumberField label="Y" bind:value={o.y} compact />
	{@render size(o)}
	{@render remove(o.id)}
{/snippet}

{#snippet warnings(list: string[])}
	{#if list.length}
		<div class="flex flex-col gap-1 rounded-md bg-amber-50 p-2.5 text-xs text-amber-800">
			{#each list as w (w)}
				<p class="flex gap-1.5"><AlertTriangle class="mt-px size-3.5 shrink-0" />{w}</p>
			{/each}
		</div>
	{/if}
{/snippet}

{#if editor.caseSelected}
	{@render head(
		'Case',
		`${layout.outer.length.toFixed(0)} × ${layout.outer.width.toFixed(0)} × ${layout.outer.height.toFixed(0)} mm outside`
	)}
	<div class={body}>
		<section>
			<Segmented
				label="Walls"
				bind:value={editor.data.walls}
				options={wallOptions}
				class="w-full"
			/>
			<p class="mt-2 text-xs text-zinc-500">{walls.note}</p>
		</section>
		<section>
			<h3 class={heading}>Outside size</h3>
			<div class="grid grid-cols-3 gap-2">
				<NumberField
					label="Length"
					bind:value={editor.data.size.length}
					auto={rounded(layout.outer.length)}
					min={10}
					max={1000}
					compact
				/>
				<NumberField
					label="Width"
					bind:value={editor.data.size.width}
					auto={rounded(layout.outer.width)}
					min={10}
					max={1000}
					compact
				/>
				<NumberField
					label="Height"
					bind:value={editor.data.size.height}
					auto={rounded(layout.outer.height)}
					min={10}
					max={1000}
					compact
				/>
			</div>
			<p class="mt-2 text-xs text-zinc-500">Leave empty to fit the boards.</p>
		</section>
		<div class="flex flex-col gap-3">
			<NumberField
				label="Wall"
				bind:value={editor.data.wall}
				auto={layout.wall}
				min={1.2}
				max={5}
				step={0.2}
			/>
			<NumberField
				label="Fit"
				bind:value={editor.data.tolerance}
				min={0}
				max={1}
				step={0.05}
				hint={walls.fitHint}
			/>
		</div>
	</div>
{:else if editor.board && resolved}
	{@const b = editor.board}
	{@const r = resolved.boards.find((q) => q.board.uid === b.uid)}
	{#snippet boardActions()}
		<Button
			size="icon-sm"
			variant="ghost"
			title="Rotate (R)"
			onclick={() => editor.rotateBoard(b.uid)}><RotateCw /></Button
		>
		<Button
			size="icon-sm"
			variant="ghost"
			title="Remove (Del)"
			onclick={() => editor.removeBoard(b.uid)}><Trash2 /></Button
		>
	{/snippet}

	{@render head(r?.def.name ?? b.defId, `Board on ${layerName(editor.layerIndex)}`, boardActions)}
	<div class={body}>
		{@render warnings(resolved.warnings)}

		{#if r?.def.pins?.length}
			<div class="flex flex-col gap-2">
				<Segmented
					label="Pins"
					value={r.pinSide}
					options={pinOptions}
					size="sm"
					onchange={(side) => (b.pins = side)}
				/>
				{#if !r.def.pinsExact && r.pinSide !== 'none'}
					<p class="text-xs text-zinc-500">
						Position not from a vendor drawing – check it against your board.
					</p>
				{/if}
			</div>
		{/if}

		<div class="flex flex-col gap-2">
			<Switch
				label="Height above floor: auto"
				checked={b.elevation === null}
				onchange={(on) =>
					(b.elevation = on ? null : Math.round(((r?.zPcb ?? 3) - resolved.zBase) * 10) / 10)}
			/>
			{#if b.elevation !== null}
				<NumberField bind:value={b.elevation} min={0} max={100} compact />
			{/if}
		</div>
	</div>
{:else if editor.layer && resolved}
	{@const layer = editor.layer}
	{#snippet layerActions()}
		<Button
			size="icon-sm"
			variant="ghost"
			title="Delete layer"
			disabled={editor.data.layers.length <= 1}
			onclick={() => editor.removeLayer(layer.id)}><Trash2 /></Button
		>
	{/snippet}

	{@render head(
		layerName(editor.layerIndex),
		editor.layerIndex === 0 ? 'Closed floor.' : 'Floor with openings for airflow and wires.',
		layerActions
	)}
	<div class={body}>
		{@render warnings(resolved.warnings)}

		<section>
			<h3 class={heading}>Size</h3>
			<div class="flex flex-col gap-3">
				<Switch
					label="Height: fit the boards"
					description={layer.height === null ? `${resolved.height.toFixed(1)} mm` : undefined}
					checked={layer.height === null}
					onchange={(on) => (layer.height = on ? null : resolved.height)}
				/>
				{#if layer.height !== null}
					<NumberField label="Height" bind:value={layer.height} min={5} max={200} />
				{/if}
				<NumberField
					label="Space around boards"
					bind:value={layer.margin}
					min={0}
					max={100}
					hint="Walls with a port stay tight to the board."
				/>
			</div>
		</section>

		<section>
			<h3 class={heading}>Openings</h3>
			<p class="mb-2 text-xs text-zinc-500">
				Ports at a wall get an opening automatically. A wall opening that reaches the top edge is
				closed there by the layer above.
			</p>
			<ul class="mb-2 flex flex-col gap-2">
				{#each layer.wallOpenings as o (o.id)}
					<li class="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 p-2">
						<Segmented class="col-span-2" bind:value={o.type} options={typeOptions} size="sm" />
						<Select label="Wall" bind:value={o.side} options={sideOptions} compact />
						<NumberField label="Position" bind:value={o.offset} compact />
						<NumberField label="Centre height" bind:value={o.z} min={0} max={200} compact />
						{@render size(o)}
						{@render remove(o.id)}
					</li>
				{/each}
				{#each layer.floorOpenings as o (o.id)}
					<li class="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 p-2">
						<p class="col-span-2 text-xs font-medium text-zinc-600">Floor</p>
						{@render plate(o)}
					</li>
				{/each}
			</ul>
			<div class="flex gap-2">
				<Button size="sm" onclick={() => editor.addWallOpening()}><Plus /> In a wall</Button>
				<Button size="sm" onclick={() => editor.addPlateOpening()}><Plus /> In the floor</Button>
			</div>
		</section>
	</div>
{:else}
	{@render head('Lid', walls.lidNote)}
	<div class={body}>
		{#if lidGain}
			<Switch
				label="Boards reach into the lid"
				description={lidGain.saved
					? `${editor.data.lid.boardsInside ? 'The top layer is' : 'Makes the top layer'} ${rounded(lidGain.saved)} mm lower; the clip into the lid gets shorter and stiffer.`
					: `No gain here. ${lidGain.why}`}
				bind:checked={editor.data.lid.boardsInside}
			/>
		{/if}
		<section>
			<h3 class={heading}>Openings</h3>
			{#if autoOpenings > 0}
				<p class="mb-2 text-xs text-zinc-500">
					{autoOpenings} opening{autoOpenings > 1 ? 's' : ''} from the boards in the top layer (displays,
					sensors).
				</p>
			{/if}
			<ul class="mb-2 flex flex-col gap-2">
				{#each editor.data.lid.openings as o (o.id)}
					<li class="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 p-2">
						{@render plate(o)}
					</li>
				{/each}
			</ul>
			<Button size="sm" onclick={() => editor.addPlateOpening()}><Plus /> Add opening</Button>
		</section>
	</div>
{/if}

{#if layout.warnings.length && (editor.caseSelected || !resolved?.warnings.length)}
	<div class="px-4 pb-4">
		{@render warnings(layout.warnings.filter((w) => !w.startsWith('Layer ')))}
	</div>
{/if}
