import { describe, expect, it } from 'vitest';
import { buildStack as buildCase } from '../../case/geometry';
import { computeLayout as caseLayout } from '../../case/layout';
import { buildStack, computeLayout } from '../../index';
import { LIBRARY } from '../../library';
import { pinPositions } from '../../parts';
import { WALL_IDS, newLayer } from '../../schema';
import { bare, isClosed, kit, plainWalls, toManifold, wasm, withPins } from '../../testing';
import { PORTS } from '../walls';
import { cradleOf, K } from './index';

describe('the cradle with plain walls', () => {
	it('carries and holds the boards without a joint', () => {
		const p = withPins('esp32-devkit-v1-30', 'none');
		const plain = kit(p, { walls: plainWalls });
		const layout = caseLayout(p, plain);
		const data = cradleOf.get(layout.layers[0])!;
		expect(data.boards[0].supports.length).toBeGreaterThan(0);
		expect(data.holds[0].latches.length).toBeGreaterThan(0);
		const g = buildCase(wasm, p, plain);
		for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices)).toBe(true);
		expect(toManifold(g.layers[0]).volume()).toBeGreaterThan(
			toManifold(buildCase(wasm, p, bare(p)).layers[0]).volume()
		);
	});
});

describe.each(WALL_IDS)('cradle (%s)', (variant) => {
	const pins = (defId: string, side: 'bottom' | 'top' | 'none') => withPins(defId, side, variant);

	it('keeps support pads clear of the pins and still carries the board', () => {
		for (const def of LIBRARY) {
			if (!def.pins?.length) continue;
			for (const side of ['bottom', 'top'] as const) {
				const l = computeLayout(pins(def.id, side)).layers[0];
				const { supports } = cradleOf.get(l)!.boards[0];
				expect(supports.length, `${def.id} ${side}`).toBeGreaterThan(0);
				for (const s of supports)
					for (const [x, y] of pinPositions(def)) {
						const inX = x > s.x0 - 0.32 && x < s.x1 + 0.32;
						const inY = s.spans.some(([a, c]) => y > a - 0.32 && y < c + 0.32);
						expect(inX && inY, `${def.id} ${side} pin ${x},${y}`).toBe(false);
					}
			}
		}
	});

	it('leaves no gap beside the supports below the PCB', () => {
		// port on the left at the wall, rim on the right; this board's pads are inset in the library
		for (const wall of [2, 3]) {
			const project = pins('esp32-devkit-v1-30', 'none');
			project.wall = wall;
			const layout = computeLayout(project);
			const [b] = layout.layers[0].boards;
			const hl = b.def.length / 2;
			// the wall face at the port edge: the inner face, or the pocket in a thick wall
			const face = -layout.inner.length / 2 - Math.max(0, wall - PORTS.portWall);
			expect(b.rect.x0, `wall ${wall}`).toBeCloseTo(face + project.tolerance, 6);
			const layer = toManifold(buildStack(wasm, project).layers[0]);
			const solid = (x0: number, x1: number) => {
				const size: [number, number, number] = [x1 - x0, 2, b.zPcb - 0.7];
				// beside the pry slot in the middle of the edge
				const probe = wasm.Manifold.cube(size).translate([x0, b.cy + 5, 0.5]);
				expect(layer.intersect(probe).volume(), `wall ${wall}`).toBeCloseTo(probe.volume(), 3);
			};
			solid(b.cx + hl - 1, b.cx + hl + project.tolerance + 0.5);
			solid(face - 0.2, b.cx - hl + 1);
		}
	});

	it('holds every board down: lip at the port wall, latch with a nose opposite', () => {
		for (const def of LIBRARY) {
			const layout = computeLayout(pins(def.id, 'none'));
			const [hold] = cradleOf.get(layout.layers[0])!.holds;
			const ports = new Set(def.ports.map((p) => p.side));
			// too small for a latch: says so
			if (def.id === 'led-5mm') {
				expect(layout.warnings.join(), def.id).toContain("isn't held down");
				continue;
			}
			expect(hold.latches.length, def.id).toBeGreaterThan(0);
			if (ports.size) expect(hold.lip, def.id).not.toBeNull();
		}
	});

	it('small lips and noses sit in the corners, reach over the PCB and are rigid', () => {
		const project = pins('esp32-devkit-v1-30', 'none');
		const tol = project.tolerance;
		const layout = computeLayout(project);
		const [b] = layout.layers[0].boards;
		const [hold] = cradleOf.get(layout.layers[0])!.holds;
		const hl = b.def.length / 2;
		const hw = b.def.width / 2;
		// two of each, one in each corner, nothing in the middle
		expect(hold.lip?.side).toBe('left');
		expect(hold.lip!.spans).toHaveLength(2);
		expect(hold.lip!.spans[0][0]).toBeCloseTo(-hw, 6);
		expect(hold.lip!.spans[1][1]).toBeCloseTo(hw, 6);
		expect(hold.latches.map((l) => l.side)).toEqual(['right', 'right']);
		expect(hold.latches[0].u).toBeLessThan(-hw / 2);
		expect(hold.latches[1].u).toBeGreaterThan(hw / 2);
		for (const l of hold.latches) expect(l.width).toBeLessThanOrEqual(K.hold.latchWidth);
		const layer = toManifold(buildStack(wasm, project).layers[0]);
		const vol = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
			layer
				.intersect(
					wasm.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([b.cx + x0, b.cy + y0, z0])
				)
				.volume();
		const above = [b.zPcbTop + K.hold.clear + 0.05, b.zPcbTop + K.hold.clear + 0.3] as const;
		// lips over the port edge, noses over the far edge, nothing over the middle
		for (const [a0, a1] of hold.lip!.spans)
			expect(vol(-hl, -hl + 0.3, a0, a1, ...above)).toBeGreaterThan(0);
		for (const lt of hold.latches)
			expect(vol(hl - 0.2, hl, lt.u - lt.width / 2, lt.u + lt.width / 2, ...above)).toBeGreaterThan(
				0
			);
		expect(vol(-hl, -hl + 0.3, -2, 2, ...above)).toBeCloseTo(0, 6);
		expect(vol(hl - 0.2, hl, -2, 2, ...above)).toBeCloseTo(0, 6);
		// nothing in the PCB itself, and the PCB rests in the clear below them
		expect(vol(-hl, hl, -hw, hw, b.zPcb, b.zPcbTop + K.hold.clear)).toBeCloseTo(0, 4);
		// a support below every hook, one piece with it
		for (const [a0, a1] of hold.lip!.spans)
			expect(vol(-hl, -hl + K.hold.reach - 0.05, a0, a1, 0.1, b.zPcb - 0.05)).toBeCloseTo(
				(K.hold.reach - 0.05) * (a1 - a0) * (b.zPcb - 0.15),
				3
			);
		for (const l of hold.latches) {
			const [a0, a1] = [l.u - l.width / 2, l.u + l.width / 2];
			expect(vol(hl - K.hold.reach + 0.05, hl + tol, a0, a1, 0.1, b.zPcb - 0.05)).toBeCloseTo(
				(K.hold.reach - 0.05 + tol) * (a1 - a0) * (b.zPcb - 0.15),
				3
			);
		}
		// a pry slot in the middle of the nose edge: open through the rim, below and under the PCB
		expect(hold.pry).toHaveLength(1);
		const p = hold.pry[0];
		expect(p.side).toBe('right');
		expect(Math.abs(p.u)).toBeLessThan(hw / 2);
		const [p0, p1] = [p.u - p.width / 2 + 0.05, p.u + p.width / 2 - 0.05];
		const zs = b.zPcb - K.hold.pryDepth + 0.05;
		expect(
			vol(hl - K.hold.pryUnder + 0.05, hl + tol + K.supportRim, p0, p1, zs, b.zPcbTop)
		).toBeCloseTo(0, 6);
		// beside the slot the support stays solid
		expect(vol(hl - 1, hl, p1 + 0.2, p1 + 0.7, zs, b.zPcb - 0.05)).toBeCloseTo(
			0.5 * (b.zPcb - 0.05 - zs),
			3
		);
		// no spring: solid behind the nose, down to the floor
		const lt = hold.latches[0];
		const [a0, a1] = [lt.u - lt.width / 2, lt.u + lt.width / 2];
		const z1 = b.zPcbTop;
		expect(vol(hl + tol, hl + tol + K.supportRim, a0, a1, 0, z1)).toBeCloseTo(
			K.supportRim * lt.width * z1,
			3
		);
	});

	it('holds boards in an upper layer too', () => {
		const project = pins('esp32-devkit-v1-30', 'none');
		project.layers.unshift(newLayer());
		const layout = computeLayout(project);
		const tier = layout.layers[1];
		const [b] = tier.boards;
		const [hold] = cradleOf.get(tier)!.holds;
		const hl = b.def.length / 2;
		const layer = toManifold(buildStack(wasm, project).layers[1]);
		const vol = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
			layer
				.intersect(
					wasm.Manifold.cube([x1 - x0, y1 - y0, z1 - z0]).translate([b.cx + x0, b.cy + y0, z0])
				)
				.volume();
		const above = [b.zPcbTop + K.hold.clear + 0.05, b.zPcbTop + K.hold.clear + 0.3] as const;
		for (const [a0, a1] of hold.lip!.spans)
			expect(vol(-hl, -hl + 0.3, a0, a1, ...above)).toBeGreaterThan(0);
		for (const lt of hold.latches)
			expect(vol(hl - 0.2, hl, lt.u - lt.width / 2, lt.u + lt.width / 2, ...above)).toBeGreaterThan(
				0
			);
	});

	it('builds closed meshes for every pin side', () => {
		for (const side of ['bottom', 'top', 'none'] as const) {
			const g = buildStack(wasm, pins('bme280', side));
			for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices), side).toBe(true);
		}
	});
});

it('keeps every pin inside its board outline', () => {
	for (const def of LIBRARY)
		for (const [x, y] of pinPositions(def)) {
			expect(Math.abs(x), def.id).toBeLessThan(def.length / 2);
			expect(Math.abs(y), def.id).toBeLessThan(def.width / 2);
		}
});
