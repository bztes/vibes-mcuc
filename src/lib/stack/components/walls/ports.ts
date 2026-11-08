import type { Manifold } from 'manifold-3d';
import type { CaseComponent, LayoutContext, Part, PartBuild } from '../../case/component';
import type { Csg } from '../../case/csg';
import { K as CASE } from '../../case/layout';
import { isXWall, rotateVec, wallDistance, worldSide } from '../../case/math';
import { slot, type CaseLayer, type CaseLayout } from '../../case/types';
import type { Side } from '../../parts';

/**
 * The openings the walls make for the boards: a notch for every port at a wall, from the top edge
 * down; the part above closes it as far as it can (its cover is the inverse of the opening).
 * Where a thick wall meets a board with ports, it is thinned from the inside. Part of every wall
 * variant. Openings added by hand are `components/openings/`.
 */

/** Fixed dimensions (mm). Deliberately not exposed in the UI. */
export const K = {
	/** Where a board sits with its ports at the wall, the wall is never thicker than this. */
	portWall: 2
} as const;

/** Notch for a port, from the top edge down to z0. u = offset along the wall from its centre. */
export interface PortNotch {
	side: Side;
	u: number;
	width: number;
	z0: number;
	label: string;
}

/** Inner pocket in a wall: `wall` = remaining thickness, measured from the outer face. */
export interface WallPocket {
	side: Side;
	u: number;
	width: number;
	wall: number;
}

/** A port notch of this layer, to be closed from above. z0 = lowest point a cover may reach. */
export interface PortCover {
	side: Side;
	u: number;
	width: number;
	z0: number;
}

export interface Ports {
	notches: PortNotch[];
	/** Port notches, closed by the part above as far as it can reach. */
	covers: PortCover[];
	/** Pockets on the inside of thick walls where a board sits with its ports at the wall. */
	pockets: WallPocket[];
}

export const portsOf = slot<Ports>('ports');

/** How much a thick wall is thinned where a board sits with its ports at it. */
const insetOf = (ctx: LayoutContext) => Math.max(0, ctx.wall - K.portWall);

/** Boards with ports at a thick wall move into its inner pocket. */
export const flushGap = (ctx: LayoutContext) => ctx.tolerance - insetOf(ctx);

function resolveLayer(ctx: LayoutContext, layout: CaseLayout, l: CaseLayer) {
	const tol = ctx.tolerance;
	const hx = layout.inner.length / 2;
	const hy = layout.inner.width / 2;
	const inset = insetOf(ctx);
	const data: Ports = { notches: [], covers: [], pockets: [] };
	portsOf.set(l, data);

	// thick walls: an inner pocket where a board sits with its ports at the wall
	if (inset > 0)
		for (const b of l.boards) {
			const sides = new Set(b.def.ports.map((p) => worldSide(p.side, b.rotation)));
			for (const side of sides) {
				if (wallDistance(b.rect, side, hx, hy) > CASE.flushDistance) continue;
				const [lo, hi] = isXWall(side) ? [b.rect.x0, b.rect.x1] : [b.rect.y0, b.rect.y1];
				data.pockets.push({ side, u: (lo + hi) / 2, width: hi - lo + 2 * tol, wall: K.portWall });
				l.walls.push({
					kind: 'pocket',
					side,
					u: (lo + hi) / 2,
					width: hi - lo + 2 * tol,
					depth: inset,
					z0: l.zBase,
					z1: Infinity
				});
			}
		}

	// a notch for every port at a wall
	for (const b of l.boards) {
		for (const p of b.def.ports) {
			const side = worldSide(p.side, b.rotation);
			if (wallDistance(b.rect, side, hx, hy) > CASE.flushDistance) {
				// a larger case can pull a board with ports on both sides away from its walls
				const lost = `${b.def.name}: ${p.label} no longer reaches the ${side} wall.`;
				if (l.flush[side] && !l.warnings.includes(lost)) l.warnings.push(lost);
				continue;
			}
			const local: [number, number] =
				p.side === 'left' || p.side === 'right' ? [0, p.offset] : [p.offset, 0];
			const [ox, oy] = rotateVec(...local, b.rotation);
			const u = isXWall(side) ? b.cx + ox : b.cy + oy;
			// exactly the port: connectors stick out past the board edge into the wall
			const z0 = Math.max(l.zBase, b.zPcbTop + p.z - p.height / 2);
			data.notches.push({ side, u, width: p.width, z0, label: p.label });
			// clear of the connector, so the part above doesn't press on the board
			data.covers.push({ side, u, width: p.width, z0: b.zPcbTop + p.z + p.height / 2 + tol });
		}
	}
}

function place(ctx: LayoutContext, layout: CaseLayout) {
	for (const l of layout.layers) {
		for (const n of portsOf.get(l)!.notches)
			l.walls.push({
				kind: 'opening',
				side: n.side,
				u: n.u,
				width: n.width,
				depth: ctx.wall,
				z0: n.z0,
				z1: l.height
			});
		for (const w of l.walls) if (w.kind === 'pocket') w.z1 = l.height;
	}
}

function build(g: Csg, layout: CaseLayout, part: Part, out: PartBuild) {
	const { w, tol } = g;
	const seam = layout.seam;

	/** Height of a port's cover limit in the frame of the part above. */
	const coverZ = (c: PortCover, below: CaseLayer) => c.z0 - (below.height - seam.overlap);

	/**
	 * Plugs for the port notches of the layer below, flush with the outside and tied to the bottom
	 * of the part above. Only the lid, printed upside down, may reach past its bottom edge down
	 * to the port; the layers print upright on a flat bottom.
	 */
	function plugs(below: CaseLayer, pastEdge: boolean) {
		if (!seam.plugs) return [];
		const ov = seam.overlap;
		// where the walls of the top layer are raised, the lid starts higher up
		const raised = pastEdge ? layout.lid.raised : { sides: [] as Side[], by: 0 };
		const inner = (seam.inside?.[0] ?? 0) + 0.01;
		const list = portsOf.get(below)!.covers.flatMap((c) => {
			const half = c.width / 2 - tol;
			const z = coverZ(c, below);
			const top = raised.sides.includes(c.side) ? Math.max(ov, raised.by) : ov;
			if (half < 0.25 || z >= top) return [];
			const box = (d1: number, z0: number, z1: number) =>
				g.wbox(c.side, c.u, -half, half, -w, d1, z0, z1);
			const parts: Manifold[] = [];
			if (ov > Math.max(0, z)) parts.push(box(inner, Math.max(0, z), ov));
			// down from the lid to the port, in the raised wall
			if (raised.sides.includes(c.side) && raised.by > Math.max(0, z))
				parts.push(box(0.01, Math.max(0, z), raised.by + 0.01));
			if (pastEdge && z < 0) parts.push(box(-w + Math.min(w, K.portWall), z, 0.01));
			return parts;
		});
		// the plugs must not poke through the rounded outer corner
		return list.length
			? [
					g.intersect(
						g.union(list)!,
						g.prism(g.outerPoly, -below.height - 1, Math.max(ov, raised.by) + 1)
					)
				]
			: [];
	}

	/** Where the part above reaches into the layer below, it keeps the port notches open below their covers. */
	function keepOpen(below: CaseLayer) {
		const ov = seam.overlap;
		if (ov <= 0 || !seam.inside) return [];
		const d1 = seam.inside[1] + 0.01;
		const cut = (side: Side, u: number, width: number, z1: number) =>
			g.wbox(side, u, -width / 2 - tol, width / 2 + tol, -w - 1, d1, -1, z1);
		return portsOf
			.get(below)!
			.covers.filter((c) => coverZ(c, below) > 0)
			.map((c) => cut(c.side, c.u, c.width, seam.plugs ? Math.min(coverZ(c, below), ov) : ov));
	}

	/**
	 * Where the boards of the top layer reach up into the lid, its wall gets a notch for every
	 * port that rises past the top edge, from its bottom edge up to the cover limit.
	 */
	function lidNotches(below: CaseLayer) {
		return portsOf
			.get(below)!
			.covers.filter((c) => coverZ(c, below) > seam.overlap)
			.map((c) =>
				g.wbox(c.side, c.u, -c.width / 2, c.width / 2, -w - 1, 0.05, -1, coverZ(c, below))
			);
	}

	function notchCutters(layer: CaseLayer) {
		// the raised walls of the top layer (boards reaching into the lid) are higher
		const isTop = layer === layout.layers[layout.layers.length - 1];
		const upTo = (side: Side) =>
			layer.height +
			1 +
			(isTop && layout.lid.raised.sides.includes(side) ? layout.lid.raised.by : 0);
		// only the wall: the rims and supports inside stay intact
		return portsOf
			.get(layer)!
			.notches.map((n) =>
				g.wbox(n.side, n.u, -n.width / 2, n.width / 2, -w - 1, 0.05, n.z0, upTo(n.side))
			);
	}

	if (part.kind === 'lid') {
		out.lateAdds.push(...plugs(part.below, true));
		out.lateCuts.push(...keepOpen(part.below), ...lidNotches(part.below));
		return;
	}
	const { layer, height: H } = part;
	// thick walls are thinned from the inside where a board sits with its ports at the wall
	for (const p of portsOf.get(layer)!.pockets)
		out.shellCuts.push(
			g.wbox(p.side, p.u, -p.width / 2, p.width / 2, -w + p.wall, 0.01, layer.zBase, H + 1)
		);
	const own = notchCutters(layer);
	out.cuts.push(...own);
	if (part.below) {
		// the layer's own notches win over the plugs for the layer below
		out.lateAdds.push(...plugs(part.below, false).map((m) => g.subtract(m, own)));
		out.lateCuts.push(...keepOpen(part.below));
	}
}

/** Hooks the walls run before those of their variant. */
export const ports = { resolveLayer, place, build } satisfies Omit<CaseComponent, 'id'>;
