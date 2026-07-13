# sochumenh rollout — demand-phased build of the số-chủ-đạo × sứ-mệnh grid

Strategy companion (the engine never reads this file). It records how the 144
combo pages are phased by real search demand, and how that demand drives the
generation order via K1.

## The axis

`combo-so-chu-dao-su-menh`: life-path (số chủ đạo) × destiny (số sứ mệnh) over
the 12 core numbers (1–9, 11, 22, 33) → **144 pages**. Each page stands on the
deterministic fact-set from `@pseo/numerology-core` (harmony, linking, maturity)
plus its hub + sibling links (K2). Slug: `so-chu-dao-<lp>-su-menh-<dt>`.

## Demand data (required before phasing — do NOT invent)

Real query volumes live in [`keywords.csv`](./keywords.csv) with columns
`query,volume_mo,maps_to,source`. `maps_to` is the engine `item_key`; `source`
names the tool + pull date (Google Keyword Planner / GSC / Ahrefs). The engine
refuses axes whose volumes would have to be invented — fill this from a real
tool before running anything beyond the golden set.

## Phasing → generation order (K1)

1. Pull real volumes into `keywords.csv`.
2. `node scripts/keywords-to-worklist.mjs seeds/sochumenh/keywords.csv` → a
   `priorities` map + `item_keys_by_demand`.
3. Splice `priorities` into the `POST /jobs` body. The drain (batch submit + the
   sync loop) orders by `priority DESC`, so high-volume pages generate and reach
   review first. A full-grid run (all 144, `enumerate: combo-grid`) may skip
   priorities — order is immaterial when everything ships.

Suggested phases (tune to the real distribution once `keywords.csv` exists):

| Phase | Scope | Sampling |
|---|---|---|
| Golden | ✅ done — 5 items, 2 life-paths | 100% |
| **Persona + v3** | adopt `persona.draft.md` → `persona.md` + template v3 (slimmed prompt, bridge/cta arc — see `v3.PROPOSAL.*.json` header for the recipe); re-golden at 100% | 100% |
| P1 | top demand tier by volume | 25% |
| P2 | mid tier | 10–25% |
| Tail | remaining combos | 5–10% |

Gate each phase on the previous one's index-coverage (GSC) before opening the
next — pace by indexation, not generation capacity.

## Refresh

Published pages are immutable; a refresh is a `template_version` bump. The
pipeline-steward proposes refreshes from GSC performance but never auto-publishes.
