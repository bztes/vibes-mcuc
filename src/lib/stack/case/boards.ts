import { PIN_HEADER, PIN_PITCH, type PartDefinition, type PinSide, type Side } from '../parts';
import type { Board } from '../schema';
import { rotateVec } from './math';
import type { Rect } from './types';

/** What the base model and the components need to know about a board. */

/** Footprint in world space, grown by `pad` in board-local space (x0 = -X side, ...). */
export function localRect(
	def: PartDefinition,
	rot: number,
	cx: number,
	cy: number,
	pad: Rect
): Rect {
	const pts = [
		rotateVec(-def.length / 2 - pad.x0, -def.width / 2 - pad.y0, rot),
		rotateVec(def.length / 2 + pad.x1, def.width / 2 + pad.y1, rot)
	];
	return {
		x0: Math.min(pts[0][0], pts[1][0]) + cx,
		x1: Math.max(pts[0][0], pts[1][0]) + cx,
		y0: Math.min(pts[0][1], pts[1][1]) + cy,
		y1: Math.max(pts[0][1], pts[1][1]) + cy
	};
}

export function pinSideOf(board: Board, def: PartDefinition): PinSide {
	if (!def.pins?.length) return 'none';
	return board.pins ?? def.defaultPins ?? 'none';
}

/** What a board needs above and below its PCB with the given pin side. */
export function boardHeights(def: PartDefinition, side: PinSide) {
	const { long, tail } = PIN_HEADER;
	return {
		top:
			side === 'top'
				? Math.max(def.topHeight, long)
				: side === 'bottom'
					? Math.max(def.topHeight, tail)
					: def.topHeight,
		bottom:
			side === 'bottom'
				? Math.max(def.bottomHeight, long)
				: side === 'top'
					? Math.max(def.bottomHeight, tail)
					: def.bottomHeight
	};
}

/** Board-local areas under the PCB taken by the header bodies or their solder joints. */
export function pinKeepouts(def: PartDefinition, side: PinSide, tol: number): Rect[] {
	if (side === 'none') return [];
	const half = PIN_PITCH / 2 + tol;
	return (def.pins ?? []).map((r) => {
		const len = (r.count - 1) * PIN_PITCH;
		return r.axis === 'x'
			? { x0: r.x - half, x1: r.x + len + half, y0: r.y - half, y1: r.y + half }
			: { x0: r.x - half, x1: r.x + half, y0: r.y - half, y1: r.y + len + half };
	});
}

export const hasPorts = (def: PartDefinition, side: Side) => def.ports.some((p) => p.side === side);

/** Board-local spans (along the edge) of the ports on one side. */
export function portSpans(def: PartDefinition, side: Side): [number, number][] {
	return def.ports
		.filter((p) => p.side === side)
		.map((p) => [p.offset - p.width / 2, p.offset + p.width / 2]);
}

/** Highest point above the PCB, connectors included. */
export function portTop(def: PartDefinition, top: number) {
	return Math.max(top, ...def.ports.map((p) => p.z + p.height / 2));
}
