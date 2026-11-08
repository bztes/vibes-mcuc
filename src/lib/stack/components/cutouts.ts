import type { Manifold } from 'manifold-3d';
import { SEGMENTS, type Csg } from '../case/csg';
import type { OpeningType } from '../parts';

/** Shapes the components cut their openings with. */

/** Vents: a row of slots instead of one open area. Width of a slot, centre-to-centre pitch. */
export const VENT = { slot: 1.6, pitch: 3.2 };

/** Centres of the vent slots across an opening of the given width, relative to its centre. */
export function ventSlots(width: number): number[] {
	const n = Math.max(1, Math.floor((width - VENT.slot) / VENT.pitch) + 1);
	return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * VENT.pitch);
}

/** Spans across an opening of this width, relative to its centre: the slots of a vent, or all. */
export const ventSpans = (width: number, vent: boolean): [number, number][] =>
	vent
		? ventSlots(width).map((c): [number, number] => [c - VENT.slot / 2, c + VENT.slot / 2])
		: [[-width / 2, width / 2]];

/** An opening in a plate (floor, deck, top): centre and size (width = diameter of a circle). */
export interface PlateOpening {
	type: OpeningType;
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Extent of an opening across y (a circle is as high as it is wide). */
export const spanY = (o: PlateOpening) => (o.type === 'circle' ? o.width : o.height);

/** Length across y of a rect, or of the slots of a vent (they stop half a slot short of the ends). */
export const slotLength = (o: PlateOpening) =>
	o.type === 'vent' ? Math.max(0.1, o.height - VENT.slot) : o.height;

/** What an opening cuts out of a plate from z0 to z1. */
export function plateCutout(g: Csg, o: PlateOpening, z0: number, z1: number): Manifold {
	if (o.type === 'circle') {
		const r = o.width / 2;
		return g.t(g.t(g.Manifold.cylinder(z1 - z0, r, r, SEGMENTS)).translate([o.x, o.y, z0]));
	}
	const hy = slotLength(o) / 2;
	return g.union(
		ventSpans(o.width, o.type === 'vent').map(([a0, a1]) =>
			g.box(o.x + a0, o.x + a1, o.y - hy, o.y + hy, z0, z1)
		)
	)!;
}

/** Does the opening stay inside |x| ≤ hx, |y| ≤ hy? */
export const plateFits = (o: PlateOpening, hx: number, hy: number) =>
	Math.abs(o.x) + o.width / 2 <= hx + 0.01 && Math.abs(o.y) + spanY(o) / 2 <= hy + 0.01;
