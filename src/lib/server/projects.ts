import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { db } from './db/index.js';
import { project, share, type ProjectRow } from './db/schema.js';

/** What the requester may do with a project: their own, or opened through an edit / view link. */
export type Access = 'owner' | 'edit' | 'view';

/** Projects the signed-in requester owns (listed in the project menu, may be shared and deleted). */
export function owned(): SQL {
	const { locals } = getRequestEvent();
	return locals.user ? eq(project.userId, locals.user.id) : sql`0`;
}

export function ownedById(id: string): SQL {
	return and(eq(project.id, id), owned())!;
}

/** The project with the requester's access to it, or null when they may not open it. */
export async function withAccess(
	id: string,
	key?: string
): Promise<{ project: ProjectRow; access: Access } | null> {
	const { locals } = getRequestEvent();
	const [p] = await db.select().from(project).where(eq(project.id, id));
	if (!p) return null;
	if (locals.user && p.userId === locals.user.id) return { project: p, access: 'owner' };
	if (!key) return null;
	const [s] = await db
		.select({ mode: share.mode })
		.from(share)
		.where(and(eq(share.projectId, id), eq(share.token, key)));
	return s ? { project: p, access: s.mode } : null;
}

/** Throws unless the requester may change the project (owner or edit link). */
export async function requireEditable(id: string, key?: string) {
	const res = await withAccess(id, key);
	if (!res) error(404, 'Project not found');
	if (res.access === 'view') error(403, 'This link is view-only');
	return res.project;
}

/** Id of the signed-in requester's most recently edited project */
export async function latestProjectId() {
	const [p] = await db
		.select({ id: project.id })
		.from(project)
		.where(owned())
		.orderBy(desc(project.updatedAt))
		.limit(1);
	return p?.id ?? null;
}
