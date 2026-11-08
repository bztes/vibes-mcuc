import { findPart } from '../library';
import { pinPositions, SIDES, type PartDefinition, type Side } from '../parts';
import type { Board, Layer, ProjectData } from '../schema';
import { boardHeights, localRect, pinSideOf, portTop } from './boards';
import { kitComponents, type Arrangement, type CaseKit, type LayoutContext } from './component';
import { isXWall, overlaps, rotateVec, unionRect, worldSide } from './math';
import type { CaseLayer, CaseLayout, ResolvedBoard, Seam } from './types';

/**
 * Fixed dimensions of the base case (mm). Deliberately not exposed in the UI.
 */
export const K = {
	cornerRadius: 3,
	headroom: 1,
	minElevation: 3,
	/** Height of a layer without boards (above its floor). */
	empty: 12,
	/** A board edge closer than this to a wall counts as "at the wall". */
	flushDistance: 3,
	/** Inner size of an empty case. */
	emptyLength: 40,
	emptyWidth: 30,
	/** Corner of the lid kept at full height where the walls of the top layer are raised. */
	lidCorner: 2
} as const;

const noSides = (): Record<Side, boolean> => ({
	left: false,
	right: false,
	front: false,
	back: false
});

function boardElevation(board: Board, bottom: number, min: number) {
	return board.elevation ?? Math.max(K.minElevation, min, Math.ceil((bottom + 1) * 2) / 2);
}

/** Footprint of the boards in the layer's own arrangement, with what they need from each wall. */
function arrange(
	layer: Layer,
	pad: (def: PartDefinition, side: Side) => number,
	flushGap: number
): Arrangement | null {
	const items = layer.boards.flatMap((board) => {
		const def = findPart(board.defId);
		if (!def) return [];
		const p = {
			x0: pad(def, 'left'),
			x1: pad(def, 'right'),
			y0: pad(def, 'front'),
			y1: pad(def, 'back')
		};
		return [
			{
				board,
				def,
				rect: localRect(def, board.rotation, board.x, board.y, { x0: 0, x1: 0, y0: 0, y1: 0 }),
				outer: localRect(def, board.rotation, board.x, board.y, p)
			}
		];
	});
	if (!items.length) return null;
	const box = unionRect(items.map((i) => i.outer));
	const flush = noSides();
	for (const it of items) {
		for (const port of it.def.ports) {
			const s = worldSide(port.side, it.board.rotation);
			const edge = {
				left: it.outer.x0 - box.x0,
				right: box.x1 - it.outer.x1,
				front: it.outer.y0 - box.y0,
				back: box.y1 - it.outer.y1
			}[s];
			if (edge < 0.5) flush[s] = true;
		}
	}
	const m = layer.margin;
	const gap = Object.fromEntries(SIDES.map((s) => [s, flush[s] ? flushGap : m])) as Record<
		Side,
		number
	>;
	const a: Arrangement = { items, box, flush, gap, need: { length: 0, width: 0 } };
	measure(a);
	return a;
}

function measure(a: Arrangement) {
	a.need = {
		length: a.box.x1 - a.box.x0 + a.gap.left + a.gap.right,
		width: a.box.y1 - a.box.y0 + a.gap.front + a.gap.back
	};
}

/** Distributes the free space of one axis: towards the side without ports. */
function axisStart(size: number, need: number, gap0: number, flush0: boolean, flush1: boolean) {
	const extra = Math.max(0, size - need);
	const before = flush0 && !flush1 ? 0 : !flush0 && flush1 ? extra : extra / 2;
	return -size / 2 + gap0 + before;
}

/**
 * Lays out a case: places the boards of every layer, lets the walls size the case around them,
 * finds the layer heights, and runs the components' hooks in between.
 */
export function computeLayout(project: ProjectData, kit: CaseKit): CaseLayout {
	const components = kitComponents(kit);
	const wall = project.wall ?? kit.walls.thickness;
	const tol = project.tolerance;
	const warnings: string[] = [];
	const ctx: LayoutContext = { project, wall, tolerance: tol, warnings, ext: {} };
	const seam: Seam = kit.walls.seam(ctx);

	// ── footprint ─────────────────────────────────────────────────────
	const pad = (def: PartDefinition, side: Side) =>
		Math.max(0, ...components.map((c) => c.boardPad?.(ctx, def, side) ?? 0));
	const arranged = project.layers.map((l) => arrange(l, pad, kit.walls.flushGap(ctx)));
	for (const c of components) c.arrange?.(ctx, arranged);
	for (const a of arranged) if (a) measure(a);
	const { length, width } = kit.walls.size(ctx, arranged);

	// ── boards ────────────────────────────────────────────────────────
	const layers: CaseLayer[] = project.layers.map((layer, index) => {
		const a = arranged[index];
		const zBase = (index === 0 ? kit.floor : kit.deck).thickness;
		const lw: string[] = [];
		const boards: ResolvedBoard[] = [];
		if (a) {
			const x0 = axisStart(length, a.need.length, a.gap.left, a.flush.left, a.flush.right);
			const y0 = axisStart(width, a.need.width, a.gap.front, a.flush.front, a.flush.back);
			const dx = x0 - a.box.x0;
			const dy = y0 - a.box.y0;
			// in the upper layers the boards stay above the part reaching in from below
			const lowest = index > 0 && seam.overlap > 0 ? seam.overlap - zBase + 0.5 : 0;
			for (const it of a.items) {
				const cx = it.board.x + dx;
				const cy = it.board.y + dy;
				const pinSide = pinSideOf(it.board, it.def);
				const heights = boardHeights(it.def, pinSide);
				const zPcb = zBase + boardElevation(it.board, heights.bottom, lowest);
				const zPcbTop = zPcb + it.def.thickness;
				if (
					it.board.elevation !== null &&
					pinSide === 'bottom' &&
					it.board.elevation < heights.bottom
				)
					lw.push(`${it.def.name}: the pins need ${heights.bottom} mm below the board.`);
				const shift = (r: typeof it.rect) => ({
					x0: r.x0 + dx,
					x1: r.x1 + dx,
					y0: r.y0 + dy,
					y1: r.y1 + dy
				});
				boards.push({
					board: it.board,
					def: it.def,
					cx,
					cy,
					rotation: it.board.rotation,
					rect: shift(it.rect),
					outer: shift(it.outer),
					zPcb,
					zPcbTop,
					zTop: zPcbTop + portTop(it.def, heights.top),
					zBottom: zPcb - heights.bottom,
					pinSide,
					pinPoints:
						pinSide === 'none'
							? []
							: pinPositions(it.def).map(([px, py]): [number, number] => {
									const [wx, wy] = rotateVec(px, py, it.board.rotation);
									return [cx + wx, cy + wy];
								})
				});
			}
			for (let i = 0; i < boards.length; i++)
				for (let j = i + 1; j < boards.length; j++)
					if (overlaps(boards[i].outer, boards[j].outer, -0.05))
						lw.push(`${boards[i].def.name} overlaps ${boards[j].def.name}.`);
		}
		return {
			layer,
			index,
			kind: index === 0 ? 'base' : 'tier',
			zBase,
			height: 0,
			autoHeight: 0,
			minHeight: 0,
			boards,
			flush: a?.flush ?? noSides(),
			walls: [],
			floorKeep: [],
			warnings: lw,
			ext: {}
		};
	});

	const layout: CaseLayout = {
		components: components.map((c) => c.id),
		inner: { length, width },
		outer: { length: length + 2 * wall, width: width + 2 * wall, height: 0 },
		wall,
		tolerance: tol,
		cornerRadius: K.cornerRadius,
		seam,
		layers,
		lid: {
			height: seam.lidEdge + kit.top.thickness,
			edge: seam.lidEdge,
			reach: 0,
			inside: false,
			raised: { sides: [], by: 0, spans: {} },
			ext: {}
		},
		warnings,
		ext: {}
	};

	for (const c of components) for (const l of layers) c.resolveLayer?.(ctx, layout, l);

	// ── heights ───────────────────────────────────────────────────────
	const top = layers[layers.length - 1];
	/** Free height inside the lid, above the top edge of the top layer. */
	const above = Math.max(0, layout.lid.edge - seam.overlap);
	// The walls of the top layer with ports at them stay as high as they were, the others get
	// lower: so ports may be on one pair of opposite walls only. And only where the walls say
	// how much room a board gets in the lid.
	const portWalls = SIDES.filter((s) => top.flush[s]);
	const raised = portWalls.length
		? isXWall(portWalls[0])
			? (['front', 'back'] as Side[])
			: (['left', 'right'] as Side[])
		: [];
	const inLid =
		project.lid.boardsInside &&
		components.some((c) => c.lidRoom) &&
		portWalls.every((s) => raised.includes(s));
	layout.lid.inside = inLid;
	/** Height of the top layer as it would be without the boards reaching into the lid. */
	let fullHeight = 0;
	const boardRoom = (b: ResolvedBoard) =>
		Math.min(above, ...components.map((c) => c.lidRoom?.(ctx, layout, b) ?? above));
	for (const l of layers) {
		const mins = [
			{ height: l.zBase + 1, reason: '' },
			...components.map((c) => c.minHeight?.(ctx, layout, l) ?? null)
		]
			.filter((m) => m !== null)
			.reduce((a, b) => (b.height > a.height ? b : a));
		// room for the boards, and for the part reaching in from above; the boards of the top
		// layer may reach into the lid
		const reachUp = inLid && l === top;
		const content =
			(l.boards.length
				? Math.max(...l.boards.map((b) => b.zTop + K.headroom - (reachUp ? boardRoom(b) : 0)))
				: l.zBase + K.empty - (reachUp ? above : 0)) + seam.overlap;
		l.minHeight = mins.height;
		l.autoHeight = Math.ceil(Math.max(mins.height, content) * 2) / 2;
		if (reachUp) {
			const full = l.boards.length
				? Math.max(...l.boards.map((b) => b.zTop + K.headroom))
				: l.zBase + K.empty;
			fullHeight = Math.ceil(Math.max(mins.height, full + seam.overlap) * 2) / 2;
		}
		l.height = l.layer.height ?? l.autoHeight;
		if (l.layer.height !== null && l.height < content - 0.01)
			l.warnings.push(`Too low for its boards – needs ${content.toFixed(1)} mm.`);
		if (l.height < mins.height - 0.01)
			l.warnings.push(
				`Below the minimum height (${mins.height.toFixed(1)} mm)${mins.reason ? ` ${mins.reason}` : ''}.`
			);
	}

	kit.walls.fitHeight(ctx, layout);

	if (inLid && raised.length) {
		const by = Math.min(layout.lid.edge, fullHeight - top.height);
		// along the boards with ports at that pair of walls, so the lid keeps its corners
		// exactly as wide as the cradle (the board with its rims)
		const along = (b: ResolvedBoard): [number, number] =>
			isXWall(raised[0]) ? [b.outer.x0, b.outer.x1] : [b.outer.y0, b.outer.y1];
		const atPorts = top.boards.filter((b) =>
			b.def.ports.some((p) => raised.includes(worldSide(p.side, b.rotation)))
		);
		const half = (isXWall(raised[0]) ? length : width) / 2 - K.lidCorner;
		const spanOf = (bs: ResolvedBoard[]): [number, number] => [
			Math.max(-half, Math.min(...bs.map((b) => along(b)[0]))),
			Math.min(half, Math.max(...bs.map((b) => along(b)[1])))
		];
		const span = spanOf(atPorts.length ? atPorts : top.boards);
		if (by > 0.01 && span[1] > span[0])
			layout.lid.raised = {
				sides: raised,
				by,
				spans: Object.fromEntries(raised.map((s) => [s, span]))
			};
	}

	for (const c of components) c.place?.(ctx, layout);
	for (const c of components) c.finish?.(ctx, layout);

	layout.lid.reach = Math.max(0, ...top.boards.map((b) => b.zTop - (top.height - seam.overlap)));
	layout.outer.height = stackHeight(layout);
	for (const l of layers) warnings.push(...l.warnings.map((w) => `Layer ${l.index + 1}: ${w}`));
	return layout;
}

/** Outside height: every layer and the lid reach seam.overlap into the one below. */
export const stackHeight = ({ layers, lid, seam }: CaseLayout) =>
	layers.reduce((s, l) => s + l.height, 0) + lid.height - layers.length * seam.overlap;
