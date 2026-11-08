import type { Manifold, Vec2 } from 'manifold-3d';
import type { Csg } from '../../case/csg';
import type { Part, PartBuild } from '../../case/component';
import type { CaseLayer, ResolvedBoard } from '../../case/types';
import type { Side } from '../../parts';
import { K, cradleOf, type CradleLayer } from './layout';

/** Edge frame of a board side: X = outwards from the board edge (d), Y = along the edge (a). */
const EDGE_ANGLE: Record<Side, number> = { right: 0, back: 90, left: 180, front: -90 };
const edgeSign = (side: Side) => (side === 'left' || side === 'back' ? -1 : 1);
const edgeDist = (side: Side, hl: number, hw: number) =>
	side === 'left' || side === 'right' ? hl : hw;

export function buildCradle(g: Csg, part: Part, out: PartBuild) {
	if (part.kind !== 'layer') return;
	const layer = part.layer;
	const data = cradleOf.get(layer);
	if (!data) return;
	out.adds.push(...boardParts(g, layer, data));
	const holds = holdParts(g, layer, data);
	out.cuts.push(...holds.cut);
	out.fixtures.push(...holds.add);
}

const place = (g: Csg, b: ResolvedBoard, m: Manifold) =>
	g.t(g.t(m.rotate([0, 0, b.rotation])).translate([b.cx, b.cy, 0]));

/** (d, z) profile along a ∈ [a0, a1] (board-local along-coordinates) on a board edge. */
function edgeProfile(g: Csg, side: Side, e: number, pts: Vec2[], a0: number, a1: number) {
	const s = edgeSign(side);
	const [f0, f1] = s > 0 ? [a0, a1] : [-a1, -a0];
	// extrusion: X=d, Y=z, Z=-a  →  d, a, z (a proper rotation)
	const m = g.profile(pts, -f1, -f0, [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, e, 0, 0, 1]);
	return g.t(m.rotate([0, 0, EDGE_ANGLE[side]]));
}

/** Pads and rims under every board. */
function boardParts(g: Csg, layer: CaseLayer, data: CradleLayer) {
	const adds: Manifold[] = [];
	layer.boards.forEach((b, i) => {
		const local: Manifold[] = [];
		const z0 = layer.zBase;
		// stand on the layer bottom, so nothing ends up over a floor opening
		const zs = 0;
		const { supports, rims } = data.boards[i];
		for (const s of supports) {
			if (b.zPcb - z0 < 0.2) continue;
			for (const [y0, y1] of s.spans) local.push(g.box(s.x0, s.x1, y0, y1, zs, b.zPcb));
		}
		// rims along the board edges keep it from sliding
		if (b.zPcb - z0 >= 0.2)
			for (const r of rims) local.push(g.box(r.x0, r.x1, r.y0, r.y1, zs, b.zPcbTop));
		const u = g.union(local);
		if (u) adds.push(place(g, b, u));
	});
	return adds;
}

/** Lips and noses of a layer's boards (world): `cut` (pry slots) and `add`. */
function holdParts(g: Csg, layer: CaseLayer, data: CradleLayer) {
	const h = K.hold;
	const tol = g.tol;
	/** Arc around (cd, cz) from angle a0 to a1 (degrees), ends included. */
	const arc = (cd: number, cz: number, a0: number, a1: number): Vec2[] =>
		Array.from({ length: 7 }, (_, i) => {
			const a = ((a0 + ((a1 - a0) * i) / 6) * Math.PI) / 180;
			return [cd + h.round * Math.cos(a), cz + h.round * Math.sin(a)];
		});
	const cut: Manifold[] = [];
	const add: Manifold[] = [];
	for (const hold of data.holds) {
		const b = layer.boards[hold.board];
		const hl = b.def.length / 2;
		const hw = b.def.width / 2;
		const zn = b.zPcbTop + h.clear;
		// support block under each hook, so the PCB is clamped between the two
		const under =
			b.zPcb - layer.zBase >= 0.2
				? (d1: number): Vec2[] => [
						[-h.reach, 0],
						[d1, 0],
						[d1, b.zPcb],
						[-h.reach, b.zPcb]
					]
				: null;
		// pry slots: through the rim, below and under the PCB edge
		for (const p of hold.pry) {
			const z0 = Math.max(layer.zBase, b.zPcb - h.pryDepth);
			const pts: Vec2[] = [
				[-h.pryUnder, z0],
				[K.supportRim + tol + 0.01, z0],
				[K.supportRim + tol + 0.01, b.zPcbTop + 1],
				[-h.pryUnder, b.zPcbTop + 1]
			];
			const e = edgeDist(p.side, hl, hw);
			cut.push(place(g, b, edgeProfile(g, p.side, e, pts, p.u - p.width / 2, p.u + p.width / 2)));
		}
		if (hold.lip) {
			// from inside the wall to over the PCB: flat underside with a rounded tip, 45° top
			const { side, spans, reach } = hold.lip;
			const d0 = reach + 0.3;
			const d1 = -h.lipOver;
			const pts: Vec2[] = [
				[d0, zn],
				...arc(d1 + h.round, zn + h.round, 270, 180),
				[d1, zn + h.lipThick],
				[d0, zn + h.lipThick + (d0 - d1)]
			];
			const e = edgeDist(side, hl, hw);
			for (const [a0, a1] of spans) {
				add.push(place(g, b, edgeProfile(g, side, e, pts, a0, a1)));
				// one piece with a support below: from under the PCB edge into the wall
				if (under) add.push(place(g, b, edgeProfile(g, side, e, under(d0), a0, a1)));
			}
		}
		for (const lt of hold.latches) {
			const e = edgeDist(lt.side, hl, hw);
			const over = tol + h.noseOver;
			const top = zn + h.noseFlat + over;
			// rigid: a rim piece from the layer bottom carries the nose; rounded under the tip, 45° on top
			const pts: Vec2[] = [
				[tol, 0],
				[tol + K.supportRim, 0],
				[tol + K.supportRim, top],
				[tol, top],
				[-h.noseOver, zn + h.noseFlat],
				...arc(-h.noseOver + h.round, zn + h.round, 180, 270),
				[tol, zn]
			];
			const [a0, a1] = [lt.u - lt.width / 2, lt.u + lt.width / 2];
			add.push(place(g, b, edgeProfile(g, lt.side, e, pts, a0, a1)));
			// one piece with a support below: from under the PCB edge into the rim
			if (under) add.push(place(g, b, edgeProfile(g, lt.side, e, under(tol + 0.01), a0, a1)));
		}
	}
	return { cut, add };
}
