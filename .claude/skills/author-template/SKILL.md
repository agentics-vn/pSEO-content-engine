---
name: author-template
description: Seat 1 as a service — turn a client intake brief (seeds/<client>/brief.json) into a reviewable template PR: output_schema, guards, prompts, work-list, and rollout plan, following docs/phase-a-handoff/02-authoring-method.md. Use when asked to author, draft, or revise a tenant template from a brief.
---

# Author a tenant template from an intake brief

You are performing **Seat 1** (SEO strategist's pen) for one tenant. The
accountable human reviews your output as a PR — your job is a draft so good
the review is sign-off, not rework. The process contract is
`docs/phase-a-handoff/02-authoring-method.md`; this skill is its executable form.

## Inputs

- `seeds/<client>/brief.json` (see `seeds/_intake/brief.example.json`)
- `seeds/<client>/keywords.csv` if present (query, volume, maps_to)
- The SERP reference URLs in the brief (WebFetch them if network allows)

**Refuse loudly** (do not draft anyway) when: the axis is not enumerable, the
fact_fields cannot back distinct pages, or keyword data is placeholder-shaped
(volumes invented, no source named). Doorway clusters are declined at intake,
not caught at review.

## Produce (all in one PR on a feature branch)

1. `seeds/<client>/site.json` — slug, name, domain from the brief.
2. `seeds/<client>/template.<key>.json`:
   - `output_schema`: one field per SERP-worthy section (read the serp_refs;
     mirror what winners rank with, not what's easy to generate). Always:
     `metaDescription`, a tagline/H1-support field, `faqs` (3–5, q/a) sized
     for FAQPage rich results. Every field must be renderable — over-include
     slightly; shape changes later are a new template_key.
   - `guards`: lengths from SERP competitiveness; `required_mentions` from
     the keyword map + hub rule; `banned_phrases` verbatim from
     brief.compliance; `numeric_consistency`/`entity_consistency` over the
     brief's fact_fields; `similarity` ≤ 0.55; `faq_shape` with count and
     answers_must_contain for the load-bearing facts.
   - `system_prompt`: voice/persona/do_nots from the brief + the anti-stamp
     instruction (vary openings) + "facts only from provided data".
   - `user_template`: ONLY `{placeholders}` over fact_fields +
     `{constraint_notes}`. No voice here.
   - `model`: Sonnet-class; note the Haiku switch after distillation.
3. `seeds/<client>/worklist.golden.json` — the golden-set job body
   (`items: [{item_key, input_data}]`, `review_sample_pct: 100`) spanning the
   axis's variety per brief.rollout, ranked by keyword volume. Include the
   sibling/hub link slugs INSIDE input_data (hub & spoke is data, not hope).
4. `seeds/<client>/ROLLOUT.md` — phases mapped to demand ranking, refresh
   cadence, and the index-coverage gate between phases.

## Checks before opening the PR

- Fill the template against 2 sample input_data rows with
  `fillTemplate` + `constraintNotes` (see `supabase/functions/tests/
  generate_lib_test.ts` for the pattern) — zero unresolved placeholders.
- Every guard token (`{...}`) exists in fact_fields.
- metaDescription guard requires the axis tokens; faq_shape mentions the
  facts users actually ask about.
- State in the PR description which decisions were SERP-derived vs
  brief-derived vs your judgment — the human reviews judgment calls first.

## Hand-off line

The PR body ends with the two human actions you cannot do: sign off voice on
the golden set after generation, and confirm keyword volumes came from a real
tool.
