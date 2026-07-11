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
(the read-only key minted by `scripts/load-seed.ts`). Switch the import at the
top to `@pseo/numerology-core` (sochudao already depends on the shared package).

It writes `astro/src/data/numerology/combos.generated.json` and **throws** on:
a combo declared in `combo-grid.config.json` missing from the pull (partial
pulls fail loud — never fewer pages silently), any non-NFC string (unicode
gate mirror), or slug/fact drift against the shared numerology-core.

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

## 3. Keep the per-page drift throw

`[combo].astro` keeps its existing throw: recompute `linking`/`maturity`/
`harmony` via `@pseo/numerology-core` and assert the prose mentions the same
numbers. The pull script catches whole-grid problems; the page throw catches
per-page data/prose drift (e.g. a hand-edited generated JSON).

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
