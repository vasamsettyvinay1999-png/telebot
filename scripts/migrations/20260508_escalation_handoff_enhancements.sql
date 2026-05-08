alter table escalations
  add column if not exists trigger_type text null;

alter table escalations
  add column if not exists similarity_score double precision null;

alter table escalations
  add column if not exists resolution_note text null;

create index if not exists idx_escalations_trigger_type_created_at
  on escalations(trigger_type, created_at desc);

