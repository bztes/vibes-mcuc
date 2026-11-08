import { describe, expect, it } from 'vitest';
import { buildStack } from '../../index';
import { board, isClosed, project, solidAt, wasm } from '../../testing';
import { topOf } from './index';

describe('the top', () => {
	it('opens what the boards of the top layer show', () => {
		const p = project();
		p.layers[0].boards = [board('oled-096')];
		const g = buildStack(wasm, p);
		const [display] = topOf.get(g.layout.lid)!.openings;
		expect(display.type).toBe('rect');
		expect(isClosed(g.lid.indices)).toBe(true);
		const z = g.layout.lid.height - 1;
		expect(solidAt(g.lid, display.x, display.y, z)).toBe(false);
		expect(solidAt(g.lid, display.x + display.width / 2 + 1, display.y, z)).toBe(true);
	});

	it('turns the openings with the board', () => {
		const p = project();
		p.layers[0].boards = [board('oled-096', 90)];
		const [o] = topOf.get(buildStack(wasm, p).layout.lid)!.openings;
		expect(o.height).toBeGreaterThan(o.width);
	});
});
