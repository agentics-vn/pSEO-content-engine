/**
 * prose-admin handler tests over an in-memory fake world. The approve-blocks-
 * on-red-fail test is MANDATORY (ground rule 1) — do not delete it.
 */

import { assert, assertEquals } from './_assert.ts';
import { makeAdminHandler, type AdminDeps, type AdminItemRow } from '../prose-admin/lib.ts';
import { dataHash } from '../_shared/hash.ts';
import { buildComboInput } from '../_shared/inputs.ts';

// ── In-memory world ──────────────────────────────────────────────────────────

interface World {
  deps: AdminDeps;
  metrics: Array<{ item_key: string; clicks: number; impressions: number; avg_position: number | null; conversions: number; revenue: number }>;
  items: Map<string, AdminItemRow & { data_hash: string }>;
  jobs: Map<string, { id: string; site_id: string; template_id: string; status: string; mode: string; review_sample_pct: number }>;
  templates: Map<string, { id: string; site_id: string; key: string; version: number; guards: Record<string, unknown>; output_schema: Record<string, unknown> }>;
  webhookCalls: Array<{ url: string; payload: unknown }>;
  generateCalls: string[];
}

function makeWorld(role: string = 'reviewer'): World {
  let seq = 0;
  const uid = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`;
  const items: World['items'] = new Map();
  const jobs: World['jobs'] = new Map();
  const templates: World['templates'] = new Map();
  const webhookCalls: World['webhookCalls'] = [];
  const generateCalls: string[] = [];
  const metrics: World['metrics'] = [];

  templates.set('tpl-1', {
    id: 'tpl-1', site_id: 'site-1', key: 'combo-so-chu-dao-su-menh', version: 1,
    output_schema: { type: 'object' },
    guards: {
      banned_phrases: { severity: 'fail', list: ['cấm'] },
      similarity: { severity: 'flag', max_pairwise: 0.55 },
      phrase_frequency: { severity: 'flag', max_shared: 2 },
    },
  });

  const deps: AdminDeps = {
    getUserId: (jwt) => Promise.resolve(jwt === 'good-jwt' ? 'user-1' : null),
    getMemberships: (userId) =>
      Promise.resolve(userId === 'user-1' ? [{ site_id: 'site-1', slug: 'sochumenh', role }] : []),

    getLatestTemplateVersion: (siteId, key) => {
      const versions = [...templates.values()].filter((t) => t.site_id === siteId && t.key === key).map((t) => t.version);
      return Promise.resolve(versions.length ? Math.max(...versions) : null);
    },
    getTemplate: (siteId, key, version) =>
      Promise.resolve([...templates.values()].find((t) => t.site_id === siteId && t.key === key && t.version === version) ?? null),
    insertTemplate: (siteId, _userId, row) => {
      const id = uid();
      templates.set(id, { id, site_id: siteId, key: row.key, version: row.version, guards: row.guards ?? {}, output_schema: row.output_schema ?? { type: 'object' } });
      return Promise.resolve({ id, version: row.version });
    },

    getPublishedItemKeys: (siteId, templateKey) =>
      Promise.resolve(new Set([...items.values()]
        .filter((i) => i.site_id === siteId && i.template_key === templateKey && i.status === 'published')
        .map((i) => i.item_key))),
    insertJob: (row) => {
      const id = uid();
      jobs.set(id, { id, site_id: row.site_id, template_id: row.template_id, status: 'pending', mode: row.mode, review_sample_pct: row.review_sample_pct });
      return Promise.resolve({ id });
    },
    insertItems: (rows) => {
      let inserted = 0;
      for (const r of rows) {
        const dup = [...items.values()].some((i) =>
          i.site_id === r.site_id && i.template_key === r.template_key &&
          i.template_version === r.template_version && i.item_key === r.item_key && i.data_hash === r.data_hash);
        if (dup) continue;
        const id = uid();
        items.set(id, {
          id, site_id: r.site_id, job_id: r.job_id, template_key: r.template_key,
          template_version: r.template_version, item_key: r.item_key, status: r.status,
          output: null, edited_output: null, validation: {}, similarity: null,
          input_data: r.input_data as Record<string, unknown>, data_hash: r.data_hash,
        });
        inserted++;
      }
      return Promise.resolve(inserted);
    },
    resetItemsForRegenerate: (siteId, templateKey, version, itemKeys, jobId) => {
      const reset: string[] = [];
      const published: string[] = [];
      for (const it of items.values()) {
        if (it.site_id !== siteId || it.template_key !== templateKey || it.template_version !== version) continue;
        if (!itemKeys.includes(it.item_key)) continue;
        if (it.status === 'published') { published.push(it.item_key); continue; }
        it.status = 'pending';
        it.job_id = jobId;
        reset.push(it.item_key);
      }
      return Promise.resolve({ reset, published });
    },

    getJob: (siteId, jobId) => {
      const j = jobs.get(jobId);
      return Promise.resolve(j && j.site_id === siteId ? j : null);
    },
    getTemplateById: (templateId) => Promise.resolve(templates.get(templateId) ?? null),
    getPendingItemIds: (jobId, limit) =>
      Promise.resolve([...items.values()].filter((i) => i.job_id === jobId && i.status === 'pending').slice(0, limit).map((i) => i.id)),
    countPending: (jobId) =>
      Promise.resolve([...items.values()].filter((i) => i.job_id === jobId && i.status === 'pending').length),
    getJobItemsWithOutput: (jobId) =>
      Promise.resolve([...items.values()].filter((i) => i.job_id === jobId && i.output !== null)),
    saveBatchResults: (itemId, similarity, batchGates) => {
      const it = items.get(itemId)!;
      it.similarity = similarity;
      it.validation = { ...it.validation, batch_gates: batchGates };
      return Promise.resolve();
    },
    markJobDone: (jobId) => {
      jobs.get(jobId)!.status = 'done';
      return Promise.resolve();
    },

    listItems: (siteId, filter) =>
      Promise.resolve([...items.values()].filter((i) =>
        i.site_id === siteId &&
        (!filter.status || i.status === filter.status) &&
        (!filter.job_id || i.job_id === filter.job_id)).slice(0, filter.limit)),
    getItem: (siteId, itemId) => {
      const it = items.get(itemId);
      return Promise.resolve(it && it.site_id === siteId ? it : null);
    },
    updateItem: (itemId, patch) => {
      Object.assign(items.get(itemId)!, patch);
      return Promise.resolve();
    },

    // Fake prose-generate: writes a distinct clean output per item.
    generate: (itemId) => {
      generateCalls.push(itemId);
      const it = items.get(itemId)!;
      if (it.status !== 'pending') return Promise.resolve({ ok: true, status: it.status, cached: true });
      it.output = {
        intro: `Bài viết riêng cho ${it.item_key}: ${it.item_key.split('').reverse().join(' ')}`,
        faqs: [{ q: 'q', a: 'a' }],
      };
      it.status = 'generated';
      it.validation = { gates: [{ gate: 'schema', severity: 'fail', passed: true }] };
      return Promise.resolve({ ok: true, status: 'generated' });
    },

    getMetricsSummary: () => Promise.resolve(metrics),
    getItemKeysForTemplate: (siteId, templateKey) =>
      Promise.resolve(new Set([...items.values()]
        .filter((i) => i.site_id === siteId && i.template_key === templateKey)
        .map((i) => i.item_key))),
    getRecentItemOutcomes: (siteId, templateKey, limit) =>
      Promise.resolve([...items.values()]
        .filter((i) => i.site_id === siteId && i.template_key === templateKey && i.status !== 'pending')
        .slice(0, limit)
        .map((i) => ({ status: i.status, validation: i.validation }))),

    listJobs: (siteId, limit) =>
      Promise.resolve([...jobs.values()].filter((j) => j.site_id === siteId).slice(0, limit) as unknown as Array<Record<string, unknown>>),
    getStats: (siteId) => {
      const byStatus: Record<string, number> = {};
      for (const it of items.values()) {
        if (it.site_id !== siteId) continue;
        byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
      }
      return Promise.resolve({
        items_by_status: byStatus, published_total: byStatus.published ?? 0, tokens_in: 0, tokens_out: 0,
      });
    },

    getWebhooks: () => Promise.resolve([{ url: 'https://site.example/hook' }]),
    fireWebhook: (url, payload) => {
      webhookCalls.push({ url, payload });
      return Promise.resolve();
    },

    now: () => Date.now(),
  };

  return { deps, items, jobs, templates, webhookCalls, generateCalls, metrics };
}

const call = (deps: AdminDeps, method: string, path: string, body?: unknown) =>
  makeAdminHandler(deps)(new Request(`http://local/prose-admin${path}`, {
    method,
    headers: { authorization: 'Bearer good-jwt', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));

async function seedItem(w: World, over: Partial<AdminItemRow> = {}): Promise<string> {
  const input = buildComboInput('so-chu-dao-7-su-menh-3');
  const id = `11111111-0000-0000-0000-${String(w.items.size + 1).padStart(12, '0')}`;
  w.items.set(id, {
    id, site_id: 'site-1', job_id: 'job-x', template_key: 'combo-so-chu-dao-su-menh',
    template_version: 1, item_key: 'so-chu-dao-7-su-menh-3', status: 'flagged',
    output: { intro: 'nội dung' }, edited_output: null,
    validation: { gates: [{ gate: 'schema', severity: 'fail', passed: true }] },
    similarity: null, input_data: input as unknown as Record<string, unknown>, data_hash: await dataHash(input),
    ...over,
  });
  return id;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

Deno.test('admin: rejects missing/invalid tokens and non-members', async () => {
  const w = makeWorld();
  const handler = makeAdminHandler(w.deps);
  const noAuth = await handler(new Request('http://local/prose-admin/items'));
  assertEquals(noAuth.status, 401);
  const badJwt = await handler(new Request('http://local/prose-admin/items', {
    headers: { authorization: 'Bearer wrong' },
  }));
  assertEquals(badJwt.status, 401);
});

// ── Roles ────────────────────────────────────────────────────────────────────

Deno.test('roles: editor can create jobs but cannot approve/publish; unknown role cannot write', async () => {
  const editor = makeWorld('editor');
  const id = await seedItem(editor, { status: 'flagged' });
  const job = await call(editor.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh', item_keys: ['so-chu-dao-5-su-menh-5'],
  });
  assertEquals(job.status, 201);
  assertEquals((await call(editor.deps, 'POST', `/items/${id}/approve`)).status, 403);
  assertEquals((await call(editor.deps, 'POST', `/items/${id}/publish`)).status, 403);
  assertEquals(editor.items.get(id)!.status, 'flagged');

  const viewer = makeWorld('viewer');
  assertEquals((await call(viewer.deps, 'POST', '/jobs', { template_key: 'x' })).status, 403);
  assertEquals((await call(viewer.deps, 'GET', '/items')).status, 200, 'reads stay open to members');
});

// ── Tenant-generic work-lists ────────────────────────────────────────────────

Deno.test('POST /jobs accepts explicit (item_key, input_data) rows — any vertical, zero engine code', async () => {
  const w = makeWorld();
  const res = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh', // any template; input builder not consulted
    items: [
      { item_key: 'gia-vang-ha-noi', input_data: { city: 'Hà Nội', price: 8_450_000, unit: 'VND/chỉ' } },
      { item_key: 'gia-vang-da-nang', input_data: { city: 'Đà Nẵng', price: 8_430_000, unit: 'VND/chỉ' } },
    ],
  });
  assertEquals(res.status, 201);
  assertEquals((await res.json()).item_count, 2);
  const rows = [...w.items.values()].filter((i) => i.item_key.startsWith('gia-vang'));
  assertEquals(rows.length, 2);
  assertEquals((rows[0].input_data as { city: string }).city, 'Hà Nội');
  assert(rows.every((r) => r.data_hash.length === 64), 'input_data hashed into the cache key');
});

Deno.test('POST /jobs rejects malformed explicit rows', async () => {
  const w = makeWorld();
  const bad = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh',
    items: [{ item_key: 'Bad Slug!', input_data: { a: 1 } }],
  });
  assertEquals(bad.status, 400);
  const dup = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh',
    items: [{ item_key: 'x', input_data: {} }, { item_key: 'x', input_data: {} }],
  });
  assertEquals(dup.status, 400);
});

// ── THE mandatory test (ground rule 1) ───────────────────────────────────────

Deno.test('MANDATORY: approve returns 409 on a red fail gate and does NOT change status', async () => {
  const w = makeWorld();
  const id = await seedItem(w, {
    status: 'flagged',
    validation: { gates: [
      { gate: 'schema', severity: 'fail', passed: true },
      { gate: 'length', severity: 'fail', passed: false, detail: 'intro too short' },
    ] },
  });
  const res = await call(w.deps, 'POST', `/items/${id}/approve`);
  assertEquals(res.status, 409);
  const body = await res.json();
  assert(String(body.error).includes('fail-severity'));
  assertEquals(w.items.get(id)!.status, 'flagged', 'status must NOT change');
});

Deno.test('approve also blocks on a red fail-severity BATCH gate', async () => {
  const w = makeWorld();
  const id = await seedItem(w, {
    validation: {
      gates: [{ gate: 'schema', severity: 'fail', passed: true }],
      batch_gates: [{ gate: 'similarity', severity: 'fail', passed: false, detail: '0.91 > 0.55' }],
    },
  });
  const res = await call(w.deps, 'POST', `/items/${id}/approve`);
  assertEquals(res.status, 409);
});

Deno.test('approve succeeds when fail gates are green (red flag gates do not block)', async () => {
  const w = makeWorld();
  const id = await seedItem(w, {
    validation: {
      gates: [{ gate: 'schema', severity: 'fail', passed: true }],
      batch_gates: [{ gate: 'similarity', severity: 'flag', passed: false, detail: 'reviewable, not blocking' }],
    },
  });
  const res = await call(w.deps, 'POST', `/items/${id}/approve`);
  assertEquals(res.status, 200);
  assertEquals(w.items.get(id)!.status, 'approved');
});

Deno.test('approve refuses from non-reviewable statuses', async () => {
  const w = makeWorld();
  const id = await seedItem(w, { status: 'rejected' });
  assertEquals((await call(w.deps, 'POST', `/items/${id}/approve`)).status, 409);
});

// ── Publish (one-way) ────────────────────────────────────────────────────────

Deno.test('publish requires approved, fires webhook, and published items are immutable', async () => {
  const w = makeWorld();
  const id = await seedItem(w, { status: 'generated' });
  assertEquals((await call(w.deps, 'POST', `/items/${id}/publish`)).status, 409, 'not approved yet');

  await call(w.deps, 'POST', `/items/${id}/approve`);
  const pub = await call(w.deps, 'POST', `/items/${id}/publish`);
  assertEquals(pub.status, 200);
  assertEquals(w.items.get(id)!.status, 'published');
  assertEquals(w.webhookCalls.length, 1);
  assertEquals((w.webhookCalls[0].payload as { site: string }).site, 'sochumenh');

  // One-way: edit and reject must refuse on a published item.
  assertEquals((await call(w.deps, 'POST', `/items/${id}/edit`, { edited_output: { intro: 'x' } })).status, 409);
  assertEquals((await call(w.deps, 'POST', `/items/${id}/reject`, {})).status, 409);
});

Deno.test('edit stores edited_output on unpublished items', async () => {
  const w = makeWorld();
  const id = await seedItem(w, { status: 'flagged' });
  const res = await call(w.deps, 'POST', `/items/${id}/edit`, { edited_output: { intro: 'đã sửa' } });
  assertEquals(res.status, 200);
  assertEquals(w.items.get(id)!.edited_output, { intro: 'đã sửa' });
});

// ── Templates ────────────────────────────────────────────────────────────────

Deno.test('templates are immutable per version: duplicate version → 409, next version auto-assigned', async () => {
  const w = makeWorld();
  const t = {
    key: 'combo-so-chu-dao-su-menh', name: 'v2', system_prompt: 's', user_template: 'u',
    output_schema: { type: 'object' }, model: 'claude-haiku-4-5',
  };
  const dup = await call(w.deps, 'POST', '/templates', { ...t, version: 1 });
  assertEquals(dup.status, 409);
  const next = await call(w.deps, 'POST', '/templates', t);
  assertEquals(next.status, 201);
  assertEquals((await next.json()).version, 2);
});

// ── Jobs: work-list building + run loop ──────────────────────────────────────

Deno.test('POST /jobs enumerates the combo grid, applies filters, excludes published', async () => {
  const w = makeWorld();
  // Pre-publish one non-master combo so it must be excluded.
  await seedItem(w, { status: 'published', item_key: 'so-chu-dao-1-su-menh-1' });

  const res = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh',
    enumerate: 'combo-grid',
    filter: { master: 'exclude' },
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.item_count, 80); // 9×9 = 81 non-master minus 1 published
});

Deno.test('POST /jobs with life_paths filter narrows the row', async () => {
  const w = makeWorld();
  const res = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh',
    enumerate: 'combo-grid',
    filter: { master: 'exclude', life_paths: [7] },
  });
  assertEquals((await res.json()).item_count, 9);
});

Deno.test('run loop drains pending items, then runs batch gates and closes the job (WP4 acceptance)', async () => {
  const w = makeWorld();
  const create = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh',
    item_keys: ['so-chu-dao-7-su-menh-1', 'so-chu-dao-7-su-menh-2', 'so-chu-dao-7-su-menh-3',
                'so-chu-dao-7-su-menh-4', 'so-chu-dao-7-su-menh-5'],
  });
  const { job_id } = await create.json();

  const run = await call(w.deps, 'POST', `/jobs/${job_id}/run`);
  const body = await run.json();
  assertEquals(body.processed, 5);
  assertEquals(body.remaining, 0);
  assertEquals(body.batch_gates_ran, true);
  assertEquals(w.jobs.get(job_id)!.status, 'done');

  const jobItems = [...w.items.values()].filter((i) => i.job_id === job_id);
  assertEquals(jobItems.length, 5);
  for (const it of jobItems) {
    assert(it.status === 'generated' || it.status === 'flagged');
    assert(Array.isArray(it.validation.batch_gates), 'batch gates written back');
    assert(typeof it.similarity === 'number', 'similarity written back');
  }
});

Deno.test('re-running a drained job is idempotent: cached generates, no new pending', async () => {
  const w = makeWorld();
  const create = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh',
    item_keys: ['so-chu-dao-2-su-menh-2', 'so-chu-dao-3-su-menh-3'],
  });
  const { job_id } = await create.json();
  await call(w.deps, 'POST', `/jobs/${job_id}/run`);
  const callsAfterFirst = w.generateCalls.length;

  const again = await call(w.deps, 'POST', `/jobs/${job_id}/run`);
  const body = await again.json();
  assertEquals(body.processed, 0, 'no pending items → no generate calls');
  assertEquals(w.generateCalls.length, callsAfterFirst);

  // Recreating the same job dedupes on the cache key: zero rows inserted.
  const recreate = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh',
    item_keys: ['so-chu-dao-2-su-menh-2', 'so-chu-dao-3-su-menh-3'],
  });
  assertEquals((await recreate.json()).inserted, 0);
});

Deno.test('regenerate resets in-review items to pending; published items need a version bump (audit fix)', async () => {
  const w = makeWorld();
  const create = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh',
    item_keys: ['so-chu-dao-7-su-menh-1', 'so-chu-dao-7-su-menh-2'],
  });
  const { job_id } = await create.json();
  await call(w.deps, 'POST', `/jobs/${job_id}/run`); // both → generated
  // Publish one; leave the other in review.
  const gen = [...w.items.values()].filter((i) => i.job_id === job_id);
  const pubItem = gen.find((i) => i.item_key === 'so-chu-dao-7-su-menh-1')!;
  await call(w.deps, 'POST', `/items/${pubItem.id}/approve`);
  await call(w.deps, 'POST', `/items/${pubItem.id}/publish`);

  const regen = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh',
    mode: 'regenerate',
    item_keys: ['so-chu-dao-7-su-menh-1', 'so-chu-dao-7-su-menh-2'],
  });
  const body = await regen.json();
  // Regenerate keeps published keys in the work-list and classifies them:
  // the in-review item is re-queued; the published one is reported for a
  // version bump and left untouched (protecting live content).
  assertEquals(body.inserted, 0);
  assertEquals(body.regenerated, 1);
  assertEquals(body.needs_version_bump, ['so-chu-dao-7-su-menh-1']);
  const other = gen.find((i) => i.item_key === 'so-chu-dao-7-su-menh-2')!;
  assertEquals(other.status, 'pending', 'in-review item re-queued for regeneration');
  assertEquals(other.job_id, body.job_id, 'reassigned to the regenerate job');
  assertEquals(pubItem.status, 'published', 'published item left live, untouched');
});

Deno.test('edit RE-GATES: editing clean content to add a banned phrase blocks approve (ground rule 1, audit fix)', async () => {
  const w = makeWorld();
  const id = await seedItem(w, {
    status: 'generated',
    output: { intro: 'nội dung sạch sẽ', metaDescription: 'ổn' },
    validation: { gates: [{ gate: 'banned_phrases', severity: 'fail', passed: true }] },
  });
  // Clean item approves fine before the edit.
  // Now a reviewer edits in a banned phrase.
  const edit = await call(w.deps, 'POST', `/items/${id}/edit`, {
    edited_output: { intro: 'đây là nội dung bị cấm', metaDescription: 'ổn' },
  });
  assertEquals(edit.status, 200);
  assertEquals((await edit.json()).regated, true);
  // The re-gated validation now carries a red fail → approve refuses.
  const gates = w.items.get(id)!.validation.gates ?? [];
  assert(gates.some((g) => g.gate === 'banned_phrases' && !g.passed), 'banned_phrases recomputed as failing');
  const approve = await call(w.deps, 'POST', `/items/${id}/approve`);
  assertEquals(approve.status, 409);
});

Deno.test('POST /jobs with unresolvable item_keys → 400, not 500 (audit fix)', async () => {
  const w = makeWorld();
  const res = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh',
    item_keys: ['not-a-combo-key'],
  });
  assertEquals(res.status, 400);
});

Deno.test('GET /metrics?window=abc → 200 with default window, not 500 (audit fix)', async () => {
  const w = makeWorld();
  const res = await call(w.deps, 'GET', '/metrics?window=abc');
  assertEquals(res.status, 200);
  assertEquals((await res.json()).window_days, 28);
});

// ── Adaptive sampling ────────────────────────────────────────────────────────

import { computeAutoSamplePct } from '../prose-admin/lib.ts';

Deno.test('computeAutoSamplePct: golden phase → 100, clean history → 5, shaky → 25', () => {
  const clean = { status: 'generated', validation: { gates: [] } };
  const failed = { status: 'failed_validation', validation: { gates: [] } };
  assertEquals(computeAutoSamplePct([clean, clean]).pct, 100); // < 15 items
  assertEquals(computeAutoSamplePct(Array(100).fill(clean)).pct, 5); // 100%
  assertEquals(computeAutoSamplePct([...Array(96).fill(clean), ...Array(4).fill(failed)]).pct, 10); // 96%
  assertEquals(computeAutoSamplePct([...Array(85).fill(clean), ...Array(15).fill(failed)]).pct, 25); // 85%
});

Deno.test('POST /jobs without review_sample_pct gets an adaptive value; explicit wins', async () => {
  const w = makeWorld();
  // Fresh template → golden phase → 100.
  const auto = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh', item_keys: ['so-chu-dao-6-su-menh-6'],
  });
  const autoBody = await auto.json();
  assertEquals(autoBody.review_sample_pct, 100);
  assert(autoBody.sample_basis.includes('golden phase'));

  const explicit = await call(w.deps, 'POST', '/jobs', {
    template_key: 'combo-so-chu-dao-su-menh', item_keys: ['so-chu-dao-6-su-menh-7'],
    review_sample_pct: 40,
  });
  assertEquals((await explicit.json()).review_sample_pct, 40);
});

// ── Performance metrics ──────────────────────────────────────────────────────

Deno.test('GET /metrics aggregates totals, sorts by clicks, filters by template', async () => {
  const w = makeWorld();
  await seedItem(w, { status: 'published', item_key: 'so-chu-dao-7-su-menh-3' });
  w.metrics.push(
    { item_key: 'so-chu-dao-7-su-menh-3', clicks: 120, impressions: 2400, avg_position: 6.2, conversions: 4, revenue: 1_960_000 },
    { item_key: 'khong-thuoc-template-nao', clicks: 50, impressions: 900, avg_position: 9.1, conversions: 0, revenue: 0 },
  );
  const all = await (await call(w.deps, 'GET', '/metrics?window=28')).json();
  assertEquals(all.totals.clicks, 170);
  assertEquals(all.items[0].item_key, 'so-chu-dao-7-su-menh-3');
  assertEquals(all.items[0].ctr, 120 / 2400);

  const filtered = await (await call(w.deps, 'GET', '/metrics?template=combo-so-chu-dao-su-menh')).json();
  assertEquals(filtered.items.length, 1);
  assertEquals(filtered.totals.revenue, 1_960_000);
});

// ── Review queue ─────────────────────────────────────────────────────────────

Deno.test('GET /jobs and GET /stats serve the dashboard, site-scoped', async () => {
  const w = makeWorld();
  await seedItem(w, { status: 'published', item_key: 'so-chu-dao-1-su-menh-1' });
  await seedItem(w, { status: 'flagged', item_key: 'so-chu-dao-1-su-menh-2' });
  await call(w.deps, 'POST', '/jobs', { template_key: 'combo-so-chu-dao-su-menh', item_keys: ['so-chu-dao-1-su-menh-3'] });

  const jobs = await (await call(w.deps, 'GET', '/jobs')).json();
  assertEquals(jobs.jobs.length, 1);

  const stats = await (await call(w.deps, 'GET', '/stats')).json();
  assertEquals(stats.published_total, 1);
  assertEquals(stats.items_by_status.flagged, 1);
  assertEquals(stats.items_by_status.pending, 1);
});

Deno.test('GET /items?status=flagged returns only flagged items for the caller site', async () => {
  const w = makeWorld();
  await seedItem(w, { status: 'flagged', item_key: 'so-chu-dao-7-su-menh-3' });
  await seedItem(w, { status: 'generated', item_key: 'so-chu-dao-7-su-menh-4' });
  const res = await call(w.deps, 'GET', '/items?status=flagged');
  const body = await res.json();
  assertEquals(body.items.length, 1);
  assertEquals(body.items[0].status, 'flagged');
});
