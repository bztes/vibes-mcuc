import type { Side } from '../parts';
import type { Rect, ResolvedBoard } from './types';

/** 2D helpers shared by the base model and the components. */

const SIDE_VEC: Record<Side, [number, number]> = {
	left: [-1, 0],
	right: [1, 0],
	front: [0, -1],
	back: [0, 1]
};

export const OPPOSITE: Record<Side, Side> = {
	left: 'right',
	right: 'left',
	front: 'back',
	back: 'front'
};

export function rotateVec(x: number, y: number, deg: number): [number, number] {
	const r = (deg * Math.PI) / 180;
	const c = Math.round(Math.cos(r));
	const s = Math.round(Math.sin(r));
	return [x * c - y * s, x * s + y * c];
}

/** The wall a board-local side faces after rotating the board. */
export function worldSide(side: Side, rotation: number): Side {
	const [x, y] = rotateVec(...SIDE_VEC[side], rotation);
	if (x < 0) return 'left';
	if (x > 0) return 'right';
	return y < 0 ? 'front' : 'back';
}

/** Front and back walls run along x. */
export const isXWall = (side: Side) => side === 'front' || side === 'back';

export const overlaps = (a: Rect, b: Rect, pad = 0) =>
	a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.y0 < b.y1 + pad && a.y1 > b.y0 - pad;

export const unionRect = (rs: Rect[]): Rect => ({
	x0: Math.min(...rs.map((r) => r.x0)),
	y0: Math.min(...rs.map((r) => r.y0)),
	x1: Math.max(...rs.map((r) => r.x1)),
	y1: Math.max(...rs.map((r) => r.y1))
});

/** [a0, a1] minus the given spans; tiny leftovers are dropped. */
export function minusSpans(a0: number, a1: number, spans: [number, number][]): [number, number][] {
	let out: [number, number][] = [[a0, a1]];
	for (const [s0, s1] of spans)
		out = out.flatMap(([b0, b1]): [number, number][] =>
			s1 <= b0 || s0 >= b1
				? [[b0, b1]]
				: [
						[b0, Math.max(b0, s0)],
						[Math.min(b1, s1), b1]
					]
		);
	return out.filter(([b0, b1]) => b1 - b0 >= 1);
}

/** Board-local rect → layer coordinates. */
export function toWorld(b: ResolvedBoard, r: Rect): Rect {
	const [ax, ay] = rotateVec(r.x0, r.y0, b.rotation);
	const [bx, by] = rotateVec(r.x1, r.y1, b.rotation);
	return {
		x0: Math.min(ax, bx) + b.cx,
		x1: Math.max(ax, bx) + b.cx,
		y0: Math.min(ay, by) + b.cy,
		y1: Math.max(ay, by) + b.cy
	};
}

/** Distance from a world rect to the inner face of a wall. */
export function wallDistance(r: Rect, side: Side, hx: number, hy: number) {
	return { left: r.x0 + hx, right: hx - r.x1, front: r.y0 + hy, back: hy - r.y1 }[side];
}

/** Rect along a wall: a0..a1 in world coordinates along it, d0..d1 inwards from the inner face. */
export function wallRect(
	side: Side,
	a0: number,
	a1: number,
	d0: number,
	d1: number,
	hx: number,
	hy: number
): Rect {
	if (side === 'front') return { x0: a0, x1: a1, y0: -hy + d0, y1: -hy + d1 };
	if (side === 'back') return { x0: a0, x1: a1, y0: hy - d1, y1: hy - d0 };
	if (side === 'left') return { x0: -hx + d0, x1: -hx + d1, y0: a0, y1: a1 };
	return { x0: hx - d1, x1: hx - d0, y0: a0, y1: a1 };
}
