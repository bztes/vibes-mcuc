import type { Floor } from '../../case/component';
import { overlaps } from '../../case/math';
import { slot, type CaseLayout, type Rect } from '../../case/types';

/**
 * The deck: the floor of every layer above the base, a lattice of openings for airflow and wires,
 * with a solid rim along the walls and ribs between the openings. The openings stay clear of what
 * the other components need solid (`floorKeep`): trimmed, or dropped. The walls may cut openings
 * of their own into it (e.g. slots for what rises from the layer below).
 */

/** Fixed dimensions (mm). Deliberately not exposed in the UI. */
export const K = {
	thickness: 2,
	grid: { cell: 10, rib: 3, rim: 2, radius: 1.5, minCell: 4 }
} as const;

export interface DeckData {
	openings: Rect[];
}

export const deckOf = slot<DeckData>('deck');

/** Floor openings stay clear of everything in `keep`: trimmed, or dropped. */
function avoid(cells: Rect[], keep: Rect[]): Rect[] {
	const min = K.grid.minCell;
	const ok = (c: Rect) => c.x1 - c.x0 >= min && c.y1 - c.y0 >= min;
	const area = (c: Rect) => (c.x1 - c.x0) * (c.y1 - c.y0);
	return cells.flatMap((cell) => {
		let c: Rect | null = cell;
		for (const k of keep) {
			if (!c || !overlaps(c, k)) continue;
			// keep the largest piece of the cell beside the block
			const pieces: Rect[] = [
				{ ...c, x1: Math.min(c.x1, k.x0) },
				{ ...c, x0: Math.max(c.x0, k.x1) },
				{ ...c, y1: Math.min(c.y1, k.y0) },
				{ ...c, y0: Math.max(c.y0, k.y1) }
			].filter(ok);
			c = pieces.sort((a, b) => area(b) - area(a))[0] ?? null;
		}
		return c ? [c] : [];
	});
}

/** The lattice inside the band the walls need along them. */
function lattice(layout: CaseLayout): Rect[] {
	const g = K.grid;
	const hx = layout.inner.length / 2;
	const hy = layout.inner.width / 2;
	const rim = layout.seam.band + g.rim;
	const grid = (lo: number, hi: number) => {
		const span = hi - lo;
		const n = Math.floor((span + g.rib) / (g.cell + g.rib) + 0.5);
		if (n < 1) return [];
		const cell = (span - (n - 1) * g.rib) / n;
		if (cell < g.minCell) return [];
		return Array.from({ length: n }, (_, i): [number, number] => {
			const a = lo + i * (cell + g.rib);
			return [a, a + cell];
		});
	};
	const cols = grid(-hx + rim, hx - rim);
	const rows = grid(-hy + rim, hy - rim);
	return cols.flatMap(([x0, x1]) => rows.map(([y0, y1]) => ({ x0, x1, y0, y1 })));
}

export const deck: Floor = {
	id: 'deck',
	thickness: K.thickness,

	// last of all: everything that needs solid floor is known
	finish(_ctx, layout) {
		const cells = lattice(layout);
		for (const l of layout.layers)
			if (l.kind === 'tier') deckOf.set(l, { openings: avoid(cells, l.floorKeep) });
	},

	build(g, _layout, part, out) {
		if (part.kind !== 'layer' || part.layer.kind !== 'tier') return;
		const z = part.layer.zBase;
		out.body.push(g.prism(g.outerPoly, 0, z));
		for (const o of deckOf.get(part.layer)?.openings ?? [])
			out.shellCuts.push(
				g.t(
					g
						.prism(g.roundedRect(o.x1 - o.x0, o.y1 - o.y0, K.grid.radius), -1, z + 1)
						.translate([(o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, 0])
				)
			);
	}
};
