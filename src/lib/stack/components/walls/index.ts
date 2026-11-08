import type {
	Arrangement,
	CaseComponent,
	LayoutContext,
	Part,
	PartBuild,
	Walls
} from '../../case/component';
import type { Csg } from '../../case/csg';
import { K as CASE, stackHeight } from '../../case/layout';
import type { CaseLayout, Seam } from '../../case/types';
import { flushGap, ports } from './ports';

/**
 * Walls: the shell of every layer and the skirt of the lid, the port notches, how the parts join,
 * and how big the case is. The variants (fitted, clips, slide) differ in how the parts join; the
 * shell, the port notches and the sizing are the same for all of them.
 */

/** What a wall variant defines; `defineWalls` adds the rest. */
export interface WallVariant extends CaseComponent {
	label: string;
	note: string;
	lidNote: string;
	fitHint: string;
	thickness: number;
	seam(ctx: LayoutContext): Seam;
	/** Smallest inner length / width the joint fits in. */
	minInner?(ctx: LayoutContext): number;
}

/**
 * Inner footprint: the outside size the project asks for, or what the boards need. Never less
 * than what fits; then it warns.
 */
function size(ctx: LayoutContext, arranged: (Arrangement | null)[], minInner: number) {
	const { project, wall, warnings } = ctx;
	const fitAxis = (label: string, wanted: number | null, need: number, auto: number) => {
		if (wanted === null) return Math.max(auto, need);
		const min = Math.max(need, minInner);
		if (wanted - 2 * wall >= min - 0.01) return wanted - 2 * wall;
		warnings.push(
			`${label} ${wanted} mm is too small – needs at least ${(min + 2 * wall).toFixed(1)} mm.`
		);
		return min;
	};
	const need = (k: 'length' | 'width') => Math.max(0, ...arranged.map((a) => a?.need[k] ?? 0));
	return {
		length: fitAxis('Length', project.size.length, need('length'), CASE.emptyLength),
		width: fitAxis('Width', project.size.width, need('width'), CASE.emptyWidth)
	};
}

/** The layers without a height of their own share what the project's height leaves. */
function fitHeight(ctx: LayoutContext, layout: CaseLayout) {
	const wanted = ctx.project.size.height;
	if (wanted === null) return;
	const fitted = stackHeight(layout);
	const flexible = layout.layers.filter((l) => l.layer.height === null);
	if (wanted < fitted - 0.01)
		ctx.warnings.push(`Height ${wanted} mm is too small – needs at least ${fitted.toFixed(1)} mm.`);
	else if (flexible.length)
		for (const l of flexible) l.height += (wanted - fitted) / flexible.length;
	else if (wanted > fitted + 0.01)
		ctx.warnings.push(`Height ${wanted} mm can't be reached – every layer has a fixed height.`);
}

/**
 * The shell: the walls of a layer up to its top edge, or the skirt of the lid. Where the boards
 * reach into the lid, the raised walls of the top layer go up with them and the lid is shorter
 * there (with play at the ends).
 */
function shell(g: Csg, layout: CaseLayout, part: Part, out: PartBuild) {
	const lid = layout.lid;
	if (part.kind === 'lid') {
		const step = lid.raised.by > 0 ? g.raisedStrips(-1, lid.raised.by, layout.tolerance) : null;
		out.body.push(step ? g.subtract(g.shell(lid.height), [step]) : g.shell(lid.height));
		return;
	}
	out.body.push(g.shell(part.height));
	const raised =
		!part.above && lid.reach > 0
			? g.raisedStrips(part.height - 1, part.height + lid.raised.by)
			: null;
	if (raised) out.body.push(g.intersect(g.shell(part.height + lid.raised.by), raised));
}

/** A wall variant with the shell, the port notches and the sizing every variant shares. */
export function defineWalls(v: WallVariant): Walls {
	return {
		...v,
		flushGap,
		size: (ctx, arranged) => size(ctx, arranged, v.minInner?.(ctx) ?? 0),
		fitHeight,
		resolveLayer(ctx, layout, layer) {
			ports.resolveLayer(ctx, layout, layer);
			v.resolveLayer?.(ctx, layout, layer);
		},
		// the variant keeps its joint clear of the notches
		place(ctx, layout) {
			ports.place(ctx, layout);
			v.place?.(ctx, layout);
		},
		build(g, layout, part, out) {
			shell(g, layout, part, out);
			ports.build(g, layout, part, out);
			v.build?.(g, layout, part, out);
		}
	};
}

export { K as PORTS, portsOf, type PortCover, type Ports } from './ports';
