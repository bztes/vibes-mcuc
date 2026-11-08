import { hasPorts, pinKeepouts, portSpans } from '../../case/boards';
import type { CaseComponent, LayoutContext } from '../../case/component';
import { K as CASE } from '../../case/layout';
import {
	isXWall,
	minusSpans,
	OPPOSITE,
	rotateVec,
	toWorld,
	wallDistance,
	worldSide
} from '../../case/math';
import { slot, type CaseLayer, type Rect, type ResolvedBoard } from '../../case/types';
import { SIDES, type PartDefinition, type PinSide, type Side } from '../../parts';

/**
 * Cradle: boards rest on solid pads rising from the layer bottom, a rim along the board
 * edges keeps them from sliding, small rigid hooks in the corners keep them down.
 */

/** Fixed dimensions (mm). Deliberately not exposed in the UI. */
export const K = {
	supportDepth: 3,
	/** Rim on the supports that rises along the board edges and keeps the board from sliding. */
	supportRim: 1.2,
	/**
	 * Board hold, so a board stays in when the case is upside down. The port edge slides under
	 * small lips on the wall in both of its corners; the opposite edge clicks under small rigid
	 * noses on the rim in both corners of that edge, where boards rarely have anything. No springs:
	 * the nose only reaches a little over the PCB, its 45° top guides the board in, and the rim and
	 * PCB give enough to pass it. The noses keep the board against the wall, so it can't slide out
	 * from the lip. Nose and lip are rounded at the bottom of their tips: no sharp overhang to
	 * print, and the board can be pulled out.
	 */
	hold: {
		/** Lip: reach over the PCB and thickness at its tip; flat underside, 45° top. */
		lipOver: 0.5,
		lipThick: 0.5,
		/** Air between the PCB top and the underside of the lip / nose. */
		clear: 0.1,
		/** Nose: width along the edge (narrowest where space is short), reach over the PCB, height of its flat part. */
		latchWidth: 2,
		minLatch: 1.2,
		noseOver: 0.3,
		noseFlat: 0.5,
		/** Radius at the bottom of the nose and lip tips. */
		round: 0.3,
		/** Distance kept from pins and openings along the edge, and from connectors. */
		keep: 1,
		keepPort: 0.5,
		/** How far from the edge something on the board gets in the way. */
		reach: 1.5,
		/**
		 * Pry slot in the middle of each nose edge: through the rim and into the support, below and
		 * under the PCB edge, for a small screwdriver to lever the board out. Width (narrowest where
		 * space is short), how far under the PCB, how deep below it.
		 */
		pryWidth: 4,
		pryMin: 2.5,
		pryUnder: 2,
		pryDepth: 1.5
	}
} as const;

export interface SupportBlock {
	/** Board-local x range of the pad. */
	x0: number;
	x1: number;
	/** Board-local y half extent of the pad. */
	halfY: number;
	/** Board-local y ranges the pad really covers (it stays clear of the pin rows). */
	spans: [number, number][];
	/** Direction of the board end along board-local x (±1), 0 = middle pad. */
	dir: number;
	/** Board-local distance from the pad's outer edge to the wall (room for an end rim). */
	reach: number;
}

/** A latch (or pry slot) on one board edge. */
export type Latch = { side: Side; u: number; width: number };

/**
 * How one board is held down. Sides are board-local; spans and `u` run along the edge in
 * board-local coordinates (y on the left/right edges, x on the front/back edges).
 */
export interface BoardHold {
	board: number;
	lip: { side: Side; spans: [number, number][]; reach: number } | null;
	latches: Latch[];
	/** Pry slots, one per nose edge. */
	pry: Latch[];
}

export interface CradleLayer {
	/** Per board (same order as `layer.boards`): pads and board-local rims. */
	boards: { supports: SupportBlock[]; rims: Rect[] }[];
	holds: BoardHold[];
}

export const cradleOf = slot<CradleLayer>('cradle');

export const rimOut = (tol: number) => tol + K.supportRim;

/**
 * Pads under the board, clear of the pin rows. A pad that loses most of its width to a row across
 * it slides towards the middle of the board, past the row.
 */
function supportPads(def: PartDefinition, keep: Rect[]) {
	const d = Math.min(K.supportDepth, def.length / 4);
	const base = def.supports.length
		? def.supports
		: [
				{ x: -def.length / 2 + d / 2, width: d },
				{ x: def.length / 2 - d / 2, width: d }
			];
	const hw = def.width / 2;
	const hits = (x0: number, x1: number) => keep.filter((k) => k.x0 < x1 && k.x1 > x0);
	const spansAt = (x0: number, x1: number) =>
		minusSpans(
			-hw,
			hw,
			hits(x0, x1).map((k): [number, number] => [k.y0, k.y1])
		);
	const widest = (s: [number, number][]) => Math.max(0, ...s.map(([a, b]) => b - a));
	return base.flatMap((raw) => {
		// a pad that stops just short of the board end goes all the way
		const inset = def.length / 2 - Math.abs(raw.x) - raw.width / 2;
		const p =
			inset > 0 && inset < 1
				? { x: raw.x + (Math.sign(raw.x) * inset) / 2, width: raw.width + inset }
				: raw;
		let x0 = p.x - p.width / 2;
		let spans = spansAt(x0, x0 + p.width);
		if (widest(spans) < def.width * 0.4) {
			const hit = hits(x0, x0 + p.width);
			x0 =
				p.x < 0 ? Math.max(...hit.map((k) => k.x1)) : Math.min(...hit.map((k) => k.x0)) - p.width;
			spans = spansAt(x0, x0 + p.width);
		}
		return spans.length ? [{ x: x0 + p.width / 2, width: p.width, spans }] : [];
	});
}

/** Free spans along one board edge: clear of connectors, pins and openings near that edge. */
export function edgeFree(
	def: PartDefinition,
	side: Side,
	pinSide: PinSide,
	tol: number,
	end = 0.5
) {
	const h = K.hold;
	const xEdge = side === 'left' || side === 'right';
	const half = (xEdge ? def.width : def.length) / 2;
	const e = (xEdge ? def.length : def.width) / 2;
	/** Distance of a board-local rect from the edge. */
	const toEdge = (r: Rect) =>
		({ left: r.x0 + e, right: e - r.x1, front: r.y0 + e, back: e - r.y1 })[side];
	const span = (a0: number, a1: number): [number, number] => [a0 - h.keep, a1 + h.keep];
	const blocked = portSpans(def, side).map(([a, b]): [number, number] => [
		a - h.keepPort,
		b + h.keepPort
	]);
	for (const r of pinKeepouts(def, pinSide, tol))
		if (toEdge(r) < h.reach) blocked.push(xEdge ? span(r.y0, r.y1) : span(r.x0, r.x1));
	// a vent only lets air to a sensor, there is nothing tall at the edge
	for (const o of def.topOpenings.filter((o) => o.type !== 'vent')) {
		const [ca, cn] = xEdge ? [o.y, o.x] : [o.x, o.y];
		const [wa, wn] = xEdge ? [o.height, o.width] : [o.width, o.height];
		const sgn = side === 'left' || side === 'front' ? -1 : 1;
		// how far the opening stays from the edge
		const gap = e - (sgn * cn + wn / 2);
		if (gap >= h.reach) continue;
		if (o.type === 'circle') {
			// only where the circle comes within reach of the edge
			const r = wn / 2;
			const q = e - sgn * cn - h.reach;
			const w = q <= 0 ? r : Math.sqrt(Math.max(0, r * r - q * q));
			blocked.push(span(ca - w, ca + w));
		} else blocked.push(span(ca - wa / 2, ca + wa / 2));
	}
	return minusSpans(-half + end, half - end, blocked);
}

/** Board-local footprint of a nose with the rim behind it, grown by `pad`. */
export function latchZone(def: PartDefinition, lt: Latch, tol: number, pad = 0): Rect {
	const a0 = lt.u - lt.width / 2 - pad;
	const a1 = lt.u + lt.width / 2 + pad;
	const hl = def.length / 2;
	const hw = def.width / 2;
	const o = rimOut(tol) + pad;
	switch (lt.side) {
		case 'right':
			return { x0: hl, x1: hl + o, y0: a0, y1: a1 };
		case 'left':
			return { x0: -hl - o, x1: -hl, y0: a0, y1: a1 };
		case 'back':
			return { x0: a0, x1: a1, y0: hw, y1: hw + o };
		case 'front':
			return { x0: a0, x1: a1, y0: -hw - o, y1: -hw };
	}
}

/** Pry slots: one per nose edge, as central as the pins and noses allow. */
function pryAt(def: PartDefinition, latches: Latch[], pinSide: PinSide, tol: number): Latch[] {
	const h = K.hold;
	const sides = [...new Set(latches.map((l) => l.side))];
	return sides.flatMap((side) => {
		const noses = latches
			.filter((l) => l.side === side)
			.map((l): [number, number] => [l.u - l.width / 2 - 1, l.u + l.width / 2 + 1]);
		const free: [number, number][] = edgeFree(def, side, pinSide, tol).flatMap(([a, b]) =>
			minusSpans(a, b, noses)
		);
		const fits = free.filter(([a, b]) => b - a >= h.pryMin);
		const spots = fits.map(([a, b]) => {
			const width = Math.min(h.pryWidth, b - a);
			return { side, u: Math.max(a + width / 2, Math.min(b - width / 2, 0)), width };
		});
		return spots.sort((x, y) => Math.abs(x.u) - Math.abs(y.u)).slice(0, 1);
	});
}

/**
 * Latches on a board edge: one in each corner, or as close to it as the free spans allow; one
 * in the middle where the edge is too short for two.
 */
function latchSpots(side: Side, free: [number, number][]): Latch[] {
	const h = K.hold;
	const fits = free.filter(([a, b]) => b - a >= h.minLatch);
	if (!fits.length) return [];
	const first = fits[0];
	const last = fits[fits.length - 1];
	const w = (s: [number, number]) => Math.min(h.latchWidth, s[1] - s[0]);
	const lo = { side, u: first[0] + w(first) / 2, width: w(first) };
	const hi = { side, u: last[1] - w(last) / 2, width: w(last) };
	// two need room for both
	if (hi.u - lo.u >= (lo.width + hi.width) / 2 + 1) return [lo, hi];
	const s = fits.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
	return [{ side, u: Math.max(s[0] + w(s) / 2, Math.min(s[1] - w(s) / 2, 0)), width: w(s) }];
}

/**
 * Where a board is held: a lip on a port side whose opposite side has no ports, and latches on
 * that opposite side. Boards without ports get latches on both short ends, or on both long sides
 * if the ends are taken. `lip` is only the side; whether it fits is decided at the wall.
 */
function holdPlan(def: PartDefinition, pinSide: PinSide, tol: number) {
	// latches go right into the corners
	const spots = (side: Side) => latchSpots(side, edgeFree(def, side, pinSide, tol, 0));
	const ports = SIDES.filter((s) => hasPorts(def, s));
	if (!ports.length) {
		const pairs: [Side, Side][] = [
			['left', 'right'],
			['front', 'back']
		];
		if (def.length < def.width) pairs.reverse();
		const tries = pairs.map((p) => p.map(spots));
		const ok = tries.find((t) => t.every((l) => l.length));
		return { lip: null, latches: (ok ?? tries[0]).flat(), held: !!ok, opposite: false };
	}
	const lip = ports.find((s) => !hasPorts(def, OPPOSITE[s])) ?? null;
	const latches = lip ? spots(OPPOSITE[lip]) : [];
	return { lip, latches, held: latches.length > 0, opposite: !lip };
}

/** How far a wall is thinned from the inside where the board sits (a pocket of the walls). */
function pocketDepth(layer: CaseLayer, b: ResolvedBoard, side: Side) {
	const u = isXWall(side) ? (b.rect.x0 + b.rect.x1) / 2 : (b.rect.y0 + b.rect.y1) / 2;
	const p = layer.walls.find(
		(w) => w.kind === 'pocket' && w.side === side && Math.abs(w.u - u) < w.width / 2
	);
	return p?.depth ?? 0;
}

function resolveBoard(
	ctx: LayoutContext,
	hx: number,
	hy: number,
	layer: CaseLayer,
	b: ResolvedBoard,
	index: number,
	lw: string[]
) {
	const tol = ctx.tolerance;
	const def = b.def;
	const keepouts = pinKeepouts(def, b.pinSide, tol);
	const supports = supportPads(def, keepouts).map((p): SupportBlock => {
		const dir = Math.abs(p.x) < 0.01 ? 0 : Math.sign(p.x);
		const padOuter = p.x + (dir * p.width) / 2;
		// distance from the pad's outer edge to the wall along board-local x
		const [wx, wy] = rotateVec(dir, 0, b.rotation);
		const [ex, ey] = rotateVec(padOuter, 0, b.rotation);
		const reach =
			wx > 0
				? hx - (b.cx + ex)
				: wx < 0
					? b.cx + ex + hx
					: wy > 0
						? hy - (b.cy + ey)
						: b.cy + ey + hy;
		return {
			x0: p.x - p.width / 2,
			x1: p.x + p.width / 2,
			halfY: def.width / 2,
			spans: p.spans,
			dir,
			reach: dir === 0 ? 0 : Math.max(0, reach)
		};
	});
	// rims around the board, open exactly under the connectors
	const o = rimOut(tol);
	const hl = def.length / 2;
	const hw = def.width / 2;
	const rims: Rect[] = [];
	const along = (side: Side, a0: number, a1: number) => minusSpans(a0, a1, portSpans(def, side));
	const world = (side: Side) => worldSide(side, b.rotation);
	// a port edge at the wall needs no rim: the wall stops the board
	const wallDist = (side: Side) => wallDistance(b.rect, world(side), hx, hy);
	const rimmed = (side: Side) => !hasPorts(def, side) || wallDist(side) > CASE.flushDistance;
	const e = (side: Side) => (rimmed(side) ? o : 0);
	for (const sp of supports) {
		const xa = sp.dir < 0 ? -hl - e('left') : sp.x0;
		const xb = sp.dir > 0 ? hl + e('right') : sp.x1;
		const ya = -hw - e('front');
		const yb = hw + e('back');
		if (rimmed('front'))
			for (const [x0, x1] of along('front', xa, xb))
				rims.push({ x0, x1, y0: -hw - o, y1: -hw - tol });
		if (rimmed('back'))
			for (const [x0, x1] of along('back', xa, xb)) rims.push({ x0, x1, y0: hw + tol, y1: hw + o });
		if (sp.dir < 0 && rimmed('left'))
			for (const [y0, y1] of along('left', ya, yb))
				rims.push({ x0: -hl - o, x1: -hl - tol, y0, y1 });
		if (sp.dir > 0 && rimmed('right'))
			for (const [y0, y1] of along('right', ya, yb))
				rims.push({ x0: hl + tol, x1: hl + o, y0, y1 });
	}
	// the wall face behind a rimless edge (thinned walls are further out)
	const face = (side: Side) => wallDist(side) + pocketDepth(layer, b, world(side));
	// below the PCB the pads run on into the rim, or the wall on a rimless edge: no gap
	const out = (side: Side) => (rimmed(side) ? tol : face(side) + 0.01);
	const atEdge = (v: number, edge: number) => Math.abs(v - edge) < 0.01;
	const solidPads = supports.map((sp): SupportBlock => ({
		...sp,
		x0: sp.dir < 0 && atEdge(sp.x0, -hl) ? -hl - out('left') : sp.x0,
		x1: sp.dir > 0 && atEdge(sp.x1, hl) ? hl + out('right') : sp.x1,
		spans: sp.spans.map(([y0, y1]): [number, number] => [
			atEdge(y0, -hw) ? -hw - out('front') : y0,
			atEdge(y1, hw) ? hw + out('back') : y1
		])
	}));
	// hold: lips at the port wall, noses opposite
	const plan = holdPlan(def, b.pinSide, tol);
	const hold: BoardHold = {
		board: index,
		lip: null,
		latches: plan.latches,
		pry: pryAt(def, plan.latches, b.pinSide, tol)
	};
	if (plan.lip && !rimmed(plan.lip)) {
		// small lips in the corners, like the noses opposite
		const spans = latchSpots(plan.lip, edgeFree(def, plan.lip, b.pinSide, tol, 0)).map(
			(l): [number, number] => [l.u - l.width / 2, l.u + l.width / 2]
		);
		if (spans.length) hold.lip = { side: plan.lip, spans, reach: face(plan.lip) };
		else lw.push(`${def.name}: no room for a lip at the port edge.`);
	}
	if (plan.opposite) lw.push(`${def.name}: ports on opposite edges – nothing holds it down.`);
	else if (!plan.held) lw.push(`${def.name}: no room for a latch – it isn't held down.`);
	return { supports: solidPads, rims, hold };
}

export const cradleLayout: Omit<CaseComponent, 'build'> = {
	id: 'cradle',

	// edges with ports go straight to the wall: no rim there, the wall stops the board
	boardPad: (ctx, def, side) => (hasPorts(def, side) ? 0 : rimOut(ctx.tolerance)),

	resolveLayer(ctx, layout, layer) {
		const hx = layout.inner.length / 2;
		const hy = layout.inner.width / 2;
		const tol = ctx.tolerance;
		const data: CradleLayer = { boards: [], holds: [] };
		layer.boards.forEach((b, i) => {
			const r = resolveBoard(ctx, hx, hy, layer, b, i, layer.warnings);
			data.boards.push({ supports: r.supports, rims: r.rims });
			data.holds.push(r.hold);
		});
		// floor openings stay clear of the pads with their rims, and of the noses
		const o = rimOut(tol);
		const m = 1;
		layer.boards.forEach((b, i) => {
			for (const sp of data.boards[i].supports)
				layer.floorKeep.push(
					toWorld(b, {
						x0: (sp.dir < 0 ? -b.def.length / 2 - o : sp.x0) - m,
						x1: (sp.dir > 0 ? b.def.length / 2 + o : sp.x1) + m,
						y0: -b.def.width / 2 - o - m,
						y1: b.def.width / 2 + o + m
					})
				);
		});
		for (const h of data.holds)
			for (const lt of h.latches) {
				const b = layer.boards[h.board];
				layer.floorKeep.push(toWorld(b, latchZone(b.def, lt, tol, 1)));
			}
		cradleOf.set(layer, data);
	}
};
