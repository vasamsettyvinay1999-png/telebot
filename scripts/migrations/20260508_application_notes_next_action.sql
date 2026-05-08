alter table application_tracker
  add column if not exists notes text null;

alter table application_tracker
  add column if not exists next_action_date date null;

create index if not exists idx_application_tracker_next_action_date
  on application_tracker(next_action_date);

