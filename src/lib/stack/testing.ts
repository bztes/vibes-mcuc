import Module from 'manifold-3d';
import type { CaseComponent, CaseKit } from './case/component';
import type { MeshData } from './case/types';
import { caseKit } from './components';
import { defineWalls } from './components/walls';
import { computeLayout } from './index';
import type { OpeningType, Side } from './parts';
import type { PinSide } from './parts';
import { defaultProject, newLayer, uid, type Board, type WallId, type ProjectData } from './schema';

/** Helpers for the specs (not shipped). */

export const wasm = await Module();
wasm.setup();

export function isClosed(indices: Uint32Array) {
	const edges = new Map<string, number>();
	for (let i = 0; i < indices.length; i += 3) {
		for (let k = 0; k < 3; k++) {
			const key = `${indices[i + k]}_${indices[i + ((k + 1) % 3)]}`;
			edges.set(key, (edges.get(key) ?? 0) + 1);
		}
	}
	for (const [key, n] of edges) {
		const [a, b] = key.split('_');
		if (n !== 1 || edges.get(`${b}_${a}`) !== 1) return false;
	}
	return true;
}

export const toManifold = (m: MeshData, dz = 0) => {
	const pos = new Float32Array(m.positions);
	for (let i = 2; i < pos.length; i += 3) pos[i] += dz;
	return new wasm.Manifold(new wasm.Mesh({ numProp: 3, vertProperties: pos, triVerts: m.indices }));
};

/** Is there material around (x, y, z), in the part's own coordinates? */
export const solidAt = (m: MeshData, x: number, y: number, z: number) => {
	const s = 0.05;
	const probe = wasm.Manifold.cube([2 * s, 2 * s, 2 * s]).translate([x - s, y - s, z - s]);
	return toManifold(m).intersect(probe).volume() > 0.5 * probe.volume();
};

export const board = (
	defId: string,
	rotation: Board['rotation'] = 0,
	pins: PinSide | null = null
) => ({
	uid: uid(),
	defId,
	x: 0,
	y: 0,
	rotation,
	elevation: null,
	pins
});

export function project(variant: WallId = 'fitted'): ProjectData {
	return { ...defaultProject(), walls: variant };
}

/** A typical stack: devkit at the bottom, a small MCU above, a display under the lid. */
export function threeLayers(variant: WallId = 'fitted'): ProjectData {
	const p = project(variant);
	p.layers[0].boards = [board('esp32-devkitc-38')];
	p.layers.push({ ...newLayer(), boards: [board('esp32-c3-supermini', 90)] });
	p.layers.push({ ...newLayer(), boards: [board('oled-096')] });
	return p;
}

/** One board in the base. */
export function withPins(defId: string, pins: PinSide, variant: WallId = 'fitted') {
	const p = project(variant);
	p.layers[0].boards = [board(defId, 0, pins)];
	return p;
}

/** Every part placed where it sits in the stack (z of the lid = its bottom edge). */
export function stacked(
	g: {
		layout: { layers: { height: number }[]; seam: { overlap: number } };
		layers: MeshData[];
		lid: MeshData;
	},
	dz = 0
) {
	let z = 0;
	return [...g.layers, g.lid].map((m, i) => {
		const mf = toManifold(m, z);
		z += (g.layout.layers[i]?.height ?? 0) - g.layout.seam.overlap + dz;
		return mf;
	});
}

/** Walls that just sit on each other: the shell, its openings and the sizing, no joint. */
export const plainWalls = defineWalls({
	id: 'plain',
	label: 'Plain',
	note: 'Parts sit on each other.',
	lidNote: 'Sits on the top layer.',
	fitHint: 'Looser if parts touch',
	thickness: 2,
	seam: () => ({ overlap: 0, inside: null, band: 0, lidEdge: 0, plugs: true })
});

/** A cradle that does nothing. */
export const noCradle: CaseComponent = { id: 'no-cradle' };

/** The project's kit with some roles swapped. */
export const kit = (p: ProjectData, parts: Partial<CaseKit> = {}): CaseKit => ({
	...caseKit(p),
	...parts
});

/** Plain walls without a cradle: the case with nothing that holds or joins. */
export const bare = (p: ProjectData) => kit(p, { walls: plainWalls, cradle: noCradle });

/** A wall opening in layer i from its top edge down by `depth` (it doesn't change the height). */
export function topNotch(
	p: ProjectData,
	i: number,
	side: Side,
	offset: number,
	width: number,
	depth: number,
	type: OpeningType = 'rect'
) {
	const H = computeLayout(p).layers[i].height;
	p.layers[i].wallOpenings.push({
		id: uid('o'),
		type,
		side,
		offset,
		z: H - depth / 2,
		width,
		height: depth
	});
}
