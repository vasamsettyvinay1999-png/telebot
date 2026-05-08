alter table application_tracker
  add column if not exists follow_up_enabled boolean not null default true;

alter table application_tracker
  add column if not exists last_follow_up_sent_at timestamptz null;

create index if not exists idx_application_tracker_followup_due
  on application_tracker(follow_up_enabled, status, applied_date);

