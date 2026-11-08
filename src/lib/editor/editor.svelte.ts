import { createContext } from 'svelte';
import { computeLayout, type CaseLayout } from '#lib/stack/index.js';
import { findPart } from '#lib/stack/library.js';
import type { BuildResult } from '#lib/stack/builder.js';
import type { Side } from '#lib/stack/parts.js';
import { newLayer, uid, type Board, type Layer, type ProjectData } from '#lib/stack/schema.js';

/** What the editor shows: one layer (by id) or the lid. */
export type Target = { kind: 'layer'; id: string } | { kind: 'lid' };
export type View3D = 'layer' | 'stack' | 'print';
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

const HISTORY_LIMIT = 100;

export const layerName = (index: number) => (index === 0 ? 'Base' : `Layer ${index + 1}`);

export class EditorState {
	/** null for a draft: not saved anywhere yet, the first edit creates it */
	id = $state<string | null>(null);
	/** Opened through a view-only share link. */
	readonly readonly: boolean;
	name = $state('');
	data = $state<ProjectData>() as ProjectData;
	target = $state<Target>({ kind: 'lid' });
	selectedBoard = $state<string | null>(null);
	/** The whole case is selected; the viewers keep showing the current target. */
	caseSelected = $state(false);
	view3d = $state<View3D>('layer');

	saveState = $state<SaveState>('saved');
	saveError = $state<string | null>(null);
	build = $state.raw<BuildResult | null>(null);
	building = $state(false);
	buildError = $state<string | null>(null);

	layout: CaseLayout = $derived(computeLayout(this.data));

	/** Index of the shown layer, -1 for the lid. */
	layerIndex = $derived.by(() => {
		const t = this.target;
		if (t.kind === 'lid') return -1;
		return this.data.layers.findIndex((l) => l.id === t.id);
	});
	layer: Layer | null = $derived(this.layerIndex >= 0 ? this.data.layers[this.layerIndex] : null);
	board: Board | null = $derived(
		this.layer?.boards.find((b) => b.uid === this.selectedBoard) ?? null
	);

	#past: string[] = [];
	#future: string[] = [];
	#current: string;
	canUndo = $state(false);
	canRedo = $state(false);

	constructor(id: string | null, name: string, data: ProjectData, readonly = false) {
		this.id = id;
		this.readonly = readonly;
		this.name = name;
		this.data = structuredClone(data);
		this.#current = JSON.stringify(data);
		this.target = { kind: 'layer', id: data.layers[0].id };
	}

	snapshot(): ProjectData {
		return $state.snapshot(this.data) as ProjectData;
	}

	// ── history ─────────────────────────────────────────────────────────
	commit(json: string) {
		if (json === this.#current) return;
		this.#past.push(this.#current);
		if (this.#past.length > HISTORY_LIMIT) this.#past.shift();
		this.#future = [];
		this.#current = json;
		this.#syncHistory();
	}

	undo() {
		const prev = this.#past.pop();
		if (prev === undefined) return;
		this.#future.push(this.#current);
		this.#restore(prev);
	}

	redo() {
		const next = this.#future.pop();
		if (next === undefined) return;
		this.#past.push(this.#current);
		this.#restore(next);
	}

	#restore(json: string) {
		this.#current = json;
		this.data = JSON.parse(json);
		this.#syncHistory();
		if (this.target.kind === 'layer' && this.layerIndex < 0)
			this.target = { kind: 'layer', id: this.data.layers[0].id };
		if (!this.board) this.selectedBoard = null;
	}

	#syncHistory() {
		this.canUndo = this.#past.length > 0;
		this.canRedo = this.#future.length > 0;
	}

	// ── layers ──────────────────────────────────────────────────────────
	show(target: Target) {
		this.target = target;
		this.selectedBoard = null;
		this.caseSelected = false;
	}

	selectCase() {
		this.selectedBoard = null;
		this.caseSelected = true;
	}

	/** Selects a board on any layer and shows that layer; null clears the board selection. */
	selectBoard(uidv: string | null) {
		this.caseSelected = false;
		const layer = this.data.layers.find((l) => l.boards.some((b) => b.uid === uidv));
		if (layer) this.target = { kind: 'layer', id: layer.id };
		this.selectedBoard = uidv;
	}

	/** Adds a layer above the shown one (or on top when the lid is shown). */
	addLayer() {
		const l = newLayer();
		const at = this.layerIndex >= 0 ? this.layerIndex + 1 : this.data.layers.length;
		this.data.layers.splice(at, 0, l);
		this.show({ kind: 'layer', id: l.id });
	}

	removeLayer(id: string) {
		if (this.data.layers.length <= 1) return;
		const i = this.data.layers.findIndex((l) => l.id === id);
		if (i < 0) return;
		this.data.layers.splice(i, 1);
		if (this.target.kind === 'layer' && this.target.id === id)
			this.show({ kind: 'layer', id: this.data.layers[Math.max(0, i - 1)].id });
	}

	/** dir = 1 moves the layer up. */
	moveLayer(id: string, dir: 1 | -1) {
		const i = this.data.layers.findIndex((l) => l.id === id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= this.data.layers.length) return;
		const [l] = this.data.layers.splice(i, 1);
		this.data.layers.splice(j, 0, l);
	}

	// ── boards ──────────────────────────────────────────────────────────
	addBoard(layerId: string, defId: string) {
		const layer = this.data.layers.find((l) => l.id === layerId);
		const def = findPart(defId);
		if (!layer || !def) return;
		// next to the existing boards (the case fits itself around them)
		let x = 0;
		for (const b of layer.boards) {
			const d = findPart(b.defId);
			if (!d) continue;
			const half = b.rotation % 180 === 0 ? d.length / 2 : d.width / 2;
			x = Math.max(x, b.x + half + 4 + def.length / 2);
		}
		const board: Board = {
			uid: uid(),
			defId,
			x: Math.round(x),
			y: 0,
			rotation: 0,
			elevation: null,
			pins: null
		};
		layer.boards.push(board);
		this.selectBoard(board.uid);
	}

	removeBoard(uidv: string) {
		const layer = this.layer;
		if (!layer) return;
		layer.boards = layer.boards.filter((b) => b.uid !== uidv);
		if (this.selectedBoard === uidv) this.selectedBoard = null;
	}

	rotateBoard(uidv: string) {
		const b = this.layer?.boards.find((q) => q.uid === uidv);
		if (b) b.rotation = ((b.rotation + 90) % 360) as Board['rotation'];
	}

	// ── openings ────────────────────────────────────────────────────────
	/** A wall opening of the current layer; starts as a notch from the top edge. */
	addWallOpening(side: Side = 'back') {
		const top = this.layout.layers[this.layerIndex]?.height ?? 20;
		this.layer?.wallOpenings.push({
			id: uid('o'),
			type: 'rect',
			side,
			offset: 0,
			z: top - 2.5,
			width: 8,
			height: 5
		});
	}

	/** An opening in the floor of the current layer, or in the lid when no layer is selected. */
	addPlateOpening() {
		const list = this.layer ? this.layer.floorOpenings : this.data.lid.openings;
		list.push({ id: uid('o'), type: 'circle', x: 0, y: 0, width: 8, height: 8 });
	}

	removeOpening(id: string) {
		const keep = <T extends { id: string }>(list: T[]) => list.filter((o) => o.id !== id);
		const layer = this.layer;
		if (layer) {
			layer.wallOpenings = keep(layer.wallOpenings);
			layer.floorOpenings = keep(layer.floorOpenings);
		}
		this.data.lid.openings = keep(this.data.lid.openings);
	}
}

export const [getEditor, setEditor] = createContext<EditorState>();
