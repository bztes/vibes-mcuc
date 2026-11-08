import { randomBytes } from 'node:crypto';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ProjectData } from '#lib/stack/schema.js';

/** secret in a share link that, together with the project id, grants access to a project */
export const newShareToken = () => randomBytes(16).toString('hex');

export const user = sqliteTable('user', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	email: text('email').notNull().unique(),
	name: text('name').notNull(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const session = sqliteTable(
	'session',
	{
		// sha256 hash of the session token stored in the cookie
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull()
	},
	(t) => [index('session_user_idx').on(t.userId)]
);

export const setting = sqliteTable('setting', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const project = sqliteTable(
	'project',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		/** null only for projects from before accounts existed; the first account claims them */
		userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		data: text('data', { mode: 'json' }).$type<ProjectData>().notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('project_user_idx').on(t.userId)]
);

/** A share link of a project; a project can have any number of them, each view-only or editable */
export const share = sqliteTable(
	'share',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		projectId: text('project_id')
			.notNull()
			.references(() => project.id, { onDelete: 'cascade' }),
		token: text('token').notNull().unique().$defaultFn(newShareToken),
		mode: text('mode', { enum: ['view', 'edit'] }).notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('share_project_idx').on(t.projectId)]
);

export type User = typeof user.$inferSelect;
export type ProjectRow = typeof project.$inferSelect;
export type Share = typeof share.$inferSelect;
