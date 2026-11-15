import type { Env } from './types';

const enc = new TextEncoder();

export const now = (env: Env): number => (env.NOW ? env.NOW() : Date.now());

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 32 random bytes, URL-safe. 256 bits of entropy. */
export function randomToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256(text: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function hmac(secret: string, text: string, hash: 'SHA-256' | 'SHA-1' = 'SHA-256'): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** A signed, stateless token: "<id>.<mac>". Nothing is stored, so nothing can leak from the database. */
export async function signedToken(env: Env, purpose: string, id: number, epoch: number): Promise<string> {
  const mac = await hmac(env.APP_SECRET, `${purpose}:${id}:${epoch}`);
  return `${id}.${b64url(mac)}`;
}

export function parseSignedToken(token: string): { id: number; mac: string } | null {
  const m = /^(\d{1,9})\.([A-Za-z0-9_-]{43})$/.exec(token);
  return m ? { id: Number(m[1]), mac: m[2] } : null;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function cleanText(input: unknown, max: number): string {
  if (typeof input !== 'string') return '';
  // Collapse whitespace and strip control characters.
  return input.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') || 'local';
}
