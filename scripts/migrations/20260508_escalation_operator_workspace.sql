alter table escalations
  add column if not exists assigned_admin_telegram_id bigint null;

alter table escalations
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_escalations_assigned_status_created_at
  on escalations(assigned_admin_telegram_id, status, created_at desc);

create table if not exists escalation_events (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid not null references escalations(id) on delete cascade,
  actor_type text not null,
  actor_telegram_id bigint null,
  event_type text not null,
  note text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_escalation_events_escalation_created_at
  on escalation_events(escalation_id, created_at desc);
