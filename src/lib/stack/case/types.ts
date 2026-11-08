import type { PartDefinition, PinSide, Side } from '../parts';
import type { Board, Layer } from '../schema';

/**
 * The base case model: one footprint, a stack of layers, a lid, and the boards placed in the
 * layers. What the case is made of (walls, cradle, floor, deck, top) are the components in
 * `component.ts`; they keep their own data in `ext`.
 *
 * The fields here that several components look at (`walls`, `floorKeep`, `seam`) are how they
 * stay out of each other's way without knowing each other.
 */

export interface MeshData {
	positions: Float32Array;
	indices: Uint32Array;
}

export interface Rect {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

/** Component data, by component id. Read and written through `slot()`. */
export type Ext = Record<string, unknown>;

export interface ResolvedBoard {
	board: Board;
	def: PartDefinition;
	/** World centre. */
	cx: number;
	cy: number;
	rotation: number;
	/** Footprint in world space (PCB only). */
	rect: Rect;
	/** Footprint the board occupies, including the room the components asked for around it. */
	outer: Rect;
	/** PCB underside / top, tallest component (z in the layer). */
	zPcb: number;
	zPcbTop: number;
	zTop: number;
	zBottom: number;
	pinSide: PinSide;
	/** Pin centres in world space, empty without pins. */
	pinPoints: [number, number][];
}

/**
 * Something a component puts into or through a wall: u = offset of its centre along the wall,
 * `depth` = how far into the wall from its inner face, z0..z1 in the layer.
 */
export interface WallUse {
	kind: 'opening' | 'pocket' | 'lock';
	side: Side;
	u: number;
	width: number;
	depth: number;
	z0: number;
	z1: number;
}

export interface CaseLayer {
	layer: Layer;
	index: number;
	kind: 'base' | 'tier';
	/** z of the surface the boards stand on. */
	zBase: number;
	height: number;
	autoHeight: number;
	minHeight: number;
	boards: ResolvedBoard[];
	/** Walls a board's ports are at. */
	flush: Record<Side, boolean>;
	/** What the components put into the walls of this layer. */
	walls: WallUse[];
	/** Floor areas that must stay solid (the floor keeps its openings out of them). */
	floorKeep: Rect[];
	warnings: string[];
	ext: Ext;
}

export interface CaseLid {
	height: number;
	/** Height of the part below the plate (skirt), z = 0 at its bottom edge. */
	edge: number;
	/**
	 * How far the boards of the top layer reach above its top edge into the lid (0 unless the
	 * project lets them).
	 */
	reach: number;
	/** The boards of the top layer may reach into the lid (the project asks, and it works here). */
	inside: boolean;
	/**
	 * When the boards reach into the lid, the walls of the top layer with ports at them keep the
	 * height they would have without it (`by` above its top edge): they carry what holds the
	 * boards at the port wall. The lid is shorter there by as much. Only as wide as the cradle
	 * (`spans`, world coordinate along the wall): the corners stay low, the lid keeps them.
	 */
	raised: { sides: Side[]; by: number; spans: Partial<Record<Side, [number, number]>> };
	ext: Ext;
}

/** How a part sits on the part below it. Set by the walls. */
export interface Seam {
	/** How far every layer above the base, and the lid, reaches down into the part below. */
	overlap: number;
	/** In that zone, the part's bottom spans d0..d1 inwards from the inner wall face. */
	inside: [number, number] | null;
	/** Band along the inside of the walls the floors keep solid. */
	band: number;
	/** Height of the lid's skirt below its plate. */
	lidEdge: number;
	/** The part above may fill the port notches below from above (it doesn't move sideways). */
	plugs: boolean;
}

export interface CaseLayout {
	/** Ids of the components this layout was built with, in the order they run. */
	components: string[];
	inner: { length: number; width: number };
	outer: { length: number; width: number; height: number };
	wall: number;
	tolerance: number;
	cornerRadius: number;
	seam: Seam;
	layers: CaseLayer[];
	lid: CaseLid;
	warnings: string[];
	ext: Ext;
}

/** Typed access to one component's data on a layer, the lid or the layout. */
export function slot<T>(id: string) {
	return {
		get: (o: { ext: Ext }) => o.ext[id] as T | undefined,
		set: (o: { ext: Ext }, value: T) => {
			o.ext[id] = value;
			return value;
		}
	};
}
