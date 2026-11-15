import { beforeEach, describe, expect, it } from 'vitest';
import { j, makeRig, TUE_1030, type Rig } from './helpers';

let r: Rig;
beforeEach(async () => { r = await makeRig(); });
const add = async (who: string, title: string, owner?: number, due?: string) => (await j(await r.call(who, 'POST', '/api/tasks', { title, owner_id: owner, due_on: due }))).task;

describe('sign-in', () => {
  it('signs in from an invite link with a long-lived secure cookie', async () => {
    const res = await r.call(null, 'GET', `/join/${r.links.Nevan}`);
    expect(res.status).toBe(302);
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^__Host-tt=[\w-]{43};/);
    expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Lax');
    expect(Number(/Max-Age=(\d+)/.exec(cookie)![1])).toBeGreaterThan(300 * 86400);
    const board = await j(await r.call('Nevan', 'GET', '/api/board'));
    expect(board.me.name).toBe('Nevan');
    expect(board.people.map((p: any) => p.name)).toEqual(['Elijah', 'Nevan', 'Gregory']);
    expect(board.tasks).toEqual([]); // production starts empty
  });
  it('the same link works on a second device', async () => {
    const a = await r.signIn('Nevan'); const b = await r.signIn('Nevan');
    expect(a).not.toBe(b);
    expect((await r.call('Nevan', 'GET', '/api/board')).status).toBe(200);
  });
  it('stores only hashes of tokens', async () => {
    const session = await r.signIn('Nevan');
    const dump = JSON.stringify([
      (await r.env.DB.prepare('SELECT * FROM people').all()).results,
      (await r.env.DB.prepare('SELECT * FROM sessions').all()).results,
    ]);
    expect(dump).not.toContain(r.links.Nevan); expect(dump).not.toContain(session);
  });
  it('rejects bad links and missing cookies', async () => {
    expect((await r.call(null, 'GET', '/join/' + 'x'.repeat(43))).headers.get('location')).toContain('bad-link');
    expect((await r.call(null, 'GET', '/api/board')).status).toBe(401);
    expect((await r.call(null, 'POST', '/api/tasks', { title: 'x' })).status).toBe(401);
  });
  it('rate-limits sign-in attempts', async () => {
    let last = '';
    for (let i = 0; i < 22; i++) last = (await r.call(null, 'GET', '/join/' + String(i).padStart(43, 'a'))).headers.get('location')!;
    expect(last).toContain('slow-down');
    expect((await r.call(null, 'GET', `/join/${r.links.Nevan}`)).headers.get('location')).toContain('slow-down');
  });
  it('lets the owner reset a link, which signs that person out everywhere', async () => {
    await r.signIn('Nevan');
    const connector = (await j(await r.call('Nevan', 'GET', '/api/connector'))).url as string;
    expect((await r.call('Nevan', 'POST', '/api/people/3/reset-link', {})).status).toBe(403); // members cannot
    const res = await j(await r.call('Elijah', 'POST', '/api/people/2/reset-link', {}));
    expect(res.invite_url).toMatch(/\/join\/[\w-]{43}$/);
    expect((await r.call('Nevan', 'GET', '/api/board')).status).toBe(401);
    expect((await r.call(null, 'GET', `/join/${r.links.Nevan}`)).headers.get('location')).toContain('bad-link');
    const rpc = await r.call(null, 'POST', new URL(connector).pathname, { jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(rpc.status).toBe(404); // the old Claude link is dead too
    r.links.Nevan = res.invite_url.split('/join/')[1];
    await r.signIn('Nevan');
    expect((await r.call('Nevan', 'GET', '/api/board')).status).toBe(200);
  });
  it('hands a Home Screen app its own sign-in', async () => {
    const { h } = await j(await r.call('Nevan', 'POST', '/api/handoff', {}));
    const res = await r.call(null, 'POST', '/api/session/adopt', { h });
    expect(res.headers.get('set-cookie')).toContain(h);
    expect((await r.call(null, 'POST', '/api/session/adopt', { h: 'y'.repeat(43) })).status).toBe(401);
    const m = await j(await r.call(null, 'GET', `/manifest.webmanifest?h=${h}`));
    expect(m.start_url).toBe(`/?h=${h}`); expect(m.name).toBe('Team Tasks'); expect(m.background_color).toBe('#060606');
  });
  it('only the owner can add a person', async () => {
    expect((await r.call('Nevan', 'POST', '/api/people', { name: 'Mara' })).status).toBe(403);
    const res = await j(await r.call('Elijah', 'POST', '/api/people', { name: '  Mara ' }));
    expect(res.person.name).toBe('Mara');
    r.links.Mara = res.invite_url.split('/join/')[1];
    expect((await j(await r.call('Mara', 'GET', '/api/board'))).people).toHaveLength(4);
    expect((await r.call('Elijah', 'POST', '/api/people', { name: 'mara' })).status).toBe(400);
    expect((await r.call('Elijah', 'POST', '/api/people', { name: '' })).status).toBe(400);
  });
});

describe('tasks', () => {
  it('anyone can add a task to anyone, and it records who', async () => {
    const t = await add('Nevan', '  Lock the   budget ', 3, '2026-11-12');
    expect(t).toMatchObject({ title: 'Lock the budget', owner_id: 3, status: 'not_started', due_on: '2026-11-12', created_by: 2, updated_by: 2 });
    expect((await add('Nevan', 'Mine')).owner_id).toBe(2);
  });
  it('validates input', async () => {
    for (const body of [{ title: '' }, { title: 'x', owner_id: 99 }, { title: 'x', due_on: 'soon' }, { title: 'x', due_on: '2026-02-30' }]) {
      expect((await r.call('Nevan', 'POST', '/api/tasks', body)).status).toBe(400);
    }
    expect((await r.call('Nevan', 'POST', '/api/tasks', 'title=x', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await r.call('Nevan', 'POST', '/api/tasks', '{bad')).status).toBe(400);
    expect((await add('Nevan', 'y'.repeat(500))).title).toHaveLength(200);
    const t = await add('Nevan', 'ok');
    expect((await r.call('Nevan', 'PATCH', `/api/tasks/${t.id}`, { status: 'purple' })).status).toBe(400);
    expect((await r.call('Nevan', 'PATCH', '/api/tasks/999', { status: 'done' })).status).toBe(404);
  });
  it('refuses writes from another site', async () => {
    expect((await r.call('Nevan', 'POST', '/api/tasks', { title: 'x' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await r.call('Nevan', 'POST', '/api/tasks', { title: 'x' }, { origin: 'https://tt.test' })).status).toBe(201);
  });
  it('anyone can change status, edit, reassign and set a due date; the version moves', async () => {
    const t = await add('Elijah', 'Scout the canyon', 2);
    const v1 = (await j(await r.call('Gregory', 'GET', '/api/board'))).version;
    expect((await j(await r.call('Gregory', 'GET', `/api/board?v=${v1}`))).unchanged).toBe(true);
    r.clock.t += 60_000;
    const u = (await j(await r.call('Gregory', 'PATCH', `/api/tasks/${t.id}`, { status: 'in_progress', title: 'Scout the canyon road', owner_id: 3, due_on: '2026-11-20' }))).task;
    expect(u).toMatchObject({ status: 'in_progress', title: 'Scout the canyon road', owner_id: 3, due_on: '2026-11-20', updated_by: 3, created_by: 1 });
    expect(u.status_changed_at).toBe(r.clock.t);
    const board = await j(await r.call('Gregory', 'GET', `/api/board?v=${v1}`));
    expect(board.version).toBeGreaterThan(v1);
    expect(board.tasks[0].title).toBe('Scout the canyon road');
  });
  it('removes softly and can undo', async () => {
    const t = await add('Elijah', 'Call the gaffer');
    await r.call('Nevan', 'DELETE', `/api/tasks/${t.id}`);
    expect((await j(await r.call('Elijah', 'GET', '/api/board'))).tasks).toHaveLength(0);
    const row = await r.env.DB.prepare('SELECT deleted_at, deleted_by FROM tasks WHERE id = ?').bind(t.id).first<any>();
    expect(row.deleted_at).toBeTruthy(); expect(row.deleted_by).toBe(2);
    await r.call('Nevan', 'POST', `/api/tasks/${t.id}/restore`, {});
    expect((await j(await r.call('Elijah', 'GET', '/api/board'))).tasks).toHaveLength(1);
  });
  it('keeps an activity log of who did what', async () => {
    const t = await add('Elijah', 'Lock the budget', 2);
    await r.call('Nevan', 'PATCH', `/api/tasks/${t.id}`, { status: 'in_progress' });
    await r.call('Nevan', 'PATCH', `/api/tasks/${t.id}`, { status: 'done' });
    await r.call('Gregory', 'DELETE', `/api/tasks/${t.id}`);
    const items = (await j(await r.call('Elijah', 'GET', '/api/activity'))).items;
    expect(items.map((a: any) => `${a.actor} ${a.text}`)).toEqual([
      'Gregory removed “Lock the budget”', 'Nevan finished “Lock the budget”', 'Nevan started “Lock the budget”', 'Elijah added “Lock the budget” for Nevan',
    ]);
  });
  it('rate-limits writes', async () => {
    let status = 0;
    for (let i = 0; i < 95; i++) status = (await r.call('Nevan', 'POST', '/api/tasks', { title: 't' + i })).status;
    expect(status).toBe(429);
  });
});

describe('check-ins', () => {
  it('messages the owner, limits to one per task every 4 hours, and tells the sender the answer', async () => {
    await r.subscribe('Nevan'); await r.subscribe('Elijah');
    const t = await add('Elijah', 'Lock the budget', 2);
    const res = await j(await r.call('Elijah', 'POST', `/api/tasks/${t.id}/checkin`, {}));
    expect(res).toMatchObject({ ok: true, owner: 'Nevan', queued: false, reachable: true });
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0].url).toBe('https://push.example/Nevan');
    expect((r.sent[0].init.headers as any).authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);

    const again = await r.call('Gregory', 'POST', `/api/tasks/${t.id}/checkin`, {});
    expect(again.status).toBe(429); expect((await j(again)).code).toBe('checkin_too_soon');
    r.clock.t += 3 * 3600_000 + 59 * 60_000;
    expect((await r.call('Gregory', 'POST', `/api/tasks/${t.id}/checkin`, {})).status).toBe(429);

    const board = await j(await r.call('Nevan', 'GET', '/api/board'));
    expect(board.asks).toHaveLength(1);
    const reply = await j(await r.call('Nevan', 'POST', `/api/checkins/${board.asks[0].id}/reply`, { answer: 'working' }));
    expect(reply.task.status).toBe('in_progress');
    expect(r.sent).toHaveLength(2);
    expect(r.sent[1].url).toBe('https://push.example/Elijah'); // the sender is told
    expect((await j(await r.call('Nevan', 'GET', '/api/board'))).asks).toHaveLength(0);

    r.clock.t += 2 * 60_000; // past 4 hours
    expect((await r.call('Gregory', 'POST', `/api/tasks/${t.id}/checkin`, {})).status).toBe(200);
  });
  it('answers from a push notification button with a signed token, no cookie', async () => {
    await r.subscribe('Nevan');
    const t = await add('Elijah', 'Book the stage', 2);
    await r.call('Elijah', 'POST', `/api/tasks/${t.id}/checkin`, {});
    const { replyToken } = await import('../src/auth');
    const token = await replyToken(r.env, 1);
    expect((await r.call(null, 'POST', `/api/reply/${token.slice(0, -2)}xx`, { answer: 'done' })).status).toBe(404);
    expect((await r.call(null, 'POST', `/api/reply/${token}`, { answer: 'maybe' })).status).toBe(400);
    const res = await j(await r.call(null, 'POST', `/api/reply/${token}`, { answer: 'done' }));
    expect(res.status).toBe('done');
    const items = (await j(await r.call('Elijah', 'GET', '/api/activity'))).items;
    expect(items[0]).toMatchObject({ actor: 'Nevan', text: 'finished “Book the stage”', via: 'push' });
  });
  it('will not check in on a finished task', async () => {
    const t = await add('Elijah', 'Done thing', 2);
    await r.call('Nevan', 'PATCH', `/api/tasks/${t.id}`, { status: 'done' });
    expect((await r.call('Elijah', 'POST', `/api/tasks/${t.id}/checkin`, {})).status).toBe(400);
  });
  it('never sends between 9 PM and 8 AM Pacific; it holds the message until 8', async () => {
    r = await makeRig(Date.parse('2026-11-11T06:30:00Z')); // Tue 10:30 PM PST
    await r.subscribe('Nevan');
    const t = await add('Elijah', 'Late idea', 2);
    const res = await j(await r.call('Elijah', 'POST', `/api/tasks/${t.id}/checkin`, {}));
    expect(res.queued).toBe(true);
    expect(r.sent).toHaveLength(0);
    const { runCron } = await import('../src/nudge');
    r.clock.t = Date.parse('2026-11-11T15:00:00Z'); // 7:00 AM
    await runCron(r.env); expect(r.sent).toHaveLength(0);
    r.clock.t = Date.parse('2026-11-11T16:00:00Z'); // 8:00 AM
    await runCron(r.env); expect(r.sent).toHaveLength(1);
    await runCron(r.env); expect(r.sent).toHaveLength(1); // never twice
  });
  it('removes dead push subscriptions', async () => {
    await r.subscribe('Nevan');
    r.env.OUTBOUND = (async () => new Response('', { status: 410 })) as any;
    const t = await add('Elijah', 'x', 2);
    const res = await j(await r.call('Elijah', 'POST', `/api/tasks/${t.id}/checkin`, {}));
    expect(res.reachable).toBe(false);
    expect((await r.env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs').first<any>()).n).toBe(0);
  });
});

describe('settings', () => {
  it('saves a phone number and channel choice', async () => {
    expect((await r.call('Nevan', 'PATCH', '/api/me', { phone: 'hello' })).status).toBe(400);
    const me = (await j(await r.call('Nevan', 'PATCH', '/api/me', { phone: '(310) 555-0123', notify_sms: true, notify_push: false }))).me;
    expect(me).toMatchObject({ phone: '+13105550123', notify_sms: true, notify_push: false });
    expect((await j(await r.call('Nevan', 'PATCH', '/api/me', { phone: '' }))).me).toMatchObject({ phone: null, notify_sms: false });
    expect(TUE_1030).toBeGreaterThan(0);
  });
});
