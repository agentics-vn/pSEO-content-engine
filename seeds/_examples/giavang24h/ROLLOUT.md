# giavang24h rollout (fictional reference)

| Phase | Scope | Sampling | Gate to next phase |
|---|---|---|---|
| Golden | 8 items in `worklist.golden.json` — 3 regions × 2 metals, incl. one flat and two falling markets (voice must not read as hype in any direction) | 100% human review | strategist voice sign-off + distill ≤3 few-shots from different regions, switch model to `claude-haiku-4-5` |
| 1 | top-20 cities by query volume × SJC | 25% + auto-flags | weekly GSC index-coverage report healthy (§12) |
| 2 | remaining provinces × SJC, then nhẫn rows | 25% + auto-flags | — |

**Refresh:** the client backend re-posts the work-list daily with fresh
prices; a changed `input_data` changes `data_hash`, so only moved markets
regenerate (cache serves the rest — near-zero token spend on quiet days).
Voice/prompt improvements = `template_version` bump + republish. SERP shape
change = new `template_key`.

**Human actions that cannot be delegated:** confirm query volumes came from a
real tool, and golden-set voice sign-off after generation.
