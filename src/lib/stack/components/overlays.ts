import type { Component } from 'svelte';
import type { CaseLayout } from '../case/types';
import DeckOverlay from './deck/TopOverlay.svelte';
import OpeningsOverlay from './openings/TopOverlay.svelte';
import TopOverlay from './top/TopOverlay.svelte';
import ClipsOverlay from './walls/clips/TopOverlay.svelte';
import PortsOverlay from './walls/PortsOverlay.svelte';
import SlideOverlay from './walls/slide/TopOverlay.svelte';

type Overlay = Component<{ layout: CaseLayout; layerIndex: number }>;

/** What a component draws into the top view (SVG, model units), by component id. */
const OVERLAYS: Record<string, Overlay[]> = {
	openings: [OpeningsOverlay],
	fitted: [PortsOverlay],
	clips: [PortsOverlay, ClipsOverlay],
	slide: [PortsOverlay, SlideOverlay],
	deck: [DeckOverlay],
	top: [TopOverlay]
};

/** The overlays of a layout, bottom-most first: the floor below what is in the walls. */
export function topOverlays(layout: CaseLayout): Overlay[] {
	const floorFirst = (id: string) => (id === 'deck' ? 0 : 1);
	return [...layout.components]
		.sort((a, b) => floorFirst(a) - floorFirst(b))
		.flatMap((id) => OVERLAYS[id] ?? []);
}
