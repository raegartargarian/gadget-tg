/**
 * Deno Deploy entrypoint — transparent proxy to the Telegram Bot API.
 *
 * Recommended host for a server INSIDE Iran: `deno.dev` is not known to be
 * filtered, and signup is via GitHub (no card → sidesteps sanctions/payment
 * walls). Front it with a subdomain of your own domain (e.g. tg.karagahegadget.ir)
 * for the most reliable reachability.
 *
 * Deploy:
 *   - Dashboard: https://dash.deno.com → New Project → deploy this file from GitHub.
 *   - or CLI:  deployctl deploy --project=<name> telegram-proxy/deno/main.ts
 *
 * Backend base URL then becomes the project host (it already appends
 * /bot<token>/<method>), e.g.  TELEGRAM_API_BASE=https://<name>.deno.dev
 * Optional guard: set a `PROXY_SECRET` env var in the project + matching
 * `TELEGRAM_PROXY_SECRET` on the backend.
 */
const TELEGRAM_ORIGIN = "https://api.telegram.org";

Deno.serve(async (request: Request): Promise<Response> => {
  const secret = Deno.env.get("PROXY_SECRET");
  if (secret && request.headers.get("x-proxy-secret") !== secret) {
    return Response.json({ ok: false, description: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const idx = url.pathname.indexOf("/bot");
  if (idx === -1) {
    return Response.json({ ok: false, description: "not a Bot API path" }, { status: 404 });
  }

  const target = `${TELEGRAM_ORIGIN}${url.pathname.slice(idx)}${url.search}`;
  const init: RequestInit = {
    method: request.method,
    headers: { "content-type": request.headers.get("content-type") || "application/json" },
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  try {
    const res = await fetch(target, init);
    return new Response(res.body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  } catch (err) {
    return Response.json(
      { ok: false, description: `proxy error: ${(err as Error).message}` },
      { status: 502 },
    );
  }
});
