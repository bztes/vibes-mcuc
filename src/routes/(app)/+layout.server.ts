import type { LayoutServerLoad } from './$types';

/** The app works without an account; `user` is null for guests. */
export const load: LayoutServerLoad = ({ locals }) => {
	return { user: locals.user };
};
