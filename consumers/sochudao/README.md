# Wiring the sochudao consumer (reference)

The sochudao repo is a separate codebase; this directory holds the ready-to-copy
pieces and the integration checklist (architecture §9–§10; the generic method is
`docs/phase-a-handoff/`). The engine's contract with sochudao is exactly one
API + one webhook + one API key — nothing here touches the engine's DB.

## 1. `scripts/pull-combos.mjs`

Copy [`pull-combos.mjs`](./pull-combos.mjs) into sochudao's `scripts/` and run
it in `prebuild`:

```jsonc
// package.json (sochudao)
{
  "scripts": {
    "prebuild": "node scripts/pull-combos.mjs combo-grid.config.json",
    "build": "astro build"
  }
}
```

Build secrets: `ENGINE_URL` (content-api base URL) and `SOCHUMENH_CONTENT_KEY`
(the read-only key minted by `scripts/load-seed.ts`). **No numerology import in
this script** — it parses the two numbers straight from `item_key` and derives
the slug literally. `@csessh/sochumenh` is used at *runtime* (visitor → số chủ
đạo × sứ mệnh), not here. Do **not** import `@pseo/numerology-core`: it is
intentionally unpublished; the engine mirrors `@csessh/sochumenh` and is
parity-guarded in CI, so there is no math to re-run site-side.

It writes `astro/src/data/numerology/combos.generated.json` and **throws** on:
a combo declared in `combo-grid.config.json` missing from the pull (partial
pulls fail loud — never fewer pages silently) or any non-NFC string (unicode
gate mirror). The deterministic facts (harmony / linking / maturity) come from
each row's `facts` (engine-computed) and are merged into the content — they are
**not** recomputed here.

`combo-grid.config.json` declares the expected grid explicitly — phase it with
the rollout:

```json
{ "master": "exclude" }
```

then widen to the full grid once the 11/22/33 batch (Phase 2) is published.

## 2. `combos.ts` becomes a thin loader

```ts
// astro/src/lib/numerology/combos.ts
import generated from '../../data/numerology/combos.generated.json';
import type { ComboContent } from './types';

export const COMBO_CONTENT: ComboContent[] = generated.map((g) => ({
  slug: g.slug,
  lifePath: g.lifePath,
  destiny: g.destiny,
  ...g.content,
}));
```

No page changes — the `ComboContent` type is preserved.

## 3. Per-page structural throw

`[combo].astro` keeps a **structural** throw: assert the slug equals
`so-chu-dao-{lifePath}-su-menh-{destiny}` for the two numbers parsed from the
key, and that `facts.harmony` / `facts.linking` / `facts.maturity` are present.
It does **not** recompute the numbers — those are engine-computed and delivered
in `facts`; re-running the math site-side would just reintroduce the fork this
setup removes. The pull script catches whole-grid problems (missing combos);
the page throw catches per-row damage (e.g. a hand-edited generated JSON whose
slug and facts no longer agree).

## 4. Webhook — the go-live signal (recommended)

Register a rebuild URL once and every engine publish triggers a fresh build
automatically — so nobody has to ping "the content is live now". The engine's
publish handler already fires registered webhooks (5s timeout, failures ignored,
never blocks a publish).

Easiest rebuild URL: a **deploy hook** from your host — a secret POST URL that
triggers a build, no auth header needed (Vercel *Deploy Hooks*, Netlify *build
hooks*, Cloudflare Pages, or a Fly/GitHub `repository_dispatch` proxy). Register
it once:

```sh
curl -X POST "$ENGINE_URL/v1/sites/sochumenh/webhooks" \
  -H "Authorization: Bearer $SOCHUMENH_CONTENT_KEY" \
  -H "content-type: application/json" \
  -d '{"url":"https://api.vercel.com/v1/integrations/deploy/prj_…/…"}'  # your deploy hook
```

The registration response includes a **`webhook_secret` shown ONCE** (plus a
`verify` block explaining the check) — store it in your secret store. On each
publish the engine POSTs `{site, template, template_version, item_key,
item_count}` to that URL, **HMAC-SHA256 signed** as
`x-signature: sha256=<hex>` over the exact raw body. Raw deploy hooks ignore
the header (harmless); if your endpoint is your own code, verify the signature
before rebuilding — the integration kit emits a ready-made
`scripts/verify-webhook.mjs` (constant-time compare). Publishes fire per item,
so a 5-item golden batch sends 5 triggers — deploy platforms coalesce
concurrent builds, so this is fine.

**First go-live is still one deliberate flip** (enable the `prebuild` pull +
set `combo-grid.config.json` to the published item_keys); the webhook automates
every publish *after* that. Until a rebuild URL exists, scheduled/manual
rebuilds work.

## Acceptance (run in the sochudao repo)

- `npm run build` pulls N published combos and renders N pages; removing one
  published combo engine-side makes the build **throw**, not ship fewer pages.
- Hand-editing a number in `combos.generated.json` makes `[combo].astro` throw.
