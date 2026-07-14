/** Table-driven tests for the generic gate module (per-item + batch scope). */

import { assert, assertEquals, assertMatch } from './_assert.ts';
import {
  gateBannedPhrases,
  gateEntityConsistency,
  gateKeywordDensity,
  gateLength,
  gateNumericConsistency,
  gateRequiredMentions,
  gateUnicode,
  hasFailingGate,
  proseOf,
  runBatchGates,
  runItemGates,
  similarityMatrix,
  type GateContext,
} from '../_shared/gates/index.ts';

const baseCtx = (over: Partial<GateContext>): GateContext => ({
  output: {},
  guards: {},
  computed: {},
  ...over,
});

// ── Per-item gates: one passing case + one crafted to trip each gate ─────────

Deno.test('gateUnicode passes NFC, trips NFD', () => {
  const nfd = 'só chủ đạo'; // "só" decomposed
  assert(gateUnicode(baseCtx({ output: { a: 'số chủ đạo' }, guards: { unicode: { form: 'NFC' } } })).passed);
  const r = gateUnicode(baseCtx({ output: { a: nfd }, guards: { unicode: { form: 'NFC' } } }));
  assertEquals(r.passed, false);
});

Deno.test('gateLength counts code points and trips out-of-bounds fields', () => {
  const guards = { length: { fields: { intro: [5, 10] } } };
  assert(gateLength(baseCtx({ output: { intro: 'đúng bảy à' }, guards })).passed); // 10 code points
  assertEquals(gateLength(baseCtx({ output: { intro: 'ngắn' }, guards })).passed, false);
  assertEquals(gateLength(baseCtx({ output: {}, guards })).passed, false); // missing = violation
});

Deno.test('gateLength hard-fails under-min/missing, soft-flags over-max', () => {
  const guards = { length: { fields: { intro: [5, 10] } } };
  // under min → blocking fail
  const under = gateLength(baseCtx({ output: { intro: 'ngắn' }, guards }));
  assertEquals(under.passed, false);
  assertEquals(under.severity, 'fail');
  // missing field → blocking fail
  assertEquals(gateLength(baseCtx({ output: {}, guards })).severity, 'fail');
  // over max only → non-blocking flag (overshoot surfaces to review, never blocks approve)
  const over = gateLength(baseCtx({ output: { intro: 'mười một kýy' }, guards })); // 12 code points > 10
  assertEquals(over.passed, false);
  assertEquals(over.severity, 'flag');
  // a mix of over-max and under-min stays a hard fail
  const mixGuards = { length: { fields: { a: [5, 10], b: [5, 10] } } };
  const mix = gateLength(baseCtx({ output: { a: 'quá dài mười hai', b: 'ít' }, guards: mixGuards }));
  assertEquals(mix.severity, 'fail');
});

Deno.test('guards.length.severity governs the hard direction only — never re-promotes over-max', () => {
  // Regression: sochumenh's golden run — templates declare severity 'fail' and
  // runItemGates used to blanket-override the gate result, turning over-max-only
  // items (career 655>650, …) into blocking failed_validation.
  const guards = { length: { severity: 'fail', fields: { intro: [5, 10] } } };
  const overOnly = runItemGates(baseCtx({ output: { intro: 'mười một kýy' }, guards })) // 12 > 10
    .find((r) => r.gate === 'length')!;
  assertEquals(overOnly.passed, false);
  assertEquals(overOnly.severity, 'flag'); // over-max stays non-blocking despite severity: 'fail'
  const underStillFails = runItemGates(baseCtx({ output: { intro: 'ngắn' }, guards }))
    .find((r) => r.gate === 'length')!;
  assertEquals(underStillFails.severity, 'fail');
  // severity 'flag' opts the hard direction down too (tenant data wins there)
  const softGuards = { length: { severity: 'flag', fields: { intro: [5, 10] } } };
  const underSoft = gateLength(baseCtx({ output: { intro: 'ngắn' }, guards: softGuards }));
  assertEquals(underSoft.severity, 'flag');
});

Deno.test('gateLength bounds array elements via field.N (ngaylanhthangtot)', () => {
  const guards = { length: { fields: { 'phanTich.0': [3, 10], 'phanTich.1': [3, 10] } } };
  assert(gateLength(baseCtx({ output: { phanTich: ['bốn từ', 'sáu ký tự'] }, guards })).passed); // 6 & 9 ∈ [3,10]
  // second element too long → trips
  assertEquals(gateLength(baseCtx({ output: { phanTich: ['ok đây', 'quá dài đây rồi'] }, guards })).passed, false);
  // not an array (or missing index) → missing violation, not a crash
  assertEquals(gateLength(baseCtx({ output: { phanTich: 'chuỗi' }, guards })).passed, false);
});

Deno.test('gateRequiredMentions ci flag matches across Vietnamese casing; default stays case-sensitive', () => {
  // "số chủ đạo 7" resolved from {searchKeyword} — seoTitle uses Title Case.
  const output = { seoTitle: 'Số Chủ Đạo 7 Là Gì? Ý Nghĩa Nhà Tư Duy' };
  const ciGuards = { required_mentions: { rules: [{ field: 'seoTitle', must_contain: ['số chủ đạo 7'], ci: true }] } };
  assert(gateRequiredMentions(baseCtx({ output, guards: ciGuards })).passed);
  // without ci the same rule fails — documents the case-sensitive default
  const csGuards = { required_mentions: { rules: [{ field: 'seoTitle', must_contain: ['số chủ đạo 7'] }] } };
  const cs = gateRequiredMentions(baseCtx({ output, guards: csGuards }));
  assertEquals(cs.passed, false);
  // ci still fails when the phrase is genuinely absent
  const missing = gateRequiredMentions(baseCtx({ output: { seoTitle: 'Con Số 7 Trong Thần Số Học' }, guards: ciGuards }));
  assertEquals(missing.passed, false);
});

Deno.test('gateKeywordDensity counts phrases case-insensitively and enforces min_count', () => {
  const guards = { keyword_density: { keywords: ['số chủ đạo 7'], min_count: 2, fields: ['meaning', 'career'] } };
  // 2 occurrences across the scanned fields (mixed casing, extra whitespace) → passes
  const ok = gateKeywordDensity(baseCtx({ output: {
    meaning: 'Số chủ đạo  7 mở ra một hành trình.',
    career: 'Với số chủ đạo 7, môi trường nghiên cứu phù hợp.',
    title: 'không được quét vì fields giới hạn',
  }, guards }));
  assert(ok.passed);
  // only 1 occurrence → under-used
  const under = gateKeywordDensity(baseCtx({ output: {
    meaning: 'Số chủ đạo 7 mở ra một hành trình.',
    career: 'Con số này hợp môi trường nghiên cứu.',
  }, guards }));
  assertEquals(under.passed, false);
  assert(under.detail?.includes('min 2'));
  assertEquals(under.severity, 'flag');
});

Deno.test('gateKeywordDensity trips stuffing over max_density and scans whole prose by default', () => {
  // 3-word phrase ×3 in a 12-word text → density 9/12 = 75% > 10%
  const stuffed = gateKeywordDensity(baseCtx({
    output: { a: 'số chủ đạo 7 là số chủ đạo 7 của số chủ đạo 7', faqs: [{ q: 'x', a: 'y z' }] },
    guards: { keyword_density: { keywords: ['số chủ đạo 7'], max_density: 0.1 } },
  }));
  assertEquals(stuffed.passed, false);
  assert(stuffed.detail?.includes('density'));
  // no fields config → nested strings (faq answers) count toward totalWords
  // empty keywords → documented no-op
  assert(gateKeywordDensity(baseCtx({ output: { a: 'bất kỳ' }, guards: { keyword_density: { keywords: [] } } })).passed);
  // opt-in: absent from guards → runItemGates omits it entirely
  const results = runItemGates(baseCtx({ output: { a: 'văn bản' }, guards: { unicode: {} } }));
  assertEquals(results.find((r) => r.gate === 'keyword_density'), undefined);
  // severity override via guards (tenant data)
  const failSev = runItemGates(baseCtx({
    output: { a: 'không có cụm nào' },
    guards: { keyword_density: { severity: 'fail', keywords: ['số chủ đạo 7'], min_count: 1 } },
  })).find((r) => r.gate === 'keyword_density')!;
  assertEquals(failSev.severity, 'fail');
  assertEquals(failSev.passed, false);
});

Deno.test('gateEntityConsistency flags invented entities, passes backed ones', () => {
  const canChi = String.raw`(Giáp|Ất|Bính|Đinh|Mậu|Kỷ|Canh|Tân|Nhâm|Quý)\s+(Tý|Sửu|Dần|Mão|Thìn|Tỵ|Ngọ|Mùi|Thân|Dậu|Tuất|Hợi)`;
  const guards = { entity_consistency: { pattern: canChi, allowed: ['Giáp Tý', 'tuổi Bính Dần xung'] } };
  // only entities present in allowed → passes
  assert(gateEntityConsistency(baseCtx({ output: { a: 'Ngày Giáp Tý, xung với tuổi Bính Dần.' }, guards })).passed);
  // model invents "Kỷ Dậu" (not in input_data) → fails
  const bad = gateEntityConsistency(baseCtx({ output: { a: 'Ngày Giáp Tý hợp với Kỷ Dậu.' }, guards }));
  assertEquals(bad.passed, false);
  assert(bad.detail?.includes('Kỷ Dậu'));
  // note-only config (no pattern) is a documented no-op → passes
  assert(gateEntityConsistency(baseCtx({ output: { a: 'bất kỳ' }, guards: { entity_consistency: { note: 'reviewer: check can-chi' } } })).passed);
  // gate is opt-in: absent from guards → runItemGates omits it
  assertEquals(
    runItemGates(baseCtx({ output: { a: 'x' }, guards: {} })).some((g) => g.gate === 'entity_consistency'),
    false,
  );
});

Deno.test('gateRequiredMentions trips when a resolved token is absent', () => {
  const guards = { required_mentions: { rules: [{ field: 'meta', must_contain: ['7', '3'] }] } };
  assert(gateRequiredMentions(baseCtx({ output: { meta: 'số 7 và số 3' }, guards })).passed);
  assertEquals(gateRequiredMentions(baseCtx({ output: { meta: 'số bảy và ba' }, guards })).passed, false);
});

Deno.test('gateBannedPhrases is case-insensitive', () => {
  const guards = { banned_phrases: { list: ['đảm bảo'] } };
  assert(gateBannedPhrases(baseCtx({ output: { a: 'nội dung tham khảo' }, guards })).passed);
  assertEquals(gateBannedPhrases(baseCtx({ output: { a: 'Chúng tôi ĐẢM BẢO kết quả' }, guards })).passed, false);
});

Deno.test('gateNumericConsistency allows computed numbers, trips unbacked ones', () => {
  const computed = { lifePath: 7, destiny: 3, linking: 4, maturity: 1, maturitySum: 10 };
  assert(gateNumericConsistency(baseCtx({ output: { a: 'số 7 và 3, liên kết 4, 7 + 3 = 10 → 1' }, computed })).passed);
  const r = gateNumericConsistency(baseCtx({ output: { a: 'con số 8 mang tài lộc' }, computed }));
  assertEquals(r.passed, false);
  assert(r.detail!.includes('8'));
});

Deno.test('runItemGates only runs configured gates and honors severity overrides', () => {
  const results = runItemGates(baseCtx({
    output: { a: 'x' },
    guards: { unicode: { form: 'NFC' }, numeric_consistency: { severity: 'flag' } },
    computed: {},
  }));
  assertEquals(results.map((r) => r.gate).sort(), ['numeric_consistency', 'unicode']);
  assertEquals(results.find((r) => r.gate === 'numeric_consistency')!.severity, 'flag');
});

Deno.test('hasFailingGate ignores failed flag-severity gates', () => {
  assert(!hasFailingGate([{ gate: 'similarity', severity: 'flag', passed: false }]));
  assert(hasFailingGate([{ gate: 'schema', severity: 'fail', passed: false }]));
});

// ── Batch gates ──────────────────────────────────────────────────────────────

const VARIED = [
  'Chiều sâu nội tâm của số 7 gặp sức sáng tạo rực rỡ của số 3, mở ra một hành trình vừa trầm lắng vừa bay bổng, nơi trực giác dẫn lối cho ngôn từ.',
  'Kỷ luật thép của số 4 là nền móng để tham vọng số 8 xây thành quả lớn; tổ hợp này ưa việc khó, càng áp lực càng vững vàng và bền bỉ theo năm tháng.',
  'Tự do là hơi thở của số 5, còn số 9 sống vì điều lớn lao hơn bản thân; khi hai dòng năng lượng này gặp nhau, những chuyến đi mang theo lý tưởng.',
];

Deno.test('similarityMatrix: near-duplicates score high, varied prose scores low', () => {
  const dupA = 'Người mang số chủ đạo 7 và số sứ mệnh 3 có chiều sâu nội tâm và khả năng biểu đạt phong phú trong cuộc sống hằng ngày.';
  const dupB = 'Người mang số chủ đạo 7 và số sứ mệnh 3 có chiều sâu nội tâm cùng khả năng biểu đạt phong phú trong đời sống hằng ngày.';
  const sim = similarityMatrix([dupA, dupB, VARIED[1]]);
  assert(sim[0][1] > 0.8, `near-duplicates should score high, got ${sim[0][1]}`);
  assert(sim[0][2] < 0.4, `varied prose should score low, got ${sim[0][2]}`);
  assertEquals(sim[0][1], sim[1][0]); // symmetric
  assertEquals(sim[0][0], 1);
});

Deno.test('runBatchGates flags the highest-overlap pair in a same-lifePath batch (WP3 acceptance)', () => {
  // 12 combos "sharing lifePath 7": 10 genuinely varied intros, 2 near-identical.
  const variedIntros = [
    'Chiều sâu nội tâm của đường đời bảy gặp sức sáng tạo rực rỡ, mở ra hành trình vừa trầm lắng vừa bay bổng nơi trực giác dẫn lối cho ngôn từ.',
    'Có những buổi tối bạn chỉ muốn ngồi một mình với cuốn sổ tay — đó là nhịp thở tự nhiên của người thuộc nhóm tư duy, và sứ mệnh của bạn bắt đầu từ đó.',
    'Sự nghiệp với bạn không phải là chiếc thang mà là phòng thí nghiệm: mỗi câu hỏi được đào tới tận gốc rễ trước khi bước tiếp sang điều mới.',
    'Trong tình yêu, khoảng lặng không phải là xa cách; với tổ hợp này, im lặng cùng nhau chính là một dạng thân mật hiếm có mà ít ai hiểu được.',
    'Gia đình nhìn bạn như một ẩn số dịu dàng: ít nói, quan sát nhiều, nhưng khi lên tiếng thì lời nào cũng chạm đúng chỗ cần chạm.',
    'Nếu phải chọn một hình ảnh, hãy nghĩ tới ngọn hải đăng — đứng yên, soi xa, và chỉ dẫn cho những con thuyền ồn ào ngoài kia tìm được bến.',
    'Tiền bạc với nhóm năng lượng này chưa bao giờ là đích đến; nó chỉ là tấm vé cho những chuyến đi vào tri thức và trải nghiệm có chiều sâu.',
    'Bạn bè thân thiết đếm trên một bàn tay, nhưng mỗi tình bạn đều được vun như một khu vườn lâu năm, càng để lâu càng đậm vị.',
    'Thách thức lớn nhất không nằm ở thế giới bên ngoài mà ở cây cầu nối giữa suy nghĩ và lời nói — nơi bài học trưởng thành của bạn đang chờ.',
    'Người ta hay nhầm sự kín đáo với lạnh lùng; kỳ thực bên trong lớp vỏ trầm tĩnh ấy là một dòng chảy cảm hứng chưa từng ngừng nghỉ.',
  ];
  const items = Array.from({ length: 12 }, (_, i) => ({
    id: `it-${i}`,
    output: {
      intro: i < 10
        ? variedIntros[i]
        : 'Người mang số chủ đạo 7 và số sứ mệnh 3 có chiều sâu nội tâm và khả năng biểu đạt phong phú, luôn tìm ý nghĩa phía sau bề mặt của vạn vật.',
    },
  }));
  const res = runBatchGates(items, { similarity: { severity: 'flag', max_pairwise: 0.55 } });
  const dup1 = res.get('it-10')!;
  const dup2 = res.get('it-11')!;
  assert(dup1.similarity! > 0.9);
  assertEquals(dup1.gates.find((g) => g.gate === 'similarity')!.passed, false);
  assertEquals(dup2.gates.find((g) => g.gate === 'similarity')!.passed, false);
  // The varied items must NOT be flagged.
  for (let i = 0; i < 10; i++) {
    assertEquals(res.get(`it-${i}`)!.gates.find((g) => g.gate === 'similarity')!.passed, true, `it-${i} wrongly flagged`);
  }
});

Deno.test('runBatchGates flags the stamped opening under phrase_frequency (WP3 acceptance)', () => {
  const stamped = (lp: number, dt: number) =>
    `Người mang số chủ đạo ${lp} và số sứ mệnh ${dt} sở hữu một tổ hợp đặc biệt. Phần thân bài ${lp}-${dt} thì khác nhau hoàn toàn.`;
  const items = [
    { id: 'a', output: { intro: stamped(7, 3) } },
    { id: 'b', output: { intro: stamped(1, 5) } },
    { id: 'c', output: { intro: stamped(9, 2) } },
    { id: 'd', output: { intro: 'Một cách vào bài hoàn toàn khác, bắt đầu từ câu chuyện nghề nghiệp.' } },
  ];
  const res = runBatchGates(items, { phrase_frequency: { severity: 'flag', max_shared: 2 } });
  assertEquals(res.get('a')!.gates.find((g) => g.gate === 'phrase_frequency')!.passed, false);
  assertEquals(res.get('b')!.gates.find((g) => g.gate === 'phrase_frequency')!.passed, false);
  assertEquals(res.get('c')!.gates.find((g) => g.gate === 'phrase_frequency')!.passed, false);
  assertEquals(res.get('d')!.gates.find((g) => g.gate === 'phrase_frequency')!.passed, true);
});

Deno.test('phrase_frequency scans every length-bounded field, not just intro (career stamp)', () => {
  // Intros all differ; careers all open "Trong công việc, bạn …" — the exact
  // shape the old intro-only gate missed (5/5 careers stamped in the golden run).
  const items = [
    { id: 'a', output: { intro: 'Mở đầu độc đáo alpha khác biệt hoàn toàn.', career: 'Trong công việc, bạn nổi bật rõ rệt.' } },
    { id: 'b', output: { intro: 'Một khởi đầu beta rất riêng biệt nữa.', career: 'Trong công việc, bạn luôn tỏa sáng.' } },
    { id: 'c', output: { intro: 'Cách vào bài gamma hoàn toàn mới lạ.', career: 'Trong công việc, bạn thường dẫn đầu.' } },
  ];
  const guards = {
    length: { fields: { intro: [10, 200], career: [10, 200] } },
    phrase_frequency: { severity: 'flag', max_shared: 2 },
  };
  const res = runBatchGates(items, guards);
  for (const id of ['a', 'b', 'c']) {
    const g = res.get(id)!.gates.find((x) => x.gate === 'phrase_frequency')!;
    assertEquals(g.passed, false);
    assertMatch(String(g.detail), /career/);
  }
});

Deno.test('runBatchGates: single-item batch has no similarity signal, empty batch is fine', () => {
  const one = runBatchGates([{ id: 'x', output: { intro: 'chỉ một bài' } }],
    { similarity: { max_pairwise: 0.55 }, phrase_frequency: {} });
  assertEquals(one.get('x')!.similarity, null);
  assertEquals(runBatchGates([], { similarity: {} }).size, 0);
});

Deno.test('proseOf collects nested strings including faq q/a', () => {
  const text = proseOf({ intro: 'a', faqs: [{ q: 'b', a: 'c' }], n: 4 });
  assertEquals(text, 'a b c');
});
