import { error, redirect } from '@sveltejs/kit';
import { importLocalProjects, localProjects } from '#lib/editor/local-projects.js';
import type { PageLoad } from './$types';

// the project lives in this browser's localStorage
export const ssr = false;

export const load: PageLoad = async ({ params, parent }) => {
	const { user } = await parent();
	if (user) {
		// signed in meanwhile: the project belongs in the account now (same id)
		await importLocalProjects();
		redirect(307, `/${params.id}`);
	}
	const project = localProjects.get(params.id);
	if (!project) error(404, 'Project not found in this browser');
	return { project };
};
