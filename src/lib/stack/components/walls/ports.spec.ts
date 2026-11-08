import { describe, expect, it } from 'vitest';
import { computeLayout as caseLayout } from '../../case/layout';
import { buildStack } from '../../index';
import { WALL_IDS, type WallId } from '../../schema';
import { bare, board, isClosed, project, solidAt, threeLayers, wasm } from '../../testing';
import { portsOf, type PortCover } from './index';

/** Point in the wall frame of a port: a along the wall, d inwards from the inner wall face. */
const inWall = (g: ReturnType<typeof buildStack>, c: PortCover, a: number, d: number) => {
	const hx = g.layout.inner.length / 2;
	const hy = g.layout.inner.width / 2;
	return {
		front: [c.u + a, -hy + d],
		back: [c.u + a, hy - d],
		left: [-hx + d, c.u + a],
		right: [hx - d, c.u + a]
	}[c.side] as [number, number];
};

describe('port notches with plain walls', () => {
	it('cuts a notch for every port at a wall', () => {
		const p = threeLayers();
		const base = portsOf.get(caseLayout(p, bare(p)).layers[0])!;
		expect(base.notches.map((n) => n.label)).toContain('Micro-USB');
		expect(base.covers.length).toBe(base.notches.length);
	});
});

describe.each(WALL_IDS)('port notches (%s)', (variant: WallId) => {
	it('closes the port notches of the top layer from the lid, down to the port', () => {
		for (const wall of [2, 3]) {
			const p = project(variant);
			p.wall = wall;
			p.layers[0].boards = [board('esp32-devkitc-38')];
			const g = buildStack(wasm, p);
			expect(isClosed(g.lid.indices)).toBe(true);
			const l = g.layout.layers[0];
			const c = portsOf.get(l)!.covers[0];
			expect(c).toBeDefined();
			const z = c.z0 - (l.height - g.layout.seam.overlap);
			expect(z).toBeLessThan(0);
			const tol = g.layout.tolerance;
			const plug = solidAt(g.lid, ...inWall(g, c, 0, -wall + 0.1), z + 0.1);
			if (variant === 'slide') {
				// the lid slides on: nothing may reach down into the notch
				expect(plug).toBe(false);
				continue;
			}
			expect(plug).toBe(true);
			expect(solidAt(g.lid, ...inWall(g, c, 0, -wall + 0.1), z - 0.1)).toBe(false);
			expect(solidAt(g.lid, ...inWall(g, c, c.width / 2 - tol + 0.1, -wall + 0.1), z + 0.1)).toBe(
				false
			);
		}
	});
});

describe('port notches with a part reaching in from above (fitted)', () => {
	it('closes the port notches from the bottom part of the layer above', () => {
		for (const wall of [2, 3]) {
			const p = threeLayers('fitted');
			p.wall = wall;
			const g = buildStack(wasm, p);
			for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices)).toBe(true);
			const { tolerance: tol } = g.layout;
			const c = portsOf.get(g.layout.layers[0])!.covers[0];
			expect(c).toBeDefined();
			// plug in the notch, flush outside, on the bed side of the upper layer
			expect(solidAt(g.layers[1], ...inWall(g, c, 0, -wall + 0.1), 0.05)).toBe(true);
			expect(solidAt(g.layers[1], ...inWall(g, c, c.width / 2 - tol + 0.1, -wall + 0.1), 0.5)).toBe(
				false
			);
			// the narrow part stays closed behind it
			expect(solidAt(g.layers[1], ...inWall(g, c, 0, tol + 0.1), 0.5)).toBe(true);
			// nothing below the layer's flat bottom
			expect(Math.min(...g.layers[1].positions.filter((_, i) => i % 3 === 2))).toBeCloseTo(0);
			// and the lid reaches down to the port
			const single = project('fitted');
			single.wall = wall;
			single.layers[0].boards = p.layers[0].boards;
			const s = buildStack(wasm, single);
			const sc = portsOf.get(s.layout.layers[0])!.covers[0];
			const z = sc.z0 - (s.layout.layers[0].height - s.layout.seam.overlap);
			expect(z).toBeLessThan(0);
			expect(solidAt(s.lid, ...inWall(s, sc, 0, -wall + 0.1), z + 0.1)).toBe(true);
			expect(solidAt(s.lid, ...inWall(s, sc, 0, -wall + 0.1), z - 0.1)).toBe(false);
		}
	});
});
