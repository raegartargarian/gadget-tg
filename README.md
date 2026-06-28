# Telegram Bot API proxy

A tiny, transparent proxy to `https://api.telegram.org`. The store's API server
runs on an **Iran VPS where Telegram is filtered**, so a direct call to the Bot
API fails. This proxy — hosted abroad on a free platform — sits in the middle:

```
backend (Iran VPS) ──HTTPS──▶ this proxy (abroad) ──HTTPS──▶ api.telegram.org
```

It forwards any `…/bot<TOKEN>/<method>` request straight through and returns the
response verbatim. **No tokens are stored here** — the bot token travels in the
URL on each request, exactly as the Bot API expects.

---

## ⚠️ Pick a host that's actually reachable from Iran

The proxy only works if the Iran VPS can reach it. Based on current (2025–2026)
reports from Iranian networks:

| Host | Reachable from Iran? | Notes |
|------|----------------------|-------|
| **Deno Deploy** (`deno.dev`) | ✅ **Best** | No filtering reports; GitHub signup (no card → sidesteps sanctions). **Recommended.** |
| Cloudflare Worker | ⚠️ only on a **custom domain** | `*.workers.dev` is filtered in Iran since 2023; free-Worker limits tightened in 2025. |
| Netlify | ❌ risky | Documented "not accessible from Iran" reports. Only viable on a custom domain, and even then unproven. |
| Vercel | ❌ | OFAC-blocks Iranian signup. |

**The single biggest reliability lever is a custom domain.** Front whichever host
you pick with a subdomain of your own domain — e.g. `tg.karagahegadget.ir` — so
your server connects to a clean, un-blocklisted hostname instead of a filtered
`*.deno.dev` / `*.workers.dev` / `*.netlify.app`. Strongly recommended for any
choice below.

This folder ships three deploy targets — `deno/main.ts` (recommended),
`worker.js` (Cloudflare), and the Netlify function — all functionally identical.

---

## Option A — Deno Deploy (recommended)

### Deploy

1. Sign in with GitHub at <https://dash.deno.com> (no credit card needed).
2. New Project → deploy `telegram-proxy/deno/main.ts` (from this Git repo, or
   `deployctl deploy --project=<name> telegram-proxy/deno/main.ts`).
3. You get `https://<name>.deno.dev`.
4. **Add a custom domain** in the project settings (e.g. `tg.karagahegadget.ir`)
   and point a CNAME at it in your DNS. Use that hostname below.

### (Recommended) abuse-guard secret

Project → Settings → Environment Variables: add `PROXY_SECRET` = a long random
string. (Without your bot token nobody can send messages anyway, but this keeps
strangers off your quota.)

### Wire the backend

In the backend prod `.env`, then redeploy the API:

```ini
TELEGRAM_BOT_TOKEN=123456:ABC...                  # from @BotFather
TELEGRAM_API_BASE=https://tg.karagahegadget.ir    # your custom domain (or https://<name>.deno.dev)
TELEGRAM_PROXY_SECRET=<same value as PROXY_SECRET> # only if you set it
```

The backend builds `${TELEGRAM_API_BASE}/bot<TOKEN>/<method>`. The proxy matches
on `/bot…` directly, so **no path suffix** is needed for Deno/Cloudflare.

### Test

```bash
# Should return {"ok":true,"result":{...bot info...}}
curl -H 'x-proxy-secret: <PROXY_SECRET>' \
  'https://tg.karagahegadget.ir/bot<TOKEN>/getMe'
```

---

## Option B — Cloudflare Worker (custom domain required)

`worker.js` is the whole thing.

1. `npm i -g wrangler && wrangler login` (or paste into the dashboard's Quick edit).
2. Deploy `worker.js`, then add a **route on a custom domain** — `*.workers.dev`
   is filtered in Iran, so use e.g. `tg.karagahegadget.ir`.
3. (Optional) `wrangler secret put PROXY_SECRET`.
4. Backend: `TELEGRAM_API_BASE=https://tg.karagahegadget.ir` (no path suffix).

Test: `curl -H 'x-proxy-secret: <secret>' https://tg.karagahegadget.ir/bot<TOKEN>/getMe`

---

## Option C — Netlify (last resort)

Reachability from Iran is unreliable; only attempt with a custom domain.

1. Drag-drop this folder onto Netlify, or `npx netlify-cli deploy --prod`, or
   connect the repo with base directory `telegram-proxy`.
2. Site env vars: `PROXY_SECRET` (optional).
3. Netlify rewrites `/tg/*` to the function (see `netlify.toml`), so the base
   **includes `/tg`**:
   ```ini
   TELEGRAM_API_BASE=https://your-site.netlify.app/tg
   ```
4. Test: `curl -H 'x-proxy-secret: <secret>' https://your-site.netlify.app/tg/bot<TOKEN>/getMe`

> Netlify free synchronous functions have a ~10s timeout — fine for `sendPhoto`.

---

## How the backend uses it

The store backend already supports this — see `backend/src/workers/telegram/`.
Env vars (`backend/src/config/env.schema.ts`):

- `TELEGRAM_BOT_TOKEN` — bot token (secret).
- `TELEGRAM_API_BASE` — this proxy's base URL (defaults to the real Bot API).
- `TELEGRAM_PROXY_SECRET` — optional; sent as the `x-proxy-secret` header.

Don't forget: the bot must be an **admin** of the target channel, and the
channel id is set in the admin Site Settings page (`telegramChannelId`).
