import type { CaseComponent } from '../../case/component';
import { SEGMENTS } from '../../case/csg';
import { isXWall, overlaps } from '../../case/math';
import { slot, type CaseLayer, type CaseLayout, type Rect } from '../../case/types';
import type { OpeningType, Side } from '../../parts';
import type { PlateOpening } from '../../schema';
import { plateCutout, plateFits, spanY, ventSpans, type PlateOpening as Plate } from '../cutouts';

/**
 * The openings added by hand: in the walls of a layer, in its floor (the floor of the base, or
 * the deck), and in the top of the lid. Each is a rect, a circle or a vent (a row of slots).
 *
 * A wall opening that reaches the top edge opens there, and the part above closes it. They are
 * placed first, so the walls, the cradle and the deck keep clear of them. Where an opening runs
 * into something it can't have, it is cut short and warns.
 */

/** Opening in a wall: u = centre along the wall, z0..z1 in the layer. */
export interface WallHole {
	id: string;
	type: OpeningType;
	side: Side;
	u: number;
	/** Diameter of a circle. */
	width: number;
	/** Centre height (circles), and how far it really goes (cut short at the bottom). */
	z: number;
	z0: number;
	z1: number;
	/** Reaches the top edge: open there. */
	open: boolean;
}

export interface PlateHole extends Plate {
	id: string;
	label: string;
}

export interface LayerOpenings {
	walls: WallHole[];
	/** In the floor of the layer. */
	floor: PlateHole[];
}

export const openingsOf = slot<LayerOpenings>('openings');
export const lidOpeningsOf = slot<{ top: PlateHole[] }>('openings');

const LABELS: Record<OpeningType, string> = {
	rect: 'Opening',
	circle: 'Round opening',
	vent: 'Vent'
};

const plateHole = (o: PlateOpening): PlateHole => ({ ...o, label: LABELS[o.type] });

const holeRect = (h: PlateHole): Rect => ({
	x0: h.x - h.width / 2,
	x1: h.x + h.width / 2,
	y0: h.y - spanY(h) / 2,
	y1: h.y + spanY(h) / 2
});

/** The band along the walls a floor keeps solid: what the walls need, in the upper layers. */
const bandOf = (layout: CaseLayout, l: CaseLayer) => (l.kind === 'tier' ? layout.seam.band : 0);

/** The wall openings of a layer, cut short where they reach too low; warns. */
function wallHoles(layout: CaseLayout, l: CaseLayer): WallHole[] {
	const H = l.height;
	// in the upper layers the part reaching in from below stays closed
	const lowest = l.index > 0 ? Math.max(l.zBase, layout.seam.overlap) : l.zBase;
	return l.layer.wallOpenings.flatMap((o): WallHole[] => {
		const half = (isXWall(o.side) ? layout.inner.length : layout.inner.width) / 2;
		const where = `An opening on the ${o.side} wall`;
		if (Math.abs(o.offset) + o.width / 2 > half) l.warnings.push(`${where} reaches past its end.`);
		const h = o.type === 'circle' ? o.width : o.height;
		const [z0, z1] = [o.z - h / 2, o.z + h / 2];
		if (z0 >= H - 0.01) {
			l.warnings.push(`${where} is above the top edge.`);
			return [];
		}
		if (z0 < lowest - 0.01) l.warnings.push(`${where} reaches too low – it is cut short.`);
		const open = z1 >= H - 0.01;
		return [
			{
				id: o.id,
				type: o.type,
				side: o.side,
				u: o.offset,
				width: o.width,
				z: o.z,
				z0: Math.max(z0, lowest),
				z1: open ? H : z1,
				open
			}
		];
	});
}

export const openings: CaseComponent = {
	id: 'openings',

	// wall openings may reach the top edge, so they need the final height
	place(ctx, layout) {
		const hx = layout.inner.length / 2;
		const hy = layout.inner.width / 2;
		for (const l of layout.layers) {
			const walls = wallHoles(layout, l);
			// the walls and what joins the parts keep clear of them
			for (const o of walls)
				l.walls.push({
					kind: 'opening',
					side: o.side,
					u: o.u,
					width: o.width,
					depth: ctx.wall,
					z0: o.z0,
					z1: o.z1
				});
			const band = bandOf(layout, l);
			const floor = l.layer.floorOpenings.map(plateHole);
			if (floor.some((h) => !plateFits(h, hx - band, hy - band)))
				l.warnings.push('A floor opening reaches into the wall – it is cut short.');
			openingsOf.set(l, { walls, floor });
		}
		const top = ctx.project.lid.openings.map(plateHole);
		if (top.some((h) => !plateFits(h, hx, hy)))
			ctx.warnings.push('Lid: an opening reaches into the wall.');
		lidOpeningsOf.set(layout.lid, { top });
	},

	// everything that needs solid floor is known now
	finish(_ctx, layout) {
		for (const l of layout.layers)
			if (openingsOf.get(l)!.floor.some((h) => l.floorKeep.some((k) => overlaps(holeRect(h), k))))
				l.warnings.push(
					'A floor opening is partly closed – the boards or the joint need the floor there.'
				);
	},

	build(g, layout, part, out) {
		const { w, tol } = g;
		if (part.kind === 'lid') {
			const lid = layout.lid;
			for (const h of lidOpeningsOf.get(lid)!.top)
				out.cuts.push(plateCutout(g, h, lid.edge - 1, lid.height + 1));
			return;
		}
		const { layer, height: H } = part;
		const data = openingsOf.get(layer)!;

		// wall openings, through the wall and 1 mm into the room; open ones up past the top edge
		// (the raised walls of the top layer, where boards reach into the lid, are higher)
		const raised = !part.above ? layout.lid.raised : null;
		const upTo = (side: Side) => H + 1 + (raised?.sides.includes(side) ? raised.by : 0);
		for (const o of data.walls) {
			if (o.type === 'circle') {
				const r = o.width / 2;
				// axis along d: through the wall from its outer face into the room
				const disc = g.t(
					g
						.t(g.Manifold.cylinder(w + 2, r, r, SEGMENTS))
						.rotate([-90, 0, 0])
						.translate([0, -w - 1, o.z])
				);
				const cut = g.intersect(disc, g.box(-r - 1, r + 1, -w - 2, 2, o.z0, upTo(o.side)));
				out.cuts.push(g.inWall(o.side, o.u, cut));
				continue;
			}
			for (const [a0, a1] of ventSpans(o.width, o.type === 'vent'))
				out.cuts.push(g.wbox(o.side, o.u, a0, a1, -w - 1, 1, o.z0, o.open ? upTo(o.side) : o.z1));
		}

		// floor openings: only through the floor, inside the band along the walls, clear of what
		// needs solid floor
		const z = layer.zBase;
		if (data.floor.length) {
			const keep = layer.floorKeep.map((k) => g.box(k.x0, k.x1, k.y0, k.y1, -2, z + 2));
			const inside = g.prism(g.outline(bandOf(layout, layer)), -2, z + 2);
			for (const h of data.floor)
				out.shellCuts.push(g.subtract(g.intersect(plateCutout(g, h, -1, z + 1), inside), keep));
		}

		// where this part reaches into the layer below, the wall openings there stay open
		const ov = layout.seam.overlap;
		const reach = layout.seam.inside;
		if (!part.below || ov <= 0 || !reach) return;
		const base = part.below.height - ov;
		for (const o of openingsOf.get(part.below)!.walls) {
			const z1 = o.open ? ov : Math.min(ov, o.z1 - base);
			if (z1 <= 0) continue;
			const z0 = o.z0 - base <= 0 ? -1 : o.z0 - base;
			out.lateCuts.push(
				g.wbox(o.side, o.u, -o.width / 2 - tol, o.width / 2 + tol, -w - 1, reach[1] + 0.01, z0, z1)
			);
		}
	}
};
