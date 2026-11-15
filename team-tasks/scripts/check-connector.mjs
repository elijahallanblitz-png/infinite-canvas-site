// Calls every connector tool through the official client, the way Claude does.
// Usage: node scripts/check-connector.mjs <connector-url>
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.argv[2];
if (!url) { console.error('Pass the connector URL.'); process.exit(2); }
const client = new Client({ name: 'team-tasks-check', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));
console.log('connected:', JSON.stringify(client.getServerVersion()));

const { tools } = await client.listTools();
const want = ['who_am_i', 'list_people', 'list_tasks', 'add_task', 'update_task', 'set_status', 'remove_task', 'check_in', 'board_summary'];
let failed = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '\n      ' + detail.replace(/\n/g, '\n      ') : ''}`); if (!ok) failed++; };
check('tools/list has all nine tools', want.every((n) => tools.some((t) => t.name === n)), tools.map((t) => t.name).join(', '));

const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); return { text: r.content?.[0]?.text ?? '', isError: Boolean(r.isError) }; };
const title = `Connector check ${Date.now()}`;
let r;
r = await call('who_am_i'); check('who_am_i', !r.isError && /^You are /.test(r.text), r.text);
r = await call('list_people'); check('list_people', !r.isError && r.text.includes('Nevan'), r.text);
r = await call('add_task', { title, person: 'Nevin', due: 'Wednesday' }); check('add_task (dictated "Nevin" finds Nevan)', !r.isError && r.text.startsWith('Added for'), r.text);
const id = /#(\d+)/.exec(r.text)?.[1];
r = await call('list_tasks', { person: 'Nevan', status: 'open' }); check('list_tasks (person + status filters)', !r.isError && r.text.includes(title), r.text.split('\n').slice(0, 4).join('\n'));
r = await call('update_task', { task: id, title: title + ' v2', due: 'tomorrow' }); check('update_task', !r.isError && r.text.includes('v2'), r.text);
r = await call('set_status', { task: title + ' v2', status: 'in_progress' }); check('set_status', !r.isError && r.text.startsWith('Now in progress'), r.text);
r = await call('check_in', { task: id }); check('check_in', !r.isError && r.text.startsWith('Checked in'), r.text);
r = await call('check_in', { task: id }); check('check_in again is refused (4 hour limit)', r.isError && /already checked in/.test(r.text), r.text);
r = await call('board_summary'); check('board_summary', !r.isError && r.text.startsWith('Board:'), r.text.split('\n').slice(0, 3).join('\n'));
r = await call('add_task', { title: 'x', person: 'Zebediah' }); check('unknown name is refused, not guessed', r.isError, r.text);
r = await call('remove_task', { task: id }); check('remove_task (cleans up)', !r.isError && r.text.startsWith('Removed'), r.text);
await client.close();
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll connector checks passed.');
process.exit(failed ? 1 : 0);
