import * as v from 'valibot';
import { OPENING_TYPES, PIN_SIDES, SIDES } from './parts';

/**
 * Project data for a stacked case.
 *
 * All layers share one footprint; only their height differs. Layers are listed bottom → top,
 * the first one is the base (closed floor); the others have a floor with openings. The lid closes the stack.
 *
 * World space (mm): X right, Y back, Z up, origin at the footprint centre, Z = 0 at the bottom
 * of each layer.
 */

const num = (min = -1000, max = 1000) => v.pipe(v.number(), v.minValue(min), v.maxValue(max));
const id = v.pipe(v.string(), v.minLength(1), v.maxLength(64));

export const BoardSchema = v.object({
	uid: id,
	defId: id,
	/** Position in the layer's arrangement; the layer is placed in the footprint automatically. */
	x: num(-2000, 2000),
	y: num(-2000, 2000),
	rotation: v.picklist([0, 90, 180, 270]),
	/** PCB underside above the layer bottom (or floor). null = automatic. */
	elevation: v.nullable(num(0, 100)),
	/** Where the pin headers are soldered. null = the part's default. */
	pins: v.nullable(v.picklist(PIN_SIDES))
});

/**
 * Opening added by hand to a wall, centred at `offset` along it and `z` above the layer bottom.
 * One that reaches the top edge opens there; the part above closes it.
 */
export const WallOpeningSchema = v.object({
	id,
	type: v.picklist(OPENING_TYPES),
	side: v.picklist(SIDES),
	offset: num(),
	z: num(0, 200),
	/** Diameter of a circle. */
	width: num(1, 300),
	height: num(1, 200)
});

/** Opening added by hand to a plate: the floor of a layer, or the top of the lid. */
export const PlateOpeningSchema = v.object({
	id,
	type: v.picklist(OPENING_TYPES),
	x: num(),
	y: num(),
	/** Diameter of a circle. */
	width: num(1, 300),
	height: num(1, 300)
});

export const LayerSchema = v.object({
	id,
	/** Wall height. null = fits the boards. */
	height: v.nullable(num(5, 200)),
	/** Space between the boards and the walls (sides without ports). */
	margin: num(0, 100),
	boards: v.pipe(v.array(BoardSchema), v.maxLength(16)),
	/** Openings added by hand. */
	wallOpenings: v.pipe(v.array(WallOpeningSchema), v.maxLength(32)),
	floorOpenings: v.pipe(v.array(PlateOpeningSchema), v.maxLength(32))
});

const caseSide = v.nullable(num(10, 1000));

/** The wall variants, how the layers join (`components/walls/`). A project uses one. */
export const WALL_IDS = ['fitted', 'clips', 'slide'] as const;
export type WallId = (typeof WALL_IDS)[number];

export const ProjectDataSchema = v.object({
	walls: v.picklist(WALL_IDS),
	/** Wall thickness. null = what the walls work best with. */
	wall: v.nullable(num(1.2, 5)),
	/** Clearance for everything that fits into something else. */
	tolerance: num(0, 1),
	/** Outside size of the case. null = fits the boards. */
	size: v.object({ length: caseSide, width: caseSide, height: caseSide }),
	layers: v.pipe(v.array(LayerSchema), v.minLength(1), v.maxLength(8)),
	lid: v.object({
		openings: v.pipe(v.array(PlateOpeningSchema), v.maxLength(32)),
		/** The boards of the top layer may reach up into the room inside the lid. */
		boardsInside: v.boolean()
	})
});

export type Board = v.InferOutput<typeof BoardSchema>;
export type WallOpening = v.InferOutput<typeof WallOpeningSchema>;
export type PlateOpening = v.InferOutput<typeof PlateOpeningSchema>;
export type Layer = v.InferOutput<typeof LayerSchema>;
export type ProjectData = v.InferOutput<typeof ProjectDataSchema>;
export type Rotation = Board['rotation'];

export const uid = (prefix = 'b') => `${prefix}${crypto.randomUUID().slice(0, 8)}`;

export const newLayer = (): Layer => ({
	id: uid('l'),
	height: null,
	margin: 3,
	boards: [],
	wallOpenings: [],
	floorOpenings: []
});

export const defaultProject = (): ProjectData => ({
	walls: 'fitted',
	wall: null,
	tolerance: 0.2,
	size: { length: null, width: null, height: null },
	layers: [newLayer()],
	lid: { openings: [], boardsInside: false }
});
