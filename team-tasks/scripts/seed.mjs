// Seeds the three people and prints their invite links ONCE. Only hashes go in the database.
// Usage: node scripts/seed.mjs --local|--remote --origin https://team-tasks.example.workers.dev [--sample] [--out file.json]
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const where = flag('--remote') ? '--remote' : '--local';
const origin = opt('--origin', 'http://localhost:8787');
const PEOPLE = [['Elijah', 'owner'], ['Nevan', 'member'], ['Gregory', 'member']];
const sql = (q) => execFileSync('npx', ['wrangler', 'd1', 'execute', 'team-tasks', where, '--json', '--command', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const esc = (s) => s.replace(/'/g, "''");

const existing = JSON.parse(sql('SELECT name FROM people'))[0].results.map((r) => r.name);
const now = Date.now();
const links = {};
const stmts = [];
for (const [name, role] of PEOPLE) {
  if (existing.includes(name) && !flag('--reset')) { console.log(`${name} already exists. Use --reset to issue a new link.`); continue; }
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('base64url');
  links[name] = `${origin}/join/${token}`;
  stmts.push(existing.includes(name)
    ? `UPDATE people SET invite_hash='${hash}', epoch=epoch+1 WHERE name='${esc(name)}'; DELETE FROM sessions WHERE person_id=(SELECT id FROM people WHERE name='${esc(name)}')`
    : `INSERT INTO people (name, role, invite_hash, created_at) VALUES ('${esc(name)}', '${role}', '${hash}', ${now})`);
}
stmts.push("UPDATE people SET icon = CASE name WHEN 'Elijah' THEN 'surfer' WHEN 'Nevan' THEN 'adventurer' WHEN 'Gregory' THEN 'hero' ELSE icon END");
if (flag('--sample')) {
  // Sample tasks for local development and screenshots only. Production starts empty.
  const day = 86400000;
  const d = (n) => new Date(now + n * day).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const T = [
    ['Lock the budget for the pilot', 1, 'in_progress', d(1), 0], ['Send the deck to the investors', 1, 'not_started', d(0), 1],
    ['Review the rough cut', 1, 'done', null, 2], ['Book the capture stage', 2, 'not_started', d(-1), 5],
    ['Scout the canyon location', 2, 'in_progress', d(3), 2], ['Clear the music rights', 2, 'not_started', null, 4],
    ['Render the splat tests', 3, 'in_progress', d(2), 1], ['Call the gaffer', 3, 'not_started', d(5), 0],
    ['Back up the dailies', 3, 'done', null, 1], ['Order the lens kit', 3, 'done', null, 3],
  ];
  for (const [title, owner, status, due, age] of T) {
    const at = now - age * day;
    stmts.push(`INSERT INTO tasks (title, owner_id, status, due_on, created_by, updated_by, created_at, updated_at, status_changed_at) VALUES ('${esc(title)}', ${owner}, '${status}', ${due ? `'${due}'` : 'NULL'}, 1, 1, ${at}, ${at}, ${at})`);
    stmts.push(`INSERT INTO activity (actor_id, verb, task_id, text, via, created_at) VALUES (1, 'add', last_insert_rowid(), 'added “${esc(title)}”', 'app', ${at})`);
  }
}
if (stmts.length) sql(stmts.join('; ') + "; UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key = 'version'");
if (opt('--out')) writeFileSync(opt('--out'), JSON.stringify(links, null, 2), { mode: 0o600 });
for (const [n, l] of Object.entries(links)) console.log(`${n}: ${l}`);
