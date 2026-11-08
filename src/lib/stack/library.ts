import * as v from 'valibot';
import { PartDefinitionSchema, type PartDefinition } from './parts';

/*
 * Built-in parts, one file per part in `boards/`, named after the part id. Dimensions are taken
 * from common datasheets / vendor drawings and are nominal – clones vary by a few tenths of a
 * millimetre, so the editor exposes clearances.
 *
 * Pin rows: `pinsExact` parts come from vendor drawings or official footprints (Espressif DXF/PDF,
 * Seeed and KiCad footprints). The others are community footprints or the usual layout of the
 * module, so they are worth checking against the real board. USB is at -X on every MCU.
 */

const files = import.meta.glob('./boards/*.json', { eager: true, import: 'default' });

export const LIBRARY: PartDefinition[] = Object.entries(files).map(([path, json]) => {
	const part = v.parse(PartDefinitionSchema, json);
	if (!path.endsWith(`/${part.id}.json`)) throw new Error(`${path} has id "${part.id}"`);
	return part;
});

export const CATEGORY_LABELS: Record<PartDefinition['category'], string> = {
	mcu: 'Microcontrollers',
	sensor: 'Sensors',
	display: 'Displays',
	power: 'Power',
	io: 'Input / Output'
};

const byId = new Map(LIBRARY.map((p) => [p.id, p]));

export function findPart(defId: string): PartDefinition | undefined {
	return byId.get(defId);
}
