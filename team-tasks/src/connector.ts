// "Connect your Claude": a remote tool server over Streamable HTTP, served from the same Worker.
// Each person's secret URL identifies them, so Claude needs no sign-in.
import { getPeople, personForConnector, rateLimit, requireRate } from './auth';
import { checkIn, createTask, liveTasks, removeTask, updateTask } from './core';
import { matchName, matchTitle } from './names';
import { nudgeFor } from './nudge';
import { describeDue, pacific, parseDue } from './time';
import { AppError, STATUS_WORD, type Env, type Person, type Status, type Task } from './types';
import { clientIp, json, now } from './util';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER = { name: 'team-tasks', title: 'Infinite Canvas Team Tasks', version: '1.0.0' };
const INSTRUCTIONS =
  'The shared task board for Infinite Canvas, a small film company. Each task has a title, an owner, a status ' +
  '(not started, in progress, done) and an optional due date. Names are often dictated, so pass them as heard. ' +
  'If a tool says a name or task could mean more than one thing, ask the person which one. Keep answers short.';

const str = (description: string) => ({ type: 'string', description });
const TASK_REF = str('Which task: its number (like 12) or a few words from its title, as the person said them.');
const PERSON_REF = 'A first name as the person said it. Loose spellings are fine ("Nevin" finds Nevan). Use "me" for the person talking.';

interface Tool {
  name: string; title: string; description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint?: boolean; openWorldHint: boolean };
}
const tool = (name: string, title: string, description: string, properties: Record<string, unknown>, required: string[], readOnly: boolean, destructive = false): Tool => ({
  name, title, description,
  inputSchema: { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false },
  annotations: { readOnlyHint: readOnly, destructiveHint: destructive, idempotentHint: readOnly, openWorldHint: false },
});

export const TOOLS: Tool[] = [
  tool('who_am_i', 'Who am I', 'Says whose board this is (the person talking), today\'s date, and how many tasks they have open. Call this first if you need to know who "me" is or what today is.', {}, [], true),
  tool('list_people', 'List people', 'Lists everyone on the team by name. Use it to check a name before assigning a task.', {}, [], true),
  tool('list_tasks', 'List tasks',
    'Lists tasks on the board. With no filters it lists every open task for everyone. Use person "me" for "what is on my plate". Done tasks are left out unless status is "done" or "all".',
    { person: str(PERSON_REF + ' Leave out for everyone.'), status: { type: 'string', enum: ['not_started', 'in_progress', 'done', 'open', 'all'], description: 'Filter by status. "open" (the default) means not started plus in progress.' } }, [], true),
  tool('add_task', 'Add a task',
    'Adds a task to someone\'s list. It starts as not started. Example: "Add a task for Nevan: lock the budget, due Wednesday" becomes title "Lock the budget", person "Nevan", due "Wednesday".',
    { title: str('What needs doing, in a few plain words. No name or date in the title.'), person: str(PERSON_REF + ' Leave out to give it to the person talking.'), due: str('Optional due date. A date like 2026-11-20, or words: today, tomorrow, Wednesday, this week, next week, Nov 20.') },
    ['title'], false),
  tool('update_task', 'Update a task', 'Changes a task\'s title, owner or due date. Only pass what should change. To change status use set_status.',
    { task: TASK_REF, title: str('New title.'), person: str('New owner. ' + PERSON_REF), due: str('New due date (same forms as add_task). Use "none" to clear it.') }, ['task'], false),
  tool('set_status', 'Set status', 'Sets a task to not started, in progress or done. Use for "mark X done", "I started X", "X is finished".',
    { task: TASK_REF, status: { type: 'string', enum: ['not_started', 'in_progress', 'done'], description: 'The new status.' } }, ['task', 'status'], false),
  tool('remove_task', 'Remove a task', 'Takes a task off the board. It can be put back from the app for a short time. Only use when the person clearly asks to remove or delete a task.', { task: TASK_REF }, ['task'], false, true),
  tool('check_in', 'Check in', 'Sends the task\'s owner a message asking where the task is at. They can answer in one tap. Limited to one check-in per task every 4 hours. Use for "ask Nevan about the budget" or "nudge Gregory on the edit".', { task: TASK_REF }, ['task'], false),
  tool('board_summary', 'Board summary', 'A short overview of the whole board: counts by status, each person\'s open tasks, and what is overdue. Use for "how are we doing" or "what is the team working on".', {}, [], true),
];

// ---- helpers ----
function line(t: Task, people: Person[], today: string, withOwner = true): string {
  const owner = people.find((p) => p.id === t.owner_id)?.name ?? 'someone';
  const due = t.due_on ? `, ${t.status !== 'done' && t.due_on < today ? 'OVERDUE, was due' : 'due'} ${describeDue(t.due_on, today)} (${t.due_on})` : '';
  return `#${t.id} ${t.title}${withOwner ? ` — ${owner}` : ''} — ${STATUS_WORD[t.status]}${due}`;
}

function resolvePerson(name: unknown, me: Person, people: Person[]): Person {
  if (name === undefined || name === null || name === '') return me;
  if (typeof name !== 'string') throw new AppError('person must be a name.');
  if (/^(me|myself|i|mine|my)$/i.test(name.trim())) return me;
  const m = matchName(name, people);
  if (m.kind === 'one') return m.item;
  if (m.kind === 'many') throw new AppError(`"${name}" could be ${m.choices.map((c) => c.name).join(' or ')}. Ask which one, then try again with that name.`);
  throw new AppError(`No one called "${name}" is on the team. The team is: ${people.map((p) => p.name).join(', ')}.`);
}

function resolveTask(ref: unknown, tasks: Task[], people: Person[], today: string): Task {
  if (typeof ref === 'number') ref = String(ref);
  if (typeof ref !== 'string' || !ref.trim()) throw new AppError('Say which task: its number or a few words from its title.');
  const num = /^#?\s*(\d{1,9})$/.exec(ref.trim());
  if (num) {
    const t = tasks.find((x) => x.id === Number(num[1]));
    if (!t) throw new AppError(`There is no task #${num[1]} on the board.`);
    return t;
  }
  const open = tasks.filter((t) => t.status !== 'done');
  let m = matchTitle(ref, open);
  if (m.kind === 'none') m = matchTitle(ref, tasks);
  if (m.kind === 'one') return m.item;
  if (m.kind === 'many') throw new AppError(`"${ref}" could be more than one task. Ask which one, then use its number:\n${m.choices.map((c) => line(c, people, today)).join('\n')}`);
  throw new AppError(`No task matches "${ref}". Use list_tasks to see what is on the board.`);
}

function parseStatus(s: unknown): Status {
  const v = typeof s === 'string' ? s.trim().toLowerCase().replace(/[\s-]+/g, '_') : '';
  if (['done', 'finished', 'complete', 'completed', 'green'].includes(v)) return 'done';
  if (['in_progress', 'working', 'working_on_it', 'started', 'doing', 'yellow'].includes(v)) return 'in_progress';
  if (['not_started', 'todo', 'to_do', 'red', 'reset'].includes(v)) return 'not_started';
  throw new AppError('status must be not_started, in_progress or done.');
}
function dueArg(due: unknown, today: string): string | null {
  const d = parseDue(due, today);
  if (d === undefined) throw new AppError(`Could not read the due date "${String(due)}". Send it as a date like ${today}.`);
  return d;
}

// ---- the tools ----
export async function callTool(env: Env, me: Person, name: string, args: Record<string, unknown>): Promise<string> {
  const t = now(env);
  const today = pacific(t).date;
  const people = await getPeople(env);
  const tasks = await liveTasks(env);
  const mine = (p: Person) => tasks.filter((k) => k.owner_id === p.id);
  const order = { not_started: 0, in_progress: 1, done: 2 } as const;
  const sorted = (list: Task[]) => [...list].sort((a, b) => order[a.status] - order[b.status] || a.id - b.id);

  switch (name) {
    case 'who_am_i': {
      const open = mine(me).filter((k) => k.status !== 'done');
      const day = new Date(today + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
      return `You are ${me.name}${me.role === 'owner' ? ' (owner)' : ''} at Infinite Canvas. Today is ${day}, ${today} (Pacific). You have ${open.length} open ${open.length === 1 ? 'task' : 'tasks'}.`;
    }
    case 'list_people':
      return people.map((p) => `${p.name}${p.id === me.id ? ' (you)' : ''}${p.role === 'owner' ? ' — owner' : ''}`).join('\n');
    case 'list_tasks': {
      const who = args.person === undefined || args.person === '' ? null : resolvePerson(args.person, me, people);
      const st = typeof args.status === 'string' && args.status ? args.status : 'open';
      let list = who ? mine(who) : tasks;
      if (st === 'open') list = list.filter((k) => k.status !== 'done');
      else if (st !== 'all') { const want = parseStatus(st); list = list.filter((k) => k.status === want); }
      const label = `${who ? (who.id === me.id ? 'Your' : `${who.name}'s`) : 'All'} ${st === 'all' ? '' : st === 'open' ? 'open ' : STATUS_WORD[parseStatus(st)] + ' '}tasks`;
      if (list.length === 0) return `${label}: none.`;
      return `${label} (${list.length}):\n${sorted(list).slice(0, 60).map((k) => line(k, people, today, !who)).join('\n')}`;
    }
    case 'add_task': {
      const owner = resolvePerson(args.person, me, people);
      const task = await createTask(env, me, { title: args.title, owner_id: owner.id, due_on: dueArg(args.due, today) }, 'claude');
      return `Added for ${owner.id === me.id ? 'you' : owner.name}: ${line(task, people, today, false)}`;
    }
    case 'update_task': {
      const task = resolveTask(args.task, tasks, people, today);
      const patch: Record<string, unknown> = {};
      if (args.title !== undefined) patch.title = args.title;
      if (args.person !== undefined) patch.owner_id = resolvePerson(args.person, me, people).id;
      if (args.due !== undefined) patch.due_on = dueArg(args.due, today);
      if (Object.keys(patch).length === 0) throw new AppError('Nothing to change. Pass a title, person or due date.');
      return `Updated: ${line(await updateTask(env, me, task.id, patch, 'claude'), people, today)}`;
    }
    case 'set_status': {
      const task = resolveTask(args.task, tasks, people, today);
      const status = parseStatus(args.status);
      if (task.status === status) return `Already ${STATUS_WORD[status]}: ${line(task, people, today)}`;
      return `Now ${STATUS_WORD[status]}: ${line(await updateTask(env, me, task.id, { status }, 'claude'), people, today)}`;
    }
    case 'remove_task': {
      const task = resolveTask(args.task, tasks, people, today);
      await removeTask(env, me, task.id, 'claude');
      return `Removed: #${task.id} ${task.title}.`;
    }
    case 'check_in': {
      const task = resolveTask(args.task, tasks.filter((k) => k.status !== 'done'), people, today);
      const r = await checkIn(env, me, task.id, 'claude');
      const how = r.delivery.queued ? `It is quiet hours, so ${r.owner.name} will get it at 8:00 AM Pacific.`
        : r.delivery.reachable ? `${r.owner.name} has been sent a message.`
        : `${r.owner.name} has no notifications on yet, so they will see it on the board.`;
      return `Checked in on "${task.title}". ${how}`;
    }
    case 'board_summary': {
      const c = { not_started: 0, in_progress: 0, done: 0 };
      for (const k of tasks) c[k.status]++;
      const out = [`Board: ${c.not_started} not started, ${c.in_progress} in progress, ${c.done} done.`];
      for (const p of people) {
        const open = sorted(mine(p).filter((k) => k.status !== 'done'));
        out.push(`${p.name}${p.id === me.id ? ' (you)' : ''}: ${open.length === 0 ? 'nothing open.' : `${open.length} open`}`);
        for (const k of open.slice(0, 8)) out.push(`  ${line(k, people, today, false)}`);
        if (open.length > 8) out.push(`  …and ${open.length - 8} more`);
      }
      const late = tasks.map((k) => nudgeFor(k, t, today)).filter((n) => n && n.task.due_on && n.task.due_on < today);
      if (late.length) out.push(`Overdue: ${late.length}.`);
      return out.join('\n');
    }
    default:
      throw new AppError(`Unknown tool: ${name}`);
  }
}

// ---- JSON-RPC over Streamable HTTP ----
interface Rpc { jsonrpc?: string; id?: string | number | null; method?: string; params?: any }
const rpcError = (id: Rpc['id'], code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function handleRpc(env: Env, me: Person, msg: Rpc): Promise<object | null> {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg?.id, -32600, 'Invalid request');
  const isNotification = msg.id === undefined || msg.id === null;
  const ok = (result: object) => ({ jsonrpc: '2.0', id: msg.id, result });
  const caps = { tools: { listChanged: false } };
  switch (msg.method) {
    case 'initialize': {
      const asked = msg.params?.protocolVersion;
      return ok({ protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0], capabilities: caps, serverInfo: SERVER, instructions: INSTRUCTIONS });
    }
    case 'server/discover':
      return ok({ supportedVersions: VERSIONS, capabilities: caps, serverInfo: SERVER, instructions: INSTRUCTIONS, _meta: { serverInfo: SERVER } });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call': {
      const name = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      if (typeof name !== 'string' || !TOOLS.some((x) => x.name === name)) return rpcError(msg.id, -32602, `Unknown tool: ${String(name)}`);
      if (typeof args !== 'object' || Array.isArray(args)) return rpcError(msg.id, -32602, 'arguments must be an object');
      try {
        return ok({ content: [{ type: 'text', text: await callTool(env, me, name, args) }], isError: false });
      } catch (e) {
        const text = e instanceof AppError ? e.message : 'Something went wrong on the board. Try again.';
        if (!(e instanceof AppError)) console.error('tool error', name, e);
        return ok({ content: [{ type: 'text', text }], isError: true });
      }
    }
    case 'resources/list': return ok({ resources: [] });
    case 'resources/templates/list': return ok({ resourceTemplates: [] });
    case 'prompts/list': return ok({ prompts: [] });
    default:
      return isNotification ? null : rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

function originAllowed(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === new URL(req.url).hostname || /(^|\.)(claude\.ai|claude\.com|anthropic\.com)$/.test(host);
  } catch { return false; }
}

export async function handleConnector(env: Env, req: Request, token: string): Promise<Response> {
  if (!originAllowed(req)) return json({ error: 'Origin not allowed' }, 403);
  const ip = clientIp(req);
  const me = await personForConnector(env, token);
  if (!me) {
    // Wrong links are rate-limited like sign-in attempts. Never 401: that would start a sign-in flow in Claude.
    await rateLimit(env, `signin:${ip}`, 20, 600);
    return json({ error: 'This link is not valid. Copy a fresh one from Team Tasks.' }, 404);
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { allow: 'POST, OPTIONS' } });
  if (req.method === 'DELETE') return new Response(null, { status: 200 }); // nothing to end: there are no sessions
  if (req.method !== 'POST') return new Response('Use POST.', { status: 405, headers: { allow: 'POST, OPTIONS' } });
  try { await requireRate(env, `claude:${me.id}`, 120, 60); } catch { return json(rpcError(null, -32000, 'Too many requests. Wait a minute.'), 429); }

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 100_000) return json(rpcError(null, -32600, 'Request too large'), 413);
    body = JSON.parse(text);
  } catch { return json(rpcError(null, -32700, 'Parse error'), 400); }

  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) return json(rpcError(null, -32600, 'Invalid batch'), 400);
    const out = [];
    for (const m of body) { const r = await handleRpc(env, me, m); if (r) out.push(r); }
    return out.length ? json(out) : new Response(null, { status: 202 });
  }
  const res = await handleRpc(env, me, body as Rpc);
  return res ? json(res) : new Response(null, { status: 202 });
}
