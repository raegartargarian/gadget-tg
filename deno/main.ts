/**
 * Deno Deploy entrypoint — a transparent proxy for APIs that are filtered on
 * the Iranian VPS. Two roles, selected by URL path:
 *
 *   1. Telegram Bot API  —  any path containing `/bot…`  →  api.telegram.org
 *   2. AI providers (for the blog generator):
 *        /openai/*     →  api.openai.com/*            (Authorization: Bearer …)
 *        /anthropic/*  →  api.anthropic.com/*         (x-api-key + anthropic-version)
 *        /google/*     →  generativelanguage.googleapis.com/*   (x-goog-api-key)
 *
 * The provider API keys are injected SERVER-SIDE here from Deno env vars, so the
 * VPS never holds them — it only knows this proxy's base URL + the shared secret.
 *
 * Recommended host for a server INSIDE Iran: `deno.dev` is not known to be
 * filtered, and signup is via GitHub (no card → sidesteps sanctions/payment
 * walls). Front it with a subdomain of your own domain (e.g. ai.karagahegadget.ir)
 * for the most reliable reachability.
 *
 * Deploy:
 *   - Dashboard: https://dash.deno.com → New Project → deploy this file from GitHub.
 *   - or CLI:  deployctl deploy --project=<name> telegram-proxy/deno/main.ts
 *
 * Env vars to set in the Deno project:
 *   - PROXY_SECRET       (shared guard; matches TELEGRAM_PROXY_SECRET / AI_PROXY_SECRET on the backend)
 *   - OPENAI_API_KEY     (for /openai/*)
 *   - ANTHROPIC_API_KEY  (for /anthropic/*)
 *   - GEMINI_API_KEY     (for /google/*)
 *
 * Backend wiring:
 *   - Telegram:  TELEGRAM_API_BASE=https://<host>            (it appends /bot<token>/<method>)
 *   - Blog AI:   AI_PROXY_BASE=https://<host>  (+ optional AI_PROXY_SECRET)
 */

const TELEGRAM_ORIGIN = "https://api.telegram.org";

/** AI provider routing table: path prefix → upstream origin + key injection. */
const AI_ROUTES: Record<
  string,
  { origin: string; auth: (headers: Headers, url: URL) => void }
> = {
  "/openai/": {
    origin: "https://api.openai.com",
    auth: (headers) => {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (key) headers.set("authorization", `Bearer ${key}`);
    },
  },
  "/anthropic/": {
    origin: "https://api.anthropic.com",
    auth: (headers) => {
      const key = Deno.env.get("ANTHROPIC_API_KEY");
      if (key) headers.set("x-api-key", key);
      // Pin a version unless the caller already set one.
      if (!headers.get("anthropic-version")) {
        headers.set("anthropic-version", "2023-06-01");
      }
    },
  },
  "/google/": {
    origin: "https://generativelanguage.googleapis.com",
    auth: (headers, url) => {
      const key = Deno.env.get("GEMINI_API_KEY");
      // Gemini accepts the key as a query param or x-goog-api-key header; set the
      // header (cleaner, keeps it out of logged URLs) and strip any client-sent
      // ?key= so it isn't leaked or duplicated.
      if (key) headers.set("x-goog-api-key", key);
      url.searchParams.delete("key");
    },
  },
};

Deno.serve(async (request: Request): Promise<Response> => {
  const secret = Deno.env.get("PROXY_SECRET");
  if (secret && request.headers.get("x-proxy-secret") !== secret) {
    return Response.json({ ok: false, description: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);

  // --- AI provider routes ---------------------------------------------------
  for (const [prefix, route] of Object.entries(AI_ROUTES)) {
    if (url.pathname.startsWith(prefix)) {
      const upstream = new URL(route.origin);
      upstream.pathname = url.pathname.slice(prefix.length - 1); // keep leading slash
      upstream.search = url.search;

      const headers = new Headers();
      const ct = request.headers.get("content-type");
      if (ct) headers.set("content-type", ct);
      const accept = request.headers.get("accept");
      if (accept) headers.set("accept", accept);
      route.auth(headers, upstream);

      const init: RequestInit = { method: request.method, headers };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = await request.text();
      }

      try {
        const res = await fetch(upstream.toString(), init);
        return new Response(res.body, {
          status: res.status,
          headers: {
            "content-type": res.headers.get("content-type") || "application/json",
          },
        });
      } catch (err) {
        return Response.json(
          { ok: false, description: `ai proxy error: ${(err as Error).message}` },
          { status: 502 },
        );
      }
    }
  }

  // --- Telegram Bot API -----------------------------------------------------
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
