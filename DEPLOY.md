# Deploying this app (Railway vs Render)

The TanStack Start app builds to a **Node server** bundle only when the Nitro
preset is pinned. Lovable's default build targets Cloudflare Workers
(`cloudflare-module`), so every self-host needs:

```bash
NITRO_PRESET=node-server vite build   # emits .output/server/index.mjs + .output/public
node .output/server/index.mjs          # binds to $PORT
```

Both commands are verified locally (build exit 0, `/auth` → 200 in ~25 ms).

## Verdict: Railway for this app

| Factor                                     | Railway                                   | Render                                           |
| ------------------------------------------ | ----------------------------------------- | ------------------------------------------------ |
| Idle spin-down                             | none (always warm)                        | free plan sleeps after 15 min, ~50 s cold start  |
| Long requests                              | up to 15 min while data flows, 5 min idle | fine on paid, but free tier is unusable for this |
| RAM floor that fits SSR + xlsx + PDF       | 1 GB on the ~$5 plan                      | 512 MB on starter, 2 GB only on the $25 plan     |
| Region for Bangladesh                      | Singapore                                 | Singapore                                        |
| Cron for the 4 `/api/public/cron/*` routes | one service with a cron schedule          | separate cron job per route (paid)               |
| Build memory (bun, 573 packages)           | 8 GB                                      | ok, slower                                       |

Why it matters here: the SVP/Takamol server functions are long. SVP calls use a
20 s timeout with up to 2 retries and the booking wizard chains several of them,
and Takamol retries 15 s attempts three times. A cold start in the middle of a
seat hold or OTP step loses the reservation, so **always-warm beats cheapest**.
Render is only competitive once you pay for Starter or higher — never run
production on its free plan.

## Railway

1. New project → Deploy from GitHub repo `kamalsvp247/remix-of-milestone-certificate`.
2. `railway.json` in this repo already sets the build/start commands,
   health check `/auth`, restart policy and a single replica.
3. Add the environment variables from the checklist below (Variables → Raw
   editor accepts a pasted `KEY=value` list).
4. Region: Singapore. Instance: at least 1 vCPU / 1 GB (build needs the RAM).
5. Optional cron: add a service from the same image with
   `curl -fsS -X POST -H "Authorization: Bearer $CRON_TOKEN" https://<domain>/api/public/cron/<name>`.

## Render

`render.yaml` is a ready Blueprint (`New → Blueprint`). It pins
`NITRO_PRESET=node-server`, `plan: starter`, `region: singapore`, health check
`/auth`, and declares every secret as `sync: false` so you fill them in the
dashboard. Render exposes env vars during the build, which is required because
the `VITE_*` Supabase values are baked into the client bundle.

## Environment variables

Build-time (client bundle): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_PROJECT_ID`.

Server-only: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TAKAMOL_API_KEY`, `SVP_CREDENTIAL_KEY`,
`BULKSMSBD_API_KEY`, `BULKSMSBD_SENDER_ID`, plus `NITRO_PRESET=node-server` and
`NODE_ENV=production`. `.env.example` lists every key with empty values, so it
can be pasted straight into Railway's raw variable editor. `LOVABLE_CRON_SECRET`
is only needed by the legacy `/api/public/cron/*` helper — the routes verify a
per-route token stored in the database instead.

## Cron routes (all POST, Bearer token from `verify_cron_token`)

| Route                                 | Suggested schedule | Purpose                         |
| ------------------------------------- | ------------------ | ------------------------------- |
| `/api/public/cron/svp-results`        | hourly             | sync SVP results into exam rows |
| `/api/public/cron/messaging`          | hourly             | drain the `sms_messages` queue  |
| `/api/public/cron/exam-sms`           | every 15–30 min    | exam SMS notifications          |
| `/api/public/cron/svp-pending-cancel` | every 15–30 min    | cancel stale unpaid SVP drafts  |

## Gotchas

- Health check must be `/auth`; `/` answers with a 307 redirect.
- Keep `SVP_CREDENTIAL_KEY` identical across deploys. Changing it invalidates
  the encrypted SVP passwords inside the vault cookie and every agent has to
  reconnect.
- Multiple replicas are safe (no sticky sessions needed) because the SVP bearer
  token lives in an httpOnly cookie, but `numReplicas: 1` is enough here.
- Keep the platform region close to the Supabase project region — cross-region
  database round trips hurt more than the host choice.
- `bun.lock` is committed, so Railway builds with Bun; Render uses `npm install`
  (no lockfile) — the two can resolve slightly different patch versions.
