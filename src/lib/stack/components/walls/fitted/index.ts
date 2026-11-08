import type { Csg } from '../../../case/csg';
import type { LayoutContext, Part, PartBuild } from '../../../case/component';
import { isXWall } from '../../../case/math';
import { slot, type CaseLayer, type CaseLayout } from '../../../case/types';
import { SIDES, type Side } from '../../../parts';
import { defineWalls } from '../index';

/**
 * Fitted: every layer above the base, and the lid, is narrower at the bottom by the wall
 * thickness, so that part fits inside the layer below. A 45° shoulder leads out to the full wall
 * (prints without supports) and sits in a matching chamfer on top of the wall below. A tiny snap
 * nose on each wall clicks into a dimple in the wall below.
 */

/** Fixed dimensions (mm). Deliberately not exposed in the UI. */
export const K = {
	/** Flat rim left on top of the wall, at its outer face. */
	land: 0.4,
	/** Height of the straight part below the shoulder (at least). */
	straight: 1.5,
	/** Wall of the narrow part (at most; thinner walls keep theirs). */
	ring: 2,
	/** Solid floor kept inside the narrow part. */
	floorRim: 2,
	/**
	 * Tiny snap nose on the narrow part, one per wall; clicks into a dimple in the wall below.
	 * Length along the wall, how far it reaches past the wall face, and the play in the dimple.
	 */
	nose: { length: 5, engage: 0.3, clearance: 0.15 }
} as const;

/** The step at the bottom of every layer above the base, and of the lid. */
export const seatDims = (wall: number, tol: number) => {
	const chamfer = wall - K.land;
	const { engage, clearance } = K.nose;
	const noseOut = tol + engage;
	// the nose has 45° flanks, so a looser fit needs more height for it
	const straight = Math.max(K.straight, 2 * noseOut + 0.4);
	return {
		/** Height of the 45° part, also how far the top of the wall below is chamfered. */
		chamfer,
		/** How far the part reaches into the layer below. */
		depth: straight + chamfer,
		/** Wall thickness of the narrow part. */
		ring: Math.min(wall, K.ring),
		/** How far the nose sticks out of the narrow part, and the height of its underside. */
		noseOut,
		noseZ: (straight - 2 * noseOut) / 2,
		/** How deep the dimple goes into the inner wall face. */
		recess: engage + clearance
	};
};

export interface FittedLayer {
	/** Where the noses of the part above click into this layer's walls. */
	snaps: { side: Side; u: number }[];
}

export const fittedOf = slot<FittedLayer>('fitted');

const seatOf = (ctx: LayoutContext) => seatDims(ctx.wall, ctx.tolerance);

/** Snap noses: one per wall, as central as the openings and pockets in the wall allow. */
function place(ctx: LayoutContext, layout: CaseLayout) {
	const hx = layout.inner.length / 2;
	const hy = layout.inner.width / 2;
	const noseHalf = K.nose.length / 2 + ctx.tolerance;
	for (const l of layout.layers) {
		const snaps: FittedLayer['snaps'] = [];
		for (const side of SIDES) {
			const limit = Math.floor((isXWall(side) ? hx : hy) - noseHalf - 3);
			const free = (u: number) =>
				!l.walls.some((o) => o.side === side && Math.abs(o.u - u) < o.width / 2 + noseHalf + 1);
			const offsets = Array.from({ length: Math.max(0, limit + 1) }, (_, d) => d);
			const u = offsets.flatMap((d) => (d ? [d, -d] : [0])).find(free);
			if (u !== undefined) snaps.push({ side, u });
		}
		if (snaps.length < 2) l.warnings.push('Too many openings for the snap noses to fit.');
		for (const s of snaps)
			l.walls.push({
				kind: 'lock',
				side: s.side,
				u: s.u,
				width: 2 * noseHalf,
				depth: seatOf(ctx).recess,
				z0: l.height - seatOf(ctx).depth,
				z1: l.height
			});
		fittedOf.set(l, { snaps });
	}
}

function build(g: Csg, layout: CaseLayout, part: Part, out: PartBuild) {
	const seat = seatDims(layout.wall, layout.tolerance);
	const { tol, union, prism, outline, loft, wedge, outerPoly } = g;

	/** Outside of a part's bottom: narrow by wall + tolerance, then 45° out towards the full wall. */
	const seatOutside = () => {
		const zs = seat.depth - seat.chamfer;
		return union([prism(outline(tol), 0, zs), loft(tol, zs, tol - seat.chamfer, seat.depth)])!;
	};
	/** Wall of the narrow bottom part. */
	const seatRing = () =>
		g.t(seatOutside().subtract(prism(outline(tol + seat.ring), -1, seat.depth + 1)));
	/** All a part may occupy; keeps supports and walls out of the wall of the layer below. */
	const seatEnvelope = (H: number) => union([seatOutside(), prism(outerPoly, seat.depth, H + 1)])!;
	/** Noses on the narrow part, for the layer below; 45° flanks print without support. */
	const snapNoses = (below: CaseLayer) => {
		const z0 = seat.noseZ;
		const h = seat.noseOut;
		return fittedOf.get(below)!.snaps.map((s) =>
			wedge(s.side, s.u, K.nose.length / 2, [
				[tol + 0.2, z0],
				[tol, z0],
				[tol - h, z0 + h],
				[tol, z0 + 2 * h],
				[tol + 0.2, z0 + 2 * h]
			])
		);
	};

	// the bottom part of a tier or the lid fits into the part below
	if (part.kind === 'lid' || part.below) {
		const below = part.kind === 'lid' ? part.below : part.below!;
		out.adds.push(seatRing());
		out.envelope.push(seatEnvelope(part.height));
		out.lateAdds.push(...snapNoses(below));
	}
	if (part.kind === 'layer') {
		const H = part.height;
		// the chamfer the next part sits in, and dimples for its noses
		out.cuts.push(loft(0.5, H - seat.chamfer - 0.5, -seat.chamfer - 1, H + 1));
		const zc = H - seat.depth + seat.noseZ + seat.noseOut;
		const r = seat.recess;
		for (const s of fittedOf.get(part.layer)!.snaps)
			out.cuts.push(
				wedge(s.side, s.u, K.nose.length / 2 + tol, [
					[0.2, zc - r - 0.2],
					[-r, zc],
					[0.2, zc + r + 0.2]
				])
			);
	}
}

export const fitted = defineWalls({
	id: 'fitted',
	label: 'Fitted',
	note: 'The bottom of each layer slides into the layer below and snaps in with tiny noses.',
	lidNote: 'Printed upside down. Its bottom part fits into the top layer.',
	fitHint: "Looser if parts don't fit",
	thickness: 2,

	seam(ctx) {
		const seat = seatOf(ctx);
		const tol = ctx.tolerance;
		return {
			overlap: seat.depth,
			inside: [tol, tol + seat.ring],
			// the floor carries the narrow bottom part
			band: tol + seat.ring,
			lidEdge: seat.depth,
			plugs: true
		};
	},
	// below this the bottom part of a layer has no room left inside
	minInner: (ctx) => 2 * (ctx.tolerance + seatOf(ctx).ring + K.floorRim),
	// room for its own bottom part and for the one coming from above
	minHeight: (ctx) => ({
		height: 2 * seatOf(ctx).depth + 1,
		reason: 'for the layers to fit together'
	}),
	place,
	build
});
