/// <reference lib="webworker" />
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { MeshData } from './case/types';
import { buildStack } from './index';
import type { ProjectData } from './schema';

export type WorkerRequest = { id: number; project: ProjectData };
export type WorkerResponse =
	| { id: number; ok: true; layers: MeshData[]; lid: MeshData; ms: number }
	| { id: number; ok: false; error: string };

const ready = Module({ locateFile: () => wasmUrl }).then((wasm) => {
	wasm.setup();
	return wasm;
});

let latest = 0;

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
	const { id, project } = event.data;
	latest = id;
	const wasm = await ready;
	// skip requests that were superseded while the WASM module was loading
	if (id !== latest) return;
	const t0 = performance.now();
	try {
		const g = buildStack(wasm, project);
		const msg: WorkerResponse = {
			id,
			ok: true,
			layers: g.layers,
			lid: g.lid,
			ms: performance.now() - t0
		};
		const buffers = [...g.layers, g.lid].flatMap((m) => [m.positions.buffer, m.indices.buffer]);
		(self as unknown as Worker).postMessage(msg, buffers);
	} catch (e) {
		const msg: WorkerResponse = {
			id,
			ok: false,
			error: e instanceof Error ? e.message : String(e)
		};
		(self as unknown as Worker).postMessage(msg);
	}
};
