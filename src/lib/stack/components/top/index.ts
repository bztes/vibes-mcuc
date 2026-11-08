import type { Top } from '../../case/component';
import { rotateVec } from '../../case/math';
import { slot, type CaseLayout } from '../../case/types';
import { plateCutout, plateFits, type PlateOpening } from '../cutouts';

/**
 * The top: the plate that closes the lid, with an opening for what the boards of the top layer
 * show (displays, sensors; a vent where a sensor only needs air).
 */

/** Fixed dimensions (mm). Deliberately not exposed in the UI. */
export const K = { thickness: 2 } as const;

export interface LidOpening extends PlateOpening {
	label: string;
}

export interface TopData {
	openings: LidOpening[];
}

export const topOf = slot<TopData>('top');

/** What the boards of the top layer show through the lid. */
function openings(layout: CaseLayout): LidOpening[] {
	const last = layout.layers[layout.layers.length - 1];
	return last.boards.flatMap((b) =>
		b.def.topOpenings.map((o): LidOpening => {
			const [ox, oy] = rotateVec(o.x, o.y, b.rotation);
			const turned = b.rotation === 90 || b.rotation === 270;
			return {
				type: o.type,
				x: b.cx + ox,
				y: b.cy + oy,
				width: turned ? o.height : o.width,
				height: turned ? o.width : o.height,
				label: o.label
			};
		})
	);
}

export const top: Top = {
	id: 'top',
	thickness: K.thickness,

	place(ctx, layout) {
		const list = openings(layout);
		for (const o of list)
			if (!plateFits(o, layout.inner.length / 2, layout.inner.width / 2))
				ctx.warnings.push(`Lid: the ${o.label.toLowerCase()} reaches into the wall.`);
		topOf.set(layout.lid, { openings: list });
	},

	build(g, layout, part, out) {
		if (part.kind !== 'lid') return;
		const lid = layout.lid;
		out.body.push(g.prism(g.outerPoly, lid.edge, lid.height));
		for (const o of topOf.get(lid)?.openings ?? [])
			out.cuts.push(plateCutout(g, o, lid.edge - 1, lid.height + 1));
	}
};
