create table if not exists escalations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  reason text not null,
  urgency text not null,
  source_message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolved_by_admin_telegram_id bigint null
);

create index if not exists idx_escalations_status_created_at
  on escalations(status, created_at desc);

create index if not exists idx_escalations_user_id_created_at
  on escalations(user_id, created_at desc);

