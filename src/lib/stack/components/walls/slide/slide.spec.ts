import { describe, expect, it } from 'vitest';
import { buildStack, computeLayout } from '../../../index';
import { solidAt, threeLayers, toManifold, topNotch, wasm } from '../../../testing';
import { K, lidSlideOf, lockDims, lockWallsOf, slideOf, type Lock } from './index';

describe('slide variant', () => {
	/** Every seam as (lower, upper) placed in the lower layer's frame. */
	function seams(g: ReturnType<typeof buildStack>) {
		const parts = [...g.layers, g.lid];
		return g.layout.layers.map((l, i) => ({
			seam: slideOf.get(l)!.up,
			lower: toManifold(parts[i]),
			upper: (dx: number, dz = 0) => {
				const [ax, ay] = lockWallsOf.get(g.layout)![0] === 'front' ? [dx, 0] : [0, dx];
				return toManifold(parts[i + 1], l.height + dz).translate([ax, ay, 0]);
			}
		}));
	}
	/**
	 * Whether every real overlap (faces that only touch don't count) is where a nose snaps past
	 * its ridge, which the wall above is meant to give for. `shift` = how far the part above is off.
	 */
	const onNose = (
		g: ReturnType<typeof buildStack>,
		hooks: Lock[],
		m: InstanceType<typeof wasm.Manifold>,
		shift: number
	) => {
		const ld = lockDims(g.layout.wall, g.layout.tolerance);
		const N = K.nose;
		return m
			.decompose()
			.filter((q) => q.volume() > 0.01)
			.every((q) => {
				const { min, max } = q.boundingBox();
				const [a0, a1] =
					lockWallsOf.get(g.layout)![0] === 'front' ? [min[0], max[0]] : [min[1], max[1]];
				return hooks.some((h) => {
					const r = ld.nose.ridge(h.u) + shift;
					return (
						a0 >= r - N.ridgeTip - ld.nose.ridgeRun - 0.01 &&
						a1 <= r + N.ridgeTip + ld.nose.ridgeRun + 0.01
					);
				});
			});
	};

	it('puts hooks on both lock walls of each seam', () => {
		const layout = computeLayout(threeLayers('slide'));
		const { layers, lid } = layout;
		const up = (i: number) => slideOf.get(layers[i])!.up;
		for (const i of layers.keys()) {
			for (const side of lockWallsOf.get(layout)!)
				expect(up(i).hooks.some((h) => h.side === side)).toBe(true);
		}
		expect(lidSlideOf.get(lid)!.down).toBe(up(2));
		expect(slideOf.get(layers[1])!.down).toBe(up(0));
	});

	it('sets a part down 1 cm off and slides it home: only the noses snap past their ridges', () => {
		const g = buildStack(wasm, threeLayers('slide'));
		const T = K.slide.travel;
		const ld = lockDims(g.layout.wall, g.layout.tolerance);
		for (const [i, { seam, lower, upper }] of seams(g).entries()) {
			for (const s of [T, 0.75 * T, 0.5 * T, 0.25 * T, 1.5, 1, 0.5]) {
				const hit = lower.intersect(upper(s));
				if (hit.volume() > 0.01)
					expect(onNose(g, seam.hooks, hit, s), `seam ${i + 1} at ${s}`).toBe(true);
			}
			// dropped in from above at the start, nothing in the way
			expect(lower.intersect(upper(T, 3)).volume(), `seam ${i + 1} drop`).toBeLessThan(0.01);
			// on the ridge: every nose is pressed, a little
			const h = seam.hooks[0];
			const click = lower.intersect(upper(h.u - ld.nose.ridge(h.u)));
			expect(click.volume(), `seam ${i + 1} click`).toBeGreaterThan(0.01 * seam.hooks.length);
			expect(click.volume(), `seam ${i + 1} click`).toBeLessThan(0.1 * seam.hooks.length);
			// locked: the nose is past its ridge, nothing touches
			expect(lower.intersect(upper(0)).volume(), `seam ${i + 1} locked`).toBeLessThan(0.01);
		}
	});

	it('the hooks keep a locked part down; at the entry it lifts off', () => {
		const g = buildStack(wasm, threeLayers('slide'));
		const T = K.slide.travel;
		for (const { lower, upper } of seams(g)) {
			const lifted = lower.intersect(upper(0, 0.5));
			expect(lifted.volume()).toBeGreaterThan(1);
			// held on both walls
			const { min, max } = lifted.boundingBox();
			expect(max[0] - min[0] + max[1] - min[1]).toBeGreaterThan(g.layout.inner.width);
			expect(lower.intersect(upper(T, 0.5)).volume()).toBeLessThan(0.01);
		}
	});

	it('the post stops the slide at the locked position', () => {
		const g = buildStack(wasm, threeLayers('slide'));
		for (const { lower, upper } of seams(g))
			expect(lower.intersect(upper(-0.5)).volume()).toBeGreaterThan(0.1);
	});

	it('only the hooks rise above the top edge, all inside the wall', () => {
		const g = buildStack(wasm, threeLayers('slide'));
		const { inner, wall, tolerance } = g.layout;
		const ld = lockDims(wall, tolerance);
		for (const [i, m] of g.layers.entries()) {
			const H = g.layout.layers[i].height;
			const above = toManifold(m).intersect(
				wasm.Manifold.cube([1000, 1000, 100], true).translate([0, 0, H + 50.01])
			);
			const { hooks } = slideOf.get(g.layout.layers[i])!.up;
			const expected =
				hooks.length *
				(K.slide.length * (ld.stem * ld.top + ld.reach * (K.slide.tip + ld.reach / 2)) +
					(K.nose.base + K.nose.tip) * ld.nose.out * (ld.nose.z1 - ld.nose.z0));
			expect(above.volume(), `layer ${i + 1}`).toBeGreaterThan(expected * 0.8);
			expect(above.volume(), `layer ${i + 1}`).toBeLessThan(expected * 1.2);
			// nothing reaches into the room
			const room = wasm.Manifold.cube([inner.length - 0.1, inner.width - 0.1, 100], true);
			expect(above.intersect(room.translate([0, 0, H + 50])).volume()).toBeLessThan(0.01);
		}
	});

	it('the wall above is hollowed from the inside; outside it stays closed', () => {
		const g = buildStack(wasm, threeLayers('slide'));
		const { wall, tolerance } = g.layout;
		const ld = lockDims(wall, tolerance);
		const hy = g.layout.inner.width / 2;
		const T = K.slide.travel;
		const parts = [...g.layers, g.lid];
		const y = (e: number) => -hy - e;
		for (const [i, l] of g.layout.layers.entries()) {
			const h = slideOf.get(l)!.up.hooks.find((k) => k.side === 'front')!;
			const above = parts[i + 1];
			const z = ld.fingerZ - 0.4;
			const n = ld.nose;
			const keeper = ld.stem + n.out + tolerance + 0.05;
			// under the finger: open at the entry, keeper where it locks
			expect(solidAt(above, h.u - T, y(keeper), z)).toBe(false);
			expect(solidAt(above, h.u, y(keeper), z)).toBe(true);
			// the nose runs free in a slot, but for the ridge
			const ridge = ld.stem + n.out - n.grip + 0.05;
			expect(solidAt(above, n.ridge(h.u), y(ridge), z)).toBe(true);
			expect(solidAt(above, h.u - T / 2, y(ridge), z)).toBe(false);
			expect(solidAt(above, h.u, y(ridge), z)).toBe(false);
			// the stem slides along a slot, the outer part of the wall stays
			expect(solidAt(above, h.u - T / 2, y(ld.stem - 0.1), z)).toBe(false);
			expect(solidAt(above, h.u - T / 2, y(ld.outer + 0.1), z)).toBe(true);
			for (const zz of [0.3, ld.top]) expect(solidAt(above, h.u - T, y(wall - 0.1), zz)).toBe(true);
		}
	});

	it('keeps the hooks away from the openings', () => {
		const p = threeLayers('slide');
		topNotch(p, 0, 'front', 0, 8, 5);
		const { up } = slideOf.get(computeLayout(p).layers[0])!;
		const ld = lockDims(2.5, 0.2);
		for (const h of up.hooks.filter((h) => h.side === 'front')) {
			const [a0, a1] = ld.locked(h.u);
			expect(a1 < -4 || a0 > 4).toBe(true);
		}
	});

	it('stacks the parts flat and leaves the port notches open', () => {
		const { seam } = computeLayout(threeLayers('slide'));
		expect(seam.overlap).toBe(0);
		expect(seam.plugs).toBe(false);
	});
});
