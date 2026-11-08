/**
 * Projects of visitors without an account, kept in this browser's localStorage
 * (one entry per project). They are moved into the account on login or signup, see `importLocalProjects`.
 */
import * as v from 'valibot';
import { importProjects } from '#lib/remote/projects.remote.js';
import { ProjectDataSchema, type ProjectData } from '#lib/stack/schema.js';

export type LocalProject = {
	id: string;
	name: string;
	data: ProjectData;
	createdAt: number;
	updatedAt: number;
};

const PREFIX = 'mcuc:project:';

const LocalProjectSchema = v.object({
	id: v.pipe(v.string(), v.uuid()),
	name: v.string(),
	data: ProjectDataSchema,
	createdAt: v.number(),
	updatedAt: v.number()
});

function read(key: string): LocalProject | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const res = v.safeParse(LocalProjectSchema, JSON.parse(raw));
		return res.success ? (res.output as LocalProject) : null;
	} catch {
		return null;
	}
}

function write(p: LocalProject) {
	// throws when the storage quota is exceeded; the editor shows that as a failed save
	localStorage.setItem(PREFIX + p.id, JSON.stringify(p));
}

function keys() {
	try {
		return Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
	} catch {
		return [];
	}
}

export const localProjects = {
	/** All local projects, most recently edited first */
	list(): LocalProject[] {
		return keys()
			.map(read)
			.filter((p) => p !== null)
			.sort((a, b) => b.updatedAt - a.updatedAt);
	},

	get(id: string) {
		return read(PREFIX + id);
	},

	create(name: string, data: ProjectData): LocalProject {
		const now = Date.now();
		const p = { id: crypto.randomUUID(), name, data, createdAt: now, updatedAt: now };
		write(p);
		return p;
	},

	update(id: string, patch: Partial<Pick<LocalProject, 'name' | 'data'>>) {
		const p = read(PREFIX + id);
		if (!p) throw new Error('Project not found');
		write({ ...p, ...patch, updatedAt: Date.now() });
	},

	duplicate(id: string) {
		const p = read(PREFIX + id);
		if (!p) throw new Error('Project not found');
		return this.create(`${p.name} (copy)`, p.data);
	},

	remove(id: string) {
		localStorage.removeItem(PREFIX + id);
	},

	clear(ids: string[]) {
		for (const id of ids) localStorage.removeItem(PREFIX + id);
	}
};

/** Upload the local projects into the signed-in user's account, then forget them locally. */
export async function importLocalProjects() {
	const projects = localProjects.list();
	if (!projects.length) return;
	await importProjects(projects);
	localProjects.clear(projects.map((p) => p.id));
}
