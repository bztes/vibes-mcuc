<svelte:options namespace="svg" />

<script lang="ts">
	import { slotLength, ventSpans, type PlateOpening } from './cutouts';

	/** Openings in a plate (floor, deck, top) in the top view. */
	interface Props {
		openings: (PlateOpening & { label: string })[];
		class: string;
	}

	let { openings, class: cls }: Props = $props();
</script>

{#each openings as o, i (i)}
	{#if o.type === 'circle'}
		<circle cx={o.x} cy={-o.y} r={o.width / 2} class={cls}>
			<title>{o.label}</title>
		</circle>
	{:else}
		{@const h = slotLength(o)}
		{#each ventSpans(o.width, o.type === 'vent') as [a0, a1], j (j)}
			<rect x={o.x + a0} y={-o.y - h / 2} width={a1 - a0} height={h} class={cls}>
				<title>{o.label}</title>
			</rect>
		{/each}
	{/if}
{/each}
