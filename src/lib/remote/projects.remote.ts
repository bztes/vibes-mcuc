import * as v from 'valibot';
import { and, asc, desc, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { command, query } from '$app/server';
import { db } from '#lib/server/db/index.js';
import { project, share } from '#lib/server/db/schema.js';
import { requireUser } from '#lib/server/auth.js';
import {
	latestProjectId,
	owned,
	ownedById,
	requireEditable,
	withAccess
} from '#lib/server/projects.js';
import { ProjectDataSchema, defaultProject } from '#lib/stack/schema.js';

const ProjectId = v.pipe(v.string(), v.uuid());
const ShareId = v.pipe(v.string(), v.uuid());
const Key = v.optional(v.pipe(v.string(), v.maxLength(64)));
const Name = v.pipe(v.string(), v.trim(), v.minLength(1, 'Please enter a name'), v.maxLength(80));
const Mode = v.picklist(['view', 'edit']);

export const listProjects = query(async () => {
	return db
		.select({ id: project.id, name: project.name, updatedAt: project.updatedAt })
		.from(project)
		.where(owned())
		.orderBy(desc(project.updatedAt));
});

export const getLatestProjectId = query(async () => latestProjectId());

export const getProject = query(v.object({ id: ProjectId, key: Key }), async ({ id, key }) => {
	const res = await withAccess(id, key);
	if (!res) error(404, 'Project not found');
	const { project: row, access } = res;
	const parsed = v.safeParse(ProjectDataSchema, row.data);
	return {
		id: row.id,
		name: row.name,
		data: parsed.success ? parsed.output : defaultProject(),
		access
	};
});

/** Called on the first save of a new (draft) project of a signed-in user */
export const createProject = command(
	v.object({ name: Name, data: ProjectDataSchema }),
	async ({ name, data }) => {
		const u = requireUser();
		const [row] = await db
			.insert(project)
			.values({ userId: u.id, name, data })
			.returning({ id: project.id });
		void listProjects().refresh();
		return row.id;
	}
);

/**
 * Moves the projects a visitor made before signing in (kept in their browser) into their account.
 * Ids are kept so `/local/<id>` can redirect to `/<id>`; projects already imported are skipped.
 */
export const importProjects = command(
	v.pipe(
		v.array(
			v.object({
				id: ProjectId,
				name: Name,
				data: ProjectDataSchema,
				createdAt: v.number(),
				updatedAt: v.number()
			})
		),
		v.maxLength(500)
	),
	async (projects) => {
		const u = requireUser();
		if (!projects.length) return;
		await db
			.insert(project)
			.values(
				projects.map((p) => ({
					id: p.id,
					userId: u.id,
					name: p.name,
					data: p.data,
					createdAt: new Date(p.createdAt),
					updatedAt: new Date(p.updatedAt)
				}))
			)
			.onConflictDoNothing();
		void listProjects().refresh();
	}
);

export const saveProject = command(
	v.object({ id: ProjectId, key: Key, name: Name, data: ProjectDataSchema }),
	async ({ id, key, name, data }) => {
		await requireEditable(id, key);
		const updatedAt = new Date();
		await db.update(project).set({ name, data, updatedAt }).where(eq(project.id, id));
		return { updatedAt };
	}
);

export const duplicateProject = command(ProjectId, async (id) => {
	const [row] = await db.select().from(project).where(ownedById(id));
	if (!row) error(404, 'Project not found');
	const [copy] = await db
		.insert(project)
		.values({ userId: row.userId, name: `${row.name} (copy)`.slice(0, 80), data: row.data })
		.returning({ id: project.id });
	void listProjects().refresh();
	return copy.id;
});

export const deleteProject = command(ProjectId, async (id) => {
	await db.delete(project).where(ownedById(id));
	void listProjects().refresh();
});

// ── share links (owner only) ────────────────────────────────────────────
async function requireOwned(id: string) {
	const [row] = await db.select({ id: project.id }).from(project).where(ownedById(id));
	if (!row) error(404, 'Project not found');
}

export const getShares = query(ProjectId, async (id) => {
	await requireOwned(id);
	return db
		.select({ id: share.id, token: share.token, mode: share.mode, createdAt: share.createdAt })
		.from(share)
		.where(eq(share.projectId, id))
		.orderBy(asc(share.createdAt));
});

export const createShare = command(
	v.object({ projectId: ProjectId, mode: Mode }),
	async ({ projectId, mode }) => {
		await requireOwned(projectId);
		const [row] = await db.insert(share).values({ projectId, mode }).returning();
		void getShares(projectId).refresh();
		return row;
	}
);

export const setShareMode = command(
	v.object({ projectId: ProjectId, id: ShareId, mode: Mode }),
	async ({ projectId, id, mode }) => {
		await requireOwned(projectId);
		await db
			.update(share)
			.set({ mode })
			.where(and(eq(share.id, id), eq(share.projectId, projectId)));
		void getShares(projectId).refresh();
	}
);

/** Revokes a link: whoever had it loses access */
export const deleteShare = command(
	v.object({ projectId: ProjectId, id: ShareId }),
	async ({ projectId, id }) => {
		await requireOwned(projectId);
		await db.delete(share).where(and(eq(share.id, id), eq(share.projectId, projectId)));
		void getShares(projectId).refresh();
	}
);
