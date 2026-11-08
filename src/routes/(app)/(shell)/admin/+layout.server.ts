import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ parent }) => {
	const { user } = await parent();
	if (!user) redirect(303, '/login');
	if (user.role !== 'admin') error(403, 'Admins only');
};
