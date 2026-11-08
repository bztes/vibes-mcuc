import type { ManifoldToplevel } from 'manifold-3d';
import { buildStack as buildCase, type StackGeometry } from './case/geometry';
import { computeLayout as layoutCase } from './case/layout';
import type { CaseLayout } from './case/types';
import { caseKit } from './components';
import type { ProjectData } from './schema';

/** The case of a project, made of the components it picked. */
export function computeLayout(project: ProjectData): CaseLayout {
	return layoutCase(project, caseKit(project));
}

export function buildStack(wasm: ManifoldToplevel, project: ProjectData): StackGeometry {
	return buildCase(wasm, project, caseKit(project));
}

export type { CaseLayout, StackGeometry };
