/**
 * Cloudflare Worker alternative to the Netlify function (single file).
 *
 * Deploy with `wrangler deploy` (or paste into the Cloudflare dashboard's
 * "Quick edit"). Use this if `*.netlify.app` turns out to be filtered from
 * inside Iran — a Worker on a CUSTOM domain (a subdomain of your own domain
 * routed through Cloudflare) is usually the most reliable option.
 *
 * Backend base URL then becomes:  https://<worker-host>/   (it already appends
 * /bot<token>/<method>), e.g. TELEGRAM_API_BASE=https://tg.example.com
 *
 * Optional guard: set a `PROXY_SECRET` Worker secret + matching
 * `TELEGRAM_PROXY_SECRET` on the backend.
 */
const TELEGRAM_ORIGIN = 'https://api.telegram.org';

export default {
  async fetch(request, env) {
    if (env.PROXY_SECRET && request.headers.get('x-proxy-secret') !== env.PROXY_SECRET) {
      return Response.json({ ok: false, description: 'forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const idx = url.pathname.indexOf('/bot');
    if (idx === -1) {
      return Response.json({ ok: false, description: 'not a Bot API path' }, { status: 404 });
    }

    const target = `${TELEGRAM_ORIGIN}${url.pathname.slice(idx)}${url.search}`;
    const init = {
      method: request.method,
      headers: { 'content-type': request.headers.get('content-type') || 'application/json' },
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = await request.text();
    }

    try {
      const res = await fetch(target, init);
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
      });
    } catch (err) {
      return Response.json({ ok: false, description: `proxy error: ${err.message}` }, { status: 502 });
    }
  },
};
