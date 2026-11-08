<svelte:options namespace="svg" />

<script lang="ts">
	import type { CaseLayout } from '../../case/types';
	import PlateOpenings from '../PlateOpenings.svelte';
	import { topOf } from './index';

	interface Props {
		layout: CaseLayout;
		/** Shown layer, -1 for the lid. */
		layerIndex: number;
	}

	let { layout, layerIndex }: Props = $props();

	const openings = $derived(layerIndex < 0 ? (topOf.get(layout.lid)?.openings ?? []) : []);
</script>

<PlateOpenings {openings} class="fill-amber-500/70" />
