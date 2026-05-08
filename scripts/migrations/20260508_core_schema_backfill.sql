create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  telegram_username text null,
  telegram_first_name text null,
  telegram_last_name text null,
  full_name text null,
  status text not null default 'onboarding',
  target_roles text[] null,
  years_of_experience integer null,
  work_authorization text null,
  location text null,
  onboarding_completed boolean not null default false,
  approved_by bigint null,
  approved_at timestamptz null,
  daily_generation_count integer not null default 0,
  daily_generation_reset timestamptz not null default now(),
  extra_credits integer not null default 0,
  session_summary text null,
  referral_code text null,
  referred_by uuid null references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_users_status
    check (status in ('onboarding', 'pending_approval', 'approved', 'rejected', 'banned'))
);

create index if not exists idx_users_status_created_at
  on users(status, created_at desc);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  telegram_username text null,
  name text null,
  email text null,
  status text not null default 'new',
  lead_score integer not null default 0,
  intent_signals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_leads_status_created_at
  on leads(status, created_at desc);

create table if not exists resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  storage_path text not null,
  file_type text not null,
  file_size_bytes integer null,
  status text not null default 'processing',
  is_active boolean not null default false,
  raw_text text null,
  parsed_sections jsonb null,
  ats_score integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_resumes_file_type check (file_type in ('pdf', 'docx', 'txt')),
  constraint chk_resumes_status check (status in ('processing', 'active', 'failed'))
);

create index if not exists idx_resumes_user_created_at
  on resumes(user_id, created_at desc);

create index if not exists idx_resumes_user_active
  on resumes(user_id, is_active)
  where is_active = true;

create table if not exists generated_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_resume_id uuid null references resumes(id) on delete set null,
  doc_type text not null,
  docx_storage_path text null,
  pdf_storage_path text null,
  credit_deducted boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_generated_documents_user_created_at
  on generated_documents(user_id, created_at desc);

create table if not exists payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  stripe_payment_intent_id text not null unique,
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  credits_purchased integer not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_payment_status check (status in ('pending', 'succeeded', 'failed', 'refunded'))
);

create index if not exists idx_payment_transactions_user_created_at
  on payment_transactions(user_id, created_at desc);

create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_telegram_id bigint not null,
  action_type text not null,
  target_user_id uuid null references users(id) on delete set null,
  target_telegram_id bigint null,
  action_data jsonb null,
  notes text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_actions_created_at
  on admin_actions(created_at desc);

create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint chk_conversation_role check (role in ('user', 'assistant', 'system'))
);

create index if not exists idx_conversation_messages_user_created_at
  on conversation_messages(user_id, created_at desc);

create table if not exists document_embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  source_id uuid null,
  source_type text not null,
  chunk_index integer not null,
  chunk_text text not null,
  embedding double precision[] not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_document_embeddings_source_chunk
  on document_embeddings(user_id, source_id, chunk_index);

create index if not exists idx_document_embeddings_user_created_at
  on document_embeddings(user_id, created_at desc);

create or replace function process_payment(
  p_user_id uuid,
  p_payment_intent_id text,
  p_credits integer
)
returns boolean as $$
declare
  v_exists uuid;
begin
  select id into v_exists
  from payment_transactions
  where stripe_payment_intent_id = p_payment_intent_id;

  if v_exists is not null then
    return true;
  end if;

  insert into payment_transactions (
    user_id,
    stripe_payment_intent_id,
    amount_cents,
    currency,
    credits_purchased,
    status
  ) values (
    p_user_id,
    p_payment_intent_id,
    0,
    'usd',
    p_credits,
    'succeeded'
  );

  update users
  set extra_credits = extra_credits + p_credits,
      updated_at = now()
  where id = p_user_id;

  return true;
end;
$$ language plpgsql;
