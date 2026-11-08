import type { Manifold } from 'manifold-3d';
import type { PartDefinition, Side } from '../parts';
import type { Board, ProjectData } from '../schema';
import type { Csg } from './csg';
import type { CaseLayer, CaseLayout, Ext, Rect, ResolvedBoard, Seam } from './types';

/**
 * A case is made of components, one per role (`CaseKit`): walls, cradle (holds the boards), floor (of the
 * base), deck (the floor of every layer above) and top (the plate of the lid). Each role can have variants (the
 * walls have fitted, clips and slide); a project picks one per role.
 *
 * Every component sees the whole layout: where each board is, in which layer, turned which way.
 * Each component owns its openings and keeps them working (moves, trims, or warns). What one
 * leaves for the others goes into the shared fields of the layout (`walls`, `floorKeep`, `seam`);
 * everything else lives in its own `ext` slot. Components don't import each other.
 */

export interface LayoutContext {
	project: ProjectData;
	wall: number;
	tolerance: number;
	/** Case-wide warnings. */
	warnings: string[];
	/** Scratch space for one layout run, by component id. */
	ext: Ext;
}

/** The boards of one layer in its own arrangement, before it is placed in the footprint. */
export interface Arrangement {
	items: { board: Board; def: PartDefinition; rect: Rect; outer: Rect }[];
	box: Rect;
	/** Walls a board's ports are at. */
	flush: Record<Side, boolean>;
	/** Space between the boards and each wall. */
	gap: Record<Side, number>;
	need: { length: number; width: number };
}

/** The part being built: a layer (z = 0 at its bottom) or the lid (assembled, z = 0 at its edge). */
export type Part =
	| {
			kind: 'layer';
			layer: CaseLayer;
			height: number;
			below: CaseLayer | null;
			above: CaseLayer | null;
	  }
	| { kind: 'lid'; height: number; below: CaseLayer };

/**
 * What the components contribute to one part, applied in this order:
 * (body − shellCuts) ∪ adds − cuts ∪ fixtures (kept below the part above) ∩ envelope
 * ∪ lateAdds − lateCuts.
 */
export interface PartBuild {
	/** Walls, floor or deck slab, top plate. */
	body: Manifold[];
	/** Cut from the body only. */
	shellCuts: Manifold[];
	adds: Manifold[];
	cuts: Manifold[];
	/** Things inside the room that must stay below where the part above reaches. */
	fixtures: Manifold[];
	/** The part may not reach outside each of these. */
	envelope: Manifold[];
	lateAdds: Manifold[];
	lateCuts: Manifold[];
}

/** Hooks every component may have; the base model calls them in the order of `kitComponents`. */
export interface CaseComponent {
	id: string;

	// ── layout, in the order the base model calls them ─────────────────
	/** Room a board needs beyond its PCB on one board-local side. */
	boardPad?(ctx: LayoutContext, def: PartDefinition, side: Side): number;
	/** Adjust the wall gaps of the arrangements (e.g. keep room for something at a wall). */
	arrange?(ctx: LayoutContext, arranged: (Arrangement | null)[]): void;
	/** Once the boards of a layer are placed. Heights are not final yet. */
	resolveLayer?(ctx: LayoutContext, layout: CaseLayout, layer: CaseLayer): void;
	/**
	 * How far a board of the top layer may reach above its top edge into the lid, when the
	 * project lets it (at most the room inside the lid). Without a component that has this hook,
	 * the boards stay below the lid.
	 */
	lidRoom?(ctx: LayoutContext, layout: CaseLayout, board: ResolvedBoard): number;
	minHeight?(
		ctx: LayoutContext,
		layout: CaseLayout,
		layer: CaseLayer
	): { height: number; reason: string } | null;
	/** Heights are final. */
	place?(ctx: LayoutContext, layout: CaseLayout): void;
	/** Everything is placed; e.g. what has to avoid all the rest. */
	finish?(ctx: LayoutContext, layout: CaseLayout): void;

	// ── geometry ───────────────────────────────────────────────────────
	build?(g: Csg, layout: CaseLayout, part: Part, out: PartBuild): void;
}

/** Walls: how the parts join, and how big the case is. */
export interface Walls extends CaseComponent {
	label: string;
	/** How it works, for the case panel. */
	note: string;
	/** How the lid goes on. */
	lidNote: string;
	/** What a looser fit helps with. */
	fitHint: string;
	/** Wall thickness to use when the project leaves it automatic. */
	thickness: number;
	/** How a part sits on the part below it. */
	seam(ctx: LayoutContext): Seam;
	/** Gap between a board edge with ports and the wall it sits at. */
	flushGap(ctx: LayoutContext): number;
	/** Inner footprint: the size the project asks for, or what the boards need (warns if too small). */
	size(ctx: LayoutContext, arranged: (Arrangement | null)[]): { length: number; width: number };
	/** Fits the layer heights to the height the project asks for (warns if it can't). */
	fitHeight(ctx: LayoutContext, layout: CaseLayout): void;
}

/** A floor slab: the closed floor of the base, or the floor of an upper layer. */
export interface Floor extends CaseComponent {
	thickness: number;
}

/** The plate that closes the lid. */
export interface Top extends CaseComponent {
	thickness: number;
}

/** The components of one case, one per role. */
export interface CaseKit {
	/** The openings added by hand, in the walls, floors and top. */
	openings: CaseComponent;
	walls: Walls;
	cradle: CaseComponent;
	/** Floor of the base layer. */
	floor: Floor;
	/** Floor of the layers above the base. */
	deck: Floor;
	top: Top;
}

/**
 * The order the hooks run in. The openings added by hand come first and the walls next:
 * everything else keeps clear of what they put into the walls. The floors come late, so they can
 * stay clear of everything else.
 */
export const kitComponents = (kit: CaseKit): CaseComponent[] => [
	kit.openings,
	kit.walls,
	kit.cradle,
	kit.floor,
	kit.deck,
	kit.top
];
