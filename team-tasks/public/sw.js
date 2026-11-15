// Team Tasks service worker: push notifications, one-tap replies, and a small offline shell.
const CACHE = 'tt-v1';
const SHELL = ['/', '/app.css', '/app.js', '/fonts/lexend-var.woff2', '/fonts/cinzel-400.woff2', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network first, so a new version shows up at once. The cache only covers a dead connection.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (/^\/(api|join|claude|webhooks|manifest)/.test(url.pathname)) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('/') : Response.error()))),
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const options = {
    body: d.body || '',
    tag: d.tag || 'team-tasks',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    data: { url: d.url || '/', reply: d.reply || null },
  };
  // One-tap answers, where the phone supports buttons on notifications.
  if (d.reply) options.actions = [{ action: 'done', title: 'Done' }, { action: 'working', title: 'Working on it' }];
  e.waitUntil(self.registration.showNotification(d.title || 'Team Tasks', options));
});

self.addEventListener('notificationclick', (e) => {
  const { url, reply } = e.notification.data || {};
  e.notification.close();
  if (reply && (e.action === 'done' || e.action === 'working')) {
    e.waitUntil(
      fetch('/api/reply/' + reply, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: e.action }) })
        .then((r) => { if (!r.ok) throw new Error('reply failed'); })
        .catch(() => self.clients.openWindow(url || '/')),
    );
    return;
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.postMessage({ type: 'open', url: url || '/' }); return c.focus(); }
      }
      return self.clients.openWindow(url || '/');
    }),
  );
});
