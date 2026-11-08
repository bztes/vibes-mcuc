import { describe, expect, it } from 'vitest';
import { buildStack, computeLayout } from '../../../index';
import { solidAt, threeLayers, topNotch, wasm } from '../../../testing';
import { fittedOf, K, seatDims } from './index';

describe('fitted variant', () => {
	it('narrows the bottom of the upper layers by the wall, with a 45° shoulder', () => {
		const g = buildStack(wasm, threeLayers());
		const { inner, tolerance: tol, wall, layers } = g.layout;
		const seat = seatDims(wall, tol);
		expect(g.layout.seam.overlap).toBe(seat.depth);
		const hy = inner.width / 2;
		const y = (d: number) => -hy + d;
		const upper = g.layers[1];
		// the straight part: gone outside, solid just inside its outer face
		expect(solidAt(upper, K.nose.length, y(tol - 0.1), 0.5)).toBe(false);
		expect(solidAt(upper, 0, y(tol + 0.1), 0.5)).toBe(true);
		// on the shoulder the outer face moves 1:1 with the height
		const z = seat.depth - 0.5;
		const face = tol - seat.chamfer + 0.5;
		expect(solidAt(upper, 0, y(face - 0.1), z)).toBe(false);
		expect(solidAt(upper, 0, y(face + 0.1), z)).toBe(true);
		// full wall above it, and the base stays full at the bottom
		expect(solidAt(upper, 0, y(-wall + 0.1), seat.depth + 0.5)).toBe(true);
		expect(solidAt(g.layers[0], 0, y(-wall + 0.1), 0.5)).toBe(true);
		// the top of the base is chamfered from the inside, leaving a rim outside
		const H = layers[0].height;
		expect(solidAt(g.layers[0], 0, y(-0.5), H - 0.1)).toBe(false);
		expect(solidAt(g.layers[0], 0, y(-wall + 0.1), H - 0.1)).toBe(true);
	});

	it('has no lips and leaves nothing above the top edge', () => {
		const g = buildStack(wasm, threeLayers());
		for (const [i, m] of g.layers.entries()) {
			let top = -Infinity;
			for (let k = 2; k < m.positions.length; k += 3) top = Math.max(top, m.positions[k]);
			expect(top, `layer ${i + 1}`).toBeCloseTo(g.layout.layers[i].height, 3);
		}
	});

	it('clicks a tiny nose on each wall into a dimple in the part below', () => {
		const g = buildStack(wasm, threeLayers());
		const { inner, tolerance: tol, wall, layers } = g.layout;
		const seat = seatDims(wall, tol);
		const hy = inner.width / 2;
		const L = K.nose.length;
		const zc = seat.noseZ + seat.noseOut;
		const tip = -hy + tol - seat.noseOut + 0.1;
		const snaps = (i: number) => fittedOf.get(layers[i])!.snaps;
		for (const i of layers.keys()) expect(snaps(i)).toHaveLength(4);
		const front = (i: number) => snaps(i).find((s) => s.side === 'front')!;
		// nose on the upper layer and on the lid, nothing beside it
		expect(solidAt(g.layers[1], front(0).u, tip, zc)).toBe(true);
		expect(solidAt(g.layers[1], front(0).u + L, tip, zc)).toBe(false);
		expect(solidAt(g.lid, front(2).u, tip, zc)).toBe(true);
		// dimple in the wall below, the wall stays closed behind it and solid beside it
		const z = layers[0].height - seat.depth + zc;
		expect(solidAt(g.layers[0], front(0).u, -hy - 0.2, z)).toBe(false);
		expect(solidAt(g.layers[0], front(0).u, -hy - seat.recess - 0.1, z)).toBe(true);
		expect(solidAt(g.layers[0], front(0).u + L, -hy - 0.2, z)).toBe(true);
	});

	it('keeps the noses away from the openings', () => {
		const p = threeLayers();
		topNotch(p, 0, 'front', 0, 8, 5);
		const [base] = computeLayout(p).layers;
		const front = fittedOf.get(base)!.snaps.find((s) => s.side === 'front')!;
		expect(Math.abs(front.u)).toBeGreaterThanOrEqual(4 + K.nose.length / 2);
	});
});
