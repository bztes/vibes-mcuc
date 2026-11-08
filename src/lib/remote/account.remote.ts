import * as v from 'valibot';
import { and, eq, ne } from 'drizzle-orm';
import { error, invalid } from '@sveltejs/kit';
import { form, getRequestEvent } from '$app/server';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema.js';
import {
	hashPassword,
	invalidateOtherSessions,
	requireUser,
	verifyPassword
} from '#lib/server/auth.js';

export const updateProfile = form(
	v.object({
		name: v.pipe(v.string(), v.trim(), v.nonEmpty('Name is required'), v.maxLength(100)),
		email: v.pipe(
			v.string(),
			v.trim(),
			v.toLowerCase(),
			v.nonEmpty('Email is required'),
			v.email('Enter a valid email')
		)
	}),
	async ({ name, email }, issue) => {
		const me = requireUser();
		const [taken] = await db
			.select({ id: user.id })
			.from(user)
			.where(and(eq(user.email, email), ne(user.id, me.id)));
		if (taken) invalid(issue.email('Another account already uses this email'));

		await db.update(user).set({ name, email }).where(eq(user.id, me.id));
		// default form behaviour re-runs load functions, so the header picks up the new name
		return { success: true };
	}
);

export const changePassword = form(
	v.pipe(
		v.object({
			_current: v.pipe(v.string(), v.nonEmpty('Enter your current password')),
			_new: v.pipe(
				v.string(),
				v.minLength(8, 'Password must be at least 8 characters'),
				v.maxLength(200)
			),
			_confirm: v.string()
		}),
		v.forward(
			v.partialCheck(
				[['_new'], ['_confirm']],
				(d) => d._new === d._confirm,
				'Passwords do not match'
			),
			['_confirm']
		)
	),
	async ({ _current, _new }, issue) => {
		const me = requireUser();
		const [row] = await db
			.select({ passwordHash: user.passwordHash })
			.from(user)
			.where(eq(user.id, me.id));
		if (!row) error(404, 'User not found');
		if (!(await verifyPassword(_current, row.passwordHash))) {
			invalid(issue._current('Current password is incorrect'));
		}

		await db
			.update(user)
			.set({ passwordHash: await hashPassword(_new) })
			.where(eq(user.id, me.id));
		await invalidateOtherSessions(getRequestEvent().cookies, me.id);
		return { success: true };
	}
);
