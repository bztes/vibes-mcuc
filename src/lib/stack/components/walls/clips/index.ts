import type { Manifold, Vec2 } from 'manifold-3d';
import type { Csg } from '../../../case/csg';
import type { Arrangement, LayoutContext, Part, PartBuild } from '../../../case/component';
import { isXWall, overlaps, wallRect } from '../../../case/math';
import { slot, type CaseLayer, type CaseLayout, type Rect } from '../../../case/types';
import type { Side } from '../../../parts';
import { defineWalls } from '../index';

/**
 * Clips: a pressable clip rises from each layer into the one above and snaps into a recess in
 * its wall; press it to lift the layer off. Lips in the corners keep the layers aligned. Parts sit
 * flat on each other.
 */

/** Fixed dimensions (mm). Deliberately not exposed in the UI. */
export const K = {
	/**
	 * Locating lip in every corner: L-shaped, follows the inner wall face and rises through a slot
	 * in the floor of the layer above. No slits, no barb: it only aligns the layers.
	 */
	cornerLip: {
		/** Length of each leg, measured from the inner corner. */
		length: 6,
		thick: 1.2,
		/** How far it reaches above the seam (the floor is 2 mm). */
		up: 4,
		/** Height of the flat part of the ledge that carries it. */
		ledge: 0.8
	},
	/**
	 * Layer clip: a wall section cut free by two vertical slits flexes inwards; a lip rises from it
	 * (just inside the wall line) into the layer above, where its barb clicks into a window in the
	 * wall. Press the wall section to release.
	 */
	clip: {
		/** Width of the flexing wall section (between the slits). */
		width: 10,
		slit: 0.8,
		/** How far the slits reach down from the top edge. */
		drop: 10,
		/**
		 * Shortest slits, for the clip into the lid when the boards reach into it and the top
		 * layer gets lower (a stiffer clip).
		 */
		minDrop: 6,
		/** Lip thickness and how far it reaches above the seam. */
		thick: 1.4,
		up: 6,
		/** Ledge that carries the lip on the inside of the wall section. */
		ledge: 1.5,
		/** Barb: protrusion towards the wall, flat part and z of its underside above the seam. */
		barb: 1,
		barbFlat: 0.8,
		barbZ: 3
	}
} as const;

export const clipDims = (tol: number) => {
	const c = K.clip;
	const lipD1 = tol + c.thick;
	return {
		/** Lip, measured inwards from the inner wall face. */
		lipD0: tol,
		lipD1,
		/** Flexing section incl. both slits. */
		span: c.width + 2 * c.slit,
		/** Recess in the upper wall + the space the lip needs inside the upper layer. */
		pocketWidth: c.width + 2 * tol + 0.4,
		upperDepth: lipD1 + tol + 0.3,
		upperHeight: c.up + tol + 0.3,
		/** Space the clip needs inside the lower layer (incl. room to flex inwards). */
		lowerDepth: lipD1 + c.barb + 0.4,
		lowerHeight: c.drop,
		/** Recess in the upper wall's inner face; the wall stays closed outside. */
		recessDepth: c.barb - tol + 0.3,
		windowZ0: c.barbZ - tol,
		windowZ1: c.barbZ + c.barbFlat + c.barb + tol + 0.3
	};
};

export const lipDims = (tol: number) => {
	const c = K.cornerLip;
	const d1 = tol + c.thick;
	return {
		/** Lip, measured inwards from the inner wall face. */
		d0: tol,
		d1,
		/** Slot in the layer above: from the inner wall face to just past the lip. */
		slotDepth: d1 + tol,
		slotLength: c.length + tol,
		slotHeight: c.up + tol + 0.3
	};
};

export interface LockClip {
	side: Side;
	u: number;
}

export interface ClipsLayer {
	/** Clips of this layer that reach into the layer above. */
	clipsUp: LockClip[];
	/** Pockets for the clips of the layer below. */
	pocketsDown: LockClip[];
	/** How far the slits of this layer's clips reach down from its top edge. */
	drop: number;
}

export const clipsOf = slot<ClipsLayer>('clips');
export const lidClipsOf = slot<{ pocketsDown: LockClip[] }>('clips');
/** The walls the clips go on first, and the other pair. */
const wallsOf = slot<[Side, Side][]>('clips');

/** The clip into the lid gets shorter as the top layer gets lower, if the boards reach the lid. */
const shortClip = (layout: CaseLayout, l: CaseLayer) =>
	layout.lid.inside && l === layout.layers[layout.layers.length - 1];

/** Slits as long as the layer allows: from the top edge down to 1 mm above the floor. */
const dropOf = (ctx: LayoutContext, layout: CaseLayout, l: CaseLayer) =>
	shortClip(layout, l)
		? Math.max(K.clip.minDrop, Math.min(K.clip.drop, l.height - l.zBase - 1))
		: K.clip.drop;

/** How far a clip has to stay from the wall ends. */
const clipInset = (tol: number) => {
	const cd = clipDims(tol);
	return K.cornerLip.length + Math.max(cd.span, cd.pocketWidth) / 2 + 0.5;
};

function arrange(ctx: LayoutContext, arranged: (Arrangement | null)[]) {
	const tol = ctx.tolerance;
	const cd = clipDims(tol);
	// boards at a wall must stay clear of the corner lips
	const corner = K.cornerLip.length + tol + 0.5;
	for (const a of arranged) {
		if (!a) continue;
		if (a.flush.front || a.flush.back) {
			a.gap.left = Math.max(a.gap.left, corner);
			a.gap.right = Math.max(a.gap.right, corner);
		}
		if (a.flush.left || a.flush.right) {
			a.gap.front = Math.max(a.gap.front, corner);
			a.gap.back = Math.max(a.gap.back, corner);
		}
	}
	// The layer clips go on the pair of opposite walls without ports (the long pair if possible);
	// those walls get enough room inside for the clips.
	const need = (a: Arrangement) => ({
		length: a.box.x1 - a.box.x0 + a.gap.left + a.gap.right,
		width: a.box.y1 - a.box.y0 + a.gap.front + a.gap.back
	});
	const anyFlush = (s: Side) => arranged.some((a) => a?.flush[s]);
	const longX =
		Math.max(0, ...arranged.map((a) => (a ? need(a).length : 0))) >=
		Math.max(0, ...arranged.map((a) => (a ? need(a).width : 0)));
	const pairs: [Side, Side][] = longX
		? [
				['front', 'back'],
				['left', 'right']
			]
		: [
				['left', 'right'],
				['front', 'back']
			];
	const clipPair = pairs.find((p) => !p.some(anyFlush)) ?? pairs[0];
	wallsOf.set(ctx, [clipPair, pairs.find((p) => p !== clipPair)!]);
	const reserve = Math.max(cd.lowerDepth, cd.upperDepth) + 0.3;
	for (const a of arranged)
		if (a) for (const s of clipPair) if (!a.flush[s]) a.gap[s] = Math.max(a.gap[s], reserve);
}

/** One pair of clips per seam, on the clip walls if they fit there. */
function place(ctx: LayoutContext, layout: CaseLayout) {
	const tol = ctx.tolerance;
	const cd = clipDims(tol);
	const hx = layout.inner.length / 2;
	const hy = layout.inner.width / 2;
	const layers = layout.layers;
	if (ctx.wall - cd.recessDepth < 0.8)
		ctx.warnings.push(
			`Wall too thin for the clip recesses – use at least ${(cd.recessDepth + 0.8).toFixed(1)} mm.`
		);
	for (const l of layers)
		clipsOf.set(l, { clipsUp: [], pocketsDown: [], drop: dropOf(ctx, layout, l) });
	const lid = lidClipsOf.set(layout.lid, { pocketsDown: [] });

	const wallOrder = wallsOf.get(ctx) ?? [
		['front', 'back'],
		['left', 'right']
	];
	const wallLen = (s: Side) => (isXWall(s) ? layout.inner.length : layout.inner.width);
	const keepRect = (s: Side, u: number, half: number, depth: number): Rect =>
		wallRect(s, u - half, u + half, 0, depth, hx, hy);
	const openings = (l: CaseLayer | null) => (l ? l.walls.filter((w) => w.kind === 'opening') : []);
	const inset = clipInset(tol);

	for (let i = 0; i < layers.length; i++) {
		const lower = layers[i];
		const upper = layers[i + 1] ?? null;
		const lowerData = clipsOf.get(lower)!;
		const upperNotches = openings(upper);
		const upperBoards = upper ? upper.boards : [];
		const pref = (i % 2 === 0 ? -1 : 1) * 1;
		const placed: LockClip[] = [];

		const free = (s: Side, u: number) => {
			// into the lid only from the lowered walls
			if (!upper && layout.lid.raised.sides.includes(s)) return false;
			const half = Math.max(cd.span, cd.pocketWidth) / 2 + 0.5;
			const lowRect = keepRect(s, u, cd.span / 2 + 1, cd.lowerDepth);
			const upRect = keepRect(s, u, cd.pocketWidth / 2, cd.upperDepth);
			if (
				lower.boards.some(
					(b) => overlaps(b.outer, lowRect) && b.zTop > lower.height - lowerData.drop
				)
			)
				return false;
			if (upperBoards.some((b) => overlaps(b.outer, upRect) && b.zBottom < cd.upperHeight + 0.5))
				return false;
			if (openings(lower).some((n) => n.side === s && Math.abs(n.u - u) < n.width / 2 + half))
				return false;
			if (
				upperNotches.some(
					(n) => n.side === s && Math.abs(n.u - u) < n.width / 2 + half && n.z0 < cd.upperHeight + 1
				)
			)
				return false;
			// keep away from the pockets of the seam below (same layer)
			if (
				lowerData.pocketsDown.some(
					(p) => p.side === s && Math.abs(p.u - u) < (cd.span + cd.pocketWidth) / 2 + 2
				)
			)
				return false;
			return true;
		};

		for (const walls of wallOrder) {
			const found: LockClip[] = [];
			for (const s of walls) {
				const limit = wallLen(s) / 2 - inset;
				if (limit < 0) continue;
				const u0 = Math.max(-limit, Math.min(limit, pref * Math.min(12, wallLen(s) / 6)));
				const cands: number[] = [];
				for (let d = 0; d <= 2 * limit; d += 1) {
					for (const u of d === 0 ? [u0] : [u0 + d, u0 - d])
						if (Math.abs(u) <= limit) cands.push(u);
				}
				const u = cands.find((c) => free(s, c));
				if (u !== undefined) found.push({ side: s, u });
			}
			if (found.length === 2) {
				placed.push(...found);
				break;
			}
		}
		if (placed.length < 2) {
			const where = i === layers.length - 1 ? 'the lid' : `layer ${i + 2}`;
			ctx.warnings.push(
				`No free spot for the clips between layer ${i + 1} and ${where} – placed anyway.`
			);
			const [a, b] = wallOrder[0];
			placed.length = 0;
			placed.push({ side: a, u: 0 }, { side: b, u: 0 });
		}
		lowerData.clipsUp = placed;
		if (upper) clipsOf.get(upper)!.pocketsDown = placed;
		else lid.pocketsDown = placed;
	}

	for (const l of layers) {
		const d = clipsOf.get(l)!;
		for (const c of d.clipsUp)
			l.walls.push({
				kind: 'lock',
				side: c.side,
				u: c.u,
				width: cd.span,
				depth: ctx.wall,
				z0: l.height - d.drop,
				z1: l.height
			});
		for (const p of d.pocketsDown) {
			l.walls.push({
				kind: 'lock',
				side: p.side,
				u: p.u,
				width: cd.pocketWidth,
				depth: cd.recessDepth,
				z0: 0,
				z1: cd.windowZ1
			});
			// keep solid floor around the lip slots
			l.floorKeep.push(keepRect(p.side, p.u, cd.pocketWidth / 2 + 3, cd.lowerDepth + 4));
		}
	}
}

function build(g: Csg, layout: CaseLayout, part: Part, out: PartBuild) {
	const { w, hx, hy, tol, box, union, subtract, prism, wbox, wprofile, roundedRect, outerPoly } = g;
	const cd = clipDims(tol);
	const ld = lipDims(tol);
	const corners: [number, number][] = [
		[-1, -1],
		[1, -1],
		[1, 1],
		[-1, 1]
	];

	/** Band following the inner wall face from d0 to d1 inwards, only `length` from each corner. */
	function cornerBand(d0: number, d1: number, length: number, z0: number, z1: number) {
		const outline = (d: number, za: number, zb: number) =>
			prism(
				roundedRect(
					layout.inner.length - 2 * d,
					layout.inner.width - 2 * d,
					Math.max(0, g.innerRadius - d)
				),
				za,
				zb
			);
		const band = g.t(outline(d0, z0, z1).subtract(outline(d1, z0 - 1, z1 + 1)));
		const mask = corners.map(([sx, sy]) =>
			box(sx * (hx + 1), sx * (hx - length), sy * (hy + 1), sy * (hy - length), z0 - 1, z1 + 1)
		);
		return g.intersect(band, union(mask)!);
	}

	/**
	 * Corner lips of a layer (top at z = top), each on a ledge with a 45° underside so it prints
	 * without support. Openings of this layer and the one above stay open.
	 */
	function cornerLips(layer: CaseLayer, above: CaseLayer | null, top: number) {
		const L = K.cornerLip.length;
		const zl = top - K.cornerLip.ledge;
		const pts: Vec2[] = [
			[-w / 2, zl - ld.d1],
			[0, zl - ld.d1],
			[ld.d1, zl],
			[ld.d1, top],
			[-w / 2, top]
		];
		const ledges = corners.flatMap(([sx, sy]) => [
			wprofile(sy < 0 ? 'front' : 'back', sx * (hx - L / 2), pts, -L / 2, L / 2),
			wprofile(sx < 0 ? 'left' : 'right', sy * (hy - L / 2), pts, -L / 2, L / 2)
		]);
		const zTop = top + K.cornerLip.up;
		const lip = union([
			// the legs must not poke through the rounded outer corner
			g.intersect(union(ledges)!, prism(outerPoly, 0, top)),
			cornerBand(ld.d0, ld.d1, L, top - 0.01, zTop)
		])!;
		const openings = (l: CaseLayer | null) =>
			l ? l.walls.filter((o) => o.kind === 'opening') : [];
		const open = [
			...openings(layer).map((n) => ({ n, z0: n.z0 })),
			...openings(above).map((n) => ({ n, z0: top + n.z0 }))
		]
			.filter(({ n }) => Math.abs(n.u) + n.width / 2 > (isXWall(n.side) ? hx : hy) - L)
			.map(({ n, z0 }) =>
				wbox(n.side, n.u, -n.width / 2, n.width / 2, -w - 1, ld.d1 + 1, z0, zTop + 1)
			);
		return subtract(lip, open);
	}

	/** Recess + lip room for the clip of the layer below (part bottom at z = 0). Only cuts. */
	function pocketParts(p: LockClip) {
		const c = K.clip;
		const half = cd.pocketWidth / 2;
		const barbOut = c.barb - tol + 0.2;
		return [
			// room for the lip (also clears supports and columns)
			wbox(p.side, p.u, -half, half, 0, cd.upperDepth, -1, cd.upperHeight),
			// blind recess in the inner wall face the barb clicks into (outside stays closed);
			// slanted roof so it prints without support
			wprofile(
				p.side,
				p.u,
				[
					[0.01, cd.windowZ0],
					[-cd.recessDepth, cd.windowZ0],
					[-cd.recessDepth, cd.windowZ1],
					[0.01, cd.windowZ1 + cd.recessDepth + 0.01]
				],
				-half,
				half
			),
			// lead-in chamfer on the inner bottom edge of the wall, the barb slides over it
			wprofile(
				p.side,
				p.u,
				[
					[0.01, -1],
					[-barbOut, -1],
					[-barbOut, 0],
					[0.01, barbOut + 0.01]
				],
				-half,
				half
			)
		];
	}

	/**
	 * Clip of this layer (top at z = top): two slits free a wall section, a ledge on its inside
	 * carries the lip that rises into the layer above.
	 */
	function clipParts(p: LockClip, top: number, drop: number) {
		const c = K.clip;
		const half = c.width / 2;
		const zRoot = top - drop;
		const { lipD0, lipD1 } = cd;
		const cut: Manifold[] = [-1, 1].map((sgn) =>
			wbox(p.side, p.u, sgn * half, sgn * (half + c.slit), -w - 1, 0.5, zRoot, top + 1)
		);
		// nothing inside may tie the section to the rest of the layer
		cut.push(wbox(p.side, p.u, -half - c.slit, half + c.slit, 0, cd.lowerDepth, zRoot, top + 1));
		// ledge with a 45° underside so it prints without support
		const zl = top - c.ledge;
		const ledge = wprofile(
			p.side,
			p.u,
			[
				[-w / 2, zl - lipD1],
				[0, zl - lipD1],
				[lipD1, zl],
				[lipD1, top],
				[-w / 2, top]
			],
			-half,
			half
		);
		const lip = wbox(p.side, p.u, -half, half, lipD0, lipD1, top - 0.01, top + c.up);
		const zb = top + c.barbZ;
		const barb = wprofile(
			p.side,
			p.u,
			[
				[lipD0 + 0.01, zb],
				[lipD0 - c.barb, zb],
				[lipD0 - c.barb, zb + c.barbFlat],
				[lipD0 + 0.01, zb + c.barbFlat + c.barb + 0.01]
			],
			-half,
			half
		);
		// small chamfer on the inner top edge of the lip
		const tip = wprofile(
			p.side,
			p.u,
			[
				[lipD1 + 0.01, top + c.up - 0.8],
				[lipD1 + 0.01, top + c.up + 0.01],
				[lipD1 - 0.8, top + c.up + 0.01]
			],
			-half - 0.1,
			half + 0.1
		);
		return { cut, add: [ledge, lip, barb], tip };
	}

	if (part.kind === 'lid') {
		out.cuts.push(...lidClipsOf.get(layout.lid)!.pocketsDown.flatMap(pocketParts));
		return;
	}
	const { layer, height: H } = part;
	const data = clipsOf.get(layer)!;
	const clips = data.clipsUp.map((c) => clipParts(c, H, data.drop));
	// slits free the clip sections; the area behind them stays clear
	out.cuts.push(...clips.flatMap((c) => c.cut), ...data.pocketsDown.flatMap(pocketParts));
	// the corner lips of the layer below come up through the floor
	if (part.below) out.cuts.push(cornerBand(0, ld.slotDepth, ld.slotLength, -1, ld.slotHeight));
	// the lip moves inwards when the clip is pressed, so the slot is as deep as in the layer below
	const half = cd.pocketWidth / 2;
	for (const p of data.pocketsDown)
		out.shellCuts.push(wbox(p.side, p.u, -half, half, 0, cd.lowerDepth, -1, layer.zBase + 1));
	out.lateAdds.push(cornerLips(layer, part.above, H), ...clips.flatMap((c) => c.add));
	out.lateCuts.push(...clips.map((c) => c.tip));
}

export const clips = defineWalls({
	id: 'clips',
	label: 'Clips',
	note: 'Press the clips in the walls to lift a layer off. Lips in the corners align the layers.',
	lidNote: 'Printed upside down. Clips from the top layer click into it.',
	fitHint: "Looser if the clips don't click in",
	thickness: 2,

	seam(ctx) {
		const cd = clipDims(ctx.tolerance);
		return {
			overlap: 0,
			inside: null,
			// keeps clear of the lip slots of the clips from below
			band: cd.lowerDepth,
			lidEdge: Math.ceil((cd.upperHeight + 1) * 2) / 2,
			plugs: true
		};
	},
	arrange,
	minInner: (ctx) => 2 * clipInset(ctx.tolerance),
	// the boards may use the whole room in the lid: the clips' lips and pockets there keep clear of
	// them when they are placed
	lidRoom: () => Infinity,
	minHeight: (ctx, layout, l) => {
		const cd = clipDims(ctx.tolerance);
		const drop = shortClip(layout, l) ? K.clip.minDrop : cd.lowerHeight;
		return {
			height: l.zBase + Math.max(cd.upperHeight, drop) + 1,
			reason: 'for the clips'
		};
	},
	place,
	build
});
