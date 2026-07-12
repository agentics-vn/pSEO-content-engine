/**
 * prose-generate lib tests. The template fixture is the REAL sochumenh seed,
 * so a seed/schema drift breaks these tests, not production.
 */

import { assert, assertEquals, assertMatch, assertThrows } from './_assert.ts';
import {
  buildComboInput,
  buildItemLlmRequest,
  coerceToSchema,
  constraintNotes,
  estimateOutputTokens,
  fillTemplate,
  finalizeItemFromLlm,
  gateFaqShape,
  generateItem,
  isDegenerate,
  llmResultFromBatchMessage,
  sizedMaxTokens,
  resolveGuards,
  reviewSampleHit,
  stripForStrict,
  validateSchema,
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
    faqs: [
      { q: 'Chỉ số liên kết của tôi là bao nhiêu?', a: pad('Chỉ số liên kết của bạn là 4, nói về khoảng cách giữa hai chỉ số.', 250) },
      { q: 'Số trưởng thành nghĩa là gì?', a: pad('Số trưởng thành của bạn là 1, giai đoạn sau của cuộc đời.', 250) },
      { q: 'Tổ hợp này hợp nghề gì?', a: pad('Các nghề cần chiều sâu và biểu đạt.', 250) },
      { q: 'Tôi nên bắt đầu từ đâu?', a: pad('Bắt đầu từ việc hiểu số chủ đạo 7 của mình.', 250) },
    ],
  };
}

async function makeFakeWorld(llmOutput?: unknown) {
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
  const calls = { llm: 0, usage: [] as Array<[number, number]> };
  const deps: GenerateDeps = {
    getItem: (id) => Promise.resolve(id === item.id ? { ...item } : null),
    getTemplate: () => Promise.resolve(template),
    saveResult: (it, patch) => {
      Object.assign(item, patch);
      return Promise.resolve();
    },
    addJobUsage: (_job, tin, tout, _channel?) => {
      calls.usage.push([tin, tout]);
      return Promise.resolve();
    },
    getJobReviewPct: () => Promise.resolve(0),
    llm: (_req): Promise<LlmResult> => {
      calls.llm++;
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
