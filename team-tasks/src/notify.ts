// One notify function, two channels behind it: push and text. Quiet hours are enforced here and nowhere else.
import { getPerson } from './auth';
import { sendPush, type PushSub } from './push';
import { sendSms, smsConfigured } from './sms';
import { isQuiet, nextSendTime } from './time';
import type { Env, Person } from './types';
import { now } from './util';

export interface Note {
  title: string;
  body: string;       // push body
  sms?: string;       // text message body, if it should differ
  url: string;        // where a tap lands
  tag: string;        // replaces an older notification with the same tag
  reply?: string;     // reply token: shows Done / Working on it buttons
}
export interface Delivery { queued: boolean; push: number; sms: boolean; reachable: boolean }

async function deliver(env: Env, person: Person, note: Note): Promise<Delivery> {
  const out: Delivery = { queued: false, push: 0, sms: false, reachable: false };
  const t = now(env);
  if (person.notify_push) {
    const subs = await env.DB.prepare('SELECT id, endpoint, p256dh, auth FROM push_subs WHERE person_id = ?')
      .bind(person.id).all<PushSub & { id: number }>();
    for (const sub of subs.results) {
      const r = await sendPush(env, sub, { title: note.title, body: note.body, url: note.url, tag: note.tag, reply: note.reply }, t);
      if (r === 'ok') out.push++;
      if (r === 'gone') await env.DB.prepare('DELETE FROM push_subs WHERE id = ?').bind(sub.id).run();
    }
  }
  if (person.notify_sms && person.phone && !person.sms_stopped && smsConfigured(env)) {
    const r = await sendSms(env, person.phone, note.sms ?? `${note.title}. ${note.body}`);
    out.sms = r === 'ok';
    if (r === 'stopped') await env.DB.prepare('UPDATE people SET sms_stopped = 1 WHERE id = ?').bind(person.id).run();
  }
  out.reachable = out.push > 0 || out.sms;
  return out;
}

/** Send a message to one person on the channels they chose. Held until 8:00 AM Pacific during quiet hours. */
export async function notify(env: Env, person: Person, note: Note): Promise<Delivery> {
  const t = now(env);
  if (isQuiet(t)) {
    await env.DB.prepare('INSERT INTO outbox (person_id, payload, send_after, created_at) VALUES (?, ?, ?, ?)')
      .bind(person.id, JSON.stringify(note), nextSendTime(t), t).run();
    return { queued: true, push: 0, sms: false, reachable: true };
  }
  return deliver(env, person, note);
}

/** Deliver anything that was held back. Called by the hourly cron. */
export async function flushOutbox(env: Env): Promise<number> {
  const t = now(env);
  if (isQuiet(t)) return 0;
  const due = await env.DB.prepare('SELECT id, person_id, payload FROM outbox WHERE sent_at IS NULL AND send_after <= ? ORDER BY id LIMIT 50')
    .bind(t).all<{ id: number; person_id: number; payload: string }>();
  let sent = 0;
  for (const row of due.results) {
    // Mark first, so a crash can never send the same message twice.
    await env.DB.prepare('UPDATE outbox SET sent_at = ? WHERE id = ?').bind(t, row.id).run();
    const person = await getPerson(env, row.person_id);
    if (!person) continue;
    await deliver(env, person, JSON.parse(row.payload) as Note);
    sent++;
  }
  return sent;
}
