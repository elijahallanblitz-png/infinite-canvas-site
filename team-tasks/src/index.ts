import {
  checkinForReplyToken, clearCookie, connectorToken, createSession, getPeople, getPerson, looksLikeToken, memLimit,
  personForInvite, personForSessionToken, rateLimit, readCookie, requireRate, resetAccess, sessionCookie, sessionFromRequest,
} from './auth';
import { handleConnector } from './connector';
import {
  addPerson, answerCheckin, boardPayload, boardVersion, checkIn, createTask, latestAskFor, recentActivity, removeTask,
  restoreTask, updateTask,
} from './core';
import { notify } from './notify';
import { runCron } from './nudge';
import { pushConfigured } from './push';
import { classifyInbound, HELP_TEXT, normalizePhone, smsConfigured, twiml, validTwilioRequest } from './sms';
import { AppError, type Env, type Person } from './types';
import { clientIp, json, now, sha256 } from './util';

const MANIFEST = {
  name: 'Team Tasks',
  short_name: 'Team Tasks',
  description: 'The Infinite Canvas team board.',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: '#060606',
  theme_color: '#060606',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get('content-type') || '').includes('application/json')) throw new AppError('Send JSON.', 415);
  const text = await req.text();
  if (text.length > 20_000) throw new AppError('That is too long.', 413);
  try {
    const v = JSON.parse(text || '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  } catch { /* fall through */ }
  throw new AppError('Send JSON.');
}

/** Browsers send Origin on every POST. If it is there, it must be us. */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}

function mePayload(env: Env, me: Person) {
  return {
    id: me.id, name: me.name, role: me.role, phone: me.phone,
    notify_push: Boolean(me.notify_push), notify_sms: Boolean(me.notify_sms), sms_stopped: Boolean(me.sms_stopped),
  };
}
const configPayload = (env: Env) => ({ push_key: pushConfigured(env) ? env.VAPID_PUBLIC_KEY : null, sms: smsConfigured(env) });

async function api(env: Env, req: Request, url: URL): Promise<Response> {
  const path = url.pathname.slice(4); // after /api
  const method = req.method;
  const write = method !== 'GET' && method !== 'HEAD';
  if (write && !sameOrigin(req)) throw new AppError('Wrong origin.', 403, 'forbidden');
  const ip = clientIp(req);

  // ---- No sign-in needed ----
  if (path === '/session/adopt' && method === 'POST') {
    // A Home Screen app on iPhone has its own cookie jar. It trades the token in its start link for a cookie.
    await requireRate(env, `signin:${ip}`, 20, 600);
    const { h } = await readJson(req);
    const person = looksLikeToken(h) ? await personForSessionToken(env, h) : null;
    if (!person) throw new AppError('This link has expired. Ask for a new invite link.', 401, 'signed_out');
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(h as string) });
  }
  let m: RegExpExecArray | null;
  if ((m = /^\/reply\/([^/]+)$/.exec(path)) && method === 'POST') {
    // The Done / Working on it buttons on a push notification. The signed token is the permission.
    await requireRate(env, `reply:${ip}`, 30, 60);
    const id = await checkinForReplyToken(env, m[1]);
    if (!id) throw new AppError('That check-in is gone.', 404, 'not_found');
    const r = await answerCheckin(env, id, (await readJson(req)).answer, 'push');
    return json({ ok: true, status: r.task.status, title: r.task.title });
  }

  // ---- Everything below needs a signed-in person ----
  const session = await sessionFromRequest(env, req);
  if (!session) throw new AppError('Open your invite link to sign in.', 401, 'signed_out');
  const me = session.person;
  if (!memLimit(`api:${me.id}:${ip}`, 600, 60, now(env))) throw new AppError('Too many requests. Wait a minute.', 429, 'rate_limited');
  if (write) await requireRate(env, `write:${me.id}`, 90, 60);
  const idOf = (s: string) => Number(s);

  if (path === '/board' && method === 'GET') {
    const have = Number(url.searchParams.get('v') || 0);
    if (have && have === (await boardVersion(env))) return json({ version: have, unchanged: true });
    return json({ ...(await boardPayload(env, me)), me: mePayload(env, me), config: configPayload(env) }, 200, { 'set-cookie': sessionCookie(session.token) });
  }
  if (path === '/activity' && method === 'GET') return json({ items: await recentActivity(env) });

  if (path === '/tasks' && method === 'POST') {
    const b = await readJson(req);
    return json({ task: await createTask(env, me, { title: b.title, owner_id: b.owner_id, due_on: b.due_on }, 'app') }, 201);
  }
  if ((m = /^\/tasks\/(\d{1,9})$/.exec(path))) {
    if (method === 'PATCH') {
      const b = await readJson(req);
      return json({ task: await updateTask(env, me, idOf(m[1]), { title: b.title, owner_id: b.owner_id, status: b.status, due_on: b.due_on }, 'app') });
    }
    if (method === 'DELETE') return json({ task: await removeTask(env, me, idOf(m[1]), 'app') });
  }
  if ((m = /^\/tasks\/(\d{1,9})\/restore$/.exec(path)) && method === 'POST') return json({ task: await restoreTask(env, me, idOf(m[1]), 'app') });
  if ((m = /^\/tasks\/(\d{1,9})\/checkin$/.exec(path)) && method === 'POST') {
    await requireRate(env, `checkin:${me.id}`, 20, 600);
    const r = await checkIn(env, me, idOf(m[1]), 'app');
    return json({ ok: true, owner: r.owner.name, queued: r.delivery.queued, reachable: r.delivery.reachable });
  }
  if ((m = /^\/checkins\/(\d{1,9})\/reply$/.exec(path)) && method === 'POST') {
    const r = await answerCheckin(env, idOf(m[1]), (await readJson(req)).answer, 'app', me);
    return json({ ok: true, task: r.task });
  }

  // ---- Me ----
  if (path === '/me' && method === 'PATCH') {
    const b = await readJson(req);
    const sets: string[] = [];
    const vals: unknown[] = [];
    if (b.phone !== undefined) {
      const phone = b.phone === null || b.phone === '' ? null : normalizePhone(b.phone);
      if (b.phone && !phone) throw new AppError('That does not look like a phone number. Try it like 310 555 0123.');
      sets.push('phone = ?', 'sms_stopped = 0'); vals.push(phone);
      if (!phone) sets.push('notify_sms = 0');
    }
    if (typeof b.notify_push === 'boolean') { sets.push('notify_push = ?'); vals.push(b.notify_push ? 1 : 0); }
    if (typeof b.notify_sms === 'boolean') { sets.push('notify_sms = ?'); vals.push(b.notify_sms ? 1 : 0); }
    if (sets.length) await env.DB.prepare(`UPDATE people SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, me.id).run();
    return json({ me: mePayload(env, (await getPerson(env, me.id))!) });
  }
  if (path === '/handoff' && method === 'POST') return json({ h: await createSession(env, me.id) });
  if (path === '/signout' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(session.token)).run();
    return json({ ok: true }, 200, { 'set-cookie': clearCookie });
  }
  if (path === '/connector' && method === 'GET') {
    const base = env.PUBLIC_URL || url.origin;
    return json({ url: `${base}/claude/${await connectorToken(env, me)}` });
  }

  // ---- Push ----
  if (path === '/push/subscribe' && method === 'POST') {
    const b = await readJson(req);
    const keys = (b.keys ?? {}) as Record<string, unknown>;
    let endpoint: URL;
    try { endpoint = new URL(String(b.endpoint)); } catch { throw new AppError('Bad subscription.'); }
    if (endpoint.protocol !== 'https:' || String(b.endpoint).length > 1000 || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string'
      || !/^[A-Za-z0-9_-]{80,100}=*$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{20,30}=*$/.test(keys.auth)) throw new AppError('Bad subscription.');
    await env.DB.prepare(
      `INSERT INTO push_subs (person_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET person_id = excluded.person_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    ).bind(me.id, endpoint.href, keys.p256dh.replace(/=+$/, ''), keys.auth.replace(/=+$/, ''), now(env)).run();
    await env.DB.prepare('UPDATE people SET notify_push = 1 WHERE id = ?').bind(me.id).run();
    return json({ ok: true });
  }
  if (path === '/push/unsubscribe' && method === 'POST') {
    await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ? AND person_id = ?').bind(String((await readJson(req)).endpoint), me.id).run();
    return json({ ok: true });
  }
  if (path === '/push/test' && method === 'POST') {
    await requireRate(env, `pushtest:${me.id}`, 5, 600);
    const d = await notify(env, me, { title: 'Team Tasks', body: `It works, ${me.name}. This is what a message looks like.`, url: '/', tag: 'test' });
    return json({ ok: true, queued: d.queued, push: d.push, sms: d.sms });
  }

  // ---- People (owner) ----
  if (path === '/people' && method === 'POST') {
    const r = await addPerson(env, me, (await readJson(req)).name);
    return json({ person: { id: r.person.id, name: r.person.name, role: r.person.role }, invite_url: `${env.PUBLIC_URL || url.origin}/join/${r.invite}` }, 201);
  }
  if ((m = /^\/people\/(\d{1,9})\/reset-link$/.exec(path)) && method === 'POST') {
    if (me.role !== 'owner') throw new AppError('Only the owner can reset links.', 403, 'forbidden');
    const target = await getPerson(env, idOf(m[1]));
    if (!target) throw new AppError('That person is not on the team.', 404, 'not_found');
    const invite = await resetAccess(env, target.id);
    return json({ person: { id: target.id, name: target.name }, invite_url: `${env.PUBLIC_URL || url.origin}/join/${invite}` });
  }
  throw new AppError('Not found.', 404, 'not_found');
}

/** Inbound text messages from Twilio. Reply 1 for done, 2 for working on it. STOP and HELP are honoured. */
async function twilioWebhook(env: Env, req: Request, url: URL): Promise<Response> {
  if (!smsConfigured(env)) return new Response('Texting is off.', { status: 503 });
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form) if (typeof v === 'string') params[k] = v;
  const publicUrl = env.PUBLIC_URL ? env.PUBLIC_URL + url.pathname + url.search : req.url;
  if (!(await validTwilioRequest(env, publicUrl, params, req.headers.get('x-twilio-signature')))) return new Response('Bad signature.', { status: 403 });
  const from = normalizePhone(params.From || '');
  const kind = params.OptOutType ? (params.OptOutType.toLowerCase() as 'stop' | 'start' | 'help') : classifyInbound(params.Body || '');
  const person = from ? await env.DB.prepare('SELECT id FROM people WHERE phone = ? AND removed_at IS NULL').bind(from).first<{ id: number }>() : null;
  if (kind === 'help') return twiml(HELP_TEXT);
  if (!person) return twiml(kind === 'stop' ? undefined : 'This number is not on Team Tasks. Add it in the app under You.');
  if (kind === 'stop') {
    await env.DB.prepare('UPDATE people SET sms_stopped = 1 WHERE id = ?').bind(person.id).run();
    return twiml(); // Twilio sends the carrier-required confirmation itself
  }
  if (kind === 'start') {
    await env.DB.prepare('UPDATE people SET sms_stopped = 0 WHERE id = ?').bind(person.id).run();
    return twiml('You are back on Team Tasks texts. Reply STOP to stop.');
  }
  if (kind === 'unknown') return twiml('Reply 1 for done or 2 for working on it. Reply HELP for help.');
  const ask = await latestAskFor(env, person.id);
  if (!ask) return twiml('Nothing is waiting on you right now.');
  const r = await answerCheckin(env, ask, kind, 'text');
  return twiml(kind === 'done' ? `Got it. “${r.task.title}” is done.` : `Got it. “${r.task.title}” is in progress.`);
}

async function route(env: Env, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  let m: RegExpExecArray | null;

  if ((m = /^\/join\/([^/]+)\/?$/.exec(path))) {
    const ip = clientIp(req);
    const allowed = await rateLimit(env, `signin:${ip}`, 20, 600);
    const person = allowed ? await personForInvite(env, m[1]) : null;
    if (!person) return Response.redirect(`${url.origin}/?${allowed ? 'bad-link' : 'slow-down'}=1`, 302);
    // Link previews (iMessage, Slack) fetch the URL too. Reuse this device's session if it already has one.
    const existing = readCookie(req);
    const same = existing ? await personForSessionToken(env, existing) : null;
    const token = same && same.id === person.id ? existing! : await createSession(env, person.id);
    return new Response(null, {
      status: 302,
      headers: { location: '/?welcome=1', 'set-cookie': sessionCookie(token), 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    });
  }
  if ((m = /^\/claude\/([^/]+)\/?$/.exec(path))) return handleConnector(env, req, m[1]);
  if (path.startsWith('/.well-known/oauth')) return json({ error: 'not_found' }, 404); // no sign-in on the Claude link
  if (path === '/manifest.webmanifest') {
    const h = url.searchParams.get('h');
    const start = looksLikeToken(h) ? `/?h=${h}` : '/';
    return new Response(JSON.stringify({ ...MANIFEST, start_url: start }), {
      headers: { 'content-type': 'application/manifest+json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  if (path === '/webhooks/twilio/sms' && req.method === 'POST') return twilioWebhook(env, req, url);
  if (path.startsWith('/api/')) return api(env, req, url);
  return env.ASSETS.fetch(req);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(env, req);
    } catch (e) {
      if (e instanceof AppError) return json({ error: e.message, code: e.code }, e.status);
      console.error('unhandled', e);
      return json({ error: 'Something went wrong. Try again.', code: 'server_error' }, 500);
    }
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runCron(env).then((r) => console.log('cron', JSON.stringify(r))));
  },
} satisfies ExportedHandler<Env>;
