/**
 * Validation gates — GENERIC. This module knows NOTHING about numerology or any
 * tenant domain (doc §7). Every domain-specific rule arrives as data via the
 * template's `guards` JSON, with placeholders ({linking}, {lifePath}, …) already
 * resolved from the item's input_data before the gates run.
 *
 * Severities: 'fail' blocks publish; 'flag' queues for human review.
 * HARD RULE (§7): the approve action must refuse while any 'fail' gate is red.
 * That check lives in prose-admin's approve handler, not here — but this module
 * is what tells it which gates are red.
 */

export type Severity = 'fail' | 'flag';
export interface GateResult {
  gate: string;
  severity: Severity;
  passed: boolean;
  detail?: string;
}

export interface GateContext {
  output: Record<string, unknown>;   // the generated item
  guards: Record<string, any>;       // resolved guards JSON (placeholders filled)
  computed: Record<string, number>;  // input_data numbers for numeric/required checks
  batch?: Array<Record<string, unknown>>; // sibling items, for batch-scope gates
}

// ── Per-item gates ───────────────────────────────────────────────────────────

export function gateUnicode(ctx: GateContext): GateResult {
  const form = ctx.guards.unicode?.form ?? 'NFC';
  const bad: string[] = [];
  for (const [k, v] of Object.entries(ctx.output)) {
    if (typeof v === 'string' && v.normalize(form) !== v) bad.push(k);
  }
  return { gate: 'unicode', severity: 'fail', passed: bad.length === 0,
           detail: bad.length ? `not ${form}: ${bad.join(', ')}` : undefined };
}

export function gateLength(ctx: GateContext): GateResult {
  const fields = ctx.guards.length?.fields ?? {};
  const viol: string[] = [];
  for (const [field, bounds] of Object.entries<[number, number]>(fields)) {
    const val = ctx.output[field];
    if (typeof val !== 'string') { viol.push(`${field}: missing`); continue; }
    const len = [...val].length; // code points, correct for Vietnamese
    if (len < bounds[0] || len > bounds[1]) viol.push(`${field}: ${len}∉[${bounds}]`);
  }
  return { gate: 'length', severity: 'fail', passed: viol.length === 0,
           detail: viol.join('; ') || undefined };
}

export function gateRequiredMentions(ctx: GateContext): GateResult {
  const rules = ctx.guards.required_mentions?.rules ?? [];
  const viol: string[] = [];
  for (const r of rules) {
    const val = String(ctx.output[r.field] ?? '');
    for (const token of r.must_contain) if (!val.includes(String(token))) viol.push(`${r.field}⊅"${token}"`);
  }
  return { gate: 'required_mentions', severity: 'fail', passed: viol.length === 0,
           detail: viol.join('; ') || undefined };
}

export function gateBannedPhrases(ctx: GateContext): GateResult {
  const list: string[] = ctx.guards.banned_phrases?.list ?? [];
  const hay = Object.values(ctx.output).filter(v => typeof v === 'string').join(' ').toLowerCase();
  const hits = list.filter(p => hay.includes(p.toLowerCase()));
  return { gate: 'banned_phrases', severity: 'fail', passed: hits.length === 0,
           detail: hits.length ? `found: ${hits.join(', ')}` : undefined };
}

/**
 * numeric_consistency: every integer appearing in prose must be an allowed
 * computed value. Catches a number in the prose with no basis in input data.
 */
export function gateNumericConsistency(ctx: GateContext): GateResult {
  const allowed = new Set(Object.values(ctx.computed).map(Number));
  const hay = Object.values(ctx.output).filter(v => typeof v === 'string').join(' ');
  const nums = (hay.match(/\d{1,2}/g) ?? []).map(Number).filter(n => n >= 0 && n <= 33);
  const bad = [...new Set(nums)].filter(n => !allowed.has(n));
  return { gate: 'numeric_consistency', severity: 'fail', passed: bad.length === 0,
           detail: bad.length ? `unbacked numbers: ${bad.join(', ')}` : undefined };
}

// ── Batch-scope gates (run after a batch, before publish) ────────────────────

/** n-gram TF-IDF cosine between all pairs — near-duplicate catcher, no LLM. */
export function gateSimilarity(ctx: GateContext): GateResult {
  // TODO: implement TF-IDF over character 3-grams of the concatenated prose;
  // flag any item whose max pairwise cosine > guards.similarity.max_pairwise.
  const max = ctx.guards.similarity?.max_pairwise ?? 0.55;
  return { gate: 'similarity', severity: 'flag', passed: true,
           detail: `TODO: enforce max pairwise cosine ≤ ${max} across batch` };
}

/** Flag stamped openings reused across the batch. */
export function gatePhraseFrequency(_ctx: GateContext): GateResult {
  // TODO: tokenize each intro's first sentence; flag opening n-grams shared by
  // more than N items (e.g. "Người mang số chủ đạo … và số sứ mệnh …").
  return { gate: 'phrase_frequency', severity: 'flag', passed: true,
           detail: 'TODO: flag reused opening n-grams across batch' };
}

const PER_ITEM = [gateUnicode, gateLength, gateRequiredMentions, gateBannedPhrases, gateNumericConsistency];

/** Run all configured per-item gates. Schema/faq_shape are checked upstream by
 *  strict tool use + a shape assert; those results should be merged in.
 *  A gate's default severity can be overridden per template via
 *  guards[gate].severity — severity is tenant data, not engine code. */
export function runItemGates(ctx: GateContext): GateResult[] {
  return PER_ITEM
    .map(fn => fn(ctx))
    .filter(r => ctx.guards[r.gate] !== undefined) // only run gates present in guards
    .map(r => {
      const configured = ctx.guards[r.gate]?.severity;
      return configured === 'fail' || configured === 'flag' ? { ...r, severity: configured as Severity } : r;
    });
}

export function hasFailingGate(results: GateResult[]): boolean {
  return results.some(r => r.severity === 'fail' && !r.passed);
}
