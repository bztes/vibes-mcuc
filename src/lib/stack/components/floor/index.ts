import type { Floor } from '../../case/component';

/**
 * The floor of the base layer: a closed plate the case stands on. Other variants (e.g. a wall
 * mount) would go here next to it.
 */

/** Fixed dimensions (mm). Deliberately not exposed in the UI. */
export const K = { thickness: 2 } as const;

export const floor: Floor = {
	id: 'floor',
	thickness: K.thickness,
	build(g, _layout, part, out) {
		if (part.kind === 'layer' && part.layer.kind === 'base')
			out.body.push(g.prism(g.outerPoly, 0, part.layer.zBase));
	}
};
