/**
 * Transparent proxy to the Telegram Bot API.
 *
 * The store's API server runs on an Iran VPS where `api.telegram.org` is
 * filtered. This function — deployed on Netlify (reachable from Iran, and able
 * to reach Telegram) — forwards any `…/bot<TOKEN>/<method>` request straight to
 * `https://api.telegram.org/bot<TOKEN>/<method>` and returns the response
 * verbatim. The backend simply sets `TELEGRAM_API_BASE` to this site's `/tg`
 * base; nothing else changes.
 *
 * Optional abuse guard: set the `PROXY_SECRET` env var on the Netlify site and
 * the matching `TELEGRAM_PROXY_SECRET` on the backend — requests without the
 * `x-proxy-secret` header are then rejected so strangers can't burn your
 * function quota.
 */
const TELEGRAM_ORIGIN = 'https://api.telegram.org';

export const handler = async (event) => {
  const required = process.env.PROXY_SECRET;
  if (required) {
    const got = event.headers['x-proxy-secret'];
    if (got !== required) {
      return json(403, { ok: false, description: 'forbidden' });
    }
  }

  // Forward from the `/bot<token>/<method>` segment onward. Works whether
  // Netlify hands us the original path (/tg/bot…) or the rewritten function
  // path (/.netlify/functions/proxy/bot…) — both contain `/bot`.
  const idx = event.path.indexOf('/bot');
  if (idx === -1) {
    return json(404, { ok: false, description: 'not a Bot API path' });
  }

  const search = event.rawQuery ? `?${event.rawQuery}` : '';
  const target = `${TELEGRAM_ORIGIN}${event.path.slice(idx)}${search}`;

  const init = {
    method: event.httpMethod,
    headers: { 'content-type': event.headers['content-type'] || 'application/json' },
  };
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD' && event.body) {
    init.body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
  }

  try {
    const res = await fetch(target, init);
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: { 'content-type': res.headers.get('content-type') || 'application/json' },
      body,
    };
  } catch (err) {
    return json(502, { ok: false, description: `proxy error: ${err.message}` });
  }
};

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  };
}
