import * as v from 'valibot';

/**
 * Built-in part definitions (not stored in projects).
 *
 * Part-local space: origin at the board centre, X along the board length, Y along its width.
 * Sides: left = -X, right = +X, front = -Y, back = +Y.
 */

export const SIDES = ['left', 'right', 'front', 'back'] as const;
export type Side = (typeof SIDES)[number];

/** Side of the PCB the long part of the header sticks out of. */
export const PIN_SIDES = ['bottom', 'top', 'none'] as const;
export type PinSide = (typeof PIN_SIDES)[number];

export const PIN_PITCH = 2.54;

/** Standard 2.54 mm header, measured from the PCB surface: the long side and the soldered tail. */
export const PIN_HEADER = { long: 8.5, tail: 2 } as const;

const SHAPES = ['rect', 'round'] as const;

/** A straight row of through-hole pins. (x, y) is the first pin, the row runs towards +axis. */
const PinRowSchema = v.strictObject({
	x: v.number(),
	y: v.number(),
	count: v.number(),
	axis: v.picklist(['x', 'y'])
});

/** A connector on the edge of a board that needs a notch in the wall in front of it. */
const PortSchema = v.strictObject({
	id: v.string(),
	label: v.string(),
	side: v.picklist(SIDES),
	/** Offset along the side from the board centre. */
	offset: v.number(),
	/** Vertical centre relative to the top surface of the PCB. */
	z: v.number(),
	width: v.number(),
	height: v.number(),
	shape: v.picklist(SHAPES)
});

/** The kinds of openings: a rectangle, a circle (width = diameter), a vent (a row of slots). */
export const OPENING_TYPES = ['rect', 'circle', 'vent'] as const;
export type OpeningType = (typeof OPENING_TYPES)[number];

/** Something on top of the board that needs an opening in the lid (only in the top layer). */
const TopOpeningSchema = v.strictObject({
	id: v.string(),
	label: v.string(),
	type: v.picklist(OPENING_TYPES),
	x: v.number(),
	y: v.number(),
	width: v.number(),
	height: v.number()
});

/** Where the board may rest. Empty = both short ends. */
const SupportSchema = v.strictObject({
	x: v.number(),
	y: v.number(),
	width: v.number(),
	height: v.number()
});

const PartCategorySchema = v.picklist(['mcu', 'sensor', 'display', 'power', 'io']);

/** Shape of one file in `boards/`. */
export const PartDefinitionSchema = v.strictObject({
	id: v.string(),
	name: v.string(),
	category: PartCategorySchema,
	description: v.string(),
	/** Board length (X). */
	length: v.number(),
	/** Board width (Y). */
	width: v.number(),
	/** PCB thickness. */
	thickness: v.number(),
	/** Tallest component above the PCB. */
	topHeight: v.number(),
	/** Tallest thing below the PCB, without pin headers. */
	bottomHeight: v.number(),
	ports: v.array(PortSchema),
	topOpenings: v.array(TopOpeningSchema),
	supports: v.array(SupportSchema),
	color: v.string(),
	/** Pin rows; absent = nothing to choose. */
	pins: v.optional(v.array(PinRowSchema)),
	defaultPins: v.optional(v.picklist(PIN_SIDES)),
	/** Pin positions come from a vendor drawing or an official footprint. */
	pinsExact: v.optional(v.boolean())
});

export type PinRow = v.InferOutput<typeof PinRowSchema>;
export type Port = v.InferOutput<typeof PortSchema>;
export type TopOpening = v.InferOutput<typeof TopOpeningSchema>;
export type Support = v.InferOutput<typeof SupportSchema>;
export type PartCategory = v.InferOutput<typeof PartCategorySchema>;
export type PartDefinition = v.InferOutput<typeof PartDefinitionSchema>;

/** Board-local centres of all pins. */
export function pinPositions(def: PartDefinition): [number, number][] {
	return (def.pins ?? []).flatMap((r) =>
		Array.from({ length: r.count }, (_, i): [number, number] =>
			r.axis === 'x' ? [r.x + i * PIN_PITCH, r.y] : [r.x, r.y + i * PIN_PITCH]
		)
	);
}
