-- W1a: per-site webhook signing secret so a consumer can verify a publish ping
-- is really from the engine (HMAC-SHA256 over the body, sent as x-signature).
-- Default generates one for existing rows and any registration that omits it;
-- re-registering the same URL keeps its secret (upsert doesn't touch this column).

alter table site_webhooks
  add column if not exists secret text not null
  default ('whsec_' || encode(gen_random_bytes(24), 'hex'));

comment on column site_webhooks.secret is
  'HMAC-SHA256 signing secret; returned once at registration, sent as x-signature: sha256=<hex>';
