// The weekday 9:00 AM Pacific digest. One message per person, never one per task.
import { getPeople } from './auth';
import { liveTasks } from './core';
import { flushOutbox, notify } from './notify';
import { daysBetween, describeDue, isDigestHour, pacific } from './time';
import type { Env, Task } from './types';
import { now } from './util';

const STALE_MS = 3 * 86_400_000;

export interface Nudge { task: Task; reason: string }

/** A task needs a nudge if it is overdue, or has sat at "not started" for 3 or more days. */
export function nudgeFor(task: Task, nowMs: number, today: string): Nudge | null {
  if (task.deleted_at || task.status === 'done') return null;
  if (task.due_on && task.due_on < today) {
    const n = daysBetween(task.due_on, today);
    return { task, reason: n === 1 ? 'was due yesterday' : `was due ${describeDue(task.due_on, today)}, ${n} days ago` };
  }
  if (task.status === 'not_started' && nowMs - task.status_changed_at >= STALE_MS) {
    return { task, reason: `not started for ${Math.floor((nowMs - task.status_changed_at) / 86_400_000)} days` };
  }
  return null;
}

export function digestText(name: string, nudges: Nudge[]): string {
  const shown = nudges.slice(0, 6).map((n) => `• ${n.task.title} (${n.reason})`);
  const more = nudges.length > 6 ? [`…and ${nudges.length - 6} more.`] : [];
  const head = nudges.length === 1 ? `Good morning, ${name}. 1 task needs a look:` : `Good morning, ${name}. ${nudges.length} tasks need a look:`;
  return [head, ...shown, ...more].join('\n');
}

/** Send today's digests. Safe to call more than once: each person gets at most one a day. */
export async function sendDigests(env: Env): Promise<number> {
  const t = now(env);
  if (!isDigestHour(t)) return 0;
  const today = pacific(t).date;
  const [people, tasks] = await Promise.all([getPeople(env), liveTasks(env)]);
  let sent = 0;
  for (const person of people) {
    if (person.last_digest_on === today) continue;
    await env.DB.prepare('UPDATE people SET last_digest_on = ? WHERE id = ?').bind(today, person.id).run();
    const nudges = tasks.filter((k) => k.owner_id === person.id).map((k) => nudgeFor(k, t, today)).filter((n): n is Nudge => n !== null);
    if (nudges.length === 0) continue;
    const text = digestText(person.name, nudges);
    const [head, ...rest] = text.split('\n');
    await notify(env, person, { title: head, body: rest.join('\n'), sms: text, url: '/', tag: `digest-${today}` });
    sent++;
  }
  return sent;
}

/** Runs every hour. Delivers held messages after quiet hours, and the digest in the 9 AM hour. */
export async function runCron(env: Env): Promise<{ flushed: number; digests: number }> {
  const flushed = await flushOutbox(env);
  const digests = await sendDigests(env);
  // Keep the rate-limit table small.
  const sec = Math.floor(now(env) / 1000);
  await env.DB.prepare("DELETE FROM rate_limits WHERE (key LIKE '%:60' AND win < ?) OR (key LIKE '%:600' AND win < ?)")
    .bind(Math.floor(sec / 60) - 5, Math.floor(sec / 600) - 5).run().catch(() => {});
  return { flushed, digests };
}
