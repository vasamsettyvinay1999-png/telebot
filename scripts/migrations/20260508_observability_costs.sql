create table if not exists ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references users(id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(12, 6) not null default 0,
  feature text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_events_created_at on ai_usage_events(created_at desc);
create index if not exists idx_ai_usage_events_user_id_created_at on ai_usage_events(user_id, created_at desc);

create table if not exists app_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  metric_name text not null,
  metric_kind text not null,
  metric_value double precision not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_metric_snapshots_name_observed
  on app_metric_snapshots(metric_name, observed_at desc);

