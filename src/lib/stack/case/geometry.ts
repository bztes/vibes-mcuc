import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { ProjectData } from '../schema';
import { kitComponents, type CaseKit, type Part, type PartBuild } from './component';
import { createCsg, toMesh } from './csg';
import { computeLayout } from './layout';
import type { CaseLayout, MeshData } from './types';

export interface StackGeometry {
	layout: CaseLayout;
	/** Bottom → top, each in its own frame (z = 0 at the layer bottom). */
	layers: MeshData[];
	/** Lid in assembled orientation (z = 0 at its bottom edge). */
	lid: MeshData;
}

/**
 * Builds every layer and the lid as closed meshes from what the components contribute (walls,
 * floor, deck, top, cradle, openings). Everything is designed to print without
 * supports: layers upright, lid upside down.
 */
export function buildStack(
	wasm: ManifoldToplevel,
	project: ProjectData,
	kit: CaseKit
): StackGeometry {
	const components = kitComponents(kit);
	const layout = computeLayout(project, kit);
	const g = createCsg(wasm, layout);
	const { union, subtract, intersect, prism } = g;

	/** `top` is cut from the part; `ceiling` is how far up its fixtures may reach. */
	function build(part: Part, top: Manifold | null, ceiling: Manifold) {
		const out: PartBuild = {
			body: [],
			shellCuts: [],
			adds: [],
			cuts: [],
			fixtures: [],
			envelope: [],
			lateAdds: [],
			lateCuts: []
		};
		for (const c of components) c.build?.(g, layout, part, out);
		const body = union(out.body);
		if (!body) throw new Error(`Nothing builds the ${part.kind}`);
		let solid = subtract(union([subtract(body, out.shellCuts), ...out.adds])!, [
			...out.cuts,
			...(top ? [top] : [])
		]);
		const fixtures = union(out.fixtures);
		if (fixtures) solid = union([solid, intersect(fixtures, ceiling)])!;
		for (const e of out.envelope) solid = intersect(solid, e);
		solid = subtract(union([solid, ...out.lateAdds])!, out.lateCuts);
		return toMesh(solid);
	}

	const lid = layout.lid;
	const meshes = layout.layers.map((layer, i) => {
		const H = layer.height;
		const below = H - layout.seam.overlap;
		const part: Part = {
			kind: 'layer',
			layer,
			height: H,
			below: layout.layers[i - 1] ?? null,
			above: layout.layers[i + 1] ?? null
		};
		// nothing may stick out above the top edge, except what components add late
		const over = g.all(H, H + 100, 5);
		if (i < layout.layers.length - 1 || lid.reach <= 0) return build(part, over, g.all(0, below));

		// the boards of the top layer reach into the lid: what holds them rises with the raised
		// walls, inside the room up to the plate of the lid
		const room = prism(g.innerPoly, -1, below + lid.edge);
		const raised = g.raisedStrips(H - 1, H + lid.raised.by);
		return build(
			part,
			subtract(over, raised ? [room, raised] : [room]),
			union([g.all(0, below), room, ...(raised ? [raised] : [])])!
		);
	});

	const lidMesh = build(
		{ kind: 'lid', height: lid.height, below: layout.layers[layout.layers.length - 1] },
		null,
		g.all(0, lid.height)
	);

	g.dispose();
	return { layout, layers: meshes, lid: lidMesh };
}
