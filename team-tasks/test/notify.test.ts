import { createDecipheriv, createECDH, createHmac, hkdfSync, randomBytes, webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { digestText, nudgeFor, runCron } from '../src/nudge';
import { encryptPayload, vapidJwt } from '../src/push';
import { classifyInbound, normalizePhone, twilioSignature } from '../src/sms';
import type { Task } from '../src/types';
import { j, makeRig, type Rig } from './helpers';

const DAY = 86_400_000;
const NOW = Date.parse('2026-11-10T17:05:00Z'); // Tue 9:05 AM PST
const task = (o: Partial<Task>): Task => ({ id: 1, title: 'T', owner_id: 2, status: 'not_started', due_on: null, created_by: 1, updated_by: 1, created_at: NOW, updated_at: NOW, status_changed_at: NOW, deleted_at: null, deleted_by: null, ...o });

describe('nudge rules', () => {
  const today = '2026-11-10';
  it('nudges overdue tasks that are not done', () => {
    expect(nudgeFor(task({ due_on: '2026-11-09' }), NOW, today)?.reason).toBe('was due yesterday');
    expect(nudgeFor(task({ due_on: '2026-11-06', status: 'in_progress' }), NOW, today)?.reason).toContain('4 days ago');
    expect(nudgeFor(task({ due_on: '2026-11-09', status: 'done' }), NOW, today)).toBeNull();
    expect(nudgeFor(task({ due_on: today }), NOW, today)).toBeNull(); // due today is not overdue
  });
  it('nudges tasks not started for 3 or more days', () => {
    expect(nudgeFor(task({ status_changed_at: NOW - 3 * DAY }), NOW, today)?.reason).toBe('not started for 3 days');
    expect(nudgeFor(task({ status_changed_at: NOW - 3 * DAY + 60_000 }), NOW, today)).toBeNull();
    expect(nudgeFor(task({ status: 'in_progress', status_changed_at: NOW - 9 * DAY }), NOW, today)).toBeNull();
    expect(nudgeFor(task({ status_changed_at: NOW - 9 * DAY, deleted_at: NOW }), NOW, today)).toBeNull();
  });
  it('writes one digest listing every task', () => {
    const text = digestText('Nevan', [{ task: task({ title: 'Lock the budget' }), reason: 'was due yesterday' }, { task: task({ title: 'Call the gaffer' }), reason: 'not started for 4 days' }]);
    expect(text).toBe('Good morning, Nevan. 2 tasks need a look:\n• Lock the budget (was due yesterday)\n• Call the gaffer (not started for 4 days)');
  });
});

describe('the 9:00 AM weekday digest', () => {
  let r: Rig;
  const seed = async (rig: Rig) => {
    await rig.subscribe('Nevan'); await rig.subscribe('Gregory'); await rig.subscribe('Elijah');
    const t = rig.clock.t;
    const ins = (title: string, owner: number, status: string, due: string | null, age: number) => rig.env.DB.prepare(
      'INSERT INTO tasks (title, owner_id, status, due_on, created_by, updated_by, created_at, updated_at, status_changed_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?)')
      .bind(title, owner, status, due, t - age * DAY, t - age * DAY, t - age * DAY).run();
    await ins('Lock the budget', 2, 'in_progress', '2026-11-09', 1);
    await ins('Call the gaffer', 2, 'not_started', null, 4);
    await ins('Scout the canyon', 2, 'not_started', '2026-11-20', 1); // fine
    await ins('Fresh thing', 3, 'not_started', null, 1);               // Gregory: nothing to nudge
    await ins('Old but done', 1, 'done', '2026-11-01', 9);             // Elijah: nothing to nudge
  };
  beforeEach(async () => { r = await makeRig(NOW); await seed(r); });

  it('sends one message per person, never one per task, and only to people who need it', async () => {
    const res = await runCron(r.env);
    expect(res.digests).toBe(1);
    expect(r.sent.map((s) => s.url)).toEqual(['https://push.example/Nevan']);
  });
  it('sends at most once a day', async () => {
    await runCron(r.env); r.clock.t += 20 * 60_000; await runCron(r.env);
    expect(r.sent).toHaveLength(1);
    r.clock.t = NOW + DAY; await runCron(r.env); // Wednesday 9 AM
    expect(r.sent).toHaveLength(2);
  });
  it('stays silent outside the 9 AM hour and on weekends', async () => {
    r.clock.t = Date.parse('2026-11-10T16:59:00Z'); await runCron(r.env);
    r.clock.t = Date.parse('2026-11-10T18:00:00Z'); await runCron(r.env);
    r.clock.t = Date.parse('2026-11-14T17:05:00Z'); await runCron(r.env); // Saturday
    r.clock.t = Date.parse('2026-11-15T17:05:00Z'); await runCron(r.env); // Sunday
    expect(r.sent).toHaveLength(0);
  });
  it('goes by text when the person chose text and Twilio is on', async () => {
    Object.assign(r.env, { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'tok', TWILIO_FROM_NUMBER: '+18005550100' });
    await r.call('Nevan', 'PATCH', '/api/me', { phone: '310 555 0123', notify_sms: true, notify_push: false });
    await runCron(r.env);
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    const form = new URLSearchParams(r.sent[0].init.body as string);
    expect(form.get('To')).toBe('+13105550123'); expect(form.get('From')).toBe('+18005550100');
    expect(form.get('Body')).toContain('Good morning, Nevan. 2 tasks need a look:');
    expect((r.sent[0].init.headers as any).authorization).toBe('Basic ' + btoa('AC123:tok'));
  });
});

describe('web push encryption', () => {
  it('produces an aes128gcm body the browser can decrypt (RFC 8291)', async () => {
    const ua = createECDH('prime256v1'); ua.generateKeys();
    const auth = randomBytes(16);
    const body = Buffer.from(await encryptPayload({ endpoint: 'https://push.example/x', p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') }, '{"title":"Team Tasks","body":"héllo"}'));
    const salt = body.subarray(0, 16); const rs = body.readUInt32BE(16); const idlen = body[20];
    const asPub = body.subarray(21, 21 + idlen); const cipher = body.subarray(21 + idlen);
    expect(rs).toBe(4096); expect(idlen).toBe(65);
    const shared = ua.computeSecret(asPub);
    const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub]), 32));
    const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const d = createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(cipher.subarray(cipher.length - 16));
    const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
    expect(plain[plain.length - 1]).toBe(2);
    expect(plain.subarray(0, -1).toString()).toBe('{"title":"Team Tasks","body":"héllo"}');
  });
  it('signs a valid VAPID token', async () => {
    const r = await makeRig();
    const jwt = await vapidJwt(r.env, 'https://web.push.apple.com', NOW);
    const [h, b, s] = jwt.split('.');
    const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
    expect(claims.aud).toBe('https://web.push.apple.com'); expect(claims.sub).toMatch(/^https:\/\//);
    expect(claims.exp - NOW / 1000).toBeLessThanOrEqual(24 * 3600);
    const key = await webcrypto.subtle.importKey('raw', Buffer.from(r.env.VAPID_PUBLIC_KEY!, 'base64url'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(s, 'base64url'), Buffer.from(`${h}.${b}`))).toBe(true);
  });
});

describe('text messages (Twilio, mocked)', () => {
  let r: Rig;
  const TW = { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'secret-token', TWILIO_FROM_NUMBER: '+18005550100' };
  const inbound = async (from: string, body: string, opts: { sign?: boolean; extra?: Record<string, string> } = {}) => {
    const params: Record<string, string> = { From: from, To: '+18005550100', Body: body, MessageSid: 'SM' + Math.random(), ...opts.extra };
    const url = 'https://tt.test/webhooks/twilio/sms';
    const sig = opts.sign === false ? 'bm9wZQ==' : await twilioSignature('secret-token', url, params);
    const res = await r.call(null, 'POST', '/webhooks/twilio/sms', new URLSearchParams(params).toString(), { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig });
    return { status: res.status, text: await res.text() };
  };
  beforeEach(async () => {
    r = await makeRig();
    await r.call('Nevan', 'PATCH', '/api/me', { phone: '310 555 0123', notify_sms: true, notify_push: false });
  });

  it('matches Twilio\'s documented signature algorithm', async () => {
    const url = 'https://mycompany.com/myapp.php?foo=1&bar=2';
    const params = { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' };
    const expected = createHmac('sha1', '12345').update(url + 'CallSidCA1234567890ABCDECaller+12349013030Digits1234From+12349013030To+18005551212').digest('base64');
    expect(await twilioSignature('12345', url, params)).toBe(expected);
  });
  it('stays off until the secrets exist', async () => {
    expect((await inbound('+13105550123', '1')).status).toBe(503);
    const t = (await j(await r.call('Elijah', 'POST', '/api/tasks', { title: 'x', owner_id: 2 }))).task;
    const res = await j(await r.call('Elijah', 'POST', `/api/tasks/${t.id}/checkin`, {}));
    expect(res.reachable).toBe(false); expect(r.sent).toHaveLength(0);
    expect((await j(await r.call('Nevan', 'GET', '/api/board'))).config.sms).toBe(false);
  });
  it('turns on with the secrets: sends the check-in, takes "1" as done, tells the sender', async () => {
    Object.assign(r.env, TW);
    await r.call('Elijah', 'PATCH', '/api/me', { phone: '+1 424 555 0199', notify_sms: true, notify_push: false });
    expect((await j(await r.call('Nevan', 'GET', '/api/board'))).config.sms).toBe(true);
    const t = (await j(await r.call('Elijah', 'POST', '/api/tasks', { title: 'Lock the budget', owner_id: 2 }))).task;
    await r.call('Elijah', 'POST', `/api/tasks/${t.id}/checkin`, {});
    expect(new URLSearchParams(r.sent[0].init.body as string).get('Body'))
      .toBe('Elijah is checking in on “Lock the budget”. Where is it at? Reply 1 for done or 2 for working on it.');
    const res = await inbound('+13105550123', ' 1 ');
    expect(res.status).toBe(200); expect(res.text).toContain('<Message>Got it. “Lock the budget” is done.</Message>');
    expect((await j(await r.call('Elijah', 'GET', '/api/board'))).tasks[0].status).toBe('done');
    const told = new URLSearchParams(r.sent[1].init.body as string);
    expect(told.get('To')).toBe('+14245550199'); expect(told.get('Body')).toBe('Nevan says “Lock the budget” is done.');
    expect((await j(await r.call('Elijah', 'GET', '/api/activity'))).items[0]).toMatchObject({ actor: 'Nevan', via: 'text' });
  });
  it('takes "2" as working on it, and says so when nothing is waiting', async () => {
    Object.assign(r.env, TW);
    expect((await inbound('+13105550123', '2')).text).toContain('Nothing is waiting on you');
    const t = (await j(await r.call('Elijah', 'POST', '/api/tasks', { title: 'Book the stage', owner_id: 2 }))).task;
    await r.call('Elijah', 'POST', `/api/tasks/${t.id}/checkin`, {});
    expect((await inbound('+13105550123', '2')).text).toContain('“Book the stage” is in progress');
    expect((await inbound('+13105550123', 'what?')).text).toContain('Reply 1 for done or 2 for working on it');
  });
  it('rejects requests with a bad signature', async () => {
    Object.assign(r.env, TW);
    expect((await inbound('+13105550123', '1', { sign: false })).status).toBe(403);
  });
  it('honours STOP, START and HELP', async () => {
    Object.assign(r.env, TW);
    expect((await inbound('+13105550123', 'HELP')).text).toContain('Reply STOP to stop texts');
    const stop = await inbound('+13105550123', 'Stop');
    expect(stop.text).not.toContain('<Message>');
    expect((await j(await r.call('Nevan', 'GET', '/api/board'))).me.sms_stopped).toBe(true);
    const t = (await j(await r.call('Elijah', 'POST', '/api/tasks', { title: 'x', owner_id: 2 }))).task;
    await r.call('Elijah', 'POST', `/api/tasks/${t.id}/checkin`, {});
    expect(r.sent).toHaveLength(0); // nothing goes to a stopped number
    expect((await inbound('+13105550123', 'START')).text).toContain('You are back');
    expect((await j(await r.call('Nevan', 'GET', '/api/board'))).me.sms_stopped).toBe(false);
    expect((await inbound('+13105550123', 'x', { extra: { OptOutType: 'STOP' } })).text).not.toContain('<Message>');
    expect((await inbound('+19995550000', '1')).text).toContain('not on Team Tasks');
  });
  it('marks a number stopped when Twilio reports error 21610', async () => {
    Object.assign(r.env, TW);
    r.env.OUTBOUND = (async () => new Response(JSON.stringify({ code: 21610 }), { status: 400 })) as any;
    const t = (await j(await r.call('Elijah', 'POST', '/api/tasks', { title: 'x', owner_id: 2 }))).task;
    await r.call('Elijah', 'POST', `/api/tasks/${t.id}/checkin`, {});
    expect((await j(await r.call('Nevan', 'GET', '/api/board'))).me.sms_stopped).toBe(true);
  });
  it('classifies replies and normalises numbers', () => {
    expect(classifyInbound('1')).toBe('done'); expect(classifyInbound('Done.')).toBe('done'); expect(classifyInbound('2')).toBe('working');
    expect(classifyInbound('UNSUBSCRIBE')).toBe('stop'); expect(classifyInbound('stop please')).toBe('unknown');
    expect(normalizePhone('310.555.0123')).toBe('+13105550123'); expect(normalizePhone('1 (310) 555-0123')).toBe('+13105550123');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958'); expect(normalizePhone('12345')).toBeNull();
  });
});
