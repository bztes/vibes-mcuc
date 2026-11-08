import * as v from 'valibot';
import { count, eq, isNull } from 'drizzle-orm';
import { invalid, redirect } from '@sveltejs/kit';
import { form, getRequestEvent, query } from '$app/server';
import { db } from '#lib/server/db/index.js';
import { project, setting, user } from '#lib/server/db/schema.js';
import {
	createSession,
	destroySession,
	hashPassword,
	isSignupOpen,
	verifyPassword
} from '#lib/server/auth.js';

export const getCurrentUser = query(async () => {
	return getRequestEvent().locals.user;
});

/** Signup is always possible for the very first user, otherwise depends on the admin setting. */
export const getSignupStatus = query(async () => {
	const [{ n }] = await db.select({ n: count() }).from(user);
	return { firstUser: n === 0, open: n === 0 || (await isSignupOpen()) };
});

const email = v.pipe(
	v.string(),
	v.trim(),
	v.toLowerCase(),
	v.nonEmpty('Email is required'),
	v.email('Enter a valid email')
);

export const login = form(
	v.object({
		email,
		_password: v.pipe(v.string(), v.nonEmpty('Password is required'))
	}),
	async ({ email, _password }) => {
		const [u] = await db.select().from(user).where(eq(user.email, email));
		if (!u || !(await verifyPassword(_password, u.passwordHash))) {
			invalid('Invalid email or password');
		}
		await createSession(getRequestEvent().cookies, u.id);
		redirect(303, '/');
	}
);

export const signup = form(
	v.object({
		name: v.pipe(v.string(), v.trim(), v.nonEmpty('Name is required'), v.maxLength(100)),
		email,
		_password: v.pipe(
			v.string(),
			v.minLength(8, 'Password must be at least 8 characters'),
			v.maxLength(200)
		)
	}),
	async ({ name, email, _password }, issue) => {
		const passwordHash = await hashPassword(_password);

		// libsql transactions serialize writes, so "first user becomes admin" is race-free
		const created = await db.transaction(async (tx) => {
			const [{ n }] = await tx.select({ n: count() }).from(user);
			if (n > 0) {
				const [s] = await tx.select().from(setting).where(eq(setting.key, 'signupOpen'));
				if (s?.value === 'false') return { error: 'closed' as const };
			}

			const [existing] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
			if (existing) return { error: 'taken' as const };

			const [u] = await tx
				.insert(user)
				.values({ name, email, passwordHash, role: n === 0 ? 'admin' : 'user' })
				.returning({ id: user.id });
			// projects from before accounts existed belong to the first account
			if (n === 0) await tx.update(project).set({ userId: u.id }).where(isNull(project.userId));
			return { id: u.id };
		});

		if ('error' in created) {
			if (created.error === 'taken')
				invalid(issue.email('An account with this email already exists'));
			invalid('Signup is currently closed');
		}

		await createSession(getRequestEvent().cookies, created.id);
		redirect(303, '/');
	}
);

export const logout = form(async () => {
	await destroySession(getRequestEvent().cookies);
	redirect(303, '/');
});
