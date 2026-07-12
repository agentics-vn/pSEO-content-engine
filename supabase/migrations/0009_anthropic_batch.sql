-- Anthropic Message Batches: job-level batch tracking + per-item usage channel.

alter table prose_jobs
  add column if not exists anthropic_batch_id text,
  add column if not exists batch_status text,
  add column if not exists run_channel text not null default 'batch';

alter table prose_items
  add column if not exists usage_channel text;

comment on column prose_jobs.anthropic_batch_id is 'Active Anthropic Message Batch id while in flight';
comment on column prose_jobs.batch_status is 'Mirrors Anthropic processing_status: in_progress | canceling | ended';
comment on column prose_jobs.run_channel is 'batch (default job run) | sync (escape hatch)';
comment on column prose_items.usage_channel is 'batch | sync — set when tokens are written; drives Actual Cost';
