// Text messages through Twilio. Off until the three TWILIO_* secrets exist.
import type { Env } from './types';
import { b64url, hmac, safeEqual } from './util';

export const smsConfigured = (env: Env) =>
  Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);

/** Normalise to E.164. US numbers may be typed without the +1. Returns null if it is not a phone number. */
export function normalizePhone(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const plus = input.trim().startsWith('+');
  const digits = input.replace(/\D/g, '');
  if (!plus && digits.length === 10) return '+1' + digits;
  if (!plus && digits.length === 11 && digits[0] === '1') return '+' + digits;
  if (plus && digits.length >= 8 && digits.length <= 15) return '+' + digits;
  return null;
}

export async function sendSms(env: Env, to: string, body: string): Promise<'ok' | 'stopped' | 'failed'> {
  if (!smsConfigured(env)) return 'failed';
  const from = env.TWILIO_FROM_NUMBER!;
  const form = new URLSearchParams({ To: to, Body: body });
  // A Messaging Service SID (MG...) works in place of a phone number.
  form.set(from.startsWith('MG') ? 'MessagingServiceSid' : 'From', from);
  try {
    const res = await (env.OUTBOUND ?? fetch)(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`),
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    );
    if (res.ok) return 'ok';
    const err = (await res.json().catch(() => ({}))) as { code?: number };
    return err.code === 21610 ? 'stopped' : 'failed'; // 21610: the person texted STOP
  } catch {
    return 'failed';
  }
}

/** Twilio request validation: HMAC-SHA1 over the URL plus every POST field, sorted by name. */
export async function twilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  const mac = await hmac(authToken, data, 'SHA-1');
  let s = '';
  for (const b of mac) s += String.fromCharCode(b);
  return btoa(s);
}
export async function validTwilioRequest(env: Env, url: string, params: Record<string, string>, header: string | null): Promise<boolean> {
  if (!env.TWILIO_AUTH_TOKEN || !header) return false;
  return safeEqual(await twilioSignature(env.TWILIO_AUTH_TOKEN, url, params), header);
}

export type Inbound = 'stop' | 'start' | 'help' | 'done' | 'working' | 'unknown';
/** One character is enough: 1 for done, 2 for working on it. */
export function classifyInbound(body: string): Inbound {
  const s = body.trim().toLowerCase().replace(/[.!]+$/, '');
  if (['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit', 'revoke', 'optout'].includes(s)) return 'stop';
  if (['start', 'unstop', 'yes'].includes(s)) return 'start';
  if (['help', 'info'].includes(s)) return 'help';
  if (['1', 'done', 'one', 'finished', 'yes done'].includes(s)) return 'done';
  if (['2', 'working', 'working on it', 'two', 'in progress', 'on it'].includes(s)) return 'working';
  return 'unknown';
}

export function twiml(message?: string): Response {
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response>${message ? `<Message>${esc(message)}</Message>` : ''}</Response>`;
  return new Response(xml, { headers: { 'content-type': 'text/xml; charset=utf-8' } });
}
export const HELP_TEXT =
  'Infinite Canvas Team Tasks. Reply 1 for done or 2 for working on it. Reply STOP to stop texts. Msg and data rates may apply.';
export { b64url };
