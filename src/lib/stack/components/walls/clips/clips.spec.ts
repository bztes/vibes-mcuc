import { describe, expect, it } from 'vitest';
import type { MeshData } from '../../../case/types';
import { buildStack, computeLayout } from '../../../index';
import { isClosed, threeLayers, toManifold, topNotch, wasm } from '../../../testing';
import { clipsOf, K, lidClipsOf, lipDims } from './index';

describe('clips variant', () => {
	it('puts one pair of clips on every seam, the lid takes the last', () => {
		const { layers, lid } = computeLayout(threeLayers('clips'));
		for (const l of layers) expect(clipsOf.get(l)!.clipsUp).toHaveLength(2);
		expect(clipsOf.get(layers[1])!.pocketsDown).toBe(clipsOf.get(layers[0])!.clipsUp);
		expect(lidClipsOf.get(lid)!.pocketsDown).toBe(clipsOf.get(layers[2])!.clipsUp);
	});

	it('has corner lips instead of columns, and slots for them in the layer above', () => {
		const g = buildStack(wasm, threeLayers('clips'));
		const { inner, tolerance: tol, layers } = g.layout;
		const hx = inner.length / 2;
		const hy = inner.width / 2;
		const L = K.cornerLip.length;
		const { d0, d1, slotDepth } = lipDims(tol);
		// volume of a small block in the front-left corner, in layer coordinates
		const inBlock = (
			m: MeshData,
			x0: number,
			x1: number,
			y0: number,
			y1: number,
			z0: number,
			z1: number
		) => {
			const b = wasm.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0]);
			return toManifold(m).intersect(b).volume();
		};
		const H0 = layers[0].height;

		// mid-height of the base: the corner is empty now
		const zm = H0 / 2;
		expect(inBlock(g.layers[0], -hx + 0.5, -hx + L, -hy + 0.5, -hy + L, zm, zm + 1)).toBeLessThan(
			0.01
		);

		// above the seam: the lip, away from the rounded corner
		const leg = inBlock(g.layers[0], -hx + 3, -hx + L - 0.5, -hy + d0, -hy + d1, H0 + 1, H0 + 2);
		expect(leg).toBeCloseTo((L - 3.5) * (d1 - d0), 2);

		// no pin or hook beyond the lip
		const beside = inBlock(
			g.layers[0],
			-hx + 3,
			-hx + L - 0.5,
			-hy + d1 + 0.05,
			-hy + 6,
			H0 + 0.5,
			H0 + 5
		);
		expect(beside).toBeLessThan(0.01);

		// the floor above is open where the lip passes, solid right behind the slot
		const open = inBlock(
			g.layers[1],
			-hx + 3,
			-hx + L - 0.5,
			-hy + 0.05,
			-hy + slotDepth - 0.05,
			0.5,
			1.5
		);
		expect(open).toBeLessThan(0.01);
		const solid = inBlock(
			g.layers[1],
			-hx + 3,
			-hx + L - 0.5,
			-hy + slotDepth + 0.05,
			-hy + slotDepth + 1,
			0.5,
			1.5
		);
		expect(solid).toBeCloseTo((L - 3.5) * 0.95, 2);
	});

	it('keeps notches at a corner open', () => {
		const p = threeLayers('clips');
		const { inner } = computeLayout(p);
		const offset = inner.length / 2 - 3;
		topNotch(p, 0, 'front', offset, 6, 5);
		const g = buildStack(wasm, p);
		for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices)).toBe(true);
		const H0 = g.layout.layers[0].height;
		const { d0, d1 } = lipDims(g.layout.tolerance);
		const hy = inner.width / 2;
		const b = wasm.Manifold.cube([3, d1 - d0, 2]).translate([offset - 1.5, -hy + d0, H0 + 1]);
		expect(toManifold(g.layers[0]).intersect(b).volume()).toBeLessThan(0.01);
	});
});
