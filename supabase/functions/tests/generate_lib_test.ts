/**
 * prose-generate lib tests. The template fixture is the REAL sochumenh seed,
 * so a seed/schema drift breaks these tests, not production.
 */

import { assert, assertEquals, assertMatch, assertThrows } from './_assert.ts';
import {
  buildComboInput,
  buildItemLlmRequest,
  bumpMaxTokens,
  coerceToSchema,
  collectBatchJob,
  constraintNotes,
  dryRunTemplate,
  estimateOutputTokens,
  fillTemplate,
  finalizeItemFromLlm,
  gateFaqShape,
  generateItem,
  isDegenerate,
  llmResultFromBatchMessage,
  sizedMaxTokens,
  submitBatchJob,
  resolveGuards,
  reviewSampleHit,
  stripForStrict,
  validateSchema,
  type AnthropicBatchApi,
  type BatchDeps,
  type GenerateDeps,
  type ItemRow,
  type LlmResult,
  type TemplateRow,
} from '../prose-generate/lib.ts';
import { dataHash } from '../_shared/hash.ts';

const seed = JSON.parse(
  await Deno.readTextFile(new URL('../../../seeds/sochumenh/template.combo-so-chu-dao-su-menh.json', import.meta.url)),
);

// ── stripForStrict ───────────────────────────────────────────────────────────

Deno.test('stripForStrict removes every bound keyword strict mode rejects', () => {
  const stripped = stripForStrict(seed.output_schema) as Record<string, unknown>;
  const json = JSON.stringify(stripped);
  for (const kw of ['minItems', 'maxItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum']) {
    assert(!json.includes(`"${kw}"`), `${kw} must be stripped`);
  }
});

Deno.test('stripForStrict enforces additionalProperties:false + required on all objects', () => {
  const stripped = stripForStrict({
    type: 'object',
    properties: { a: { type: 'string' }, list: { type: 'array', minItems: 2, items: { type: 'object', properties: { x: { type: 'string' } } } } },
  }) as Record<string, any>;
  assertEquals(stripped.additionalProperties, false);
  assertEquals(stripped.required, ['a', 'list']);
  assertEquals(stripped.properties.list.items.additionalProperties, false);
  assertEquals(stripped.properties.list.items.required, ['x']);
});

Deno.test('stripForStrict does not mutate the original schema', () => {
  const before = JSON.stringify(seed.output_schema);
  stripForStrict(seed.output_schema);
  assertEquals(JSON.stringify(seed.output_schema), before);
});

// ── constraintNotes ──────────────────────────────────────────────────────────

Deno.test('constraintNotes re-issues every dropped bound as prose (ground rule 5)', () => {
  const notes = constraintNotes(seed.output_schema, seed.guards);
  assertMatch(notes, /metaDescription: 120–165 ký tự/);
  assertMatch(notes, /intro: 400–750 ký tự/);
  assertMatch(notes, /faqs: ĐÚNG 4 phần tử/);
  assertMatch(notes, /metaDescription: phải chứa \{lifePath\} và \{destiny\}/);
  assertMatch(notes, /\{linking\}/); // faq answers_must_contain token, resolved later
  assertMatch(notes, /KHÔNG dùng các cụm/);
});

Deno.test('constraintNotes is empty when there is nothing to constrain', () => {
  assertEquals(constraintNotes({ type: 'object', properties: {} }, {}), '');
});

// ── fillTemplate / resolveGuards ─────────────────────────────────────────────

const facts = buildComboInput('so-chu-dao-7-su-menh-3') as unknown as Record<string, unknown>;

Deno.test('buildComboInput computes the authoritative fact-set', () => {
  assertEquals(facts.lifePath, 7);
  assertEquals(facts.destiny, 3);
  assertEquals(facts.linking, 4);
  assertEquals(facts.maturity, 1);
  assertEquals(facts.maturitySum, 10);
  // K2: hub & sibling internal-link data
  assertEquals(facts.hub, 'so-chu-dao-7');
  assert(Array.isArray(facts.siblings) && (facts.siblings as string[]).length === 4);
  assert((facts.siblings as string[]).every((s) => /^so-chu-dao-7-su-menh-\d+$/.test(s)));
  assert(!(facts.siblings as string[]).includes('so-chu-dao-7-su-menh-3')); // excludes self
  assertThrows(() => buildComboInput('not-a-combo-key'));
});

Deno.test('fillTemplate resolves dot paths and arrays; the seed template fills completely', () => {
  const withNotes = (seed.user_template as string).replace(
    '{constraint_notes}',
    constraintNotes(seed.output_schema, seed.guards),
  );
  const prompt = fillTemplate(withNotes, facts);
  assert(prompt.includes('Số chủ đạo (đường đời): 7 — Nhà tư duy'));
  assert(prompt.includes('|7 − 3| = 4'));
  assert(prompt.includes('Quyết đoán') === false, 'no cross-number leakage');
  assert(!prompt.includes('{'), `unresolved placeholder left in prompt: ${prompt.match(/\{[^}]*\}/)?.[0]}`);
});

Deno.test('fillTemplate throws on an unknown placeholder instead of shipping it', () => {
  assertThrows(() => fillTemplate('xin chào {khongTonTai}', facts));
});

Deno.test('resolveGuards fills guard tokens so the gates stay domain-blind', () => {
  const resolved = resolveGuards(seed.guards, facts) as Record<string, any>;
  const rule = (field: string) =>
    resolved.required_mentions.rules.find((r: { field: string }) => r.field === field);
  assertEquals(rule('metaDescription').must_contain, ['7', '3']);
  assertEquals(rule('seoTitle').must_contain, ['7', '3']);
  assertEquals(rule('linkingInsight').must_contain, ['4']);
  assertEquals(resolved.faq_shape.answers_must_contain, ['4', '1']);
});

// ── coerceToSchema / validateSchema ──────────────────────────────────────────

Deno.test('coerceToSchema re-parses stringified arrays (§6.4)', () => {
  const out = coerceToSchema(
    { faqs: '[{"q":"a?","a":"b"}]', tagline: 'x' },
    { type: 'object', properties: { faqs: seed.output_schema.properties.faqs, tagline: { type: 'string' } } },
  ) as Record<string, unknown>;
  assert(Array.isArray(out.faqs));
  assertEquals((out.faqs as unknown[]).length, 1);
  assertEquals(out.tagline, 'x');
});

Deno.test('validateSchema flags missing/extra/mistyped fields', () => {
  const good = validItem();
  assertEquals(validateSchema(good, seed.output_schema), []);
  const { tagline: _drop, ...missing } = good;
  assert(validateSchema(missing, seed.output_schema).some((e) => e.includes('tagline')));
  assert(validateSchema({ ...good, extra: 1 }, seed.output_schema).some((e) => e.includes('extra')));
  assert(validateSchema({ ...good, faqs: 'nope' }, seed.output_schema).some((e) => e.includes('faqs')));
});

Deno.test('gateFaqShape enforces count + answer mentions', () => {
  const cfg = { count: 4, answers_must_contain: ['4', '1'] };
  assert(gateFaqShape(validItem(), cfg).passed);
  const three = validItem();
  (three.faqs as unknown[]).pop();
  assert(!gateFaqShape(three, cfg).passed);
  const noMention = validItem();
  (noMention.faqs as Array<{ a: string }>).forEach((f) => (f.a = f.a.replaceAll('4', 'bốn')));
  assert(!gateFaqShape(noMention, cfg).passed);
});

Deno.test('reviewSampleHit is deterministic and respects bounds', () => {
  assertEquals(reviewSampleHit('anything', 100), true);
  assertEquals(reviewSampleHit('anything', 0), false);
  assertEquals(reviewSampleHit('so-chu-dao-7-su-menh-3', 25), reviewSampleHit('so-chu-dao-7-su-menh-3', 25));
});

// ── generateItem orchestration with fake deps ────────────────────────────────

function validItem(): Record<string, unknown> {
  const pad = (base: string, n: number) => (base + ' bình an và sáng suốt trong hành trình. ').repeat(50).slice(0, n);
  return {
    title: 'Số chủ đạo 7 và số sứ mệnh 3',
    seoTitle: 'Số chủ đạo 7 và số sứ mệnh 3 nghĩa là gì?',
    tagline: 'Nhà tư duy 7 gặp Người sáng tạo 3 — chiều sâu gặp biểu đạt',
    metaDescription: pad('Số chủ đạo 7 và số sứ mệnh 3: chiều sâu nội tâm gặp sức biểu đạt.', 150),
    intro: pad('Người mang tổ hợp 7 và 3 sống giữa chiều sâu và biểu đạt.', 500),
    synergy: pad('Chiều sâu 7 nuôi chất liệu cho biểu đạt 3.', 400),
    tension: pad('Số 7 cần tĩnh lặng còn số 3 hướng ngoại.', 400),
    linkingInsight: pad('Chỉ số liên kết 4 nhắc bạn xây nhịp cầu kỷ luật.', 400),
    career: pad('Nghề viết, nghiên cứu, giảng dạy hợp tổ hợp này.', 400),
    love: pad('Trong tình cảm, 7 và 3 cần nhịp riêng.', 400),
    advice: pad('Hãy cho mình không gian tĩnh rồi chia sẻ.', 400),
    // v3 persuasion-arc fields (the fixture tracks the REAL seed template):
    bridge: pad('Trang này mở một góc nhìn về tổ hợp 7 và 3; bản đồ số đầy đủ mới trả lời trọn.', 300),
    cta: pad('Tra cứu bản đồ số đầy đủ của bạn trên sochumenh để đi tiếp.', 120),
    faqs: [
      { q: 'Chỉ số liên kết của tôi là bao nhiêu?', a: pad('Chỉ số liên kết của bạn là 4, nói về khoảng cách giữa hai chỉ số.', 250) },
      { q: 'Số trưởng thành nghĩa là gì?', a: pad('Số trưởng thành của bạn là 1, giai đoạn sau của cuộc đời.', 250) },
      { q: 'Tổ hợp này hợp nghề gì?', a: pad('Các nghề cần chiều sâu và biểu đạt.', 250) },
      { q: 'Tôi nên bắt đầu từ đâu?', a: pad('Bắt đầu từ việc hiểu số chủ đạo 7 của mình.', 250) },
    ],
  };
}

async function makeFakeWorld(llmOutput?: unknown, opts?: { persona?: string | null }) {
  const inputData = buildComboInput('so-chu-dao-7-su-menh-3') as unknown as Record<string, unknown>;
  const item: ItemRow = {
    id: 'item-1', site_id: 'site-1', job_id: 'job-1',
    template_key: seed.key, template_version: seed.version,
    item_key: 'so-chu-dao-7-su-menh-3',
    data_hash: await dataHash(inputData),
    input_data: inputData, output: null, status: 'pending', validation: {}, regen_count: 0,
  };
  const template: TemplateRow = {
    id: 'tpl-1', site_id: 'site-1', key: seed.key, version: seed.version,
    system_prompt: seed.system_prompt, user_template: seed.user_template,
    output_schema: seed.output_schema, few_shots: [], guards: seed.guards,
    model: seed.model, temperature: seed.temperature, max_tokens: seed.max_tokens,
  };
  const calls = { llm: 0, usage: [] as Array<[number, number]>, systems: [] as string[], personaFetches: 0 };
  const deps: GenerateDeps = {
    getItem: (id) => Promise.resolve(id === item.id ? { ...item } : null),
    getTemplate: () => Promise.resolve(template),
    getSitePersona: () => { calls.personaFetches++; return Promise.resolve(opts?.persona ?? null); },
    saveResult: (it, patch) => {
      Object.assign(item, patch);
      return Promise.resolve();
    },
    addJobUsage: (_job, tin, tout, _channel?) => {
      calls.usage.push([tin, tout]);
      return Promise.resolve();
    },
    getJobReviewPct: () => Promise.resolve(0),
    llm: (req): Promise<LlmResult> => {
      calls.llm++;
      calls.systems.push(req.system);
      return Promise.resolve({ output: llmOutput ?? validItem(), tokensIn: 1200, tokensOut: 900 });
    },
  };
  return { deps, item, template, calls };
}

Deno.test('generateItem: clean output → status generated, gates recorded', async () => {
  const { deps, item, calls } = await makeFakeWorld();
  const res = await generateItem(deps, { item_id: 'item-1' });
  assertEquals(res.ok, true);
  assertEquals(res.status, 'generated');
  assertEquals(res.cached, false);
  assertEquals(calls.llm, 1);
  assertEquals(item.status, 'generated');
  const gates = (item.validation as { gates: Array<{ gate: string; passed: boolean }> }).gates;
  for (const g of ['schema', 'unicode', 'length', 'required_mentions', 'banned_phrases', 'numeric_consistency', 'faq_shape']) {
    assert(gates.some((x) => x.gate === g), `gate ${g} ran`);
  }
  assert(gates.every((g) => g.passed), JSON.stringify(gates.filter((g) => !g.passed)));
});

Deno.test('generateItem: cache hit spends ZERO LLM tokens (acceptance, WP2)', async () => {
  const { deps, calls } = await makeFakeWorld();
  await generateItem(deps, { item_id: 'item-1' });
  const second = await generateItem(deps, { item_id: 'item-1' });
  assertEquals(second.cached, true);
  assertEquals(calls.llm, 1, 'second call must not touch the LLM');
});

Deno.test('generateItem: mode=regenerate bypasses the cache and bumps regen_count', async () => {
  const { deps, item, calls } = await makeFakeWorld();
  await generateItem(deps, { item_id: 'item-1' });
  const res = await generateItem(deps, { item_id: 'item-1', mode: 'regenerate' });
  assertEquals(res.cached, false);
  assertEquals(calls.llm, 2);
  assertEquals(item.regen_count, 1);
});

Deno.test('generateItem: numeric_consistency rejects a number with no basis (acceptance, WP2)', async () => {
  const bad = validItem();
  bad.advice = (bad.advice as string).slice(0, 300) + ' Con số 8 sẽ mang lại may mắn.'; // 8 ∉ computed
  const { deps, item } = await makeFakeWorld(bad);
  const res = await generateItem(deps, { item_id: 'item-1' });
  assertEquals(res.status, 'failed_validation');
  const gates = (item.validation as { gates: Array<{ gate: string; passed: boolean; detail?: string }> }).gates;
  const nc = gates.find((g) => g.gate === 'numeric_consistency')!;
  assertEquals(nc.passed, false);
  assertMatch(nc.detail ?? '', /8/);
});

Deno.test('generateItem: schema violation → failed_validation even after coercion', async () => {
  const bad = validItem();
  delete (bad as Record<string, unknown>).tagline;
  const { deps } = await makeFakeWorld(bad);
  const res = await generateItem(deps, { item_id: 'item-1' });
  assertEquals(res.status, 'failed_validation');
});

Deno.test('generateItem: review sample forces flagged status', async () => {
  const { deps } = await makeFakeWorld();
  deps.getJobReviewPct = () => Promise.resolve(100);
  const res = await generateItem(deps, { item_id: 'item-1' });
  assertEquals(res.status, 'flagged');
});

Deno.test('generateItem: few-shot for the combo being generated is excluded', async () => {
  const { deps, template } = await makeFakeWorld();
  template.few_shots = [
    { item_key: 'so-chu-dao-7-su-menh-3', output: { tagline: 'LEAK-SELF' } },
    { item_key: 'so-chu-dao-1-su-menh-5', output: { tagline: 'KEEP-OTHER' } },
  ];
  let seenSystem = '';
  const innerLlm = deps.llm;
  deps.llm = (req) => {
    seenSystem = req.system;
    return innerLlm(req);
  };
  await generateItem(deps, { item_id: 'item-1' });
  assert(!seenSystem.includes('LEAK-SELF'), 'self few-shot must be excluded');
  assert(seenSystem.includes('KEEP-OTHER'), 'other-combo few-shot kept');
});

Deno.test('generateItem: prompt contains resolved constraint notes, no leftover tokens', async () => {
  const { deps } = await makeFakeWorld();
  let prompt = '';
  const innerLlm = deps.llm;
  deps.llm = (req) => {
    prompt = req.userPrompt;
    return innerLlm(req);
  };
  await generateItem(deps, { item_id: 'item-1' });
  assertMatch(prompt, /RÀNG BUỘC/);
  assertMatch(prompt, /metaDescription: phải chứa 7 và 3/);
  assert(!prompt.includes('{'), 'no unresolved placeholders');
});

Deno.test('buildItemLlmRequest: returns model, system, userPrompt, toolSchema', async () => {
  const { template } = await makeFakeWorld();
  const inputData = buildComboInput('so-chu-dao-7-su-menh-3') as unknown as Record<string, unknown>;
  const req = buildItemLlmRequest({ item_key: 'so-chu-dao-7-su-menh-3', input_data: inputData }, template);
  assertEquals(req.model, template.model);
  assert(req.system.length > 0);
  assertMatch(req.userPrompt, /RÀNG BUỘC/);
  assertEquals(typeof req.toolSchema, 'object');
  // P3: max_tokens is auto-sized to the schema's length floor, never below the
  // template's own value, and an explicit override wins.
  assert(req.maxTokens >= template.max_tokens);
  const override = buildItemLlmRequest(
    { item_key: 'so-chu-dao-7-su-menh-3', input_data: inputData }, template, { maxTokensOverride: 9999 },
  );
  assertEquals(override.maxTokens, 9999);
});

Deno.test('P3: sizedMaxTokens floors on schema length bounds, never below template', async () => {
  const { template } = await makeFakeWorld();
  assert(estimateOutputTokens(template) > 0);
  assert(sizedMaxTokens(template) >= template.max_tokens);
  // Audit fix: an explicit max_tokens above the 16000 cap is honored, not lowered.
  assertEquals(sizedMaxTokens({ ...template, max_tokens: 20000 }), 20000);
});

Deno.test('P1: bumpMaxTokens increases but never lowers', () => {
  assert(bumpMaxTokens(4500) > 4500);
  assertEquals(bumpMaxTokens(20000), 20000); // already above cap → unchanged, not shrunk
});

Deno.test('P1: isDegenerate catches stub shells, unresolved tokens, duplicate shells; passes real content', () => {
  assert(isDegenerate({ a: 'placeholder', b: 'placeholder', c: 'placeholder' })); // ≥2 stubs
  assert(isDegenerate({ a: 'nội dung {lifePath} lỗi', b: 'x', c: 'y', d: 'z' }));  // leaked token
  assert(isDegenerate({ a: 'trùng', b: 'trùng', c: 'trùng', d: 'trùng' }));        // near-identical shell
  assert(isDegenerate({}));                                                         // no strings
  assert(!isDegenerate({
    a: 'Một đoạn văn hoàn chỉnh và thật', b: 'Một đoạn khác hẳn về nội dung',
    c: 'Nội dung phong phú thứ ba', d: 'Và một đoạn rất đa dạng nữa',
  }));
});

Deno.test('llmResultFromBatchMessage: parses emit_content tool_use + usage', () => {
  const out = validItem();
  const llm = llmResultFromBatchMessage({
    content: [{ type: 'tool_use', name: 'emit_content', input: out }],
    usage: { input_tokens: 100, output_tokens: 200 },
  });
  assert(llm);
  assertEquals(llm!.tokensIn, 100);
  assertEquals(llm!.tokensOut, 200);
  assertEquals((llm!.output as { tagline: string }).tagline, out.tagline);
});

Deno.test('finalizeItemFromLlm: batch channel sets usage_channel on save', async () => {
  const { deps, item, template } = await makeFakeWorld();
  await finalizeItemFromLlm(deps, item, template, { output: validItem(), tokensIn: 50, tokensOut: 30 }, {
    usageChannel: 'batch',
  });
  assertEquals(item.status, 'generated');
  assertEquals((item as ItemRow & { usage_channel?: string }).usage_channel, 'batch');
});

// ── Anthropic Message Batches (submit / collect / P1 batch-aware retry) ───────

async function makeBatchWorld(opts: {
  batchId?: string | null;
  status?: string;
  results?: Array<{ custom_id: string; result: Record<string, unknown> }>;
  persona?: string | null;
} = {}) {
  const inputData = buildComboInput('so-chu-dao-7-su-menh-3') as unknown as Record<string, unknown>;
  const item: ItemRow = {
    id: 'item-b1', site_id: 'site-1', job_id: 'job-1',
    template_key: seed.key, template_version: seed.version,
    item_key: 'so-chu-dao-7-su-menh-3',
    data_hash: await dataHash(inputData),
    input_data: inputData, output: null, status: 'pending', validation: {}, regen_count: 0,
  };
  const template: TemplateRow = {
    id: 'tpl-1', site_id: 'site-1', key: seed.key, version: seed.version,
    system_prompt: seed.system_prompt, user_template: seed.user_template,
    output_schema: seed.output_schema, few_shots: [], guards: seed.guards,
    model: seed.model, temperature: seed.temperature, max_tokens: seed.max_tokens,
  };
  const job: Record<string, unknown> = {
    id: 'job-1', mode: 'generate', anthropic_batch_id: opts.batchId ?? null, batch_status: null,
  };
  const calls = { create: 0, retry: [] as string[], failure: [] as string[], usage: [] as Array<[number, number, string?]>, personaFetches: 0 };
  const batchApi: AnthropicBatchApi = {
    create: (_reqs) => { calls.create++; return Promise.resolve({ id: 'batch-1' }); },
    retrieve: (_id) => Promise.resolve({ processing_status: opts.status ?? 'ended', request_counts: { succeeded: 1 } }),
    // deno-lint-ignore require-yield
    results: async function* (_id) { for (const r of (opts.results ?? [])) yield r as never; },
  };
  const deps: BatchDeps = {
    getItem: (id) => Promise.resolve(id === item.id ? { ...item } : null),
    getTemplate: () => Promise.resolve(template),
    getSitePersona: () => { calls.personaFetches++; return Promise.resolve(opts.persona ?? null); },
    saveResult: (_it, patch) => { Object.assign(item, patch); return Promise.resolve(); },
    addJobUsage: (_j, tin, tout, ch) => { calls.usage.push([tin, tout, ch]); return Promise.resolve(); },
    getJobReviewPct: () => Promise.resolve(0),
    llm: () => Promise.reject(new Error('llm must not be called on the batch path')),
    getJob: () => Promise.resolve(job as never),
    listPendingItems: () => Promise.resolve(item.status === 'pending' ? [{ ...item }] : []),
    countPending: () => Promise.resolve(item.status === 'pending' ? 1 : 0),
    updateJobBatch: (_j, patch) => { Object.assign(job, patch); return Promise.resolve(); },
    noteBatchFailure: (_it, err) => { calls.failure.push(err); return Promise.resolve(); },
    noteBatchRetry: (it, detail) => {
      const prev = Number((it.validation as { gen_retry?: unknown } | null)?.gen_retry ?? 0);
      item.validation = { ...(item.validation ?? {}), gen_retry: prev + 1, retry_note: detail };
      calls.retry.push(detail);
      return Promise.resolve();
    },
  };
  return { item, template, job, deps, batchApi, calls };
}

function batchResult(input: unknown, stopReason: string) {
  return {
    custom_id: 'item-b1',
    result: {
      type: 'succeeded',
      message: {
        content: [{ type: 'tool_use', name: 'emit_content', input }],
        usage: { input_tokens: 1000, output_tokens: 900 },
        stop_reason: stopReason,
      },
    },
  };
}

Deno.test('submitBatchJob submits pending items and marks the job in batch channel', async () => {
  const w = await makeBatchWorld({ batchId: null });
  const res = await submitBatchJob(w.deps, w.batchApi, (r) => r, 'job-1');
  assertEquals(res.ok, true);
  assertEquals(res.request_count, 1);
  assertEquals(res.batch_id, 'batch-1');
  assertEquals(w.calls.create, 1);
  assertEquals(w.job.anthropic_batch_id, 'batch-1');
  assertEquals(w.job.run_channel, 'batch');
});

Deno.test('collectBatchJob finalizes a clean succeeded result', async () => {
  const w = await makeBatchWorld({ batchId: 'batch-1', results: [batchResult(validItem(), 'end_turn')] });
  const res = await collectBatchJob(w.deps, w.batchApi, 'job-1');
  assertEquals(res.ok, true);
  assertEquals(res.processed, 1);
  assertEquals(w.item.status, 'generated');
  assertEquals(w.calls.retry.length, 0);
  assertEquals(w.job.anthropic_batch_id, null); // batch cleared after collect
});

Deno.test('P1 batch: a truncated succeeded result is re-queued once, then finalized', async () => {
  // stop_reason=max_tokens with otherwise-valid content → truncated, not degenerate.
  const w = await makeBatchWorld({ batchId: 'batch-1', results: [batchResult(validItem(), 'max_tokens')] });
  await collectBatchJob(w.deps, w.batchApi, 'job-1');
  // Not finalized: still pending, gen_retry bumped, wasted attempt billed to the job.
  assertEquals(w.item.status, 'pending');
  assertEquals((w.item.validation as { gen_retry?: number }).gen_retry, 1);
  assertEquals(w.calls.retry.length, 1);
  assert(w.calls.usage.some((u) => u[2] === 'batch'), 'wasted attempt billed on the batch channel');

  // Re-submit sets a new batch id; second collect must NOT retry again (cap 1) → finalize.
  w.job.anthropic_batch_id = 'batch-2';
  await collectBatchJob(w.deps, w.batchApi, 'job-1');
  assertEquals(w.calls.retry.length, 1);       // no second retry
  assert(w.item.status !== 'pending', 'finalized on the capped retry');
});

// ── Site persona / doctrine layer ─────────────────────────────────────────────

Deno.test('persona: prepended before the template prompt and few-shots; null/empty → byte-identical (release gate)', async () => {
  const { template } = await makeFakeWorld();
  const inputData = buildComboInput('so-chu-dao-7-su-menh-3') as unknown as Record<string, unknown>;
  const item = { item_key: 'so-chu-dao-7-su-menh-3', input_data: inputData };
  const tplWithShots: TemplateRow = { ...template, few_shots: [{ item_key: 'so-chu-dao-1-su-menh-5', output: { intro: 'ví dụ' } }] };

  const doctrine = 'DOCTRINE: gọi tên vấn đề của người đọc; định vị sochumenh là lời giải.';
  const withPersona = buildItemLlmRequest(item, tplWithShots, { persona: doctrine });
  assert(withPersona.system.startsWith(doctrine + '\n\n'), 'persona leads the system prompt');
  assert(withPersona.system.indexOf(doctrine) < withPersona.system.indexOf('VÍ DỤ THAM KHẢO'), 'persona precedes few-shots');

  // Release gate: absent/null/empty persona are all byte-identical to the pre-persona build.
  const base = buildItemLlmRequest(item, tplWithShots);
  assertEquals(buildItemLlmRequest(item, tplWithShots, { persona: null }).system, base.system);
  assertEquals(buildItemLlmRequest(item, tplWithShots, { persona: '' }).system, base.system);
  assertEquals(buildItemLlmRequest(item, tplWithShots, { persona: '   ' }).system, base.system);
  assert(base.system.startsWith(tplWithShots.system_prompt.slice(0, 40)));
});

Deno.test('persona: generateItem fetches once, applies to BOTH attempts of a P1 retry, stamps persona_hash', async () => {
  const doctrine = 'DOCTRINE: luôn nối vấn đề với giải pháp.';
  const w = await makeFakeWorld(undefined, { persona: doctrine });
  // First call truncates → P1 retry; both systems must carry the doctrine.
  let call = 0;
  w.deps.llm = (req): Promise<LlmResult> => {
    call++;
    w.calls.systems.push(req.system);
    return Promise.resolve(call === 1
      ? { output: validItem(), tokensIn: 100, tokensOut: 4500, stopReason: 'max_tokens' }
      : { output: validItem(), tokensIn: 100, tokensOut: 900 });
  };
  const res = await w.deps.getItem('item-1');
  assert(res);
  const out = await generateItem(w.deps, { item_id: 'item-1' });
  assertEquals(out.ok, true);
  assertEquals(w.calls.systems.length, 2);
  assert(w.calls.systems.every((s) => s.startsWith(doctrine)), 'persona on initial AND retry build');
  assertEquals(w.calls.personaFetches, 1, 'fetched once per invocation');
  const validation = w.item.validation as { persona_hash?: string };
  assertEquals(typeof validation.persona_hash, 'string');
  assertEquals(validation.persona_hash!.length, 12);
});

Deno.test('persona: no-persona site stamps nothing (validation has no persona_hash)', async () => {
  const w = await makeFakeWorld();
  await generateItem(w.deps, { item_id: 'item-1' });
  assertEquals((w.item.validation as { persona_hash?: string }).persona_hash, undefined);
});

Deno.test('persona: batch submit applies it per item and caches the fetch', async () => {
  const doctrine = 'DOCTRINE: mỗi trang thuyết phục đúng một hành trình.';
  const w = await makeBatchWorld({ batchId: null, persona: doctrine });
  const captured: string[] = [];
  const res = await submitBatchJob(w.deps, w.batchApi, (r) => { captured.push((r as { system: string }).system); return r; }, 'job-1');
  assertEquals(res.ok, true);
  assertEquals(captured.length, 1);
  assert(captured[0].startsWith(doctrine), 'batch request system carries the persona');
  assertEquals(w.calls.personaFetches, 1);
});

Deno.test('persona: dry-run applies req.persona without any DB dep', async () => {
  const { template } = await makeFakeWorld();
  const systems: string[] = [];
  const llm = (req: { system: string }): Promise<LlmResult> => {
    systems.push(req.system);
    return Promise.resolve({ output: validItem(), tokensIn: 10, tokensOut: 10 });
  };
  const inputData = buildComboInput('so-chu-dao-7-su-menh-3') as unknown as Record<string, unknown>;
  const res = await dryRunTemplate({ llm } as Pick<GenerateDeps, 'llm'>, {
    template, input_data: inputData, item_key: 'so-chu-dao-7-su-menh-3', persona: 'DOCTRINE dry-run.',
  });
  assertEquals(res.ok, true);
  assert(systems[0].startsWith('DOCTRINE dry-run.'));
});
