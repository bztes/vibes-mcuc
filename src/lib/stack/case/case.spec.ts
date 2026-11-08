import * as v from 'valibot';
import { describe, expect, it } from 'vitest';
import { buildStack as buildFull, computeLayout } from '../index';
import { PIN_HEADER, type PinSide } from '../parts';
import { WALL_IDS, defaultProject, ProjectDataSchema } from '../schema';
import { K as FLOOR } from '../components/floor';
import { K as TOP } from '../components/top';
import {
	bare,
	isClosed,
	plainWalls,
	project,
	stacked,
	threeLayers,
	toManifold,
	wasm,
	withPins
} from '../testing';
import { buildStack } from './geometry';
import { computeLayout as caseLayout } from './layout';

describe('the base case with plain walls and no cradle', () => {
	/** Three layers, the top one empty: nothing shows through the lid. */
	const plainLid = () => {
		const p = threeLayers();
		p.layers[2].boards = [];
		return p;
	};

	it('builds walls, floors and a plain lid from its components', () => {
		const p = plainLid();
		const g = buildStack(wasm, p, bare(p));
		expect(g.layout.components).toEqual(['openings', 'plain', 'no-cradle', 'floor', 'deck', 'top']);
		expect(g.layers).toHaveLength(3);
		for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices)).toBe(true);
		// parts sit flat on each other, the lid is only the plate
		expect(g.layout.seam.overlap).toBe(0);
		expect(g.layout.lid.edge).toBe(0);
		const { length, width } = g.layout.outer;
		expect(toManifold(g.lid).volume()).toBeLessThan(length * width * TOP.thickness);
		expect(toManifold(g.lid).volume()).toBeGreaterThan(0.9 * length * width * TOP.thickness);
		for (const [i, part] of stacked(g).entries())
			if (i > 0) expect(part.intersect(stacked(g)[i - 1]).volume()).toBeLessThan(0.01);
	});

	it('places the boards and sizes itself around them', () => {
		const p = threeLayers();
		const layout = caseLayout(p, bare(p));
		const [base] = layout.layers;
		const [b] = base.boards;
		expect(b.def.id).toBe('esp32-devkitc-38');
		// the USB port is at the left wall: the board goes right up to it
		expect(b.rect.x0).toBeCloseTo(-layout.inner.length / 2 + layout.tolerance, 6);
		expect(layout.inner.length).toBeGreaterThanOrEqual(b.def.length);
		expect(base.height).toBeGreaterThan(b.zTop);
		// only the port notches in the walls, nothing kept free on the floor
		for (const l of layout.layers) {
			expect(l.walls.every((w) => w.kind === 'opening')).toBe(true);
			expect(l.floorKeep).toEqual([]);
		}
		expect(base.walls.length).toBeGreaterThan(0);
		expect(layout.warnings).toEqual([]);
	});

	it('a closed box: the walls and floor are solid without openings', () => {
		const p = project();
		const g = buildStack(wasm, p, bare(p));
		const { inner, outer, wall } = g.layout;
		const H = g.layout.layers[0].height;
		const walls = outer.length * outer.width - inner.length * inner.width;
		// walls all the way up, the floor closed (rounded corners take a little)
		const expected = walls * H + inner.length * inner.width * FLOOR.thickness;
		expect(toManifold(g.layers[0]).volume()).toBeGreaterThan(0.97 * expected);
		expect(toManifold(g.layers[0]).volume()).toBeLessThan(expected);
		expect(wall).toBe(plainWalls.thickness);
	});

	it('the pin side decides how much room a board needs', () => {
		const at = (side: PinSide) => {
			const p = withPins('esp32-devkitc-38', side);
			return caseLayout(p, bare(p)).layers[0].boards[0];
		};
		expect(at('bottom').zPcb - at('bottom').zBottom).toBe(PIN_HEADER.long);
		expect(at('none').zPcb).toBeLessThan(at('bottom').zPcb);
		expect(at('top').zTop - at('top').zPcbTop).toBe(PIN_HEADER.long);
		expect(at('none').pinPoints).toEqual([]);
		expect(at('bottom').pinPoints).toHaveLength(38);
	});
});

describe.each(WALL_IDS)('case size (%s)', (variant) => {
	const auto = computeLayout(threeLayers(variant));

	it('uses the requested outside size and leaves the other sides automatic', () => {
		const p = threeLayers(variant);
		p.size.length = auto.outer.length + 20;
		const l = computeLayout(p);
		expect(l.outer.length).toBeCloseTo(auto.outer.length + 20);
		expect(l.outer.width).toBeCloseTo(auto.outer.width);
		expect(l.outer.height).toBeCloseTo(auto.outer.height);
		expect(l.warnings).toEqual([]);
	});

	it('grows to fit the boards and warns when the requested size is too small', () => {
		const p = threeLayers(variant);
		p.size.width = 10;
		p.size.height = 10;
		const l = computeLayout(p);
		expect(l.outer.width).toBeCloseTo(auto.outer.width);
		expect(l.outer.height).toBeCloseTo(auto.outer.height);
		expect(l.warnings.filter((w) => w.includes('too small'))).toHaveLength(2);
	});

	it('can go below the automatic minimum of an empty case', () => {
		const p = project(variant);
		p.size.length = 35;
		const g = buildFull(wasm, p);
		expect(g.layout.outer.length).toBeCloseTo(35);
		expect(g.layout.warnings).toEqual([]);
		for (const m of [...g.layers, g.lid]) expect(isClosed(m.indices)).toBe(true);
	});

	it('shares extra height between the layers without a height of their own', () => {
		const p = threeLayers(variant);
		p.layers[1].height = auto.layers[1].height + 2;
		p.size.height = auto.outer.height + 12;
		const l = computeLayout(p);
		expect(l.outer.height).toBeCloseTo(auto.outer.height + 12);
		expect(l.layers[0].height).toBeCloseTo(auto.layers[0].height + 5);
		expect(l.layers[1].height).toBeCloseTo(auto.layers[1].height + 2);
		expect(l.layers[2].height).toBeCloseTo(auto.layers[2].height + 5);
	});

	it('warns when every layer has a fixed height', () => {
		const p = project(variant);
		p.layers[0].height = 20;
		p.size.height = 100;
		const l = computeLayout(p);
		expect(l.layers[0].height).toBe(20);
		expect(l.warnings.some((w) => w.includes('fixed height'))).toBe(true);
	});

	it('counts the part of each layer inside the one below only once', () => {
		const { layers, lid, seam, outer } = auto;
		const sum = layers.reduce((s, l) => s + l.height, 0) + lid.height;
		expect(outer.height).toBeCloseTo(sum - layers.length * seam.overlap);
	});
});

describe('project data', () => {
	it('new projects use the fitted walls with an automatic thickness', () => {
		const p = defaultProject();
		expect(p.walls).toBe('fitted');
		expect(p.wall).toBeNull();
		expect(computeLayout(p).wall).toBe(2);
		expect(computeLayout({ ...p, walls: 'slide' }).wall).toBe(2.5);
		expect(computeLayout({ ...p, walls: 'slide', wall: 3 }).wall).toBe(3);
	});

	it('accepts what the editor saves', () => {
		const p = threeLayers('clips');
		p.wall = 2.4;
		p.tolerance = 0.4;
		expect(v.parse(ProjectDataSchema, p)).toEqual(p);
	});
});
