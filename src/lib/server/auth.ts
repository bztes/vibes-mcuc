import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, ne } from 'drizzle-orm';
import { error, type Cookies } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { db } from './db';
import { session, user, setting } from './db/schema';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const SESSION_COOKIE = 'session';
const DAY = 1000 * 60 * 60 * 24;
const SESSION_TTL = 30 * DAY;

export type SessionUser = { id: string; email: string; name: string; role: 'admin' | 'user' };

// ---------- passwords ----------

export async function hashPassword(password: string) {
	const salt = randomBytes(16);
	const hash = await scrypt(password, salt, 64);
	return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
	const [algo, saltB64, hashB64] = stored.split('$');
	if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
	const expected = Buffer.from(hashB64, 'base64');
	const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length);
	return timingSafeEqual(actual, expected);
}

// ---------- sessions ----------

/** Sign out every other device of this user, keeping the current session */
export async function invalidateOtherSessions(cookies: Cookies, userId: string) {
	const token = cookies.get(SESSION_COOKIE);
	const current = token ? hashToken(token) : '';
	await db.delete(session).where(and(eq(session.userId, userId), ne(session.id, current)));
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(cookies: Cookies, userId: string) {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_TTL);
	await db.insert(session).values({ id: hashToken(token), userId, expiresAt });
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt
	});
}

export async function destroySession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await db.delete(session).where(eq(session.id, hashToken(token)));
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function validateSession(cookies: Cookies): Promise<SessionUser | null> {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) return null;
	const id = hashToken(token);

	const [row] = await db
		.select({
			expiresAt: session.expiresAt,
			user: { id: user.id, email: user.email, name: user.name, role: user.role }
		})
		.from(session)
		.innerJoin(user, eq(session.userId, user.id))
		.where(eq(session.id, id));

	if (!row || row.expiresAt.getTime() < Date.now()) {
		if (row) await db.delete(session).where(eq(session.id, id));
		cookies.delete(SESSION_COOKIE, { path: '/' });
		return null;
	}

	// sliding expiration: extend when less than half the TTL remains
	if (row.expiresAt.getTime() - Date.now() < SESSION_TTL / 2) {
		const expiresAt = new Date(Date.now() + SESSION_TTL);
		await db.update(session).set({ expiresAt }).where(eq(session.id, id));
		cookies.set(SESSION_COOKIE, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			expires: expiresAt
		});
	}

	return row.user;
}

// ---------- guards for remote functions ----------

export function requireUser(): SessionUser {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'Not signed in');
	return locals.user;
}

export function requireAdmin(): SessionUser {
	const u = requireUser();
	if (u.role !== 'admin') error(403, 'Admins only');
	return u;
}

// ---------- settings ----------

export async function isSignupOpen() {
	const [row] = await db.select().from(setting).where(eq(setting.key, 'signupOpen'));
	return row ? row.value === 'true' : true;
}

export async function setSignupOpen(open: boolean) {
	await db
		.insert(setting)
		.values({ key: 'signupOpen', value: String(open) })
		.onConflictDoUpdate({ target: setting.key, set: { value: String(open) } });
}
