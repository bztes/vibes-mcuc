import { describe, expect, it } from 'vitest';
import { buildStack as buildCase } from './case/geometry';
import { WALLS } from './components';
import { portsOf } from './components/walls';
import { clipsOf, K as CLIPS } from './components/walls/clips';
import { buildStack, computeLayout } from './index';
import { LIBRARY } from './library';
import { WALL_IDS, defaultProject, newLayer, type WallId } from './schema';
import {
	board,
	isClosed,
	kit,
	noCradle,
	plainWalls,
	project,
	solidAt,
	stacked,
	threeLayers,
	toManifold,
	wasm
} from './testing';

describe.each(WALL_IDS)('a stack with the %s variant', (variant) => {
	it('is built from the chosen walls, cradle, floor, deck and top', () => {
		expect(buildStack(wasm, project(variant)).layout.components).toEqual([
			'openings',
			variant,
			'cradle',
			'floor',
			'deck',
			'top'
		]);
	});

	it('builds a new project as an empty case', () => {
		const g = buildStack(wasm, project(variant));
		for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices)).toBe(true);
	});

	it('builds closed meshes for every layer and the lid', () => {
		const g = buildStack(wasm, threeLayers(variant));
		expect(g.layers).toHaveLength(3);
		for (const m of [...g.layers, g.lid]) {
			expect(m.indices.length).toBeGreaterThan(0);
			expect(isClosed(m.indices)).toBe(true);
			expect(toManifold(m).volume()).toBeGreaterThan(100);
		}
	});

	it('every library part builds as a single board in each rotation', () => {
		for (const def of LIBRARY) {
			for (const rotation of [0, 90, 180, 270] as const) {
				const p = project(variant);
				p.layers[0].boards = [board(def.id, rotation)];
				p.layers.push(newLayer());
				const g = buildStack(wasm, p);
				for (const m of [...g.layers, g.lid])
					expect(isClosed(m.indices), `${def.id} @${rotation}`).toBe(true);
			}
		}
	}, 120_000);

	it('fits the layers into each other for thin and thick walls and any fit', () => {
		for (const [wall, tolerance] of [
			[1.2, 0.2],
			[2, 0.2],
			[3, 0.2],
			[5, 0.2],
			[2, 0],
			[2, 1]
		]) {
			const p = threeLayers(variant);
			p.wall = wall;
			p.tolerance = tolerance;
			const g = buildStack(wasm, p);
			for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices), `wall ${wall}`).toBe(true);
			const placed = stacked(g);
			for (let i = 0; i + 1 < placed.length; i++)
				expect(
					placed[i].intersect(placed[i + 1]).volume(),
					`wall ${wall} fit ${tolerance}`
				).toBeLessThan(0.01);
		}
	});

	it('has no warnings for a typical stack', () => {
		expect(buildStack(wasm, threeLayers(variant)).layout.warnings).toEqual([]);
	});

	it('builds without a cradle, and with plain walls', () => {
		const p = threeLayers(variant);
		for (const [name, k] of [
			['no cradle', kit(p, { cradle: noCradle })],
			['plain walls', kit(p, { walls: plainWalls })]
		] as const) {
			const g = buildCase(wasm, p, k);
			for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices), name).toBe(true);
			const placed = stacked(g);
			for (let i = 0; i + 1 < placed.length; i++)
				expect(placed[i].intersect(placed[i + 1]).volume(), name).toBeLessThan(0.01);
		}
	}, 60_000);
});

it('describes every variant for the editor', () => {
	for (const id of WALL_IDS) {
		const c = WALLS[id];
		expect(c.id).toBe(id);
		for (const text of [c.label, c.note, c.lidNote, c.fitHint])
			expect(text.length).toBeGreaterThan(3);
	}
});

describe('boards reaching into the lid (clips only)', () => {
	/** One devkit in the base, its USB port at the left wall. */
	const single = (variant: WallId, inside: boolean) => {
		const p = project(variant);
		p.layers[0].boards = [board('esp32-devkitc-38')];
		p.lid.boardsInside = inside;
		return p;
	};
	/** A two-layer stack with the given boards in the top layer. */
	const topLayer = (variant: WallId, inside: boolean, defIds: string[]) => {
		const p = threeLayers(variant);
		p.layers.length = 2;
		p.layers[1].boards = defIds.map((id) => board(id));
		p.lid.boardsInside = inside;
		return p;
	};

	it('is off by default and changes nothing then', () => {
		expect(defaultProject().lid.boardsInside).toBe(false);
		for (const variant of WALL_IDS) expect(computeLayout(threeLayers(variant)).lid.reach).toBe(0);
	});

	it('changes nothing with the other walls', () => {
		for (const variant of ['fitted', 'slide'] as const)
			for (const ids of [[], ['bme280'], ['oled-096']]) {
				const [off, on] = [false, true].map((i) => computeLayout(topLayer(variant, i, ids)));
				expect(
					on.layers.map((l) => l.height),
					variant
				).toEqual(off.layers.map((l) => l.height));
				expect(on.lid.reach).toBe(0);
			}
	});

	it('lowers the top layer by up to the room inside the lid, with a shorter clip', () => {
		for (const ids of [[], ['bme280'], ['oled-096']]) {
			const off = computeLayout(topLayer('clips', false, ids));
			const on = computeLayout(topLayer('clips', true, ids));
			const [lo, hi] = [on.layers[1].height, off.layers[1].height];
			expect(lo, ids.join()).toBeLessThan(hi);
			expect(hi - lo).toBeLessThanOrEqual(on.lid.edge + 0.5);
			expect(on.warnings).toEqual([]);
			// the clip into the lid: slits from the top edge down to 1 mm above the floor
			const [base, top] = on.layers;
			expect(clipsOf.get(base)!.drop).toBe(CLIPS.clip.drop);
			const drop = clipsOf.get(top)!.drop;
			expect(drop).toBeGreaterThanOrEqual(CLIPS.clip.minDrop);
			expect(drop).toBeLessThanOrEqual(top.height - top.zBase - 1 + 0.01);
		}
	});

	it('keeps the walls with ports as high as before and lowers the walls with the clips', () => {
		const g = buildStack(wasm, single('clips', true));
		const flat = computeLayout(single('clips', false));
		const l = g.layout.layers[0];
		const { raised } = g.layout.lid;
		// the USB port is at the left wall
		expect(raised.sides).toEqual(['left', 'right']);
		expect(l.height + raised.by).toBeCloseTo(flat.layers[0].height, 6);
		const { inner, wall } = g.layout;
		const [hx, hy] = [inner.length / 2, inner.width / 2];
		const z = l.height + raised.by - 0.5;
		// raised: the right wall (the left one has the notch for the port)
		expect(solidAt(g.layers[0], hx + wall / 2, 0, z)).toBe(true);
		// lowered: front and back, where the clips into the lid are
		expect(solidAt(g.layers[0], 0, -hy - wall / 2, z)).toBe(false);
		for (const c of clipsOf.get(l)!.clipsUp) expect(['front', 'back']).toContain(c.side);
		// the lid is shorter over the raised walls, full over the others
		expect(solidAt(g.lid, hx + wall / 2, 0, 0.5)).toBe(false);
		expect(solidAt(g.lid, 0, -hy - wall / 2, 0.5)).toBe(true);
		// and keeps its corners: the raised part runs along the boards only
		const [a0, a1] = raised.spans.right!;
		expect(a1 - a0).toBeLessThan(inner.width);
		// exactly as wide as the cradle
		const [b] = l.boards;
		expect([a0, a1]).toEqual([b.outer.y0, b.outer.y1]);
		expect(solidAt(g.lid, hx + wall / 2, hy - 0.5, 0.5)).toBe(true);
		expect(solidAt(g.layers[0], hx + wall / 2, hy - 0.5, z)).toBe(false);
		// the lid closes the port notch in the raised wall above the port
		const c = portsOf.get(l)!.covers[0];
		const zc = c.z0 - l.height;
		expect(zc).toBeLessThan(raised.by - 0.5);
		expect(solidAt(g.lid, -hx - wall / 2, c.u, raised.by - 0.3)).toBe(true);
		expect(solidAt(g.lid, -hx - wall / 2, c.u, zc - 0.3)).toBe(false);
		// what holds the board is whole: nothing floats
		const pieces = toManifold(g.layers[0]).decompose();
		expect(pieces.filter((m) => m.volume() > 0.001)).toHaveLength(1);
		for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices)).toBe(true);
		const [layer, lid] = stacked(g);
		expect(layer.intersect(lid).volume()).toBeLessThan(0.01);
	});

	it('gives no room in the lid with ports on walls next to each other', () => {
		const p = topLayer('clips', true, []);
		// USB at the left wall, and at the front or back wall
		p.layers[1].boards = [
			{ ...board('esp32-c3-supermini', 0), x: -30 },
			{ ...board('esp32-c3-supermini', 90), x: 30 }
		];
		const on = computeLayout(p);
		const top = on.layers[1];
		expect(top.flush.left).toBe(true);
		expect(top.flush.front || top.flush.back).toBe(true);
		p.lid.boardsInside = false;
		expect(top.height).toBe(computeLayout(p).layers[1].height);
		expect(on.lid.raised.by).toBe(0);
	});

	it('builds a lower stack whose parts still fit', () => {
		for (const ids of [[], ['bme280'], ['oled-096']]) {
			const g = buildStack(wasm, topLayer('clips', true, ids));
			for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices), ids.join()).toBe(true);
			const placed = stacked(g);
			for (let i = 0; i + 1 < placed.length; i++)
				expect(placed[i].intersect(placed[i + 1]).volume(), ids.join()).toBeLessThan(0.01);
		}
	});
});
