import * as v from 'valibot';
import { asc, count, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { command, query } from '$app/server';
import { db } from '#lib/server/db/index.js';
import { project, session, user } from '#lib/server/db/schema.js';
import {
	isSignupOpen,
	requireAdmin,
	setSignupOpen as persistSignupOpen
} from '#lib/server/auth.js';

const userId = v.pipe(v.string(), v.uuid());

export const getUsers = query(async () => {
	requireAdmin();
	return db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			createdAt: user.createdAt,
			projects: count(project.id)
		})
		.from(user)
		.leftJoin(project, eq(project.userId, user.id))
		.groupBy(user.id)
		.orderBy(asc(user.createdAt));
});

export const getAdminSettings = query(async () => {
	requireAdmin();
	return { signupOpen: await isSignupOpen() };
});

export const setSignupOpen = command(v.boolean(), async (open) => {
	requireAdmin();
	await persistSignupOpen(open);
	void getAdminSettings().refresh();
});

async function adminCount() {
	const [{ n }] = await db.select({ n: count() }).from(user).where(eq(user.role, 'admin'));
	return n;
}

export const setUserRole = command(
	v.object({ id: userId, role: v.picklist(['admin', 'user']) }),
	async ({ id, role }) => {
		const me = requireAdmin();
		if (id === me.id && role !== 'admin') error(400, "You can't remove your own admin role");
		if (role === 'user' && (await adminCount()) <= 1) error(400, 'At least one admin is required');
		await db.update(user).set({ role }).where(eq(user.id, id));
		void getUsers().refresh();
	}
);

export const deleteUser = command(userId, async (id) => {
	const me = requireAdmin();
	if (id === me.id) error(400, "You can't delete yourself");
	await db.delete(session).where(eq(session.userId, id));
	await db.delete(project).where(eq(project.userId, id));
	await db.delete(user).where(eq(user.id, id));
	void getUsers().refresh();
});
