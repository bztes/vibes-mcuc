import type { CaseComponent } from '../../case/component';
import { buildCradle } from './geometry';
import { cradleLayout } from './layout';

export { cradleOf, K, type CradleLayer, type BoardHold, type SupportBlock } from './layout';

/** Pads, rims and corner hooks that hold the boards. */
export const cradle: CaseComponent = {
	...cradleLayout,
	build: (g, _layout, part, out) => buildCradle(g, part, out)
};
