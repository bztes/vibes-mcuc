import { redirect } from '@sveltejs/kit';
import { importLocalProjects, localProjects } from '#lib/editor/local-projects.js';
import { getCurrentUser } from '#lib/remote/auth.remote.js';
import { getLatestProjectId } from '#lib/remote/projects.remote.js';
import type { PageLoad } from './$types';

// guests' projects live in localStorage, which only the browser can read
export const ssr = false;

/** Open the most recently edited project, or start a new one */
export const load: PageLoad = async () => {
	let id: string | null;
	if (await getCurrentUser()) {
		// projects made before logging in / signing up move into the account
		await importLocalProjects();
		id = await getLatestProjectId();
		if (id) redirect(307, `/${id}`);
	} else {
		id = localProjects.list()[0]?.id ?? null;
		if (id) redirect(307, `/local/${id}`);
	}
	redirect(307, '/new');
};
