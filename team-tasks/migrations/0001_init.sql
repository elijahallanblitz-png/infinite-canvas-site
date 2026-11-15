-- Team Tasks schema. Times are Unix milliseconds. Dates are YYYY-MM-DD.
CREATE TABLE people (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  invite_hash TEXT UNIQUE,                    -- SHA-256 of the invite link token. The token itself is never stored.
  epoch INTEGER NOT NULL DEFAULT 1,           -- bumped on link reset; invalidates the Claude link too
  phone TEXT,
  notify_push INTEGER NOT NULL DEFAULT 1,
  notify_sms INTEGER NOT NULL DEFAULT 0,
  sms_stopped INTEGER NOT NULL DEFAULT 0,     -- set when the person texts STOP
  last_digest_on TEXT,
  created_at INTEGER NOT NULL,
  removed_at INTEGER
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX sessions_person ON sessions(person_id);

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES people(id),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'done')),
  due_on TEXT,
  created_by INTEGER NOT NULL REFERENCES people(id),
  updated_by INTEGER NOT NULL REFERENCES people(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  status_changed_at INTEGER NOT NULL,
  deleted_at INTEGER,
  deleted_by INTEGER REFERENCES people(id)
);
CREATE INDEX tasks_live ON tasks(deleted_at, owner_id);

CREATE TABLE activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES people(id),
  verb TEXT NOT NULL,
  task_id INTEGER REFERENCES tasks(id),
  text TEXT NOT NULL,                         -- plain sentence tail, e.g. finished "Lock the budget"
  via TEXT NOT NULL DEFAULT 'app',            -- app | claude | push | text | auto
  created_at INTEGER NOT NULL
);
CREATE INDEX activity_recent ON activity(created_at DESC);

CREATE TABLE checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id),
  sender_id INTEGER NOT NULL REFERENCES people(id),
  owner_id INTEGER NOT NULL REFERENCES people(id),
  created_at INTEGER NOT NULL,
  answered_at INTEGER,
  answer TEXT
);
CREATE INDEX checkins_task ON checkins(task_id, created_at DESC);
CREATE INDEX checkins_owner ON checkins(owner_id, answered_at);

CREATE TABLE push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX push_person ON push_subs(person_id);

-- Messages held back by quiet hours, delivered by the hourly cron.
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  person_id INTEGER NOT NULL REFERENCES people(id),
  payload TEXT NOT NULL,
  send_after INTEGER NOT NULL,
  sent_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX outbox_due ON outbox(sent_at, send_after);

CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  win INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (key, win)
);

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO meta (key, value) VALUES ('version', '1');
