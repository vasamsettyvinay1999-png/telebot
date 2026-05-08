## Orion Path Runbook

### Admin operations

- Approve users: `/approve {telegram_id}`
- Reject users: `/reject {telegram_id}`
- Ban users: `/ban {telegram_id}`
- Queue status: `/queue`

### Restart worker

- Local dev: `npm run worker:dev`
- Production: `npm run worker:start`

### Migrations

- Apply: `npm run db:migrate`

### Failed file jobs

1. Run `/queue` to inspect failed count.
2. Open BullMQ dashboard/logs.
3. Requeue failed jobs after root-cause fix.

### Incident severity

- **P1:** complete outage, webhook processing down, payment failures.
- **P2:** degraded queue throughput, single subsystem partial failure.

### Claude outage degraded mode

- Temporarily disable premium generation responses.
- Continue onboarding + admin + queue workflows.
- Send user-facing maintenance message for AI actions.

