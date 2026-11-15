import { beforeEach, describe, expect, it } from 'vitest';
import { TOOLS } from '../src/connector';
import { j, makeRig, type Rig } from './helpers';

let r: Rig;
beforeEach(async () => { r = await makeRig(); });

describe('Claude connector protocol', () => {
  it('answers initialize, tools/list and ping with plain JSON', async () => {
    const init = await r.rpc('Nevan', 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-ai', version: '1' } });
    expect(init.result.protocolVersion).toBe('2025-06-18');
    expect(init.result.capabilities.tools).toBeDefined();
    expect(init.result.serverInfo.name).toBe('team-tasks');
    expect((await r.rpc('Nevan', 'initialize', { protocolVersion: '2099-01-01' })).result.protocolVersion).toBe('2025-11-25');
    const list = await r.rpc('Nevan', 'tools/list');
    expect(list.result.tools.map((t: any) => t.name)).toEqual(['who_am_i', 'list_people', 'list_tasks', 'add_task', 'update_task', 'set_status', 'remove_task', 'check_in', 'board_summary']);
    for (const t of TOOLS) {
      expect(t.description.length).toBeGreaterThan(40);
      expect(typeof t.annotations.readOnlyHint).toBe('boolean'); expect(typeof t.annotations.destructiveHint).toBe('boolean');
      expect(t.inputSchema.type).toBe('object');
    }
    expect((await r.rpc('Nevan', 'ping')).result).toEqual({});
    expect((await r.rpc('Nevan', 'nope/nope')).error.code).toBe(-32601);
  });
  it('accepts notifications with 202, refuses GET with 405, and never asks for sign-in', async () => {
    const url = new URL((await j(await r.call('Nevan', 'GET', '/api/connector'))).url).pathname;
    expect(url).toMatch(/^\/claude\/2\.[\w-]{43}$/);
    expect((await r.call(null, 'POST', url, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
    expect((await r.call(null, 'GET', url)).status).toBe(405);
    expect((await r.call(null, 'POST', url, '{nope')).status).toBe(400);
    const bad = await r.call(null, 'POST', url.slice(0, -3) + 'abc', { jsonrpc: '2.0', id: 1, method: 'ping' });
    expect(bad.status).toBe(404); // never 401: that would start a sign-in flow
    expect((await r.call(null, 'POST', url, { jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://evil.example' })).status).toBe(403);
    expect((await r.call(null, 'POST', url, { jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://claude.ai' })).status).toBe(200);
    expect((await r.call(null, 'GET', '/.well-known/oauth-protected-resource')).status).toBe(404);
    const batch = await j(await r.call(null, 'POST', url, [{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]));
    expect(batch).toHaveLength(2);
  });
  it('the link identifies the person', async () => {
    expect((await r.tool('Nevan', 'who_am_i')).text).toMatch(/^You are Nevan at Infinite Canvas\. Today is Tuesday, 2026-11-10/);
    expect((await r.tool('Elijah', 'who_am_i')).text).toContain('You are Elijah (owner)');
  });
  it('rate-limits each link', async () => {
    let last: any;
    for (let i = 0; i < 124; i++) last = await r.rpc('Gregory', 'ping');
    expect(last.error.message).toContain('Too many');
  });
});

describe('Claude connector tools', () => {
  it('add_task: "Add a task for Nevin: lock the budget, due Wednesday"', async () => {
    const res = await r.tool('Elijah', 'add_task', { title: 'Lock the budget', person: 'Nevin', due: 'Wednesday' });
    expect(res.isError).toBe(false);
    expect(res.text).toBe('Added for Nevan: #1 Lock the budget — not started, due tomorrow (2026-11-11)');
    const board = await j(await r.call('Nevan', 'GET', '/api/board'));
    expect(board.tasks[0]).toMatchObject({ title: 'Lock the budget', owner_id: 2, created_by: 1, due_on: '2026-11-11' });
    const act = (await j(await r.call('Nevan', 'GET', '/api/activity'))).items[0];
    expect(act).toMatchObject({ actor: 'Elijah', via: 'claude' });
  });
  it('defaults to me, and rejects unreadable dates and unknown names', async () => {
    expect((await r.tool('Gregory', 'add_task', { title: 'Render the splat tests' })).text).toContain('Added for you');
    const bad = await r.tool('Gregory', 'add_task', { title: 'x', due: 'when the moon is right' });
    expect(bad.isError).toBe(true); expect(bad.text).toContain('Could not read the due date');
    const who = await r.tool('Gregory', 'add_task', { title: 'x', person: 'Bartholomew' });
    expect(who.isError).toBe(true); expect(who.text).toContain('The team is: Elijah, Nevan, Gregory');
    expect((await r.tool('Gregory', 'add_task', { title: '   ' })).isError).toBe(true);
  });
  it('returns the choices when a name could mean two people', async () => {
    await r.call('Elijah', 'POST', '/api/people', { name: 'Neville' });
    const res = await r.tool('Elijah', 'add_task', { title: 'Call the gaffer', person: 'Nev' });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(/could be Nevan or Neville|could be Neville or Nevan/);
    expect((await j(await r.call('Elijah', 'GET', '/api/board'))).tasks).toHaveLength(0); // nothing was guessed
  });
  it('list_people and list_tasks with filters', async () => {
    await r.tool('Elijah', 'add_task', { title: 'Lock the budget', person: 'Nevan', due: '2026-11-08' });
    await r.tool('Elijah', 'add_task', { title: 'Send the deck' });
    await r.tool('Elijah', 'add_task', { title: 'Back up the dailies', person: 'greg' });
    await r.tool('Elijah', 'set_status', { task: 'dailies', status: 'done' });
    expect((await r.tool('Nevan', 'list_people')).text).toBe('Elijah — owner\nNevan (you)\nGregory');
    expect((await r.tool('Nevan', 'list_tasks', { person: 'me' })).text).toBe('Your open tasks (1):\n#1 Lock the budget — not started, OVERDUE, was due Nov 8 (2026-11-08)');
    const all = (await r.tool('Nevan', 'list_tasks')).text;
    expect(all).toContain('All open tasks (2)'); expect(all).not.toContain('dailies');
    expect((await r.tool('Nevan', 'list_tasks', { status: 'done' })).text).toContain('#3 Back up the dailies — Gregory — done');
    expect((await r.tool('Nevan', 'list_tasks', { person: 'Gregory' })).text).toBe("Gregory's open tasks: none.");
  });
  it('update_task, set_status, remove_task by number or by words', async () => {
    await r.tool('Elijah', 'add_task', { title: 'Lock the budget', person: 'Nevan' });
    await r.tool('Elijah', 'add_task', { title: 'Send the budget to investors' });
    const amb = await r.tool('Elijah', 'set_status', { task: 'budget', status: 'done' });
    expect(amb.isError).toBe(true); expect(amb.text).toContain('#1 Lock the budget'); expect(amb.text).toContain('#2 Send the budget');
    expect((await r.tool('Elijah', 'set_status', { task: 'lock the budget', status: 'in_progress' })).text).toContain('Now in progress: #1');
    expect((await r.tool('Elijah', 'set_status', { task: '#1', status: 'in_progress' })).text).toContain('Already in progress');
    const up = await r.tool('Elijah', 'update_task', { task: 2, title: 'Send the deck', person: 'Gregory', due: 'Friday' });
    expect(up.text).toBe('Updated: #2 Send the deck — Gregory — not started, due Friday (2026-11-13)');
    expect((await r.tool('Elijah', 'update_task', { task: 2, due: 'none' })).text).toBe('Updated: #2 Send the deck — Gregory — not started');
    expect((await r.tool('Elijah', 'update_task', { task: 2 })).isError).toBe(true);
    expect((await r.tool('Elijah', 'remove_task', { task: 'deck' })).text).toBe('Removed: #2 Send the deck.');
    expect((await r.tool('Elijah', 'remove_task', { task: 'deck' })).isError).toBe(true);
    expect((await r.tool('Elijah', 'set_status', { task: '77', status: 'done' })).text).toContain('no task #77');
  });
  it('check_in sends a message and respects the 4 hour limit', async () => {
    await r.subscribe('Nevan');
    await r.tool('Elijah', 'add_task', { title: 'Lock the budget', person: 'Nevan' });
    expect((await r.tool('Elijah', 'check_in', { task: 'budget' })).text).toBe('Checked in on "Lock the budget". Nevan has been sent a message.');
    expect(r.sent).toHaveLength(1);
    const again = await r.tool('Gregory', 'check_in', { task: 'budget' });
    expect(again.isError).toBe(true); expect(again.text).toContain('already checked in');
  });
  it('board_summary', async () => {
    expect((await r.tool('Elijah', 'board_summary')).text).toContain('Board: 0 not started, 0 in progress, 0 done.');
    await r.tool('Elijah', 'add_task', { title: 'Lock the budget', person: 'Nevan', due: '2026-11-01' });
    await r.tool('Elijah', 'add_task', { title: 'Send the deck' });
    await r.tool('Elijah', 'set_status', { task: 'deck', status: 'in_progress' });
    const s = (await r.tool('Elijah', 'board_summary')).text;
    expect(s).toContain('Board: 1 not started, 1 in progress, 0 done.');
    expect(s).toContain('Elijah (you): 1 open'); expect(s).toContain('Gregory: nothing open.'); expect(s).toContain('Overdue: 1.');
  });
});
