# WP7 — wiring the sochudao consumer (reference)

The sochudao repo is a separate codebase; this directory holds the ready-to-copy
pieces and the integration checklist (docs/IMPLEMENTATION.md WP7, architecture
§9–§10). The engine's contract with sochudao is exactly one API + one webhook +
one API key — nothing here touches the engine's DB.

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

## 4. Webhook (optional, after CI endpoint exists)

Register sochudao's CI trigger once:

```sh
curl -X POST "$ENGINE_URL/v1/sites/sochumenh/webhooks" \
  -H "Authorization: Bearer $SOCHUMENH_CONTENT_KEY" \
  -H "content-type: application/json" \
  -d '{"url":"https://ci.example/hooks/sochumenh-content-updated"}'
```

On publish the engine POSTs `{site, template, item_count}`; the hook should
re-run `npm run build` (which re-pulls). Until then, scheduled/manual rebuilds
are fine.

## Acceptance (run in the sochudao repo)

- `npm run build` pulls N published combos and renders N pages; removing one
  published combo engine-side makes the build **throw**, not ship fewer pages.
- Hand-editing a number in `combos.generated.json` makes `[combo].astro` throw.
