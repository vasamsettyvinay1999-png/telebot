-- Retention + growth schema additions

create table if not exists application_tracker (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  company text not null,
  role text not null,
  status text not null default 'applied',
  applied_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_application_tracker_user_id_created_at
  on application_tracker(user_id, created_at desc);

alter table users add column if not exists referral_code text;
alter table users add column if not exists referred_by uuid references users(id);

create unique index if not exists idx_users_referral_code_unique
  on users(referral_code)
  where referral_code is not null;

update users
set referral_code = substr(md5(id::text || now()::text), 1, 10)
where referral_code is null;

