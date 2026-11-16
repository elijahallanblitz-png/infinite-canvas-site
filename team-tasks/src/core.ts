// The rules of the board. The app, the Claude connector, push replies and text replies all go through here.
import { getPeople, getPerson, newInvite, replyToken } from './auth';
import { notify, type Delivery } from './notify';
import { describeDue, isDate, pacific } from './time';
import { AppError, STATUSES, type Env, type Person, type Status, type Task, type Via } from './types';
import { cleanText, now } from './util';

export const CHECKIN_GAP = 4 * 3_600_000; // one check-in per task every 4 hours
const ASK_LIFE = 48 * 3_600_000;          // an unanswered check-in stops showing after two days
export const TITLE_MAX = 200;
export const NAME_MAX = 40;
const q = (s: string) => `“${s}”`;

export async function bump(env: Env): Promise<void> {
  await env.DB.prepare("UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'version'").run();
}
export async function boardVersion(env: Env): Promise<number> {
  const r = await env.DB.prepare("SELECT value FROM meta WHERE key = 'version'").first<{ value: string }>();
  return Number(r?.value ?? 1);
}

async function log(env: Env, actor: Person | null, verb: string, taskId: number | null, text: string, via: Via) {
  await env.DB.prepare('INSERT INTO activity (actor_id, verb, task_id, text, via, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(actor?.id ?? null, verb, taskId, text, via, now(env)).run();
}

export async function getTask(env: Env, id: number, includeRemoved = false): Promise<Task> {
  const t = Number.isInteger(id) ? await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>() : null;
  if (!t || (t.deleted_at && !includeRemoved)) throw new AppError('That task is not on the board.', 404, 'not_found');
  return t;
}
export async function liveTasks(env: Env): Promise<Task[]> {
  const r = await env.DB.prepare('SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY id').all<Task>();
  return r.results;
}

function checkStatus(s: unknown): Status {
  if (typeof s !== 'string' || !STATUSES.includes(s as Status)) throw new AppError('Status must be not_started, in_progress or done.');
  return s as Status;
}
function checkDue(d: unknown): string | null {
  if (d === null || d === undefined || d === '') return null;
  if (!isDate(d)) throw new AppError('Due date must look like 2026-11-20.');
  return d;
}
async function checkOwner(env: Env, id: unknown): Promise<Person> {
  const p = Number.isInteger(id) ? await getPerson(env, id as number) : null;
  if (!p) throw new AppError('That person is not on the team.');
  return p;
}

export async function createTask(env: Env, actor: Person, input: { title: unknown; owner_id?: unknown; due_on?: unknown }, via: Via): Promise<Task> {
  const title = cleanText(input.title, TITLE_MAX);
  if (!title) throw new AppError('The task needs a few words.');
  const owner = input.owner_id === undefined || input.owner_id === null ? actor : await checkOwner(env, input.owner_id);
  const due = checkDue(input.due_on);
  const t = now(env);
  const row = await env.DB.prepare(
    `INSERT INTO tasks (title, owner_id, status, due_on, created_by, updated_by, created_at, updated_at, status_changed_at)
     VALUES (?, ?, 'not_started', ?, ?, ?, ?, ?, ?) RETURNING *`,
  ).bind(title, owner.id, due, actor.id, actor.id, t, t, t).first<Task>();
  await log(env, actor, 'add', row!.id, `added ${q(title)}${owner.id === actor.id ? '' : ` for ${owner.name}`}`, via);
  await bump(env);
  return row!;
}

export async function updateTask(
  env: Env, actor: Person, id: number,
  patch: { title?: unknown; owner_id?: unknown; status?: unknown; due_on?: unknown }, via: Via,
): Promise<Task> {
  const task = await getTask(env, id);
  const t = now(env);
  const today = pacific(t).date;
  const next = { ...task };
  const lines: Array<[string, string]> = [];
  if (patch.title !== undefined) {
    const title = cleanText(patch.title, TITLE_MAX);
    if (!title) throw new AppError('The task needs a few words.');
    if (title !== task.title) { lines.push(['rename', `renamed ${q(task.title)} to ${q(title)}`]); next.title = title; }
  }
  if (patch.owner_id !== undefined) {
    const owner = await checkOwner(env, patch.owner_id);
    if (owner.id !== task.owner_id) { lines.push(['reassign', `gave ${q(next.title)} to ${owner.name}`]); next.owner_id = owner.id; }
  }
  if (patch.due_on !== undefined) {
    const due = checkDue(patch.due_on);
    if (due !== task.due_on) {
      lines.push(['due', due ? `set ${q(next.title)} due ${describeDue(due, today)}` : `cleared the due date on ${q(next.title)}`]);
      next.due_on = due;
    }
  }
  let statusChanged = false;
  if (patch.status !== undefined) {
    const status = checkStatus(patch.status);
    if (status !== task.status) {
      statusChanged = true;
      next.status = status;
      next.status_changed_at = t;
      lines.push(['status', status === 'done' ? `finished ${q(next.title)}`
        : status === 'in_progress' ? `started ${q(next.title)}` : `moved ${q(next.title)} back to not started`]);
    }
  }
  if (lines.length === 0) return task;
  next.updated_at = t;
  next.updated_by = actor.id;
  await env.DB.prepare('UPDATE tasks SET title = ?, owner_id = ?, status = ?, due_on = ?, status_changed_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
    .bind(next.title, next.owner_id, next.status, next.due_on, next.status_changed_at, t, actor.id, id).run();
  for (const [verb, text] of lines) await log(env, actor, verb, id, text, via);
  if (statusChanged && next.status !== 'not_started') await closeCheckins(env, next, actor, next.status === 'done' ? 'done' : 'working');
  await bump(env);
  return next;
}

export async function removeTask(env: Env, actor: Person, id: number, via: Via): Promise<Task> {
  const task = await getTask(env, id);
  const t = now(env);
  await env.DB.prepare('UPDATE tasks SET deleted_at = ?, deleted_by = ? WHERE id = ?').bind(t, actor.id, id).run();
  await log(env, actor, 'remove', id, `removed ${q(task.title)}`, via);
  await bump(env);
  return { ...task, deleted_at: t, deleted_by: actor.id };
}
export async function restoreTask(env: Env, actor: Person, id: number, via: Via): Promise<Task> {
  const task = await getTask(env, id, true);
  if (!task.deleted_at) return task;
  await env.DB.prepare('UPDATE tasks SET deleted_at = NULL, deleted_by = NULL WHERE id = ?').bind(id).run();
  await log(env, actor, 'restore', id, `put back ${q(task.title)}`, via);
  await bump(env);
  return { ...task, deleted_at: null, deleted_by: null };
}

// ---- Check-ins ----
export interface CheckinResult { task: Task; owner: Person; delivery: Delivery }

export async function checkIn(env: Env, sender: Person, taskId: number, via: Via): Promise<CheckinResult> {
  const task = await getTask(env, taskId);
  if (task.status === 'done') throw new AppError('That task is already done.');
  const t = now(env);
  const last = await env.DB.prepare('SELECT created_at FROM checkins WHERE task_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(taskId).first<{ created_at: number }>();
  if (last && t - last.created_at < CHECKIN_GAP) {
    const mins = Math.ceil((CHECKIN_GAP - (t - last.created_at)) / 60_000);
    const wait = mins >= 60 ? `${Math.ceil(mins / 60)} hours` : `${mins} minutes`;
    throw new AppError(`Someone already checked in on this. You can check in again in ${wait}.`, 429, 'checkin_too_soon');
  }
  const owner = (await getPerson(env, task.owner_id))!;
  const row = await env.DB.prepare('INSERT INTO checkins (task_id, sender_id, owner_id, created_at) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(taskId, sender.id, owner.id, t).first<{ id: number }>();
  await log(env, sender, 'checkin', taskId, `checked in on ${q(task.title)}${owner.id === sender.id ? '' : ` with ${owner.name}`}`, via);
  await bump(env);
  const line = `${sender.name} is checking in on ${q(task.title)}. Where is it at?`;
  const delivery = await notify(env, owner, {
    title: 'Team Tasks',
    body: line,
    sms: `${line} Reply 1 for done or 2 for working on it.`,
    url: `/?ask=${row!.id}`,
    tag: `checkin-${row!.id}`,
    reply: await replyToken(env, row!.id),
  });
  return { task, owner, delivery };
}

/** Mark open check-ins on a task answered and tell whoever asked. */
async function closeCheckins(env: Env, task: Task, answeredBy: Person, answer: 'done' | 'working') {
  const t = now(env);
  const open = await env.DB.prepare('SELECT id, sender_id FROM checkins WHERE task_id = ? AND answered_at IS NULL AND created_at > ?')
    .bind(task.id, t - ASK_LIFE).all<{ id: number; sender_id: number }>();
  if (open.results.length === 0) return;
  await env.DB.prepare('UPDATE checkins SET answered_at = ?, answer = ? WHERE task_id = ? AND answered_at IS NULL')
    .bind(t, answer, task.id).run();
  const told = new Set<number>();
  for (const c of open.results) {
    if (c.sender_id === answeredBy.id || told.has(c.sender_id)) continue;
    told.add(c.sender_id);
    const sender = await getPerson(env, c.sender_id);
    if (!sender) continue;
    const body = answer === 'done' ? `${answeredBy.name} says ${q(task.title)} is done.` : `${answeredBy.name} is working on ${q(task.title)}.`;
    await notify(env, sender, { title: 'Team Tasks', body, sms: body, url: '/', tag: `answer-${c.id}` });
  }
}

/** The owner's one-tap answer: done, or working on it. */
export async function answerCheckin(env: Env, checkinId: number, answer: unknown, via: Via, actor?: Person): Promise<{ task: Task; answer: 'done' | 'working' }> {
  if (answer !== 'done' && answer !== 'working') throw new AppError('Answer must be done or working.');
  const c = await env.DB.prepare('SELECT id, task_id, owner_id, answered_at FROM checkins WHERE id = ?')
    .bind(checkinId).first<{ id: number; task_id: number; owner_id: number; answered_at: number | null }>();
  if (!c) throw new AppError('That check-in is gone.', 404, 'not_found');
  const task = await getTask(env, c.task_id);
  const who = actor ?? (await getPerson(env, task.owner_id)) ?? (await getPerson(env, c.owner_id));
  if (!who) throw new AppError('That check-in is gone.', 404, 'not_found');
  const want: Status = answer === 'done' ? 'done' : 'in_progress';
  if (task.status === want) {
    // Nothing to move, but the person who asked still deserves an answer.
    if (!c.answered_at) {
      await log(env, who, 'answer', task.id, answer === 'done' ? `said ${q(task.title)} is done` : `said ${q(task.title)} is still in progress`, via);
      await closeCheckins(env, task, who, answer);
      await bump(env);
    }
    return { task, answer };
  }
  if (task.status === 'done') return { task, answer: 'done' }; // never pull a finished task backwards from a notification
  return { task: await updateTask(env, who, task.id, { status: want }, via), answer };
}

/** The newest unanswered check-in waiting on a person. Used for text replies. */
export async function latestAskFor(env: Env, ownerId: number): Promise<number | null> {
  const r = await env.DB.prepare(
    `SELECT c.id FROM checkins c JOIN tasks t ON t.id = c.task_id
     WHERE t.owner_id = ? AND c.answered_at IS NULL AND c.created_at > ? AND t.deleted_at IS NULL AND t.status != 'done'
     ORDER BY c.created_at DESC LIMIT 1`,
  ).bind(ownerId, now(env) - ASK_LIFE).first<{ id: number }>();
  return r?.id ?? null;
}

// ---- People ----
export async function addPerson(env: Env, actor: Person, rawName: unknown): Promise<{ person: Person; invite: string }> {
  if (actor.role !== 'owner') throw new AppError('Only the owner can add people.', 403, 'forbidden');
  const name = cleanText(rawName, NAME_MAX);
  if (!name) throw new AppError('Type a name.');
  const people = await getPeople(env);
  if (people.some((p) => p.name.toLowerCase() === name.toLowerCase())) throw new AppError(`${name} is already on the team.`);
  if (people.length >= 12) throw new AppError('The team is full. Twelve people is the limit.');
  const row = await env.DB.prepare("INSERT INTO people (name, role, created_at) VALUES (?, 'member', ?) RETURNING id")
    .bind(name, now(env)).first<{ id: number }>();
  const invite = await newInvite(env, row!.id);
  await log(env, actor, 'person', null, `added ${name} to the team`, 'app');
  await bump(env);
  return { person: (await getPerson(env, row!.id))!, invite };
}

// ---- The board, as one payload ----
export async function boardPayload(env: Env, me: Person) {
  const t = now(env);
  const [people, tasks, version, checks, asks] = await Promise.all([
    getPeople(env),
    liveTasks(env),
    boardVersion(env),
    env.DB.prepare('SELECT task_id, MAX(created_at) AS at FROM checkins WHERE created_at > ? GROUP BY task_id')
      .bind(t - CHECKIN_GAP).all<{ task_id: number; at: number }>(),
    env.DB.prepare(
      `SELECT c.id, c.task_id, c.sender_id, c.created_at FROM checkins c JOIN tasks t ON t.id = c.task_id
       WHERE t.owner_id = ? AND c.answered_at IS NULL AND c.created_at > ? AND t.deleted_at IS NULL AND t.status != 'done'
       ORDER BY c.created_at DESC`,
    ).bind(me.id, t - ASK_LIFE).all<{ id: number; task_id: number; sender_id: number; created_at: number }>(),
  ]);
  const lastCheck = new Map(checks.results.map((c) => [c.task_id, c.at]));
  const seen = new Set<number>();
  return {
    version,
    today: pacific(t).date,
    people: people.map((p) => ({ id: p.id, name: p.name, role: p.role, icon: p.icon ?? null })),
    tasks: tasks.map((k) => ({
      id: k.id, title: k.title, owner_id: k.owner_id, status: k.status, due_on: k.due_on,
      created_by: k.created_by, updated_by: k.updated_by, created_at: k.created_at, updated_at: k.updated_at,
      status_changed_at: k.status_changed_at, checked_at: lastCheck.get(k.id) ?? null,
    })),
    // One banner per task, newest first.
    asks: asks.results.filter((a) => !seen.has(a.task_id) && seen.add(a.task_id)),
  };
}

export async function recentActivity(env: Env, limit = 80) {
  const r = await env.DB.prepare(
    `SELECT a.id, a.verb, a.text, a.via, a.created_at, a.task_id, p.name AS actor
     FROM activity a LEFT JOIN people p ON p.id = a.actor_id ORDER BY a.id DESC LIMIT ?`,
  ).bind(limit).all();
  return r.results;
}
