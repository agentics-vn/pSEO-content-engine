# ngaylanhthangtot rollout — spec-aligned v2, golden pending

Strategy companion (the engine never reads this file). Authoritative tenant
strategy lives beside this file: `strategy-master.md` (4 fronts, 10k
clicks/day target), `seo-page-structure-spec.md` (page structure + keyword
density spec, benchmarked against the #1 SERP), `keywords.csv` (440 keywords,
DataForSEO — the DEMAND INPUT per the engine contract).

## The axis

- **`ngay-tot-xau` v2** (golden, this PR): the prose layer for **Front A day
  pages** (spec §2.2, `/lich-am/ngay-{dd}-{mm}-{yyyy}/` — "template đã rank
  pos 2–8 khi được crawl", a proven axis). One page per calendar date,
  GENERIC (lịch chung) day-quality content. `item_key: ngay-<dd>-<mm>-<yyyy>`
  mirrors the site URL 1:1; hub `lich-am`; siblings ±3 days (prev/next
  navigation). Facts from `GET /v1/day-detail?mode=generic`
  (agentics-vn/tu-tru-api) via `scripts/build-worklist-ngay-tot-xau.mjs`.
- **v1 is orphaned** (loaded to DB before the spec arrived, zero items
  generated — superseded by v2, harmless).
- **Division of labor per spec §2.2**: engine prose = the narrative sections
  (phân tích tốt/xấu, giờ hoàng đạo, nên/kiêng kỵ, sao & trực, 3 FAQ); the
  SITE renders the data tables (thông tin ngày, tuổi xung, event-score block
  "tốt cho việc gì") from its own `canchi.ts` compute + old event engine.

## Spec alignment implemented in v2

- Numeric date form (`dateSlash` dd/mm/yyyy) as the primary token everywhere
  (required_mentions title/seoTitle/metaDescription, FAQ answers,
  keyword_density) — real queries are numeric, not written-out dates.
- Title = H1 format (contains date + Can Chi); seoTitle follows the A/B
  split by day parity (`titleVariant` fact) per the site's existing CTR
  mechanism.
- FAQ exactly 3 (was 5).
- Body sized to the spec's 600–900 words (prose portion).
- Density: min 3× in prose + title/meta/FAQ ≈ the spec's 5–8×/page;
  ceiling 2% (spec's hard cap). Flag-only.
- Synonym rotation (ngày tốt/đẹp/lành/hoàng đạo · xem/chọn/coi ngày · lịch
  âm/âm lịch) prompted in system_prompt — NOT gate-enforced (no multi-phrase
  synonym gate yet) → **reviewer checklist item**.

## Known data gaps (relay to site + tu-tru-api owner)

Spec §1 requires 8 entities per day page. Generic mode covers 6 (can chi,
trực, sao, giờ hoàng đạo, âm/dương lịch, ngũ hành via sao_element + nạp âm
in breakdown). **Missing from the API's generic response: tiết khí, tuổi
xung** (+ hướng xuất hành / nạp âm as first-class fields). Site currently
covers them with its own `canchi.ts` tables; ask tu-tru-api to expose them
in day-detail generic so prose can reference all 8 naturally.

## Demand data

`keywords.csv` (real, DataForSEO): head cluster `lịch âm` 2.74M/mo,
`lịch âm hôm nay` 1.5M — day pages are the long-tail of Front A. Individual
day pages have no per-page volume rows (pattern-based) → no K1 priorities
needed for the golden month. Seasonal prioritization (Tết, cưới season)
comes later from GSC.

## Phasing

| Phase | Scope | Status |
|---|---|---|
| Golden (31 days, Aug 2026) | `ngay-tot-xau` v2, review 100% | this PR — validate → load v2 → generate → strategist sign-off |
| Full year | 365 days, phased monthly | after golden + length/density recalibration; few-shot distillation + cheaper model |
| Front B prose (event×tháng, 15 events) | candidate next axis IF site migrates off its old single-tenant engine | site decision |
| Per-intent pages | date × intent (27 codes) | blocked on site birth-input UX (personalized API mode) |

## Open PROVISIONAL items for strategist review

1. `persona.md` — DRAFT voice (unchanged from v1), not final brand identity.
2. Length bounds — sized to spec words→chars conversion, verify on golden.
3. `min_count 3` density floor — calibrated on the ~70% prose share
   assumption; verify against a composed page.
4. No `cta`/`bridge` field — strategy's bát-tự funnel block (spec §2B) is a
   SITE-side widget on niche pages, not day-page prose; revisit if day pages
   should also carry a persuasion bridge.
5. `gradeLabel` mirrors tu-tru-api's internal GRADE_PLAIN thresholds — the
   tu-tru-client fixture test is the drift alarm.
