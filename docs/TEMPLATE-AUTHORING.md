# Template authoring — the SEO strategy seat

A template is not a config file; it is **SEO strategy compiled into data**.
Everything the strategist decides — target queries, page shape, hub & spoke
position, quality bars — lands in exactly two artifacts, both PR-reviewed in
this repo:

- `seeds/<client>/template.<key>.json` (schema + guards + prompts + model)
- the job work-list (`items: [{item_key, input_data}]` — which pages exist)

This doc is the process for producing them. It assumes two seats:

| Seat | Owns | Typical staffing |
|---|---|---|
| **SEO strategist / template author** | steps 1–6 below, golden-set sign-off, refresh cadence | agency SEO lead, with an AI agent doing the legwork |
| **Site integrator** | rendering published items in the client repo (components, pull script, sitemaps, structured data, internal links) | whoever owns the client site repo — client dev or agency dev, heavily automatable from `consumers/sochudao/` |

The engine team is deliberately **neither** — it maintains gates and pipes
(architecture §9). One accountable human per seat; AI can hold the pen.

---

## 1. Keyword research → the axis

Inputs that cannot be invented by a model: real query data (Google Keyword
Planner / GSC of an existing property / Ahrefs). The strategist's first
deliverable is a spreadsheet mapping **query pattern → axis value**:

```
"số chủ đạo 7 sứ mệnh 3"   → combo(7,3)      170/mo
"giá vàng hôm nay hà nội"  → city(hà nội)   40k/mo
```

Rules:
- The axis must be enumerable and backed by computable facts (§2). No axis →
  decline the template.
- Rank the work-list by search demand — this ordering becomes the job phases
  (golden set → phase 1 → tail), not alphabetical order.
- Record the head term and its hub page now; you need it in step 2.

## 2. Hub & spoke map

Before any page shape is designed, draw the cluster:

- **Hub** = the head-keyword page (usually `/so-chu-dao/` or the homepage
  section, §11). It links DOWN to every spoke with keyword-rich anchors.
- **Spokes** = the programmatic pages this template generates. Every spoke
  links UP to its hub(s) and SIDEWAYS to 2–4 sibling spokes that share an
  axis value (e.g. combo 7×3 → hub "số chủ đạo 7", hub "số sứ mệnh 3",
  siblings 7×1, 7×5).

Encode it, don't hope for it:
- Sideways/up links are **data**: put `related` slugs into `input_data` (the
  work-list generator computes them), render them in the page component.
- If the prose must reference the hub concept, enforce it with a
  `required_mentions` guard — the gate makes the strategy non-optional.
- The hub page itself is usually hand-written (one page; highest stakes) and
  lives in the site repo, not the engine.

## 3. SERP-informed output_schema

Search the target queries; read the top 5 results. The schema's fields are a
bet on what the SERP rewards: what sections do winners have, what questions
appear in People-Also-Ask (→ your `faqs` field), what belongs in a
comparison table vs prose. Every field must be **renderable** by the site
component — schema changes after launch are a new `template_key` (§8), so
over-include slightly rather than migrate later.

Standing fields that have earned their place: `metaDescription` (guarded
120–165 chars, must contain the axis tokens), `tagline` (H1 support), `faqs`
(3–5, maps 1:1 to FAQPage structured data), one field per SERP-worthy
section.

## 4. Guards = the quality bar, written down

Derive, don't improvise:
- lengths per field from the SERP analysis (what's competitive, not what's
  cheap),
- `required_mentions` from the keyword map (each page must name its axis
  values) and the hub & spoke map,
- `banned_phrases` from the client's compliance list (absolute promises,
  medical/financial claims),
- `numeric_consistency` / `entity_consistency` from whatever facts the pages
  compute,
- `similarity.max_pairwise` stays ≤ 0.55 unless measured otherwise.

## 5. Voice + prompts

`system_prompt` carries the brand voice, the DO-NOTs, and the anti-stamp
instruction (vary openings). `user_template` carries ONLY facts from
`input_data` plus `{constraint_notes}`. If a sentence in the prompt isn't a
fact or a constraint, it's voice — move it to the system prompt.

## 6. Golden set → distill → phase (per WP6, every template)

~15 items on a Sonnet-class model spanning the axis's variety,
`review_sample_pct: 100`, human sign-off by the **strategist** (voice) — not
just the reviewer role. Promote ≤3 approved outputs into `few_shots` (from
different axis regions, never the item being generated), switch to
Haiku-class, batch by the demand ranking from step 1.

## 7. Refresh cadence

The strategist owns the calendar: facts changed → new work-list rows (the
hash regenerates them automatically); prompt/voice improved → bump
`template_version` and republish; SERP shape changed → new `template_key`
(deliberate downstream migration). Pace batches by the weekly index-coverage
report (§12), not by generation capacity.

---

## Integrator checklist (site repo, per template)

1. Page component rendering every schema field (schema is the contract).
2. `pull-*.mjs` from `consumers/sochudao/` adapted: declared page list,
   throw-on-missing, NFC + fact-drift asserts.
3. FAQPage + WebSite/Organization structured data; self-canonical; hub links.
4. Sitemap entry + GSC/IndexNow submission job (§12).
5. OG card per page (templated SVG→PNG from `input_data`, not a raw icon).
6. Analytics events with UTM-tagged content→product links (§13).
