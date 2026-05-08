create table if not exists interview_preps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_interview_preps_user_id_created_at
  on interview_preps(user_id, created_at desc);

create table if not exists cover_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_cover_letters_user_id_created_at
  on cover_letters(user_id, created_at desc);

