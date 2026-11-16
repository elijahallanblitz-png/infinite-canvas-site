// Team Tasks — the whole front end. No framework: small, fast on cellular, and every pixel is ours.

// ---------- tiny DOM helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const SVG = {
  ring: '<circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="2"/>',
  half: '<circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3.8a8.2 8.2 0 0 0 0 16.4z" fill="currentColor"/>',
  check: '<path d="M4.5 12.6l4.9 4.9L19.5 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  x: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  back: '<path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  chev: '<path d="M9.5 5.5L16 12l-6.5 6.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  person: '<circle cx="12" cy="8.5" r="3.7" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M4.8 19.6c1.2-3.3 4-5 7.2-5s6 1.7 7.2 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5h-14z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  spark: '<path d="M12 3.5l1.9 5.6 5.6 1.9-5.6 1.9L12 18.5l-1.9-5.6-5.6-1.9 5.6-1.9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M11 17.6h2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  screen: '<rect x="3" y="5" width="18" height="12" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M9 20.5h6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  share: '<path d="M12 14.5V4m0 0L8.5 7.5M12 4l3.5 3.5M6.5 11H6a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-.5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M15.5 5.5v-1a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h1" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  hand: '<path d="M4 12.5h3.5l2-5 3.5 10 2-5H20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l.8 12.5h8.4L17 7M10.5 10.5v6M13.5 10.5v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  pen: '<path d="M4.5 19.5l1-4L16 5l3 3L8.5 18.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  swap: '<path d="M4.5 8.5h13m0 0l-3.5-3.5m3.5 3.5L14 12M19.5 15.5h-13m0 0L10 12m-3.5 3.5L10 19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};
function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = SVG[name];
  return s;
}
const STATUS = {
  not_started: { word: 'Not started', icon: 'ring', next: 'in_progress' },
  in_progress: { word: 'In progress', icon: 'half', next: 'done' },
  done: { word: 'Done', icon: 'check', next: null },
};
const ORDER = ['not_started', 'in_progress', 'done'];
const CHECKIN_GAP = 4 * 3600 * 1000;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

// ---------- state ----------
function loadOpen() { try { return JSON.parse(localStorage.getItem('tt_open') || '{}') || {}; } catch { return {}; } }
function saveOpen() { store.set('tt_open', JSON.stringify(S.open)); }
const S = {
  loaded: false, signedOut: false, signedOutWhy: '',
  me: null, config: { push_key: null, sms: false }, people: [], tasks: [], asks: [], version: 0,
  filter: null, showDone: {}, open: loadOpen(), sweep: null, activity: null, pushOn: false, installEvent: null,
  welcome: null, // { step } while the welcome is open
};
const isTV = () => location.pathname === '/tv';
const person = (id) => S.people.find((p) => p.id === id);
const nameOf = (id) => (id === S.me?.id ? 'you' : person(id)?.name || 'someone');

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
function endOfWeek() { const wd = new Date().getDay(); return wd >= 1 && wd <= 4 ? plusDays(5 - wd) : plusDays((7 - wd) % 7); }
const asDate = (s) => new Date(s + 'T12:00:00');
const dayDiff = (s) => Math.round((asDate(s) - asDate(today())) / 86400000);
function sayDate(s) {
  const n = dayDiff(s);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n < 7) return asDate(s).toLocaleDateString('en-US', { weekday: 'long' });
  return asDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function dueInfo(t) {
  if (!t.due_on || t.status === 'done') return null;
  const n = dayDiff(t.due_on);
  return n < 0 ? { late: true, text: `Overdue. Was due ${sayDate(t.due_on)}` } : { late: false, text: `Due ${sayDate(t.due_on)}` };
}
function ago(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// ---------- server ----------
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw Object.assign(new Error('No connection. Check your signal and try again.'), { offline: true }); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { signedOut(); throw Object.assign(new Error(data.error || 'Signed out.'), { code: 'signed_out' }); }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { code: data.code, status: res.status });
  return data;
}
function signedOut(why = '') {
  if (S.signedOut) return;
  S.signedOut = true; S.signedOutWhy = why || S.signedOutWhy; store.del('tt_h');
  render();
}
function applyBoard(d) {
  if (d.unchanged) return false;
  Object.assign(S, { me: d.me, config: d.config, people: d.people, tasks: d.tasks, asks: d.asks, version: d.version, loaded: true });
  return true;
}
let polling = false;
async function refresh(force = false) {
  if (polling || S.signedOut) return;
  polling = true;
  try {
    const changed = applyBoard(await api('GET', `/api/board${!force && S.version ? `?v=${S.version}` : ''}`));
    if (changed) {
      if (location.pathname === '/activity') loadActivity();
      render({ glide: true });
    }
  } catch { /* the next tick tries again */ } finally { polling = false; }
}
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 4000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
addEventListener('online', () => refresh());

// ---------- toasts ----------
let toastTimer = 0;
function toast(text, { undo, ms = 5000 } = {}) {
  const root = $('#toast-root');
  clearTimeout(toastTimer);
  const close = () => { clearTimeout(toastTimer); root.replaceChildren(); };
  const el = h('div', { class: 'toast' }, h('p', { text }));
  if (undo) {
    el.append(h('button', { class: 'undo', type: 'button', onclick: () => { close(); undo(); } }, 'Undo'));
    const fuse = h('span', { class: 'fuse' });
    fuse.style.animationDuration = ms + 'ms';
    el.append(fuse);
  }
  root.replaceChildren(el);
  toastTimer = setTimeout(close, ms);
}
const fail = (e) => { if (e.code !== 'signed_out') toast(e.message, { ms: 6000 }); };

// ---------- actions (optimistic: the screen changes first, the server catches up) ----------
function setStatus(task, status, { quiet = false } = {}) {
  const prev = task.status;
  if (prev === status) return;
  task.status = status;
  task.status_changed_at = Date.now();
  if (status === 'done') { S.sweep = { id: task.id, at: Date.now() }; navigator.vibrate?.(12); }
  render({ glide: true });
  renderSheetIfTask();
  if (!quiet) toast(status === 'done' ? 'Done. Nice work.' : `Marked ${STATUS[status].word.toLowerCase()}.`, { undo: () => setStatus(task, prev, { quiet: true }) });
  api('PATCH', `/api/tasks/${task.id}`, { status }).then((d) => { S.version = 0; Object.assign(task, d.task); })
    .catch((e) => { task.status = prev; render(); renderSheetIfTask(); fail(e); });
}
function patchTask(task, patch, done) {
  const prev = { ...task };
  Object.assign(task, patch);
  render({ glide: true });
  api('PATCH', `/api/tasks/${task.id}`, patch).then(() => { S.version = 0; done?.(); })
    .catch((e) => { Object.assign(task, prev); render(); renderSheetIfTask(); fail(e); });
}
function removeTask(task) {
  const at = S.tasks.indexOf(task);
  S.tasks.splice(at, 1);
  closeSheet();
  render({ glide: true });
  const putBack = () => {
    S.tasks.splice(at, 0, task); render({ glide: true });
    api('POST', `/api/tasks/${task.id}/restore`).then(() => { S.version = 0; }).catch(fail);
  };
  toast('Task removed.', { undo: putBack, ms: 7000 });
  api('DELETE', `/api/tasks/${task.id}`).then(() => { S.version = 0; }).catch((e) => { S.tasks.splice(at, 0, task); render(); fail(e); });
}
async function addTask(title, ownerId, due) {
  const temp = { id: -Date.now(), title, owner_id: ownerId, status: 'not_started', due_on: due, created_by: S.me.id, updated_by: S.me.id, created_at: Date.now(), status_changed_at: Date.now(), checked_at: null, pending: true };
  S.tasks.push(temp);
  S.open[ownerId] = true; saveOpen();
  render({ glide: true });
  try {
    const d = await api('POST', '/api/tasks', { title, owner_id: ownerId, due_on: due });
    Object.assign(temp, d.task, { pending: false, checked_at: null });
    S.version = 0;
    render();
    toast(ownerId === S.me.id ? 'Added to your list.' : `Added for ${person(ownerId)?.name}.`, { ms: 3000 });
  } catch (e) { S.tasks.splice(S.tasks.indexOf(temp), 1); render(); fail(e); }
}
async function checkIn(task) {
  const prev = task.checked_at;
  task.checked_at = Date.now();
  render(); renderSheetIfTask();
  try {
    const d = await api('POST', `/api/tasks/${task.id}/checkin`);
    S.version = 0;
    toast(d.queued ? `It is late. ${d.owner} will get it at 8:00 AM.` : d.reachable ? `Sent. ${d.owner} can answer in one tap.` : `${d.owner} will see it on the board. Their notifications are off.`, { ms: 5000 });
  } catch (e) { task.checked_at = e.code === 'checkin_too_soon' ? Date.now() : prev; render(); renderSheetIfTask(); fail(e); }
}
async function answerAsk(ask, answer) {
  const task = S.tasks.find((t) => t.id === ask.task_id);
  S.asks = S.asks.filter((a) => a.id !== ask.id);
  if (task) {
    const want = answer === 'done' ? 'done' : 'in_progress';
    if (task.status !== want) { task.status = want; if (want === 'done') { S.sweep = { id: task.id, at: Date.now() }; navigator.vibrate?.(12); } }
  }
  render({ glide: true });
  try { await api('POST', `/api/checkins/${ask.id}/reply`, { answer }); S.version = 0; toast(`Thanks. ${person(ask.sender_id)?.name || 'They'} will be told.`, { ms: 3500 }); }
  catch (e) { fail(e); refresh(true); }
}

// ---------- routing ----------
function go(path, replace = false) {
  if (location.pathname !== path) history[replace ? 'replaceState' : 'pushState']({}, '', path);
  closeSheet(true);
  render();
  scrollTo(0, 0);
  $('#view').focus({ preventScroll: true });
}
addEventListener('popstate', () => { closeSheet(true); render(); });
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'open') { go('/'); refresh(true); } });

// ---------- header ----------
function flare() {
  const drift = h('div', { class: 'flare-drift' });
  const line = h('div', { class: 'flare-line' }, h('span', { class: 'bloom' }), h('span', { class: 'streak' }), h('span', { class: 'core' }));
  for (const [l, w] of [[56, 3], [71, 5], [83, 2.4]]) {
    const g = h('span', { class: 'ghost' }); g.style.left = l + '%'; g.style.width = w + '%'; line.append(g);
  }
  drift.append(line);
  // A sparse field of dust in the projector beam. Seeded, so it never jumps between renders.
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const colors = ['#e8e6e1', '#e8e6e1', '#d4a843', '#d4a843', '#4f98a3'];
  for (let i = 0; i < 30; i++) {
    const d = h('span', { class: 'dust' });
    const size = 1 + rnd() * 2.2;
    d.style.left = (rnd() * 100).toFixed(2) + '%';
    d.style.top = (4 + rnd() * 92).toFixed(2) + '%';
    d.style.width = d.style.height = size.toFixed(1) + 'px';
    d.style.background = colors[Math.floor(rnd() * colors.length)];
    d.style.setProperty('--o', (0.25 + rnd() * 0.5).toFixed(2));
    d.style.animationDelay = (-rnd() * 7).toFixed(1) + 's';
    drift.append(d);
  }
  return h('div', { class: 'flare', 'aria-hidden': 'true' }, drift);
}
function brandMark() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 32 32'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="1.25" opacity="0.85"/><circle cx="16" cy="16" r="1.6" fill="#D4A843"/><path d="M16 3 L17.2 6 M16 29 L14.8 26 M3 16 L6 14.8 M29 16 L26 17.2" stroke="#4F98A3" stroke-width="1" opacity="0.85" stroke-linecap="round" fill="none"/>';
  return s;
}
let headerKey = '';
function renderHeader(kind, title) {
  const key = kind + '|' + title;
  if (key === headerKey) return;
  headerKey = key;
  const top = $('#top');
  top.className = 'top ' + kind;
  const inner = h('div', { class: 'top-inner' });
  if (kind === 'full') {
    inner.append(
      h('div', { class: 'brand' }, brandMark(), h('span', { class: 'wordmark', text: 'Infinite Canvas' })),
      h('h1', { class: 'title reveal' }, 'Team ', h('span', { class: 'gold', text: 'Tasks' })),
    );
  } else {
    inner.append(
      h('button', { class: 'back', type: 'button', onclick: () => go('/') }, icon('back'), 'Board'),
      h('h1', { class: 'title reveal', text: title }),
    );
  }
  top.replaceChildren(flare(), inner);
}

// ---------- character pictures next to each name ----------
const PICTURES = ['surfer', 'adventurer', 'hero'];
function avatar(p) {
  if (PICTURES.includes(p.icon)) {
    return h('span', { class: 'avatar av-' + p.icon, 'aria-hidden': 'true' },
      h('img', { src: `/avatars/${p.icon}.webp`, alt: '', width: '72', height: '72', decoding: 'async' }));
  }
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'avatar av-plain');
  const initial = (p.name[0] || '?').toUpperCase().replace(/[^A-Z0-9]/, '?');
  s.innerHTML = `<circle cx="32" cy="32" r="24" fill="none" stroke="#e8e6e1" stroke-width="1.6" opacity="0.8"/><text x="32" y="40" text-anchor="middle" font-family="Cinzel, serif" font-size="22" fill="#d4a843">${initial}</text>`;
  return s;
}

// ---------- board ----------
function sortTasks(list) {
  return [...list].sort((a, b) => {
    const s = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
    if (s) return s;
    if (a.status === 'done') return b.status_changed_at - a.status_changed_at;
    if ((a.due_on || '9') !== (b.due_on || '9')) return (a.due_on || '9') < (b.due_on || '9') ? -1 : 1;
    return a.created_at - b.created_at;
  });
}
function taskRow(t, tv) {
  const st = STATUS[t.status];
  const due = dueInfo(t);
  const row = h('li', { class: `task s-${t.status}`, 'data-id': t.id });
  if (!tv) row.style.viewTransitionName = 't' + String(t.id).replace('-', 'n');
  if (S.sweep && S.sweep.id === t.id && Date.now() - S.sweep.at < 900) row.classList.add('sweep');
  const tile = tv
    ? h('span', { class: 'tile' }, icon(st.icon))
    : h('button', {
      class: 'tile', type: 'button',
      'aria-label': st.next ? `${st.word}. Mark “${t.title}” ${STATUS[st.next].word.toLowerCase()}` : `Done. Open “${t.title}”`,
      onclick: () => (st.next ? setStatus(t, st.next) : openTask(t.id)),
    }, icon(st.icon));
  const text = [
    h('span', { class: 'task-title', text: t.title }),
    h('span', { class: 'task-meta' }, h('span', { class: 'status-word', text: st.word }), due && h('span', { class: 'due' + (due.late ? ' late' : ''), text: due.text })),
  ];
  const body = h('div', { class: 'task-body' }, tv ? h('div', { class: 'task-open' }, text) : h('button', { class: 'task-open', type: 'button', onclick: () => openTask(t.id) }, text));
  if (!tv && t.status !== 'done' && t.owner_id !== S.me.id && !t.pending) {
    const recent = t.checked_at && Date.now() - t.checked_at < CHECKIN_GAP;
    body.append(h('button', { class: 'mini', type: 'button', disabled: recent, 'aria-label': recent ? `Checked in on “${t.title}”` : `Check in on “${t.title}”`, onclick: () => checkIn(t) },
      icon('hand'), recent ? 'Checked in' : 'Check in'));
  }
  row.append(tile, body);
  return row;
}
function personCard(p, tv) {
  const mine = p.id === S.me.id;
  let list = sortTasks(S.tasks.filter((t) => t.owner_id === p.id));
  const open = list.filter((t) => t.status !== 'done').length;
  if (S.filter) list = list.filter((t) => t.status === S.filter);
  const done = list.filter((t) => t.status === 'done');
  const limit = tv ? 2 : 3;
  const hideDone = !S.filter && !S.showDone[p.id] && done.length > limit;
  const shown = hideDone ? list.filter((t) => t.status !== 'done').concat(done.slice(0, limit)) : list;
  const isOpen = tv || Boolean(S.filter) || Boolean(S.open[p.id]);
  const all = S.tasks.filter((t) => t.owner_id === p.id);
  const n = { not_started: 0, in_progress: 0, done: 0 };
  for (const t of all) n[t.status]++;
  const card = h('section', { class: 'card person' + (isOpen ? ' open' : ''), 'aria-label': `${p.name}'s tasks` });
  const tally = h('span', { class: 'tally' }, all.length === 0
    ? h('span', { class: 'tally-none', text: 'No tasks yet' })
    : ORDER.map((s) => h('span', { class: `tally-item s-${s}` }, icon(STATUS[s].icon), h('span', { text: n[s] }), h('span', { class: 'sr', text: ' ' + STATUS[s].word.toLowerCase() + '. ' }))));
  const headText = [
    avatar(p),
    h('span', { class: 'person-name', text: p.name }),
    h('span', { class: 'person-sub' }, mine && h('span', { class: 'you-tag', text: 'You' }), tally),
  ];
  const panelId = 'tasks-' + p.id;
  card.append(h('div', { class: 'person-head' },
    tv ? h('h2', { class: 'person-toggle' }, headText)
      : h('h2', { class: 'person-h' }, h('button', {
        class: 'person-toggle', type: 'button', 'aria-expanded': String(isOpen), 'aria-controls': panelId,
        onclick: () => { S.open[p.id] = !isOpen; if (S.filter) S.filter = null; saveOpen(); render({ glide: true }); },
      }, headText, icon('chev', 'drop'))),
  ));
  if (!isOpen) return card;
  const panel = h('div', { class: 'person-panel', id: panelId });
  if (shown.length === 0) {
    panel.append(h('div', { class: 'empty' }, h('p', { text: S.filter ? `Nothing ${STATUS[S.filter].word.toLowerCase()} here.` : mine ? 'Your list is clear.' : `${p.name} has nothing yet.` })));
  } else {
    const ul = h('ul', { class: 'tasks' }, shown.map((t) => taskRow(t, tv)));
    if (hideDone && !tv) ul.append(h('li', null, h('button', { class: 'mini more-done', type: 'button', onclick: () => { S.showDone[p.id] = true; render(); } }, `Show ${done.length - limit} more done`)));
    panel.append(ul);
  }
  if (!tv) panel.append(h('button', { class: 'mini add-here', type: 'button', onclick: () => openAdd(p.id) }, icon('plus'), mine ? 'Add a task for me' : `Add a task for ${p.name}`));
  card.append(panel);
  return card;
}
function countsBar(tv) {
  const c = { not_started: 0, in_progress: 0, done: 0 };
  for (const t of S.tasks) c[t.status]++;
  return h('div', { class: 'counts-wrap' }, h('div', { class: 'counts', role: 'group', 'aria-label': 'Task counts. Tap one to filter.' },
    ORDER.map((s) => h(tv ? 'div' : 'button', {
      class: `count s-${s}`, type: tv ? null : 'button', 'aria-pressed': tv ? null : String(S.filter === s), 'data-count': s,
      onclick: tv ? null : () => { S.filter = S.filter === s ? null : s; render(); },
    }, h('span', { class: 'num', text: c[s] }), icon(STATUS[s].icon), h('span', { class: 'lab', text: STATUS[s].word })))));
}
function askBanner(a) {
  const task = S.tasks.find((t) => t.id === a.task_id);
  if (!task) return null;
  return h('section', { class: 'card ask reveal', 'aria-label': 'Check-in' },
    h('p', null, h('span', { class: 'who', text: person(a.sender_id)?.name || 'Someone' }), ` is checking in on “${task.title}”. Where is it at?`),
    h('div', { class: 'row-2' },
      h('button', { class: 'btn status s-done', type: 'button', onclick: () => answerAsk(a, 'done') }, icon('check'), 'Done'),
      h('button', { class: 'btn status s-in_progress', type: 'button', onclick: () => answerAsk(a, 'working') }, icon('half'), 'Working on it')));
}
function renderBoard(view, tv) {
  const kids = [countsBar(tv)];
  if (!tv) for (const a of S.asks) kids.push(askBanner(a));
  if (S.tasks.length === 0) {
    kids.push(h('section', { class: 'card slate reveal' },
      h('div', { class: 'ring', 'aria-hidden': 'true' }),
      h('h2', { text: 'A clean slate' }),
      h('p', { text: tv ? 'No tasks yet. Add one from your phone.' : 'Nothing on the board yet. Add the first task. It takes five seconds.' }),
      !tv && h('button', { class: 'btn primary', type: 'button', onclick: () => openAdd() }, icon('plus'), 'Add the first task')));
  }
  if (S.filter && !tv) {
    kids.push(h('p', { class: 'filter-note' }, `Showing ${STATUS[S.filter].word.toLowerCase()} only.`,
      h('button', { class: 'mini', type: 'button', onclick: () => { S.filter = null; render(); } }, 'Show all')));
  }
  const ordered = [...S.people].sort((a, b) => (b.id === S.me.id) - (a.id === S.me.id) || a.id - b.id);
  if (S.tasks.length > 0 || !tv) kids.push(h('div', { class: 'people' }, ordered.map((p) => personCard(p, tv))));
  view.replaceChildren(...kids.filter(Boolean));
  watchSticky();
}
let stickyObs;
function watchSticky() {
  stickyObs?.disconnect();
  const wrap = $('.counts-wrap');
  if (!wrap || isTV() || !('IntersectionObserver' in window)) return;
  stickyObs = new IntersectionObserver(([e]) => wrap.classList.toggle('stuck', !e.isIntersecting), { threshold: 0 });
  stickyObs.observe($('#top'));
}

// ---------- activity ----------
async function loadActivity() {
  try { S.activity = (await api('GET', '/api/activity')).items; if (location.pathname === '/activity') render(); } catch { /* shown as empty */ }
}
const VERB_ICON = { add: ['plus', 'red'], status: ['half', 'gold'], remove: ['trash', ''], restore: ['plus', ''], checkin: ['hand', 'teal'], answer: ['check', 'green'], rename: ['pen', ''], due: ['cal', ''], reassign: ['swap', ''], person: ['person', 'teal'] };
function renderActivity(view) {
  if (!S.activity) { view.replaceChildren(h('p', { class: 'note', text: 'Loading…' })); return; }
  if (S.activity.length === 0) {
    view.replaceChildren(h('section', { class: 'card slate reveal' }, h('div', { class: 'ring', 'aria-hidden': 'true' }), h('h2', { text: 'Nothing yet' }), h('p', { text: 'When someone adds or moves a task, it shows up here.' })));
    return;
  }
  const out = [];
  let dayKey = '', ul;
  for (const a of S.activity) {
    const d = new Date(a.created_at);
    const key = iso(d);
    if (key !== dayKey) {
      dayKey = key;
      const n = dayDiff(key);
      out.push(h('h2', { class: 'day', text: n === 0 ? 'Today' : n === -1 ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) }));
      ul = h('ul', { class: 'card feed' });
      out.push(ul);
    }
    let [ic, color] = VERB_ICON[a.verb] || ['pulse', ''];
    if (a.verb === 'status') [ic, color] = a.text.startsWith('finished') ? ['check', 'green'] : a.text.startsWith('started') ? ['half', 'gold'] : ['ring', 'red'];
    const via = { claude: ' · with Claude', text: ' · by text', push: ' · from a notification' }[a.via] || '';
    const li = h('li', null, icon(ic), h('div', null,
      h('p', { class: 'what' }, h('b', { text: a.actor || 'Someone' }), ' ' + a.text),
      h('p', { class: 'when', text: ago(a.created_at) + via })));
    if (color) li.style.setProperty('--c', `var(--${color === 'teal' ? 'teal-bright' : color})`);
    ul.append(li);
  }
  view.replaceChildren(...out);
}

// ---------- sheets ----------
let sheet = null; // { kind, el, opener, ... }
function openSheet(kind, data = {}) {
  closeSheet(true);
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' });
  const scrim = h('div', { class: 'scrim', onclick: (e) => { if (e.target === scrim) closeSheet(); } }, panel);
  sheet = { kind, panel, scrim, opener: document.activeElement, ...data };
  $('#sheet-root').replaceChildren(scrim);
  document.body.style.overflow = 'hidden';
  $('#app').inert = true;
  drawSheet();
  const first = panel.querySelector('[data-autofocus]') || panel.querySelector('button, input, textarea');
  first?.focus({ preventScroll: true });
}
function closeSheet(silent = false) {
  if (!sheet) return;
  const { opener } = sheet;
  sheet = null;
  $('#sheet-root').replaceChildren();
  document.body.style.overflow = '';
  $('#app').inert = false;
  if (!silent && opener?.isConnected) opener.focus({ preventScroll: true });
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheet) closeSheet();
  if (e.key === 'Tab' && sheet) { // keep focus inside the sheet
    const f = [...sheet.panel.querySelectorAll('button:not([disabled]), input, textarea, a[href]')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
const sheetHead = (title, sub) => [
  h('div', { class: 'grab', 'aria-hidden': 'true' }),
  h('div', { class: 'sheet-head' },
    h('div', null, h('h2', { id: 'sheet-title', text: title }), sub && h('p', { class: 'sub', text: sub })),
    h('button', { class: 'close', type: 'button', 'aria-label': 'Close', onclick: () => closeSheet() }, icon('x'))),
];
function drawSheet() {
  if (!sheet) return;
  if (sheet.kind === 'add') drawAdd();
  if (sheet.kind === 'task') drawTask();
  if (sheet.kind === 'link') drawLink();
}
function renderSheetIfTask() { if (sheet?.kind === 'task' && sheet.mode === 'main') drawTask(); }

function dueChips(current, onPick) {
  const picks = [['Today', today()], ['Tomorrow', plusDays(1)], ['This week', endOfWeek()]];
  const custom = current && !picks.some(([, v]) => v === current);
  const native = h('input', { type: 'date', class: 'date-native', tabindex: '-1', 'aria-hidden': 'true', min: plusDays(-1), value: current || '', onchange: (e) => { if (e.target.value) onPick(e.target.value); } });
  // A date already chosen wins: "Today" and "This week" can be the same day on a Friday.
  let used = false;
  return h('div', { class: 'chips', role: 'group', 'aria-label': 'Due date' },
    picks.map(([label, v]) => {
      const on = current === v && !used; if (on) used = true;
      return h('button', { class: 'chip', type: 'button', 'aria-pressed': String(on), onclick: () => onPick(on ? null : v) }, label);
    }),
    h('button', { class: 'chip', type: 'button', 'aria-pressed': String(Boolean(custom)), onclick: () => { try { native.showPicker(); } catch { native.focus(); native.click(); } } },
      icon('cal'), custom ? asDate(current).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Pick a date'),
    native);
}
function nameChips(current, onPick) {
  const ordered = [...S.people].sort((a, b) => (b.id === S.me.id) - (a.id === S.me.id) || a.id - b.id);
  return h('div', { class: 'chips', role: 'group', 'aria-label': 'Who is it for' },
    ordered.map((p) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(current === p.id), onclick: () => onPick(p.id) }, p.id === S.me.id ? 'Me' : p.name)));
}

function openAdd(ownerId) { openSheet('add', { owner: ownerId || S.me.id, due: null, title: '' }); }
function drawAdd() {
  const keep = sheet.panel.querySelector('textarea')?.value ?? sheet.title;
  const input = h('textarea', { class: 'field', id: 'add-title', rows: '2', maxlength: '200', placeholder: 'Say it or type it', enterkeyhint: 'done', autocapitalize: 'sentences', 'data-autofocus': true });
  input.value = keep;
  const submit = h('button', { class: 'btn primary', type: 'submit' }, icon('plus'), 'Add task');
  const err = h('p', { class: 'err', role: 'alert', hidden: true });
  const form = h('form', { novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const title = input.value.replace(/\s+/g, ' ').trim();
    if (!title) { err.textContent = 'Say what needs doing first.'; err.hidden = false; input.focus(); return; }
    const { owner, due } = sheet;
    closeSheet();
    addTask(title, owner, due);
  } },
    sheetHead('What needs doing?'),
    h('label', { class: 'sr', for: 'add-title', text: 'What needs doing?' }),
    h('div', { class: 'stack' }, input), err,
    h('p', { class: 'label', text: 'Who is it for?' }),
    nameChips(sheet.owner, (id) => { sheet.owner = id; drawAdd(); }),
    h('p', { class: 'label' }, 'When is it due? ', h('span', { class: 'opt', text: 'You can skip this.' })),
    dueChips(sheet.due, (d) => { sheet.due = d; drawAdd(); }),
    h('div', { class: 'foot' }, submit));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  const hadFocus = document.activeElement?.id === 'add-title';
  sheet.panel.replaceChildren(form);
  if (hadFocus) input.focus();
}

function openTask(id) { openSheet('task', { id, mode: 'main' }); }
function drawTask() {
  const t = S.tasks.find((x) => x.id === sheet.id);
  if (!t) { closeSheet(); return; }
  const owner = person(t.owner_id);
  const due = t.due_on ? (t.status !== 'done' && dayDiff(t.due_on) < 0 ? `Overdue. Was due ${sayDate(t.due_on)}` : `Due ${sayDate(t.due_on)}`) : 'No due date';
  const sub = `${t.owner_id === S.me.id ? 'Yours' : `For ${owner?.name}`} · Added by ${nameOf(t.created_by)}${t.updated_by !== t.created_by ? ` · Last changed by ${nameOf(t.updated_by)}` : ''}`;
  const back = (label) => h('button', { class: 'btn quiet', type: 'button', onclick: () => { sheet.mode = 'main'; drawTask(); } }, label);
  let body;
  if (sheet.mode === 'edit') {
    const input = h('textarea', { class: 'field', id: 'edit-title', rows: '2', maxlength: '200', 'data-autofocus': true });
    input.value = t.title;
    const save = () => { const title = input.value.replace(/\s+/g, ' ').trim(); if (title) patchTask(t, { title }); sheet.mode = 'main'; drawTask(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); } });
    body = [sheetHead('Edit the words'), h('label', { class: 'sr', for: 'edit-title', text: 'Task' }), h('div', { class: 'stack' }, input),
      h('div', { class: 'foot' }, h('button', { class: 'btn primary', type: 'button', onclick: save }, 'Save'), back('Cancel'))];
  } else if (sheet.mode === 'due') {
    body = [sheetHead('When is it due?', t.title), h('div', { class: 'stack' }, dueChips(t.due_on, (d) => { patchTask(t, { due_on: d }); sheet.mode = 'main'; drawTask(); })),
      h('div', { class: 'foot' }, t.due_on && h('button', { class: 'btn', type: 'button', onclick: () => { patchTask(t, { due_on: null }); sheet.mode = 'main'; drawTask(); } }, 'No due date'), back('Back'))];
  } else if (sheet.mode === 'who') {
    body = [sheetHead('Who should have it?', t.title), h('div', { class: 'stack' }, nameChips(t.owner_id, (id) => { patchTask(t, { owner_id: id }); sheet.mode = 'main'; drawTask(); })), h('div', { class: 'foot' }, back('Back'))];
  } else {
    const recent = t.checked_at && Date.now() - t.checked_at < CHECKIN_GAP;
    const row = (ic, label, value, onclick, cls = '') => h('button', { class: 'rowlink ' + cls, type: 'button', onclick }, icon(ic), h('span', null, label, value && h('span', { class: 'sub', text: ' · ' + value })), icon('chev', 'chev'));
    body = [
      sheetHead(t.title, sub),
      h('div', { class: 'stack', role: 'group', 'aria-label': 'Status' }, ORDER.map((s) => h('button', {
        class: `btn status s-${s}`, type: 'button', 'aria-pressed': String(t.status === s), onclick: () => { if (t.status !== s) { setStatus(t, s); if (s === 'done') closeSheet(); } },
      }, icon(STATUS[s].icon), STATUS[s].word, t.status === s && h('span', { class: 'now', text: 'Now' })))),
      h('div', { class: 'rows card' },
        t.status !== 'done' && h('button', { class: 'rowlink', type: 'button', disabled: recent, onclick: () => { checkIn(t); } }, icon('hand'),
          h('span', null, recent ? 'Checked in' : 'Check in', h('span', { class: 'sub', text: recent ? ' · You can ask again in a few hours' : ` · Ask ${t.owner_id === S.me.id ? 'yourself' : owner?.name} where it is at` }))),
        row('pen', 'Edit the words', '', () => { sheet.mode = 'edit'; drawTask(); sheet.panel.querySelector('textarea').focus(); }),
        row('cal', 'Due date', due, () => { sheet.mode = 'due'; drawTask(); }),
        row('swap', 'Who has it', owner?.name, () => { sheet.mode = 'who'; drawTask(); })),
      h('div', { class: 'foot' }, h('button', { class: 'btn danger', type: 'button', onclick: () => removeTask(t) }, icon('trash'), 'Remove task')),
    ];
  }
  sheet.panel.replaceChildren(...body.flat().filter(Boolean));
}

// ---------- copy and share ----------
async function copyText(text, btn, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = h('textarea', { class: 'sr' }); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* shown below */ } ta.remove();
  }
  if (btn) { const old = [...btn.childNodes]; btn.replaceChildren(icon('check'), label); setTimeout(() => btn.replaceChildren(...old), 2200); }
}
const inviteMessage = (name, url) => `Hi ${name}. This is your link to our Team Tasks board. Tap it and you are in. No password.\n${url}\nIt is your personal key, so please do not forward it.`;
function drawLink() {
  const { name, url, fresh } = sheet;
  const msg = inviteMessage(name, url);
  const copy = h('button', { class: 'btn primary', type: 'button', 'data-autofocus': true, onclick: () => copyText(msg, copy) }, icon('copy'), 'Copy the message');
  sheet.panel.replaceChildren(...[
    sheetHead(`${name}'s invite link`, fresh ? 'The old link no longer works. Their devices are signed out.' : 'Text this to them. One tap and they are in.'),
    h('p', { class: 'linkbox msgbox', text: msg }),
    h('p', { class: 'note', text: 'This is shown once. If it gets lost, make a new one with Reset link.' }),
    h('div', { class: 'foot' }, copy,
      navigator.share && h('button', { class: 'btn', type: 'button', onclick: () => navigator.share({ text: msg }).catch(() => {}) }, icon('share'), 'Share'),
      h('button', { class: 'btn quiet', type: 'button', onclick: () => closeSheet() }, 'Done')),
  ].flat().filter(Boolean));
}

// ---------- notifications ----------
function keyBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
async function checkPush() {
  if (!pushSupported() || Notification.permission !== 'granted') { S.pushOn = false; return; }
  try { const reg = await navigator.serviceWorker.ready; S.pushOn = Boolean(await reg.pushManager.getSubscription()); } catch { S.pushOn = false; }
}
/** Returns '' on success, or a plain sentence saying what to do. */
async function enablePush() {
  if (!S.config.push_key) return 'Notifications are not set up on the server yet.';
  if (!pushSupported()) return isIOS() && !standalone() ? 'On iPhone, add Team Tasks to your Home Screen first. Then open it from there and turn this on.' : 'This browser cannot show notifications.';
  let perm;
  try { perm = await Notification.requestPermission(); } catch { perm = 'denied'; }
  if (perm !== 'granted') return 'Notifications are blocked for this site. Allow them in your phone settings, then try again.';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(S.config.push_key) }));
    await api('POST', '/api/push/subscribe', sub.toJSON());
    S.pushOn = true; S.me.notify_push = true;
    return '';
  } catch (e) { return e.message || 'Could not turn on notifications. Try again.'; }
}

// ---------- You ----------
function renderYou(view) {
  const me = S.me;
  const channel = me.notify_push && me.notify_sms ? 'both' : me.notify_sms ? 'text' : 'push';
  const note = h('p', { class: 'note', role: 'status' });
  const pushBtn = S.pushOn
    ? h('button', { class: 'mini', type: 'button', onclick: async () => { try { const d = await api('POST', '/api/push/test'); toast(d.queued ? 'It is quiet hours. The test arrives at 8:00 AM.' : 'Sent. It should arrive in a moment.'); } catch (e) { fail(e); } } }, 'Send a test')
    : h('button', { class: 'mini gold-line', type: 'button', onclick: async () => { const why = await enablePush(); if (why) note.textContent = why; else { toast('Notifications are on.'); render(); } } }, 'Turn on');
  const phone = h('input', { class: 'field', id: 'phone', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '310 555 0123', value: me.phone || '' });
  const phoneErr = h('p', { class: 'err', role: 'alert', hidden: true });
  const saveMe = async (patch, okText) => { try { S.me = (await api('PATCH', '/api/me', patch)).me; if (okText) toast(okText, { ms: 3000 }); render(); return true; } catch (e) { if (e.status === 400) { phoneErr.textContent = e.message; phoneErr.hidden = false; } else fail(e); return false; } };
  const pick = (c) => {
    if (c !== 'push' && !me.phone) { phoneErr.textContent = 'Add your mobile number first.'; phoneErr.hidden = false; phone.focus(); return; }
    saveMe({ notify_push: c !== 'text', notify_sms: c !== 'push' }, 'Saved.');
  };
  const kids = [
    h('section', { class: 'card section reveal' },
      h('h2', { text: 'Notifications on this device' }),
      h('p', { class: 'lead', text: 'Check-ins and the morning digest. Never between 9:00 PM and 8:00 AM.' }),
      h('div', { class: 'member' }, h('span', { class: 'state ' + (S.pushOn ? 'on' : 'off') }, icon(S.pushOn ? 'check' : 'ring'), S.pushOn ? 'On' : 'Off'), pushBtn), note),
    h('section', { class: 'card section' },
      h('h2', { text: 'How should we reach you?' }),
      h('div', { class: 'chips stack', role: 'group', 'aria-label': 'How should we reach you' },
        [['push', 'Notifications'], ['text', 'Text messages'], ['both', 'Both']].map(([c, label]) => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(channel === c), onclick: () => pick(c) }, label))),
      h('label', { class: 'label', for: 'phone', text: 'Your mobile number' }),
      h('form', { class: 'inline', novalidate: true, onsubmit: (e) => { e.preventDefault(); phoneErr.hidden = true; saveMe({ phone: phone.value.trim() || null }, phone.value.trim() ? 'Number saved.' : 'Number removed.'); } },
        phone, h('button', { class: 'btn', type: 'submit' }, 'Save')),
      phoneErr,
      h('p', { class: 'note', text: 'Adding your number means you agree to get Team Tasks texts. Reply STOP to end them.' }),
      !S.config.sms && h('p', { class: 'note', text: 'Texting is not switched on yet. Your number is kept for the day it is.' }),
      me.sms_stopped && h('p', { class: 'err', text: 'You replied STOP, so texts are paused. Text START to the Team Tasks number to resume.' })),
    h('div', { class: 'card rows' },
      h('button', { class: 'rowlink', type: 'button', onclick: () => go('/connect') }, icon('spark'), 'Connect your Claude', icon('chev', 'chev')),
      h('button', { class: 'rowlink', type: 'button', onclick: () => startWelcome(0) }, icon('phone'), 'Add to Home Screen', icon('chev', 'chev')),
      h('button', { class: 'rowlink', type: 'button', onclick: () => go('/tv') }, icon('screen'), 'Wall display', icon('chev', 'chev'))),
  ];
  if (me.role === 'owner') {
    const name = h('input', { class: 'field', id: 'new-person', type: 'text', maxlength: '40', autocomplete: 'off', autocapitalize: 'words', placeholder: 'First name' });
    const err = h('p', { class: 'err', role: 'alert', hidden: true });
    kids.push(h('section', { class: 'card section' },
      h('h2', { text: 'People' }),
      h('p', { class: 'lead', text: 'Each person has one invite link. Resetting it signs them out everywhere.' }),
      h('div', { class: 'stack' }, S.people.map((p) => h('div', { class: 'member' },
        h('span', { class: 'nm', text: p.name + (p.id === me.id ? ' (you)' : '') }),
        h('button', { class: 'mini', type: 'button', 'aria-label': `Reset link for ${p.name}`, onclick: async (e) => {
          const b = e.currentTarget;
          if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to reset'; b.classList.add('danger'); setTimeout(() => { if (b.isConnected) { b.dataset.sure = ''; b.textContent = 'Reset link'; b.classList.remove('danger'); } }, 4000); return; }
          try { const d = await api('POST', `/api/people/${p.id}/reset-link`); openSheet('link', { name: p.name, url: d.invite_url, fresh: true }); } catch (x) { fail(x); }
        } }, 'Reset link')))),
      h('label', { class: 'label', for: 'new-person', text: 'Add a person' }),
      h('form', { class: 'inline', novalidate: true, onsubmit: async (e) => {
        e.preventDefault(); err.hidden = true;
        try { const d = await api('POST', '/api/people', { name: name.value }); S.version = 0; await refresh(true); openSheet('link', { name: d.person.name, url: d.invite_url, fresh: false }); }
        catch (x) { err.textContent = x.message; err.hidden = false; }
      } }, name, h('button', { class: 'btn', type: 'submit' }, 'Add')), err));
  }
  kids.push(h('div', { class: 'stack' }, h('button', { class: 'btn quiet', type: 'button', onclick: async () => { try { await api('POST', '/api/signout'); } catch { /* signed out either way */ } signedOut('You are signed out on this device.'); } }, 'Sign out on this device')));
  view.replaceChildren(...kids);
}

// ---------- Connect your Claude ----------
let connectorUrl = '';
async function loadConnector() { if (!connectorUrl) { try { connectorUrl = (await api('GET', '/api/connector')).url; } catch { /* retried on next open */ } } return connectorUrl; }
function renderConnect(view) {
  const box = h('p', { class: 'linkbox', text: connectorUrl || 'Loading your link…', 'aria-label': 'Your personal Claude link' });
  const copy = h('button', { class: 'btn primary', type: 'button', onclick: async () => { const u = await loadConnector(); if (u) copyText(u, copy, 'Copied. Now paste it in Claude'); } }, icon('copy'), 'Copy my link');
  if (!connectorUrl) loadConnector().then((u) => { if (u) box.textContent = u; });
  view.replaceChildren(
    h('section', { class: 'card section reveal' },
      h('h2', { text: 'Run the board by talking' }),
      h('p', { class: 'lead', text: 'This link is yours alone. It tells Claude who you are, so there is no sign-in. Keep it private.' }),
      box, h('div', { class: 'stack' }, copy)),
    h('section', { class: 'card section' },
      h('h2', { text: 'Three steps, once' }),
      h('ol', { class: 'steps' },
        h('li', null, h('span', { text: 'Copy your link with the gold button.' })),
        h('li', null, h('span', { text: 'In Claude, open Customize, then Connectors. Choose Add, then Add custom connector.' })),
        h('li', null, h('span', { text: 'Name it Team Tasks. Paste your link. Choose No sign-in. Then Add.' }))),
      h('p', { class: 'note', text: 'Set it up at claude.ai or in the Claude desktop app. After that it works in Claude on your phone too.' })),
    h('section', { class: 'card section' },
      h('h2', { text: 'Things to say' }),
      h('ul', { class: 'say' },
        ['Add a task for Nevan: lock the budget, due Wednesday.', 'What is on my plate today?', 'Mark the budget task done.', 'Check in with Gregory on the edit.', 'How is the team doing?'].map((s) => h('li', { text: `“${s}”` })))));
}

// ---------- welcome: three large steps, each skippable ----------
const PICS = {
  home: '<rect x="42" y="14" width="64" height="120" rx="12" fill="none" stroke="#e8e6e1" stroke-width="2"/><rect x="62" y="56" width="24" height="24" rx="7" fill="rgba(212,168,67,0.16)" stroke="#d4a843" stroke-width="2"/><path d="M74 62v12M68 68h12" stroke="#d4a843" stroke-width="2" stroke-linecap="round"/><path d="M8 118h132" stroke="#4f98a3" stroke-width="1.5" opacity="0.7"/><circle cx="30" cy="118" r="3" fill="#bfeff0"/><path d="M66 124h16" stroke="#e8e6e1" stroke-width="2" stroke-linecap="round" opacity="0.5"/>',
  bell: '<path d="M46 98V70a28 28 0 0 1 56 0v28l10 10H36z" fill="rgba(212,168,67,0.1)" stroke="#e8e6e1" stroke-width="2" stroke-linejoin="round"/><path d="M64 118a10.5 10.5 0 0 0 20 0" fill="none" stroke="#e8e6e1" stroke-width="2" stroke-linecap="round"/><circle cx="104" cy="48" r="9" fill="#d4a843"/><path d="M8 30h132" stroke="#4f98a3" stroke-width="1.5" opacity="0.7"/><circle cx="104" cy="30" r="3" fill="#bfeff0"/>',
  talk: '<path d="M26 34h78a12 12 0 0 1 12 12v36a12 12 0 0 1-12 12H62l-22 20V94H26a12 12 0 0 1-12-12V46a12 12 0 0 1 12-12z" fill="rgba(79,152,163,0.1)" stroke="#e8e6e1" stroke-width="2" stroke-linejoin="round"/><path d="M65 46l4.6 13.4L83 64l-13.4 4.6L65 82l-4.6-13.4L47 64l13.4-4.6z" fill="none" stroke="#d4a843" stroke-width="2" stroke-linejoin="round"/><path d="M96 122h44" stroke="#4f98a3" stroke-width="1.5" opacity="0.7"/><circle cx="118" cy="122" r="3" fill="#bfeff0"/>',
};
function pic(name) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 148 148'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = PICS[name];
  return s;
}
function startWelcome(step = 0) { S.welcome = { step, note: '' }; render(); }
function endWelcome() { store.set('tt_welcomed', '1'); S.welcome = null; go('/', true); }
function renderWelcome() {
  const w = S.welcome;
  const next = () => { w.step++; w.note = ''; if (w.step > 2) endWelcome(); else render(); };
  let body;
  if (w.step === 0) {
    const installed = standalone();
    const how = installed ? null : isIOS()
      ? h('ol', { class: 'how' }, h('li', null, icon('share'), 'Tap the Share button in Safari.'), h('li', null, icon('plus'), 'Choose “Add to Home Screen”.'), h('li', null, icon('check'), 'Open Team Tasks from your Home Screen.'))
      : S.installEvent ? null
        : h('ol', { class: 'how' }, h('li', null, icon('chev'), 'Open your browser menu.'), h('li', null, icon('plus'), 'Choose “Install app” or “Add to Home screen”.'));
    body = [pic('home'),
      h('h1', { tabindex: '-1' }, 'Add to ', h('span', { class: 'gold', text: 'Home Screen' })),
      h('p', { class: 'say-it', text: installed ? 'Done. Team Tasks is on your Home Screen.' : 'Put Team Tasks one tap away. It opens like an app. No store, no password.' }), how,
      h('div', { class: 'acts' },
        !installed && S.installEvent ? h('button', { class: 'btn primary', type: 'button', onclick: async () => { S.installEvent.prompt(); await S.installEvent.userChoice.catch(() => {}); S.installEvent = null; next(); } }, 'Add it now')
          : h('button', { class: 'btn primary', type: 'button', onclick: next }, installed ? 'Next' : 'I have done it'),
        !installed && h('button', { class: 'btn quiet', type: 'button', onclick: next }, 'Skip for now'))];
  } else if (w.step === 1) {
    const needsHome = isIOS() && !standalone();
    body = [pic('bell'),
      h('h1', { tabindex: '-1' }, 'Turn on ', h('span', { class: 'gold', text: 'Notifications' })),
      h('p', { class: 'say-it', text: S.pushOn ? 'Done. This device will get check-ins.' : needsHome ? 'On iPhone this works from the Home Screen app. Open Team Tasks from there and we will ask again.' : 'Get a tap on the shoulder when someone checks in. Answer in one tap. Never at night.' }),
      w.note && h('p', { class: 'err', role: 'alert', text: w.note }),
      h('div', { class: 'acts' },
        S.pushOn || needsHome ? h('button', { class: 'btn primary', type: 'button', onclick: next }, 'Next')
          : h('button', { class: 'btn primary', type: 'button', onclick: async () => { const why = await enablePush(); if (why) { w.note = why; render(); } else next(); } }, 'Turn on notifications'),
        !S.pushOn && !needsHome && h('button', { class: 'btn quiet', type: 'button', onclick: next }, 'Skip for now'))];
  } else {
    body = [pic('talk'),
      h('h1', { tabindex: '-1' }, 'Connect ', h('span', { class: 'gold', text: 'your Claude' })),
      h('p', { class: 'say-it', text: 'Run the board by talking. “Add a task for Nevan: lock the budget, due Wednesday.”' }),
      h('div', { class: 'acts' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => { store.set('tt_welcomed', '1'); S.welcome = null; go('/connect', true); } }, 'Show me how'),
        h('button', { class: 'btn quiet', type: 'button', onclick: next }, 'Skip. Take me to the board'))];
  }
  return h('div', { class: 'stage', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome' }, h('div', { class: 'stage-bg', 'aria-hidden': 'true' }),
    h('div', { class: 'stage-in reveal' },
      h('div', { class: 'brand' }, brandMark(), h('span', { class: 'wordmark', text: 'Infinite Canvas' })),
      h('p', { class: 'eyebrow', text: w.step === 0 && !store.get('tt_welcomed') ? `Welcome, ${S.me.name}` : 'Getting set up' }),
      h('div', { class: 'pic' }, body[0]), body.slice(1),
      h('p', { class: 'dots', 'aria-label': `Step ${w.step + 1} of 3` }, [0, 1, 2].map((i) => h('i', { class: i <= w.step ? 'on' : '' })), h('span', { text: `Step ${w.step + 1} of 3` }))));
}
function renderSignedOut() {
  return h('div', { class: 'stage' }, h('div', { class: 'stage-bg', 'aria-hidden': 'true' }),
    h('div', { class: 'stage-in reveal' },
      h('div', { class: 'brand' }, brandMark(), h('span', { class: 'wordmark', text: 'Infinite Canvas' })),
      h('div', { class: 'pic' }),
      h('h1', null, 'Team ', h('span', { class: 'gold', text: 'Tasks' })),
      h('p', { class: 'say-it', text: S.signedOutWhy || 'Open your invite link to come in.' }),
      h('p', { class: 'say-it', text: 'It is the link Elijah texted you. Lost it? Ask Elijah for a new one.' }),
      h('div', { class: 'acts' })));
}

// ---------- render ----------
let stage = null;
function draw() {
  const path = location.pathname;
  const tv = path === '/tv';
  document.documentElement.classList.toggle('tv-root', tv);
  document.body.classList.toggle('tv', tv);
  stage?.remove(); stage = null;
  if (S.signedOut) { stage = renderSignedOut(); document.body.append(stage); $('#app').hidden = true; return; }
  if (!S.loaded) return;
  $('#app').hidden = false;
  if (S.welcome) { stage = renderWelcome(); document.body.append(stage); $('#app').inert = true; stage.querySelector('h1')?.focus({ preventScroll: true }); return; }
  if (!sheet) $('#app').inert = false;
  const view = $('#view');
  const dock = $('#dock');
  const sub = { '/activity': 'Activity', '/you': S.me.name, '/connect': 'Connect your Claude' }[path];
  view.className = sub ? 'narrow' : '';
  document.body.classList.toggle('no-dock', Boolean(sub));
  renderHeader(sub ? 'slim' : 'full', sub || '');
  document.title = `${sub ? (path === '/you' ? 'You' : sub) : tv ? 'Wall display' : 'Board'} · Team Tasks`;
  if (path === '/activity') { if (!S.activity) loadActivity(); renderActivity(view); }
  else if (path === '/you') renderYou(view);
  else if (path === '/connect') renderConnect(view);
  else renderBoard(view, tv);
  dock.hidden = tv || Boolean(sub);
  if (!dock.firstChild) {
    dock.append(h('div', { class: 'dock-inner' },
      h('button', { class: 'tab', type: 'button', onclick: () => go('/activity') }, icon('pulse'), 'Activity'),
      h('button', { class: 'btn primary', type: 'button', id: 'add', onclick: () => openAdd() }, icon('plus'), 'Add a task'),
      h('button', { class: 'tab', type: 'button', onclick: () => go('/you') }, icon('person'), 'You')));
  }
  if (tv && !$('.clock')) $('#top').append(h('p', { class: 'clock', text: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }));
}
function render({ glide = false } = {}) {
  // Rows glide to their new place where the browser can do it. Never while typing in a sheet.
  if (glide && document.startViewTransition && !reduced() && !sheet && !S.welcome && !S.signedOut && document.visibilityState === 'visible') {
    try { document.startViewTransition(draw); return; } catch { /* fall through */ }
  }
  draw();
  if (sheet?.kind === 'task' && !S.tasks.some((t) => t.id === sheet.id)) closeSheet();
}

// ---------- boot ----------
async function prepareHomeScreen() {
  // An iPhone Home Screen app has its own cookie jar. Its start link carries a sign-in of its own.
  if (standalone()) return;
  let hand = store.get('tt_h');
  if (!hand) { try { hand = (await api('POST', '/api/handoff')).h; store.set('tt_h', hand); } catch { return; } }
  $('#manifest').setAttribute('href', `/manifest.webmanifest?h=${hand}`);
}
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvent = e; if (S.welcome) render(); });

(async function boot() {
  const q = new URLSearchParams(location.search);
  const clean = () => history.replaceState({}, '', location.pathname);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (q.get('h')) { try { await fetch('/api/session/adopt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ h: q.get('h') }) }); } catch { /* the board call decides */ } }
  if (q.has('bad-link')) S.signedOutWhy = 'That invite link is no longer valid.';
  if (q.has('slow-down')) S.signedOutWhy = 'Too many tries. Wait ten minutes, then open your link again.';
  const wantsWelcome = q.has('welcome');
  if (location.search) clean();
  try { applyBoard(await api('GET', '/api/board')); } catch (e) {
    if (e.code !== 'signed_out') { $('.boot-text').textContent = e.message; setTimeout(boot, 4000); }
    return;
  }
  await checkPush();
  if (!isTV() && !store.get('tt_welcomed') && (wantsWelcome || standalone())) S.welcome = { step: standalone() ? 1 : 0, note: '' };
  render();
  prepareHomeScreen();
})();
