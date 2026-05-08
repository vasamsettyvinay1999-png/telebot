## Orion Path AI Career Partner (Backend)

### What you have now

- Fastify server (`src/server.ts`)
- Telegraf bot instance (`src/bot.ts`)
- Fail-fast env validation (`src/config/env.ts`)
- Supabase service-role client (`src/config/supabase.ts`)
- Upstash Redis client (`src/config/redis.ts`)
- Telegram webhook endpoint with anti-replay (`src/routes/webhook.route.ts`)
- Stripe webhook endpoint (signature verify stub) (`src/routes/stripe.route.ts`)
- Health endpoint (`GET /health`)

### Local setup

Copy env template:

```bash
cp .env.example .env
```

Run dev server:

```bash
npm run dev
```

For local polling (optional), set:

```bash
TELEGRAM_USE_POLLING=true
```

Default local mode is webhook-compatible (polling off).

Run file worker (separate process):

```bash
npm run worker:dev
```

Build:

```bash
npm run build
```

### Webhook endpoint shape

- Telegram: `POST /webhook/telegram` with header `x-telegram-bot-api-secret-token`
- Stripe: `POST /stripe/webhook`

### Queue Redis note

BullMQ requires `redis://` or `rediss://` transport. If your `UPSTASH_REDIS_URL` is REST/HTTPS,
set `BULLMQ_REDIS_URL` and `BULLMQ_REDIS_TOKEN` to a Redis endpoint for queue workers.

### New bot commands

- `/applied Company | Role` to track a submitted application
- `/applications [status] [page]` to list tracked applications with optional filter/pagination
- `/referral` to view your referral code
- `/usecode CODE` to apply a referral code
- `/escalations [limit]` (admin) to list open escalation cases
- `/escalation {case_id}` (admin) to inspect full escalation detail and timeline
- `/escassign {case_id} {admin_telegram_id|me|clear}` (admin) to claim/unassign escalation ownership
- `/escnote {case_id} {note}` (admin) to add internal operator notes to escalation timeline
- `/resolve {case_id|telegram_id} [note]` (admin) to resolve an escalation case and optionally store note
- `/costs [days]` (admin) to view AI token/cost report
- `/interview` to generate interview prep (uses credits)
- `/coverletter` to generate a tailored cover letter (uses credits)
- `/mydocs` to fetch latest generated resume links
- `/history` to view latest resume/interview prep/cover letter artifacts
- `/followup {on|off} {application_id}` to control application follow-up reminders
- `/appstatus {application_id} {applied|screening|interview|offer|rejected|withdrawn}` to update application stage
- `/appnote {application_id} {note text}` to save application notes
- `/appnext {application_id} {YYYY-MM-DD|clear}` to set/clear next action date
- `/apps [status] [page]` (admin) to view application board
- `/appdetail {application_id}` (admin) to inspect one tracked application
- `/appsetstatus {application_id} {status}` (admin) to override application status
- `/appsetnext {application_id} {YYYY-MM-DD|clear}` (admin) to override next action date
- `/appsbulkstatus {status} {id1,id2,...}` (admin) to bulk update statuses
- `/appsdue [days]` (admin) to list applications with upcoming next actions
- `/appsexport [status]` (admin) to download a CSV export of applications
- `/latestprep {telegram_id}` (admin) to view latest interview prep snapshot
- `/latestletter {telegram_id}` (admin) to view latest cover letter snapshot

### Automated admin alerts

- Weekly funnel report is sent to `ADMIN_ALERT_CHANNEL_ID` (if configured)
- Stale pipeline alerts run every 6 hours for applications stuck in `applied` >14 days
- In-process metrics are flushed to DB every 10 minutes (`app_metric_snapshots`)

### CI + security automation

- Deploy workflow now uses retrying post-deploy health checks
- Optional deploy failure webhook: `CI_ALERT_WEBHOOK_URL`
- Scheduled `Security Audit` GitHub workflow runs custom checklist + `npm audit`
- Runtime verification command: `APP_URL=https://<app-url> npm run verify:runtime`
- Production rollout runbook: `docs/production-rollout-checklist.md`

### Migration coverage

- Added idempotent core schema backfill migration for users, resumes, payments, leads, admin actions, conversation logs, and embeddings tables
- Added extra index hardening migration for app tracker and AI usage query paths

### Escalation quality

- Semantic loop detection escalates repetitive user attempts automatically
- Escalation records store trigger type + similarity score + optional resolution note
- Operator workspace supports assignment and timeline events for case handoff continuity

### Calendar + booking note

- To enable real Google Calendar booking, configure `GOOGLE_REFRESH_TOKEN`
- Without it, the system uses safe fallback slots and still sends confirmation email

## Render deployment (production)

### Web service settings

- Runtime: `Node`
- Build command: `npm install && npm run build`
- Start command: `npm run start:web`
- Health check path: `/health`

### Worker service settings

- Runtime: `Node`
- Build command: `npm install && npm run build`
- Start command: `npm run start:worker`

### Required production env vars

- `NODE_ENV=production`
- `PORT` (provided by Render)
- `APP_URL` (your Render web URL, e.g. `https://your-app.onrender.com`)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET` (min 16 chars)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_URL`
- `UPSTASH_REDIS_TOKEN`
- `ANTHROPIC_API_KEY`
- `ADMIN_TELEGRAM_IDS` (comma-separated numeric Telegram IDs)

### Optional env vars

- Stripe: `STRIPE_ENABLED=true` then set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- Google Calendar: `GOOGLE_CALENDAR_ENABLED=true` then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_ID` (+ optional `GOOGLE_REFRESH_TOKEN`)
- Resend: `RESEND_ENABLED=true` then set `RESEND_API_KEY`
- BullMQ Redis override (only if needed): `BULLMQ_REDIS_URL`, `BULLMQ_REDIS_TOKEN`

### Post-deploy commands

```bash
npm run db:migrate
npm run telegram:set-webhook
npm run telegram:get-webhook-info
APP_URL=https://your-app.onrender.com npm run verify:runtime
```

