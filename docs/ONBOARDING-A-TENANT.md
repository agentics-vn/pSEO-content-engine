# Onboarding a new client (tenant) — zero engine code

The engine is multi-tenant by construction: every row is scoped by `site_id`,
the item cache key includes the tenant, API keys are site-scoped, and admin
logins see one site at a time. Onboarding a client is **data entry, not
development** — with one prerequisite that is strategy, not code.

## Step 0 — find the scaling axis (or refuse the deal)

Programmatic SEO only works when there is a real, enumerable data axis behind
the pages (architecture §2): a city, a product pair, a date, a spec sheet, a
price point. "Mass articles" without an axis is a doorway-page penalty waiting
to happen — the prose personalizes the presentation of real facts; it is not
what makes pages distinct. If the client cannot name the axis and the
structured facts behind each page, this engine is the wrong tool for them.

## Step 1 — create the site + key

```sh
# seeds/<client>/site.json + template.<key>.json, then:
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
  deno run --allow-net --allow-env --allow-read scripts/load-seed.ts seeds/<client>
```

Prints a read-only, site-scoped API key once → goes into the client site's
build secrets. Add their reviewers to `site_admins` (`editor` builds
templates/jobs, `reviewer` approves/publishes, `owner` = both).

## Step 2 — author the template (the actual craft)

One template = one page shape. Fill in:

| Field | What it encodes |
|---|---|
| `output_schema` | the exact JSON shape their site renders |
| `guards` | lengths, required mentions, banned phrases, numeric/entity consistency, similarity threshold — all data, no engine code |
| `system_prompt` / `user_template` | voice + the structured facts, with `{placeholders}` and `{constraint_notes}` |
| `model` | Sonnet-class for the golden set, Haiku-class after distillation |

## Step 3 — supply the work-list (the tenant-generic path)

`POST /jobs` accepts explicit rows — any vertical, any data source:

```jsonc
{
  "template_key": "gia-vang-theo-tinh",
  "items": [
    { "item_key": "gia-vang-ha-noi",  "input_data": { "city": "Hà Nội",  "price": 8450000, "unit": "VND/chỉ" } },
    { "item_key": "gia-vang-da-nang", "input_data": { "city": "Đà Nẵng", "price": 8430000, "unit": "VND/chỉ" } }
  ],
  "review_sample_pct": 100
}
```

`input_data` is hashed into the cache key, so re-posting the same rows is free
(dedupe) and changed facts regenerate automatically. Built-in enumerators
(like `enumerate: "combo-grid"` for the numerology axis) are conveniences on
top of this, not requirements.

## Step 4 — golden set → distill → batch

Same playbook as WP6, every tenant: ~15 hand-reviewed items on the expensive
model spanning the axis's variety (set `review_sample_pct: 100`), promote the
best approved outputs into `few_shots`, switch the template `model` to
Haiku-class, then run the full batch phased by search demand with 25%
sampling on top of auto-flags.

## Step 5 — wire their site

Their backend/build pulls `GET /v1/sites/<slug>/published` with their key and
replicates the build-time safety gate (declare the expected page list, throw
on missing/drifted content — see `consumers/sochudao/` for the reference).
Optionally register a webhook so publishes trigger their CI rebuild.

**What the engine never does for a tenant:** page building, deploys, sitemaps,
GSC/IndexNow submission, analytics. Those live in the client's stack (§9) —
budget them in the engagement.
