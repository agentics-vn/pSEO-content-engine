-- Per-item token usage for Actual Cost reporting (jobs already have tokens_*).
alter table prose_items
  add column if not exists tokens_in  bigint not null default 0,
  add column if not exists tokens_out bigint not null default 0;
