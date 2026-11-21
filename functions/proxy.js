/* Cloudflare Pages Function: /proxy?url=<address>
 *
 * Browsers cannot call most IPTV, Jellyfin, Plex or Stalker servers directly: they lack CORS headers, are often plain
 * http (blocked on an https page), and Stalker needs a Cookie header that pages may not set. This function makes the
 * request from Cloudflare instead and hands the answer back to the page.
 *
 * It is meant for testing the web build and is deliberately narrow:
 *   - same-origin callers only (the app's own page), nobody else's site and no cross-site use
 *   - http/https only, no localhost, private or internal addresses
 *   - only a short allow-list of request headers is forwarded
 *   - video and audio are refused: this is an API proxy, not a stream relay
 * Put the whole site behind Cloudflare Access if it should not be reachable by everyone.
 *
 * Environment (all optional):  PROXY_ALLOW = comma-separated host names; when set, only those hosts are reachable
 *                              PROXY_ALLOW_PRIVATE = "1" lets local test servers through (development only)  */

const FORWARD = ['cookie', 'user-agent', 'x-user-agent', 'authorization', 'accept', 'content-type', 'x-emby-authorization', 'x-emby-token',
  'x-plex-client-identifier', 'x-plex-product', 'x-plex-version', 'x-plex-platform', 'x-plex-device', 'x-plex-device-name', 'x-plex-token'];
const MAX_BYTES = 120 * 1024 * 1024;
const TIMEOUT_MS = 25000;

function reply(status, message) {
  return new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-SH-Proxy-Error': encodeURIComponent(message) } });
}

export function blockedHost(hostname) {
  const h = String(hostname).toLowerCase();
  if (!h || h === 'localhost' || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(h)) return true;
  if (h.indexOf('.') < 0 && h.charAt(0) !== '[') return true;                 // single-label names are internal
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const a = +m[1], b = +m[2];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (h.charAt(0) === '[') return true;                                       // IPv6 literals are not used by IPTV providers; refuse them all
  return false;
}

export async function onRequest(context) {
  const request = context.request, env = context.env || {}, url = new URL(request.url);

  if (url.searchParams.has('ping')) {
    return new Response(JSON.stringify({ streamhaven: true, proxy: 1 }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  }

  const site = request.headers.get('sec-fetch-site'), origin = request.headers.get('origin');
  if (!((site === 'same-origin') || (origin && origin === url.origin))) return reply(403, 'This proxy only serves the Streamhaven page on this site.');
  if (origin && origin !== url.origin) return reply(403, 'Cross-site use is not allowed.');
  if (['GET', 'HEAD', 'POST'].indexOf(request.method) < 0) return reply(405, 'Method not allowed.');

  let target;
  try { target = new URL(url.searchParams.get('url') || ''); } catch (e) { return reply(400, 'The address is not valid.'); }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return reply(400, 'Only http and https addresses can be reached.');
  if (target.username || target.password) return reply(400, 'Addresses with embedded logins are not accepted.');
  if (env.PROXY_ALLOW_PRIVATE !== '1' && blockedHost(target.hostname)) return reply(403, 'That address is not reachable through the proxy.');
  if (env.PROXY_ALLOW) {
    const allowed = String(env.PROXY_ALLOW).toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
    if (allowed.indexOf(target.hostname.toLowerCase()) < 0) return reply(403, 'That host is not on this proxy\'s allow-list.');
  }

  const headers = new Headers();
  try {
    const raw = request.headers.get('x-sh-headers');
    const given = raw ? JSON.parse(decodeURIComponent(raw)) : {};
    Object.keys(given).forEach((k) => { if (FORWARD.indexOf(k.toLowerCase()) >= 0 && typeof given[k] === 'string') headers.set(k, given[k]); });
  } catch (e) { return reply(400, 'The forwarded headers could not be read.'); }

  let body;
  if (request.method === 'POST') {                                           // sign-in bodies only: small, so buffer them
    body = await request.arrayBuffer();
    if (body.byteLength > 1024 * 1024) return reply(413, 'The request is too large.');
  }
  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method, headers, redirect: 'follow', body,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (e) {
    return reply(502, e && e.name === 'TimeoutError' ? 'The server took too long to respond' : 'Could not reach the server');
  }

  const type = upstream.headers.get('content-type') || '';
  if (/^(video|audio)\//i.test(type)) { try { upstream.body && upstream.body.cancel(); } catch (e) {} return reply(415, 'Video and audio are not relayed by this proxy.'); }
  const length = +(upstream.headers.get('content-length') || 0);
  if (length > MAX_BYTES) { try { upstream.body && upstream.body.cancel(); } catch (e) {} return reply(413, 'The response is too large.'); }

  const out = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  if (type) out.set('Content-Type', type);
  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: out });
}
