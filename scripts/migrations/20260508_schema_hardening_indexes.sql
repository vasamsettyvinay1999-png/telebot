create index if not exists idx_application_tracker_status_updated_at
  on application_tracker(status, updated_at desc);

create index if not exists idx_application_tracker_next_action_date
  on application_tracker(next_action_date)
  where next_action_date is not null;

create index if not exists idx_application_tracker_user_status
  on application_tracker(user_id, status);

create index if not exists idx_users_referred_by
  on users(referred_by)
  where referred_by is not null;

create index if not exists idx_ai_usage_events_feature_created_at
  on ai_usage_events(feature, created_at desc);

create index if not exists idx_ai_usage_events_user_created_at
  on ai_usage_events(user_id, created_at desc);
