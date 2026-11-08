import type { CaseKit, Walls } from '../case/component';
import type { WallId, ProjectData } from '../schema';
import { cradle } from './cradle';
import { floor } from './floor';
import { openings } from './openings';
import { deck } from './deck';
import { top } from './top';
import { clips } from './walls/clips';
import { fitted } from './walls/fitted';
import { slide } from './walls/slide';

/** The wall variants: how the layers join. A project picks one (`project.walls`). */
export const WALLS: Record<WallId, Walls> = { fitted, clips, slide };

/** The components a project's case is made of. */
export function caseKit(project: ProjectData): CaseKit {
	return { openings, walls: WALLS[project.walls], cradle, floor, deck, top };
}
