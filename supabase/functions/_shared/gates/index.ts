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
//
// The doorway-cluster defense: a combo axis repeats the same number across a
// whole row, so near-duplication is the structural risk. Both gates are pure
// text statistics — no second LLM call.

/** Every string in the item (nested fields, faq q/a) concatenated as prose. */
export function proseOf(output: unknown): string {
  const parts: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(output);
  return parts.join(' ');
}

function charNgrams(text: string, n = 3): Map<string, number> {
  const norm = text.toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
  const counts = new Map<string, number>();
  for (let i = 0; i + n <= norm.length; i++) {
    const gram = norm.slice(i, i + n);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/**
 * Pairwise cosine over TF-IDF weighted character 3-grams. Returns the full
 * N×N matrix (diagonal = 1). Parity target with the reference metric: a
 * healthy 31-page batch measured avg pairwise ≈ 0.43, max ≈ 0.72.
 */
export function similarityMatrix(texts: string[]): number[][] {
  const n = texts.length;
  const tfs = texts.map(t => charNgrams(t));
  const df = new Map<string, number>();
  for (const tf of tfs) for (const gram of tf.keys()) df.set(gram, (df.get(gram) ?? 0) + 1);
  const idf = (gram: string) => Math.log((n + 1) / ((df.get(gram) ?? 0) + 1)) + 1;

  const vectors = tfs.map(tf => {
    const v = new Map<string, number>();
    let normSq = 0;
    for (const [gram, count] of tf) {
      const w = count * idf(gram);
      v.set(gram, w);
      normSq += w * w;
    }
    return { v, norm: Math.sqrt(normSq) };
  });

  const sim = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    sim[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const [small, large] = vectors[i].v.size <= vectors[j].v.size
        ? [vectors[i], vectors[j]] : [vectors[j], vectors[i]];
      let dot = 0;
      for (const [gram, w] of small.v) {
        const w2 = large.v.get(gram);
        if (w2 !== undefined) dot += w * w2;
      }
      const denom = vectors[i].norm * vectors[j].norm;
      sim[i][j] = sim[j][i] = denom === 0 ? 0 : dot / denom;
    }
  }
  return sim;
}

/** First-sentence opening key used by the phrase_frequency gate. */
function openingKey(intro: string, tokens = 6): string {
  const firstSentence = intro.split(/(?<=[.!?…])\s/)[0] ?? intro;
  return firstSentence.toLowerCase().normalize('NFC')
    .replace(/[\d]+/g, '#')            // "số chủ đạo 7" and "… 4" stamp alike
    .replace(/[^\p{L}#\s]/gu, '')
    .split(/\s+/).filter(Boolean).slice(0, tokens).join(' ');
}

export interface BatchItem {
  id: string;
  output: Record<string, unknown>;
}

export interface BatchGateResult {
  similarity: number | null;   // max pairwise cosine vs the rest of the batch
  gates: GateResult[];
}

/**
 * Run all batch-scope gates over a job's generated items. Called by
 * prose-admin after the generate loop drains, before review/publish; results
 * are merged into each item's validation + similarity columns.
 */
export function runBatchGates(
  items: BatchItem[],
  guards: Record<string, any>,
): Map<string, BatchGateResult> {
  const out = new Map<string, BatchGateResult>();
  if (items.length === 0) return out;

  const simCfg = guards.similarity;
  const freqCfg = guards.phrase_frequency;
  const maxPairwise: number = simCfg?.max_pairwise ?? 0.55;
  const maxShared: number = freqCfg?.max_shared ?? 2;

  const sim = simCfg !== undefined && items.length > 1
    ? similarityMatrix(items.map(it => proseOf(it.output)))
    : null;

  const openings = new Map<string, number>();
  if (freqCfg !== undefined) {
    for (const it of items) {
      const key = openingKey(String(it.output.intro ?? ''));
      if (key) openings.set(key, (openings.get(key) ?? 0) + 1);
    }
  }

  items.forEach((it, i) => {
    const gates: GateResult[] = [];
    let maxSim: number | null = null;

    if (sim !== null) {
      maxSim = Math.max(...sim[i].filter((_, j) => j !== i));
      gates.push({
        gate: 'similarity',
        severity: (simCfg?.severity === 'fail' ? 'fail' : 'flag'),
        passed: maxSim <= maxPairwise,
        detail: maxSim > maxPairwise
          ? `max pairwise cosine ${maxSim.toFixed(3)} > ${maxPairwise}` : undefined,
      });
    }

    if (freqCfg !== undefined) {
      const key = openingKey(String(it.output.intro ?? ''));
      const shared = key ? (openings.get(key) ?? 0) : 0;
      gates.push({
        gate: 'phrase_frequency',
        severity: (freqCfg?.severity === 'fail' ? 'fail' : 'flag'),
        passed: shared <= maxShared,
        detail: shared > maxShared
          ? `opening "${key}" shared by ${shared} items (max ${maxShared})` : undefined,
      });
    }

    out.set(it.id, { similarity: maxSim, gates });
  });

  return out;
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
