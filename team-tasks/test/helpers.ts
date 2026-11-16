// Test rig: the real Worker code against an in-memory SQLite that speaks the D1 interface.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes, webcrypto } from 'node:crypto';
import worker from '../src/index';
import type { Env } from '../src/types';

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private args: unknown[] = []) {}
  bind(...args: unknown[]) { return new Stmt(this.db, this.sql, args.map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a))); }
  async first<T>(): Promise<T | null> { return (this.db.prepare(this.sql).get(...(this.args as any[])) as T) ?? null; }
  async all<T>(): Promise<{ results: T[] }> { return { results: this.db.prepare(this.sql).all(...(this.args as any[])) as T[] }; }
  async run() { const r = this.db.prepare(this.sql).run(...(this.args as any[])); return { success: true, meta: { changes: r.changes } }; }
}
function fakeD1(): D1Database {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_icons.sql']) db.exec(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  return {
    prepare: (sql: string) => new Stmt(db, sql),
    batch: async (stmts: Stmt[]) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
    exec: async (sql: string) => db.exec(sql),
  } as unknown as D1Database;
}

export interface Sent { url: string; init: RequestInit }
export interface Rig {
  env: Env; sent: Sent[]; clock: { t: number };
  links: Record<string, string>;
  /** Make a request as a signed-in person (by name), or anonymously. */
  call(who: string | null, method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  signIn(name: string): Promise<string>;
  subscribe(name: string): Promise<void>;
  rpc(name: string, method: string, params?: unknown): Promise<any>;
  tool(name: string, tool: string, args?: Record<string, unknown>): Promise<{ text: string; isError: boolean }>;
}

/** Tuesday 10 Nov 2026, 10:30 AM Pacific. A normal working morning. */
export const TUE_1030 = Date.parse('2026-11-10T18:30:00Z');

export async function makeRig(startAt = TUE_1030): Promise<Rig> {
  const clock = { t: startAt };
  const sent: Sent[] = [];
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = Buffer.from(await webcrypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url');
  const env: Env = {
    DB: fakeD1(),
    APP_SECRET: 'test-secret-' + randomBytes(16).toString('hex'),
    VAPID_PUBLIC_KEY: pub,
    VAPID_PRIVATE_KEY: JSON.stringify(jwk),
    NOW: () => clock.t,
    OUTBOUND: (async (url: any, init: any) => {
      sent.push({ url: String(url), init });
      return new Response(JSON.stringify({ sid: 'SM1' }), { status: 201 });
    }) as typeof fetch,
  };
  const links: Record<string, string> = {};
  for (const [name, role] of [['Elijah', 'owner'], ['Nevan', 'member'], ['Gregory', 'member']]) {
    const token = randomBytes(32).toString('base64url');
    links[name] = token;
    await env.DB.prepare('INSERT INTO people (name, role, invite_hash, created_at) VALUES (?, ?, ?, ?)')
      .bind(name, role, createHash('sha256').update(token).digest('base64url'), clock.t).run();
  }
  const cookies: Record<string, string> = {};
  const fetchW = (req: Request) => worker.fetch(req as any, env);
  const rig: Rig = {
    env, sent, clock, links,
    async signIn(name) {
      const res = await fetchW(new Request(`https://tt.test/join/${links[name]}`, { redirect: 'manual' }));
      const c = /__Host-tt=([^;]+)/.exec(res.headers.get('set-cookie') || '');
      if (!c) throw new Error('sign-in failed for ' + name);
      return (cookies[name] = c[1]);
    },
    async call(who, method, path, body, headers = {}) {
      const h: Record<string, string> = { ...headers };
      if (who) h.cookie = `__Host-tt=${cookies[who] ?? (await rig.signIn(who))}`;
      if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
      return fetchW(new Request(`https://tt.test${path}`, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }));
    },
    async subscribe(name) {
      const kp = await webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      const p256dh = Buffer.from(await webcrypto.subtle.exportKey('raw', kp.publicKey)).toString('base64url');
      const res = await rig.call(name, 'POST', '/api/push/subscribe', { endpoint: `https://push.example/${name}`, keys: { p256dh, auth: randomBytes(16).toString('base64url') } });
      if (!res.ok) throw new Error('subscribe failed: ' + (await res.text()));
    },
    async rpc(name, method, params) {
      const url = (await (await rig.call(name, 'GET', '/api/connector')).json() as any).url as string;
      const res = await fetchW(new Request(url, {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      }));
      return res.json();
    },
    async tool(name, tool, args = {}) {
      const r = await rig.rpc(name, 'tools/call', { name: tool, arguments: args });
      if (r.error) throw new Error(r.error.message);
      return { text: r.result.content[0].text as string, isError: Boolean(r.result.isError) };
    },
  };
  return rig;
}
export const j = async (res: Response) => (await res.json()) as any;
