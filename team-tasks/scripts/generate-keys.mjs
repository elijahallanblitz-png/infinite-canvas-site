// Generates the app's own secrets: APP_SECRET and the push (VAPID) key pair.
// Usage: node scripts/generate-keys.mjs            -> writes .dev.vars for local development (if missing)
//        node scripts/generate-keys.mjs --json     -> prints JSON for `wrangler secret bulk`
import { webcrypto as crypto } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
export async function generate() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = await crypto.subtle.exportKey('raw', pair.publicKey);
  return {
    APP_SECRET: b64url(crypto.getRandomValues(new Uint8Array(48))),
    VAPID_PUBLIC_KEY: b64url(pub),
    VAPID_PRIVATE_KEY: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }),
  };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = await generate();
  if (process.argv.includes('--json')) console.log(JSON.stringify(keys));
  else if (existsSync('.dev.vars')) console.log('.dev.vars already exists. Left alone.');
  else {
    writeFileSync('.dev.vars', Object.entries(keys).map(([k, v]) => `${k}='${v}'`).join('\n') + '\n', { mode: 0o600 });
    console.log('Wrote .dev.vars');
  }
}
