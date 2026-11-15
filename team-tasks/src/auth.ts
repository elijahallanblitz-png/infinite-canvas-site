import { AppError, type Env, type Person } from './types';
import { b64url, hmac, now, parseSignedToken, randomToken, safeEqual, sha256, signedToken } from './util';

export const COOKIE = '__Host-tt';
const YEAR = 400 * 86_400; // browsers cap cookie life at 400 days; we renew on use

export function sessionCookie(token: string): string {
  return `${COOKIE}=${token}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`;
}
export const clearCookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const looksLikeToken = (t: unknown): t is string => typeof t === 'string' && TOKEN_RE.test(t);

// ---- Rate limiting ----
/** Durable fixed-window limiter in D1. Use for sign-in, writes, the connector. */
export async function rateLimit(env: Env, key: string, limit: number, windowSec: number): Promise<boolean> {
  const win = Math.floor(now(env) / 1000 / windowSec);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, win, count) VALUES (?1, ?2, 1)
     ON CONFLICT (key, win) DO UPDATE SET count = count + 1 RETURNING count`,
  ).bind(`${key}:${windowSec}`, win).first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}
export async function requireRate(env: Env, key: string, limit: number, windowSec: number): Promise<void> {
  if (!(await rateLimit(env, key, limit, windowSec))) {
    throw new AppError('Too many requests. Wait a minute and try again.', 429, 'rate_limited');
  }
}
/** Cheap per-isolate limiter for reads (board polling), so polling costs no database writes. */
const mem = new Map<string, { win: number; n: number }>();
export function memLimit(key: string, limit: number, windowSec: number, ms: number): boolean {
  const win = Math.floor(ms / 1000 / windowSec);
  const cur = mem.get(key);
  if (!cur || cur.win !== win) {
    if (mem.size > 5000) mem.clear();
    mem.set(key, { win, n: 1 });
    return true;
  }
  return ++cur.n <= limit;
}

// ---- People lookups ----
const PERSON_COLS = 'id, name, role, epoch, phone, notify_push, notify_sms, sms_stopped, last_digest_on, created_at, removed_at';
export async function getPerson(env: Env, id: number): Promise<Person | null> {
  return env.DB.prepare(`SELECT ${PERSON_COLS} FROM people WHERE id = ? AND removed_at IS NULL`).bind(id).first<Person>();
}
export async function getPeople(env: Env): Promise<Person[]> {
  const r = await env.DB.prepare(`SELECT ${PERSON_COLS} FROM people WHERE removed_at IS NULL ORDER BY id`).all<Person>();
  return r.results;
}

// ---- Sessions ----
export async function createSession(env: Env, personId: number): Promise<string> {
  const token = randomToken();
  const t = now(env);
  await env.DB.prepare('INSERT INTO sessions (person_id, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?)')
    .bind(personId, await sha256(token), t, t).run();
  return token;
}

export function readCookie(req: Request): string | null {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(req.headers.get('cookie') || '');
  return m && looksLikeToken(m[1]) ? m[1] : null;
}

export async function personForSessionToken(env: Env, token: string): Promise<Person | null> {
  const row = await env.DB.prepare(
    `SELECT s.id AS sid, s.last_seen_at, p.id, p.name, p.role, p.epoch, p.phone, p.notify_push, p.notify_sms,
            p.sms_stopped, p.last_digest_on, p.created_at, p.removed_at
     FROM sessions s JOIN people p ON p.id = s.person_id
     WHERE s.token_hash = ? AND p.removed_at IS NULL`,
  ).bind(await sha256(token)).first<Person & { sid: number; last_seen_at: number }>();
  if (!row) return null;
  const t = now(env);
  if (t - row.last_seen_at > 86_400_000) {
    await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(t, row.sid).run();
  }
  return row;
}

export async function sessionFromRequest(env: Env, req: Request): Promise<{ person: Person; token: string } | null> {
  const token = readCookie(req);
  if (!token) return null;
  const person = await personForSessionToken(env, token);
  return person ? { person, token } : null;
}

// ---- Invite links: long random tokens, only the hash is stored ----
export async function newInvite(env: Env, personId: number): Promise<string> {
  const token = randomToken();
  await env.DB.prepare('UPDATE people SET invite_hash = ? WHERE id = ?').bind(await sha256(token), personId).run();
  return token;
}
export async function personForInvite(env: Env, token: string): Promise<Person | null> {
  if (!looksLikeToken(token)) return null;
  const row = await env.DB.prepare('SELECT id FROM people WHERE invite_hash = ? AND removed_at IS NULL')
    .bind(await sha256(token)).first<{ id: number }>();
  return row ? getPerson(env, row.id) : null;
}
/** New invite link, every device signed out, Claude link changed. */
export async function resetAccess(env: Env, personId: number): Promise<string> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE person_id = ?').bind(personId),
    env.DB.prepare('DELETE FROM push_subs WHERE person_id = ?').bind(personId),
    env.DB.prepare('UPDATE people SET epoch = epoch + 1 WHERE id = ?').bind(personId),
  ]);
  return newInvite(env, personId);
}

// ---- Claude link and reply tokens: signed, never stored ----
export const connectorToken = (env: Env, p: Person) => signedToken(env, 'claude', p.id, p.epoch);
export async function personForConnector(env: Env, token: string): Promise<Person | null> {
  const parsed = parseSignedToken(token);
  if (!parsed) return null;
  const person = await getPerson(env, parsed.id);
  if (!person) return null;
  const expect = b64url(await hmac(env.APP_SECRET, `claude:${person.id}:${person.epoch}`));
  return safeEqual(expect, parsed.mac) ? person : null;
}
export const replyToken = (env: Env, checkinId: number) => signedToken(env, 'reply', checkinId, 0);
export async function checkinForReplyToken(env: Env, token: string): Promise<number | null> {
  const parsed = parseSignedToken(token);
  if (!parsed) return null;
  const expect = b64url(await hmac(env.APP_SECRET, `reply:${parsed.id}:0`));
  return safeEqual(expect, parsed.mac) ? parsed.id : null;
}
