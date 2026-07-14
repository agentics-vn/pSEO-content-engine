# sochumenh rollout — demand-phased build

Strategy companion (the engine never reads this file). Real query volumes
(2,225 rows, DataForSEO 2026-07) showed the combo axis (số chủ đạo × số sứ
mệnh) has near-zero standalone search demand — almost all real demand is on
single-index pages (số chủ đạo N, năm cá nhân N, etc.). The site pivoted
accordingly: it now ships 7 index axes (số chủ đạo, số sứ mệnh, năm cá nhân,
số linh hồn, số trưởng thành, số thái độ, số nhân cách) with static
site-authored facts, and combo pages were demoted to a tail cluster (kept,
not expanded). This file tracks engine-side content for both.

## The axes

- **`combo-so-chu-dao-su-menh`** (tail — kept at 5 demo pages, not expanded):
  life-path × destiny over the 12 core numbers → up to 144 possible pages.
  Slug: `so-chu-dao-<lp>-su-menh-<dt>`.
- **`index-so-chu-dao`** (pilot, this PR): số chủ đạo 1–9, 10, 11, 22, 33 → 13
  pages. Slug: `so-chu-dao-<n>`. Highest demand of all axes (`so-chu-dao-3` =
  10,130/mo summed). See `template.index-so-chu-dao.json` +
  `worklist.golden.index-so-chu-dao.json`.
- **6 more index axes queued**, same pattern once `index-so-chu-dao` is
  reviewed: `index-so-su-menh`, `index-nam-ca-nhan`, `index-so-linh-hon`,
  `index-so-truong-thanh`, `index-so-thai-do`, `index-so-nhan-cach`.

## Demand data

Real query volumes live in [`keywords.csv`](./keywords.csv) — 2,225 rows,
`query,volume_mo,maps_to,source`. `maps_to` is the engine `item_key`; queries
with no generated target (homepage, hand-authored pillars, blog) keep
`maps_to` empty — K1 skips them safely. Source: DataForSEO pull, 2026-07
(144 rows human-reviewed + mapped; 2,081 rows from a broader keyword
expansion, classified programmatically by axis word + number-in-domain, no
invented volumes).

## Phasing → generation order (K1)

```
node scripts/keywords-to-worklist.mjs seeds/sochumenh/keywords.csv
```
→ `priorities` map + `item_keys_by_demand`. Splice `priorities` into the
`POST /jobs` body for whichever template you're running; the drain orders
`priority DESC`.

| Phase | Scope | Status |
|---|---|---|
| Combo golden | 5 items, 2 life-paths | ✅ done |
| **Persona + v3** | `persona.md` activated; combo template bumped to v3 (slimmed system_prompt, `bridge`+`cta` structural) | ✅ **authored + activated this PR** — NOT yet loaded (`validate-seed` + `load-seed` pending; needs a human run — this session has no `deno`) |
| **`index-so-chu-dao` golden** | 13 items (the whole axis, incl. master numbers 11/22/33), `review_sample_pct: 100` | ✅ template + worklist authored this PR — pending `validate-seed` → `load-seed` → generate → strategist voice sign-off |
| Other 6 index axes | same pattern | not started — do after `index-so-chu-dao` golden is approved, to catch template-shape issues once instead of ×7 |
| Combo P1/P2/tail | — | **on hold** — combo has near-zero demand; do not expand past the 5 existing demo pages without new evidence |

Gate each phase on the previous one's index-coverage (GSC) before opening the
next — pace by indexation, not generation capacity.

## Refresh

Published pages are immutable; a refresh is a `template_version` bump. The
pipeline-steward proposes refreshes from GSC performance but never auto-publishes.
