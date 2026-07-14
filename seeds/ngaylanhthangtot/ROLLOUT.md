# ngaylanhthangtot rollout — golden-set-ready, clean-slate rebuild

Strategy companion (the engine never reads this file). No seed folder for
this tenant was ever committed (git log --all confirms) — this is a
clean-slate rebuild sourcing facts from the tu-tru-api third-party service,
not a restore of the original single-tenant implementation's data. The
original site is the proven precedent: architecture.md §15 records "31 days
of calendar content, ~$0.50 total generation cost, live and indexed."

## The axis

- **`ngay-tot-xau`** (golden, this PR): one page per calendar date, GENERIC
  (non-personalized, lịch chung) day-quality content — Can Chi, Trực, Sao,
  Hoàng Đạo/Hắc Đạo, điểm số 0–100, giờ tốt/xấu. `item_key: ngay-<YYYY-MM-DD>`.
  Facts from `GET /v1/day-detail?mode=generic` (agentics-vn/tu-tru-api, open
  API, 300 req/min) via `scripts/build-worklist-ngay-tot-xau.mjs` +
  `packages/tu-tru-client`.
- **NOT in this pass**: a personalized/per-intent axis. Verified against
  tu-tru-api's source: `purpose_rows`/`good_for`/`avoid_for` (the 27 intent
  codes — KHAI_TRUONG, DAM_CUOI, DONG_THO...) are **null in generic mode**;
  they require `birth_date`. Faking a per-intent checklist from generic data
  would violate the real-facts principle. Candidate v2 once a birth-input
  UX exists on the site.

## Demand data

None yet — no `keywords.csv` for this tenant. Axis legitimacy rests on
architecture.md principle #1 (calendar dates are an inherently real,
enumerable axis — the proven original), not volume evidence. Do NOT block
the golden set on this. Once real GSC/query data exists, prioritize dates
via K1 `priorities` (wedding season, Tết, ngày rằm/mùng 1...) and replace
the provisional `searchPhraseDate` keyword_density phrase with the real
demand phrase.

## Golden set (this PR)

`worklist.golden.ngay-tot-xau.json`: 31 items, August 2026
(`--from=2026-08-01 --days=31`), `review_sample_pct: 100`. Real API data —
grade spread A:6 / B:4 / C:10 / D:11, mixed hoàng-đạo/hắc-đạo — good
coverage of both verdict shapes for voice review.

## Phasing

| Phase | Scope | Status |
|---|---|---|
| Golden (31 days, Aug 2026) | `ngay-tot-xau` v1, review 100% | authored this PR — validate → load → generate → strategist sign-off |
| Full year | 365 days, phased monthly | not started — after golden review + length-bound/persona recalibration; consider few-shot distillation + cheaper model tier |
| Per-intent pages (v2) | date × intent (27 codes) | blocked on site birth-input UX; personalized API mode |

## Open PROVISIONAL items for strategist review (before golden generate)

1. `persona.md` — DRAFT voice, not final brand identity.
2. `guards.length` bounds — no real SERP data behind them.
3. `searchPhraseDate` ("ngày D tháng M") keyword_density phrase — no real
   query data; flag-only so it can't block.
4. **No `cta`/`bridge` field** — no confirmed monetization funnel target for
   this tenant yet. Adding one later is a template version bump (cheap), but
   deciding now is cheaper. Decide before the full-year batch at the latest.
5. `gradeLabel` mirrors tu-tru-api's internal (undocumented) GRADE_PLAIN
   thresholds — the tu-tru-client fixture test is the drift alarm; consider
   asking tu-tru-api to expose it as a real field.
6. Hub slug `ngay-tot-xau` — confirm against the actual site IA/URL
   structure (site repo: tad-agentics/Ngay-lanh-thang-tot).
