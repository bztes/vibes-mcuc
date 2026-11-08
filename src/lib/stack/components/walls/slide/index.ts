import type { Vec2 } from 'manifold-3d';
import type { Csg } from '../../../case/csg';
import type { Arrangement, LayoutContext, Part, PartBuild } from '../../../case/component';
import { isXWall, overlaps, wallRect } from '../../../case/math';
import { slot, type CaseLayer, type CaseLayout } from '../../../case/types';
import type { Side } from '../../../parts';
import { defineWalls } from '../index';

/**
 * Slide lock, inside the wall. Every part sits flat on the wall of the part below. The wall is
 * split: its inner part rises from the layer below as small rigid hooks (a stem with a finger
 * pointing outwards, 45° underside, prints upright); the wall above is hollowed from the inside
 * to take them, its outer part stays closed and runs under the fingers as the keeper. The part
 * above is set down `travel` off along those walls, the hooks drop into pockets, and a short
 * slide moves the fingers over the keepers. At the end of the slide a small nose on each stem
 * snaps past a ridge in the wall above and holds the part there; pull it firmly to slide it back.
 * Nothing reaches into the room and the outside shows only the seam.
 */

/** Fixed dimensions (mm). Deliberately not exposed in the UI. */
export const K = {
	slide: {
		travel: 10,
		/** Hook length along the wall (at most travel − 2·tolerance). */
		length: 6,
		/** Thickness of the finger at its tip, and of the keeper below it. */
		tip: 0.8,
		keeper: 1.2,
		/** Outer part of the wall that stays closed (at least; thicker walls keep more). */
		skin: 0.5
	},
	/**
	 * Small nose on the outer face of each stem, below the finger: a detent that only keeps the part
	 * from sliding back by itself, far smaller than the hooks (which hold). The wall above is
	 * cleared along the slide so the nose runs free, except for a ridge just before the locked
	 * place: the nose snaps past it (the thin outer part of the wall above gives).
	 */
	nose: {
		/** Height, up to just below the finger. */
		height: 0.6,
		/** Half lengths along the wall at its base and at its tip. */
		base: 0.6,
		tip: 0.15,
		/**
		 * How far nose and ridge overlap (what the wall above has to give). The nose stands out
		 * tolerance + grip from the stem; the ridge is the face of the hollow left standing.
		 */
		grip: 0.15,
		/** Half length of the ridge at its top; its flanks run as steep as the nose's. */
		ridgeTip: 0.2
	},
	/** Thinnest wall the lock fits in. */
	minWall: 2,
	/** Smallest inner size. */
	minInner: 10
} as const;

/**
 * Sizes of the slide lock. e = outwards from the inner wall face, z = above the seam. Spans run
 * along the wall in world coordinates; the part above is set down `travel` towards +x / +y and
 * slides back.
 */
export const lockDims = (wall: number, tol: number) => {
	const s = K.slide;
	const n = K.nose;
	// the inner part of the wall (stem and finger) comes from below, the outer part stays
	const skin = Math.max(s.skin, 0.25 * wall);
	const room = Math.max(0.8, wall - tol - skin);
	const reach = Math.min(1.2, Math.max(0.4, 0.4 * room));
	const stem = room - reach;
	const fingerZ = s.keeper + tol;
	const top = fingerZ + reach + s.tip;
	/** Outer face of the hollow in the wall above. */
	const outer = stem + reach + tol;
	const half = s.length / 2;
	// it still has to drop in past the keeper at the entry (open to reach + tol)
	const out = Math.min(tol + n.grip, reach + tol - 0.1);
	const grip = out - tol;
	/** Run of the nose flank per mm out, and its half length at the height of the ridge top. */
	const slope = (n.base - n.tip) / out;
	const atGrip = n.tip + slope * grip;
	return {
		/** Stem (from the inner face out) and finger. */
		stem,
		reach,
		fingerZ,
		top,
		outer,
		/** Highest point of the hollow in the wall above (45° roof). */
		hookTop: top + tol + outer,
		/** Where the hook is when locked, where it drops in, and all it passes through. */
		locked: (u: number): [number, number] => [u - half, u + half],
		entry: (u: number): [number, number] => [u - s.travel - half - tol, u - s.travel + half + tol],
		sweep: (u: number): [number, number] => [u - s.travel - half - tol, u + half + tol],
		nose: {
			/** Outer face of the nose and of the cleared slot in the wall above. */
			out,
			grip,
			/** Bottom and top of the nose, top of the cleared slot (below the keeper's 45° top). */
			z0: Math.max(0, fingerZ - tol - n.height),
			z1: fingerZ - tol,
			slotZ: fingerZ,
			/** Run of each ridge flank, parallel to the nose flank. */
			ridgeRun: slope * (grip + tol),
			/** Ridge centre (world) for a hook locked at u: just behind the nose, touching nothing. */
			ridge: (u: number) => u - atGrip - tol - n.ridgeTip
		}
	};
};

/** A hook on one wall; u = world coordinate along the wall of its locked position. */
export interface Lock {
	side: Side;
	u: number;
}

/** What joins one part to the part below it. */
export interface Seam {
	hooks: Lock[];
}

export interface SlideLayer {
	/** Hooks rising into the part above. */
	up: Seam;
	/** Hooks of the layer below (none for the base). */
	down: Seam | null;
}

export const slideOf = slot<SlideLayer>('slide');
export const lidSlideOf = slot<{ down: Seam }>('slide');
/** The walls with the hooks; the parts slide along them. */
export const lockWallsOf = slot<[Side, Side]>('slide');

const dimsOf = (ctx: LayoutContext) => lockDims(ctx.wall, ctx.tolerance);

// The hooks go on the pair of opposite walls without ports at the wall (the long pair if
// possible); the parts slide along them.
function arrange(ctx: LayoutContext, arranged: (Arrangement | null)[]) {
	const anyFlush = (s: Side) => arranged.some((a) => a?.flush[s]);
	const pairs: [Side, Side][] = [
		['front', 'back'],
		['left', 'right']
	];
	const longest = (k: 'length' | 'width') => Math.max(0, ...arranged.map((a) => a?.need[k] ?? 0));
	if (longest('width') > longest('length')) pairs.reverse();
	lockWallsOf.set(ctx, pairs.find((p) => !p.some(anyFlush)) ?? pairs[0]);
}

/** Hooks on both lock walls, near each end. */
function place(ctx: LayoutContext, layout: CaseLayout) {
	const ld = dimsOf(ctx);
	const hx = layout.inner.length / 2;
	const hy = layout.inner.width / 2;
	const layers = layout.layers;
	const warnings = ctx.warnings;
	if (ctx.wall < K.minWall)
		warnings.push(`Wall too thin for the slide lock – use at least ${K.minWall} mm.`);
	const lockWalls = lockWallsOf.get(ctx) ?? ['front', 'back'];
	lockWallsOf.set(layout, lockWalls);
	for (const l of layers) slideOf.set(l, { up: { hooks: [] }, down: null });
	const lid = lidSlideOf.set(layout.lid, { down: { hooks: [] } });

	/** Space a lock part takes: a span along the wall, how far inwards, from z0 to z1. */
	type Zone = { side: Side; a0: number; a1: number; d: number; z0: number; z1: number };
	const zoneRect = (z: Zone) => wallRect(z.side, z.a0, z.a1, 0, z.d, hx, hy);
	/** Parts of a hook in the layer below (`low`, top at H) and in the part above (`up`). */
	const zones = (side: Side, u: number, H: number) => {
		const [l0, l1] = ld.locked(u);
		const [s0, s1] = ld.sweep(u);
		// all inside the wall
		return {
			low: { side, a0: l0, a1: l1, d: 0, z0: H - 1, z1: H },
			up: { side, a0: s0, a1: s1, d: 0, z0: 0, z1: ld.hookTop }
		};
	};
	/** Lock parts already in each layer (index = layers.length for the lid). */
	const taken: Zone[][] = [...layers.map(() => []), []];
	const fits = (l: CaseLayer | null, z: Zone, mine: Zone[]) => {
		const half = isXWall(z.side) ? hx : hy;
		if (z.a0 < -half + 1.5 || z.a1 > half - 1.5) return false;
		const near = (a0: number, a1: number, pad: number) => a0 < z.a1 + pad && a1 > z.a0 - pad;
		// parts at the bottom of a layer (from below) and at its top (rising up) may share a spot
		const level = (o: Zone) => o.z0 < z.z1 + 0.5 && o.z1 > z.z0 - 0.5;
		if (mine.some((o) => o.side === z.side && level(o) && near(o.a0, o.a1, 1))) return false;
		if (!l) return true;
		const rect = zoneRect(z);
		if (l.boards.some((b) => overlaps(b.outer, rect, -0.01) && z.z0 < b.zTop)) return false;
		if (
			l.walls.some(
				(n) =>
					n.kind === 'opening' &&
					n.side === z.side &&
					n.z0 < z.z1 + 1 &&
					near(n.u - n.width / 2, n.u + n.width / 2, 1)
			)
		)
			return false;
		return !l.walls.some(
			(p) =>
				p.kind === 'pocket' && p.side === z.side && near(p.u - p.width / 2, p.u + p.width / 2, 1)
		);
	};
	for (let i = 0; i < layers.length; i++) {
		const lower = layers[i];
		const upper = layers[i + 1] ?? null;
		const seam: Seam = { hooks: [] };
		const put = (side: Side, order: 1 | -1) => {
			const half = isXWall(side) ? hx : hy;
			const steps = Math.floor(half * 4);
			for (let k = 0; k <= 2 * steps; k++) {
				const u = order * (-half + k * 0.5);
				const z = zones(side, u, lower.height);
				if (fits(lower, z.low, taken[i]) && fits(upper, z.up, taken[i + 1])) {
					taken[i].push(z.low);
					taken[i + 1].push(z.up);
					return { side, u };
				}
			}
			return null;
		};
		// a hook near each end of both walls, where they fit
		for (const side of lockWalls)
			for (const order of [1, -1] as const) {
				const h = put(side, order);
				if (h) seam.hooks.push(h);
			}
		const where = upper ? `layer ${i + 2}` : 'the lid';
		const what = `Between layer ${i + 1} and ${where}`;
		if (!seam.hooks.length) warnings.push(`${what}: no room for the slide hooks.`);
		else if (!lockWalls.every((s) => seam.hooks.some((h) => h.side === s)))
			warnings.push(`${what}: slide hooks fit on one wall only – the joint is weak.`);
		slideOf.get(lower)!.up = seam;
		if (upper) slideOf.get(upper)!.down = seam;
		else lid.down = seam;
	}

	// what the locks take: in the walls, and solid floor below them
	for (const l of layers)
		for (const z of taken[l.index]) {
			l.walls.push({
				kind: 'lock',
				side: z.side,
				u: (z.a0 + z.a1) / 2,
				width: z.a1 - z.a0,
				depth: ctx.wall,
				z0: z.z0,
				z1: z.z1
			});
			const r = zoneRect({ ...z, d: z.d + 1 });
			l.floorKeep.push({ x0: r.x0 - 1, x1: r.x1 + 1, y0: r.y0 - 1, y1: r.y1 + 1 });
		}
}

function build(g: Csg, layout: CaseLayout, part: Part, out: PartBuild) {
	const { w, tol, wbox, profile, inWall } = g;
	const ld = lockDims(w, tol);
	const nd = ld.nose;
	const N = K.nose;

	/** Profile in the (d, z) plane of a wall, extruded along it over [a0, a1] (world). */
	const wprofile = (side: Side, a0: number, a1: number, pts: Vec2[]) =>
		// extrusion: X=d, Y=z, Z=a  →  a, d, z
		inWall(
			side,
			(a0 + a1) / 2,
			profile(pts, -(a1 - a0) / 2, (a1 - a0) / 2, [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1])
		);
	/** Profile in the (a, d) plane of a wall (a relative to u, counter-clockwise), from z0 to z1. */
	const aprofile = (side: Side, u: number, pts: Vec2[], z0: number, z1: number) =>
		inWall(side, u, profile(pts, z0, z1, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
	/** Box in wall coordinates over the world span [a0, a1]. */
	const span = (
		side: Side,
		[a0, a1]: [number, number],
		d0: number,
		d1: number,
		z0: number,
		z1: number
	) => wbox(side, (a0 + a1) / 2, -(a1 - a0) / 2, (a1 - a0) / 2, d0, d1, z0, z1);

	// d = inwards from the inner wall face: everything below sits inside the wall (d < 0)

	/** Hook rising from the inner part of the wall (top at H): stem, finger pointing outwards, nose. */
	function hookUp(h: Lock, H: number) {
		const at = ld.locked(h.u);
		const stem = span(h.side, at, -ld.stem, 0, H - 0.01, H + ld.top);
		// flat top, 45° underside
		const finger = wprofile(h.side, ...at, [
			[-ld.stem + 0.01, H + ld.fingerZ],
			[-ld.stem - ld.reach, H + ld.fingerZ + ld.reach],
			[-ld.stem - ld.reach, H + ld.top],
			[-ld.stem + 0.01, H + ld.top]
		]);
		// ramps both ways along the wall, so it snaps past the ridge in and out
		const d0 = -ld.stem + 0.01;
		const d1 = -ld.stem - nd.out;
		const nose = aprofile(
			h.side,
			h.u,
			[
				[-N.base, d0],
				[-N.tip, d1],
				[N.tip, d1],
				[N.base, d0]
			],
			H + nd.z0,
			H + nd.z1
		);
		return [stem, finger, nose];
	}

	/**
	 * Hollow in the wall above (bottom at z = 0): the hook drops in at the entry and slides to its
	 * locked place. The outer part of the wall stays; under the finger it is the keeper, with a
	 * 45° top. 45° roof, so it prints upright and upside down. Below the keeper a slot lets the
	 * nose run free, but for the ridge it snaps past.
	 */
	function hookRoom(h: Lock) {
		const z1 = ld.top + tol;
		const o = ld.outer;
		const sweep = ld.sweep(h.u);
		const dIn = -ld.stem - tol + 0.01;
		const dOut = -ld.stem - nd.out - tol;
		const r = nd.ridge(h.u) - h.u;
		const top = dOut + nd.grip + tol;
		const [s0, s1] = sweep.map((a) => a - h.u);
		// back and left run against the world axis: mirror (and keep it counter-clockwise)
		const flip = h.side === 'back' || h.side === 'left';
		const pts: Vec2[] = [
			[s0, dIn],
			[s0, dOut],
			[r - N.ridgeTip - nd.ridgeRun, dOut],
			[r - N.ridgeTip, top],
			[r + N.ridgeTip, top],
			[r + N.ridgeTip + nd.ridgeRun, dOut],
			[s1, dOut],
			[s1, dIn]
		];
		const slot = aprofile(
			h.side,
			h.u,
			flip ? pts.map(([a, d]): Vec2 => [-a, d]).reverse() : pts,
			-1,
			nd.slotZ
		);
		return [
			span(h.side, sweep, -ld.stem - tol, 0.01, -1, z1),
			wprofile(h.side, ...sweep, [
				[0.01, ld.fingerZ - tol - ld.stem - 0.01],
				[-o, ld.fingerZ + ld.reach],
				[-o, z1],
				[0.01, z1 + o + 0.01]
			]),
			span(h.side, ld.entry(h.u), -o, 0.01, -1, z1),
			slot
		];
	}

	/** Room a part needs for the seam below it. */
	const fromBelow = (seam: Seam) => seam.hooks.flatMap(hookRoom);

	if (part.kind === 'lid') {
		out.cuts.push(...fromBelow(lidSlideOf.get(layout.lid)!.down));
		return;
	}
	const H = part.height;
	const data = slideOf.get(part.layer)!;
	if (data.down) out.cuts.push(...fromBelow(data.down));
	// the hooks rise into the part above
	out.lateAdds.push(...data.up.hooks.flatMap((h) => hookUp(h, H)));
}

export const slide = defineWalls({
	id: 'slide',
	label: 'Slide',
	note: 'Set a layer down 1 cm off and slide it home until it clicks. Pull it firmly to slide it back.',
	lidNote: 'Printed upside down. Slides onto the top layer like the layers.',
	fitHint: 'Looser if the slide is too tight',
	thickness: 2.5,

	seam(ctx) {
		const ld = dimsOf(ctx);
		return {
			overlap: 0,
			inside: null,
			band: 0,
			lidEdge: Math.ceil((ld.hookTop + 1) * 2) / 2,
			// nothing may reach down into the notches, or the part above couldn't slide
			plugs: false
		};
	},
	arrange,
	minInner: () => K.minInner,
	// a tier keeps solid wall between the hollow from below and the hooks rising from its top
	minHeight: (ctx, _layout, l) => ({
		height: l.index === 0 ? l.zBase + 2 : Math.ceil(dimsOf(ctx).hookTop + 2),
		reason: 'for the layers to fit together'
	}),
	place,
	build
});
