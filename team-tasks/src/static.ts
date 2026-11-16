// Serves the app's own files from inside the Worker. One deploy, one moving part.
import { FILES } from './static.gen';

const SECURITY: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
const decoded = new Map<string, Uint8Array>();

function cacheFor(path: string): string {
  if (path.startsWith('/fonts/')) return 'public, max-age=31536000, immutable';
  if (path.startsWith('/icons/') || path.startsWith('/avatars/') || path.startsWith('/splash/') || path === '/hero.webp') return 'public, max-age=604800';
  return 'no-cache'; // html, css, js, sw: always revalidate (cheap, thanks to ETags), so a deploy shows up at once
}

export function serveStatic(req: Request): Response {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  let path = new URL(req.url).pathname;
  if (path === '/' || !FILES[path]) {
    // App routes (/activity, /you, /tv…) all load the same page. A missing file is a real 404.
    if (/\.[a-z0-9]{2,5}$/i.test(path)) return new Response('Not found', { status: 404, headers: SECURITY });
    path = '/index.html';
  }
  const [type, tag, b64] = FILES[path];
  const etag = `"${tag}"`;
  const headers = { ...SECURITY, 'content-type': type, 'cache-control': cacheFor(path), etag };
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers });
  let body = decoded.get(path);
  if (!body) {
    const bin = atob(b64);
    body = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) body[i] = bin.charCodeAt(i);
    decoded.set(path, body);
  }
  return new Response(req.method === 'HEAD' ? null : body, { headers });
}
