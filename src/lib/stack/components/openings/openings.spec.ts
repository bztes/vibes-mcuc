import { describe, expect, it } from 'vitest';
import { buildStack, computeLayout } from '../../index';
import type { OpeningType } from '../../parts';
import { WALL_IDS, type ProjectData, type WallId } from '../../schema';
import {
	board,
	isClosed,
	project,
	solidAt,
	threeLayers,
	toManifold,
	topNotch,
	wasm
} from '../../testing';
import { lidOpeningsOf, openingsOf } from './index';

/** x of the middle of the back wall's thickness, y of a point in it. */
const backWall = (p: ProjectData) => {
	const l = computeLayout(p);
	return l.inner.width / 2 + l.wall / 2;
};

const warns = (p: ProjectData, text: string) =>
	computeLayout(p).warnings.some((w) => w.includes(text));

describe('wall openings', () => {
	it('a rect that reaches the top edge opens there, and the others keep clear of it', () => {
		const p = project();
		topNotch(p, 0, 'back', 0, 8, 5);
		const [layer] = computeLayout(p).layers;
		const [o] = openingsOf.get(layer)!.walls;
		expect(o.open).toBe(true);
		expect(o.z0).toBeCloseTo(layer.height - 5);
		expect(layer.walls).toContainEqual(
			expect.objectContaining({ kind: 'opening', side: 'back', u: 0, width: 8, z1: layer.height })
		);
		const g = buildStack(wasm, p);
		const y = backWall(p);
		expect(solidAt(g.layers[0], 0, y, layer.height - 0.5)).toBe(false);
		expect(solidAt(g.layers[0], 0, y, layer.height - 5.5)).toBe(true);
	});

	it('a rect below the top edge is a window, a circle a round hole', () => {
		for (const type of ['rect', 'circle'] as OpeningType[]) {
			const p = project();
			p.layers[0].wallOpenings = [
				{ id: 'o1', type, side: 'back', offset: 0, z: 7, width: 6, height: 6 }
			];
			const g = buildStack(wasm, p);
			const [l] = g.layout.layers;
			expect(openingsOf.get(l)!.walls[0].open, type).toBe(false);
			expect(isClosed(g.layers[0].indices)).toBe(true);
			const y = backWall(p);
			expect(solidAt(g.layers[0], 0, y, 7), type).toBe(false);
			expect(solidAt(g.layers[0], 0, y, 10.5), type).toBe(true);
			expect(solidAt(g.layers[0], 0, y, 3.5), type).toBe(true);
			// a circle leaves its corners
			expect(solidAt(g.layers[0], 2.7, y, 9.7), type).toBe(type === 'circle');
		}
	});

	it('cuts openings short that reach too low, drops those above the top edge', () => {
		const p = project();
		p.layers[0].wallOpenings = [
			{ id: 'o1', type: 'rect', side: 'back', offset: 0, z: 1, width: 6, height: 6 }
		];
		expect(warns(p, 'reaches too low')).toBe(true);
		expect(openingsOf.get(computeLayout(p).layers[0])!.walls[0].z0).toBe(2);
		p.layers[0].wallOpenings[0].z = 500;
		expect(warns(p, 'above the top edge')).toBe(true);
		expect(openingsOf.get(computeLayout(p).layers[0])!.walls).toEqual([]);
	});

	it('warns about openings past the end of a wall', () => {
		const p = project();
		topNotch(p, 0, 'front', computeLayout(p).inner.length / 2, 10, 5);
		expect(warns(p, 'front wall reaches past its end')).toBe(true);
	});

	it('stays open where the part above reaches into the layer (fitted)', () => {
		const p = threeLayers('fitted');
		topNotch(p, 0, 'front', 0, 8, 5);
		const g = buildStack(wasm, p);
		for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices)).toBe(true);
		const y = -g.layout.inner.width / 2 + g.layout.tolerance + 0.5;
		expect(solidAt(g.layers[1], 0, y, 1)).toBe(false);
		expect(solidAt(g.layers[1], 8, y, 1)).toBe(true);
	});
});

describe('floor and lid openings', () => {
	it('go through the floor, the deck and the top', () => {
		const p = threeLayers();
		p.layers[2].boards = [];
		const hole = { id: 'o1', type: 'circle', x: 0, y: 0, width: 6, height: 6 } as const;
		p.layers[2].floorOpenings = [hole];
		p.lid.openings = [hole];
		const g = buildStack(wasm, p);
		expect(solidAt(g.layers[2], 0, 0, 1)).toBe(false);
		expect(solidAt(g.lid, 0, 0, g.layout.lid.height - 1)).toBe(false);
		expect(lidOpeningsOf.get(g.layout.lid)!.top).toHaveLength(1);
		const base = project();
		base.layers[0].floorOpenings = [hole];
		expect(solidAt(buildStack(wasm, base).layers[0], 0, 0, 1)).toBe(false);
	});

	it('give way to what needs solid floor, and warn', () => {
		const p = project();
		p.layers[0].boards = [board('esp32-devkitc-38')];
		const [b] = computeLayout(p).layers[0].boards;
		// right under a support pad at the board end
		const x = b.rect.x1 - 1;
		p.layers[0].floorOpenings = [{ id: 'o1', type: 'rect', x, y: 0, width: 4, height: 4 }];
		expect(warns(p, 'partly closed')).toBe(true);
		expect(solidAt(buildStack(wasm, p).layers[0], x, 0, 1)).toBe(true);
	});

	it('warn when they reach into the wall', () => {
		const p = project();
		const { inner } = computeLayout(p);
		p.layers[0].floorOpenings = [
			{ id: 'o1', type: 'rect', x: inner.length / 2, y: 0, width: 8, height: 8 }
		];
		p.lid.openings = [{ id: 'o2', type: 'rect', x: 0, y: inner.width / 2, width: 8, height: 8 }];
		expect(warns(p, 'floor opening reaches into the wall')).toBe(true);
		expect(warns(p, 'Lid: an opening reaches into the wall')).toBe(true);
		const g = buildStack(wasm, p);
		for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices)).toBe(true);
	});
});

describe.each(WALL_IDS)('openings (%s)', (variant: WallId) => {
	it('vents remove less material than rects of the same size', () => {
		const build = (type: OpeningType) => {
			const p = threeLayers(variant);
			// nothing else shows through the lid
			p.layers[2].boards = [];
			topNotch(p, 0, 'back', 0, 20, 5, type);
			p.layers[1].floorOpenings = [{ id: 'o1', type, x: 0, y: 0, width: 16, height: 10 }];
			p.lid.openings = [{ id: 'o2', type, x: 0, y: 0, width: 16, height: 10 }];
			const g = buildStack(wasm, p);
			for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices), type).toBe(true);
			return [...g.layers, g.lid].map((m) => toManifold(m).volume());
		};
		const rect = build('rect');
		const vent = build('vent');
		for (const i of [0, 3]) expect(vent[i]).toBeGreaterThan(rect[i]);
	});
});
