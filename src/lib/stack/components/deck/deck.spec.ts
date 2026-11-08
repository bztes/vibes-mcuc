import { describe, expect, it } from 'vitest';
import { buildStack } from '../../index';
import { WALL_IDS, type WallId } from '../../schema';
import { threeLayers, toManifold, wasm } from '../../testing';
import { deckOf } from './index';

describe.each(WALL_IDS)('the deck (%s)', (variant: WallId) => {
	it('upper layers have a floor with openings, the base floor is closed', () => {
		const g = buildStack(wasm, threeLayers(variant));
		const [base, ...tiers] = g.layout.layers;
		expect(deckOf.get(base)).toBeUndefined();
		for (const [i, l] of tiers.entries()) {
			expect(deckOf.get(l)!.openings.length, `layer ${i + 2}`).toBeGreaterThan(1);
			// a thin slice through the floor is mostly solid, but not closed
			const slice = toManifold(g.layers[i + 1]).trimByPlane([0, 0, -1], -1);
			const full = g.layout.outer.length * g.layout.outer.width;
			const area = slice.volume();
			expect(area).toBeGreaterThan(full * 0.3);
			expect(area).toBeLessThan(full * 0.9);
		}
	});
});
