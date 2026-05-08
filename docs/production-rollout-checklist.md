## Production Rollout Checklist

Use this checklist for every production deploy.

### 1) Pre-deploy

- Ensure GitHub secrets are set:
  - `FLY_API_TOKEN`
  - `FLY_APP_URL`
  - optional `CI_ALERT_WEBHOOK_URL`
- Ensure app runtime environment variables are configured on Fly/Supabase:
  - Telegram bot + webhook secret
  - Supabase URL + service role key
  - Redis credentials (`UPSTASH_REDIS_*`, and `BULLMQ_REDIS_*` when queue workers are enabled)
  - Anthropic API key
  - Stripe keys/webhook secret
  - Resend key
  - Admin IDs/channel
- Run local validation before merge:
  - `npm run lint`
  - `npm run build`
  - `npm test`
  - `npm run security:check`

### 2) Database rollout

- Apply migrations in order with `supabase db push`.
- Confirm required core tables exist:
  - `users`, `resumes`, `generated_documents`, `payment_transactions`
  - `application_tracker`, `escalations`, `escalation_events`
  - `interview_preps`, `cover_letters`, `ai_usage_events`, `app_metric_snapshots`
  - `document_embeddings`, `admin_actions`, `conversation_messages`, `leads`
- Confirm RPC functions exist:
  - `deduct_credit`
  - `process_payment`

### 3) Deployment verification

- Deploy via GitHub Actions `Deploy` workflow.
- Confirm workflow post-deploy checks pass:
  - retrying health check for `/health`
  - runtime verification script for `/health` + `/admin/health`
- Optional manual check:
  - `APP_URL=https://your-app-url npm run verify:runtime`

### 4) Post-deploy smoke tests

- Telegram bot responds to `/start` and basic commands.
- Resume upload flow reaches processing state.
- Admin command surface works (`/admin`, `/queue`, `/escalations`).
- Stripe webhook endpoint returns healthy response for signed test event.
- Scheduler-driven alerts and reports continue to run.

### 5) Rollback trigger

Rollback if any condition is true:
- Deploy workflow fails post-deploy checks.
- `verify:runtime` fails.
- Error rate spikes (5xx) after release.
- Bot command handling is degraded for core flows.
