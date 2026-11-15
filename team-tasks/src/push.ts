// Web Push from a Worker using only WebCrypto: VAPID (RFC 8292) + aes128gcm payloads (RFC 8291).
import type { Env } from './types';
import { b64url, unb64url } from './util';

const enc = new TextEncoder();
export interface PushSub { endpoint: string; p256dh: string; auth: string }

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

/** Encrypt a payload for one subscription. Returns the request body. */
export async function encryptPayload(sub: PushSub, payload: string): Promise<Uint8Array> {
  const uaPublic = unb64url(sub.p256dh);
  const authSecret = unb64url(sub.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error('bad subscription keys');
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const localPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as any, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, localPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(payload), new Uint8Array([2])); // 0x02 marks the last record
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plain));
  const header = concat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([65]), localPublic); // record size 4096
  return concat(header, cipher);
}

/** A signed VAPID token for one push service origin. */
export async function vapidJwt(env: Env, audience: string, nowMs: number): Promise<string> {
  const jwk = JSON.parse(env.VAPID_PRIVATE_KEY!);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(nowMs / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || 'https://infinitecanvas.space',
  })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

export const pushConfigured = (env: Env) => Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

/** Send one push. Returns 'ok', 'gone' (subscription is dead, delete it) or 'failed'. */
export async function sendPush(env: Env, sub: PushSub, payload: object, nowMs: number): Promise<'ok' | 'gone' | 'failed'> {
  if (!pushConfigured(env)) return 'failed';
  try {
    const url = new URL(sub.endpoint);
    if (url.protocol !== 'https:') return 'gone';
    const body = await encryptPayload(sub, JSON.stringify(payload));
    const jwt = await vapidJwt(env, url.origin, nowMs);
    const res = await (env.OUTBOUND ?? fetch)(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: '43200',
        urgency: 'high',
      },
      body,
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.status >= 200 && res.status < 300 ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}
