import { resolve } from '$app/paths';
import {
	createProject,
	deleteProject,
	duplicateProject,
	listProjects,
	saveProject
} from '#lib/remote/projects.remote.js';
import type { ProjectData } from '#lib/stack/schema.js';
import { localProjects } from './local-projects';

/** Where the editor keeps a project: the server (accounts, share links) or this browser. */
export type ProjectStore = {
	local: boolean;
	/** URL of a project in this store */
	path(id: string): string;
	list(): Promise<{ id: string; name: string }[]>;
	create(name: string, data: ProjectData): Promise<string>;
	save(id: string, name: string, data: ProjectData): Promise<void>;
	duplicate(id: string): Promise<string>;
	remove(id: string): Promise<void>;
};

/** `key` is the share link token the project was opened with, if any */
export function serverStore(key?: string): ProjectStore {
	return {
		local: false,
		path: (id) => resolve('/(app)/[id=uuid]', { id }),
		list: async () => {
			// saves don't refresh the list, so a rename only shows up after this
			const projects = listProjects();
			await projects.refresh();
			return projects;
		},
		create: (name, data) => createProject({ name, data }),
		save: async (id, name, data) => void (await saveProject({ id, key, name, data })),
		duplicate: (id) => duplicateProject(id),
		remove: (id) => deleteProject(id)
	};
}

export const localStore: ProjectStore = {
	local: true,
	path: (id) => resolve('/(app)/local/[id=uuid]', { id }),
	list: async () => localProjects.list(),
	create: async (name, data) => localProjects.create(name, data).id,
	save: async (id, name, data) => localProjects.update(id, { name, data }),
	duplicate: async (id) => localProjects.duplicate(id).id,
	remove: async (id) => localProjects.remove(id)
};
