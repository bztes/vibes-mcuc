import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { validateSession } from '#lib/server/auth.js';
import { db } from '#lib/server/db/index.js';

export const init: ServerInit = async () => {
	await migrate(db, { migrationsFolder: 'drizzle' });
};

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = await validateSession(event.cookies);
	return resolve(event);
};
