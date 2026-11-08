import type { Manifold, ManifoldToplevel, Mat4, Vec2, Vec3 } from 'manifold-3d';
import type { Side } from '../parts';
import type { CaseLayout, MeshData } from './types';

export const SEGMENTS = 48;

export type Csg = ReturnType<typeof createCsg>;

/**
 * Primitives for building the parts of one case. Everything made here is freed by `dispose()`.
 *
 * Wall coordinates: a = along the wall (centred on u), d = inwards from the inner wall face,
 * z = up. Every frame is a proper rotation, so meshes keep their winding.
 */
export function createCsg(wasm: ManifoldToplevel, layout: CaseLayout) {
	const { Manifold, CrossSection } = wasm;
	const hx = layout.inner.length / 2;
	const hy = layout.inner.width / 2;
	const w = layout.wall;

	const owned: { delete(): void }[] = [];
	const t = <T extends { delete(): void }>(m: T): T => {
		owned.push(m);
		return m;
	};

	function roundedRect(wd: number, dp: number, r: number): Vec2[] {
		r = Math.min(r, wd / 2 - 0.01, dp / 2 - 0.01);
		if (r < 0.05)
			return [
				[-wd / 2, -dp / 2],
				[wd / 2, -dp / 2],
				[wd / 2, dp / 2],
				[-wd / 2, dp / 2]
			];
		const n = SEGMENTS / 4;
		const pts: Vec2[] = [];
		const corners: [number, number, number][] = [
			[wd / 2 - r, -dp / 2 + r, -90],
			[wd / 2 - r, dp / 2 - r, 0],
			[-wd / 2 + r, dp / 2 - r, 90],
			[-wd / 2 + r, -dp / 2 + r, 180]
		];
		for (const [cx, cy, a0] of corners)
			for (let i = 0; i <= n; i++) {
				const a = ((a0 + (90 * i) / n) * Math.PI) / 180;
				pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
			}
		return pts;
	}

	const prism = (poly: Vec2[], z0: number, z1: number) =>
		t(t(Manifold.extrude(t(new CrossSection([poly], 'NonZero')), z1 - z0)).translate([0, 0, z0]));

	function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
		const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
		const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
		const [az, bz] = z0 < z1 ? [z0, z1] : [z1, z0];
		return t(t(Manifold.cube([bx - ax, by - ay, bz - az])).translate([ax, ay, az]));
	}

	/** Profile in the (a, b) plane, extruded along a third axis from c0 to c1, then mapped by `mat`. */
	function profile(points: Vec2[], c0: number, c1: number, mat: Mat4) {
		const m = t(Manifold.extrude(t(new CrossSection([points], 'NonZero')), c1 - c0)).translate([
			0,
			0,
			c0
		]);
		return t(t(m).transform(mat));
	}

	const union = (list: Manifold[]) => (list.length ? t(Manifold.union(list)) : null);
	const subtract = (a: Manifold, list: Manifold[]) => {
		const u = union(list);
		return u ? t(a.subtract(u)) : a;
	};
	const intersect = (a: Manifold, b: Manifold) => t(a.intersect(b));

	function wallFrame(side: Side, u: number): Mat4 {
		switch (side) {
			case 'front':
				return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, -hy, 0, 1];
			case 'back':
				return [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, u, hy, 0, 1];
			case 'left':
				return [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, -hx, u, 0, 1];
			case 'right':
				return [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, hx, u, 0, 1];
		}
	}
	const inWall = (side: Side, u: number, m: Manifold) => t(m.transform(wallFrame(side, u)));
	/** Box in wall coordinates. */
	const wbox = (
		side: Side,
		u: number,
		a0: number,
		a1: number,
		d0: number,
		d1: number,
		z0: number,
		z1: number
	) => inWall(side, u, box(a0, a1, d0, d1, z0, z1));
	/** (d, z) profile extruded along a ∈ [a0, a1], in wall coordinates. */
	const wprofile = (side: Side, u: number, pts: Vec2[], a0: number, a1: number) =>
		// extrusion: X=d, Y=z, Z=a  →  a, d, z
		inWall(side, u, profile(pts, a0, a1, [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 1]));
	/** Convex (d, z) profile, extruded `half` to both sides along the wall. */
	const wedge = (side: Side, u: number, half: number, pts: Vec2[]) =>
		inWall(
			side,
			u,
			t(
				Manifold.hull(
					pts.flatMap(([d, z]): Vec3[] => [
						[-half, d, z],
						[half, d, z]
					])
				)
			)
		);

	// ── the case outline ────────────────────────────────────────────────
	const outerPoly = roundedRect(
		layout.inner.length + 2 * w,
		layout.inner.width + 2 * w,
		layout.cornerRadius
	);
	const innerRadius = Math.max(0.5, layout.cornerRadius - w);
	const innerPoly = roundedRect(layout.inner.length, layout.inner.width, innerRadius);
	/** The walls, from 0 to z1. */
	const shell = (z1: number) => t(prism(outerPoly, 0, z1).subtract(prism(innerPoly, -1, z1 + 1)));
	/** Footprint d inwards from the inner wall face (negative: into the wall). */
	const outline = (d: number) =>
		roundedRect(layout.inner.length - 2 * d, layout.inner.width - 2 * d, innerRadius - d);
	/** Solid between the footprints at d0 (height z0) and d1 (height z1). */
	const loft = (d0: number, z0: number, d1: number, z1: number) =>
		t(
			Manifold.hull([
				...outline(d0).map(([x, y]): Vec3 => [x, y, z0]),
				...outline(d1).map(([x, y]): Vec3 => [x, y, z1])
			])
		);
	/** Everything inside the outer outline from z0 to z1, plus a margin around it. */
	const all = (z0: number, z1: number, grow = 0) =>
		box(-hx - w - grow, hx + w + grow, -hy - w - grow, hy + w + grow, z0, z1);

	/**
	 * Where the walls of the top layer are raised (boards reaching into the lid): everything beyond
	 * their inner face, from z0 to z1, only along the boards (the lid keeps the corners). `inset`
	 * reaches into the room, and is play at the ends.
	 */
	function raisedStrips(z0: number, z1: number, inset = 0) {
		const raised = layout.lid.raised;
		const m = w + 5;
		const strips = raised.sides.map((s) => {
			const [a0, a1] = raised.spans[s]!.map((a, i) => a + (i ? inset : -inset));
			const [x0, x1, y0, y1] = {
				front: [a0, a1, -hy - m, -hy + inset],
				back: [a0, a1, hy - inset, hy + m],
				left: [-hx - m, -hx + inset, a0, a1],
				right: [hx - inset, hx + m, a0, a1]
			}[s];
			return box(x0, x1, y0, y1, z0, z1);
		});
		return union(strips);
	}

	return {
		Manifold,
		hx,
		hy,
		w,
		tol: layout.tolerance,
		t,
		roundedRect,
		prism,
		box,
		profile,
		union,
		subtract,
		intersect,
		wallFrame,
		inWall,
		wbox,
		wprofile,
		wedge,
		outerPoly,
		innerPoly,
		innerRadius,
		shell,
		outline,
		loft,
		all,
		raisedStrips,
		dispose() {
			for (const o of owned) o.delete();
			owned.length = 0;
		}
	};
}

export function toMesh(m: Manifold): MeshData {
	const mesh = m.getMesh();
	const np = mesh.numProp;
	const nv = mesh.vertProperties.length / np;
	const positions = new Float32Array(nv * 3);
	for (let i = 0; i < nv; i++) {
		positions[i * 3] = mesh.vertProperties[i * np];
		positions[i * 3 + 1] = mesh.vertProperties[i * np + 1];
		positions[i * 3 + 2] = mesh.vertProperties[i * np + 2];
	}
	return { positions, indices: new Uint32Array(mesh.triVerts) };
}
