import type { WorkerRequest, WorkerResponse } from './stack.worker';
import type { ProjectData } from './schema';

export type BuildResult = Extract<WorkerResponse, { ok: true }>;

/**
 * Runs stack generation in a worker. Only the newest request resolves; older ones are dropped.
 */
export class StackBuilder {
	#worker: Worker;
	#seq = 0;
	#pending = new Map<
		number,
		{ resolve: (r: BuildResult | null) => void; reject: (e: Error) => void }
	>();

	constructor() {
		this.#worker = new Worker(new URL('./stack.worker.ts', import.meta.url), { type: 'module' });
		this.#worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
			const msg = e.data;
			const entry = this.#pending.get(msg.id);
			this.#pending.delete(msg.id);
			// resolve stale requests with null
			for (const [id, p] of this.#pending) {
				if (id < msg.id) {
					p.resolve(null);
					this.#pending.delete(id);
				}
			}
			if (!entry) return;
			if (msg.ok) entry.resolve(msg);
			else entry.reject(new Error(msg.error));
		};
		// a worker that fails to load or crashes would otherwise leave every build pending
		this.#worker.onerror = (e) => {
			e.preventDefault();
			const err = new Error(e.message || 'Geometry worker failed');
			for (const p of this.#pending.values()) p.reject(err);
			this.#pending.clear();
		};
	}

	build(project: ProjectData): Promise<BuildResult | null> {
		const id = ++this.#seq;
		const req: WorkerRequest = { id, project: structuredClone(project) };
		return new Promise((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#worker.postMessage(req);
		});
	}

	destroy() {
		this.#worker.terminate();
		for (const p of this.#pending.values()) p.resolve(null);
		this.#pending.clear();
	}
}
