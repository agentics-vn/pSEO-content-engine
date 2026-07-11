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
  items: Map<string, AdminItemRow & { input_data: unknown; data_hash: string }>;
  jobs: Map<string, { id: string; site_id: string; template_id: string; status: string; mode: string; review_sample_pct: number }>;
  templates: Map<string, { id: string; site_id: string; key: string; version: number; guards: Record<string, unknown> }>;
  webhookCalls: Array<{ url: string; payload: unknown }>;
  generateCalls: string[];
}

function makeWorld(): World {
  let seq = 0;
  const uid = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`;
  const items: World['items'] = new Map();
  const jobs: World['jobs'] = new Map();
  const templates: World['templates'] = new Map();
  const webhookCalls: World['webhookCalls'] = [];
  const generateCalls: string[] = [];

  templates.set('tpl-1', {
    id: 'tpl-1', site_id: 'site-1', key: 'combo-so-chu-dao-su-menh', version: 1,
    guards: {
      similarity: { severity: 'flag', max_pairwise: 0.55 },
      phrase_frequency: { severity: 'flag', max_shared: 2 },
    },
  });

  const deps: AdminDeps = {
    getUserId: (jwt) => Promise.resolve(jwt === 'good-jwt' ? 'user-1' : null),
    getMemberships: (userId) =>
      Promise.resolve(userId === 'user-1' ? [{ site_id: 'site-1', slug: 'sochumenh', role: 'reviewer' }] : []),

    getLatestTemplateVersion: (siteId, key) => {
      const versions = [...templates.values()].filter((t) => t.site_id === siteId && t.key === key).map((t) => t.version);
      return Promise.resolve(versions.length ? Math.max(...versions) : null);
    },
    getTemplate: (siteId, key, version) =>
      Promise.resolve([...templates.values()].find((t) => t.site_id === siteId && t.key === key && t.version === version) ?? null),
    insertTemplate: (siteId, _userId, row) => {
      const id = uid();
      templates.set(id, { id, site_id: siteId, key: row.key, version: row.version, guards: row.guards ?? {} });
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
          input_data: r.input_data, data_hash: r.data_hash,
        });
        inserted++;
      }
      return Promise.resolve(inserted);
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

    getWebhooks: () => Promise.resolve([{ url: 'https://site.example/hook' }]),
    fireWebhook: (url, payload) => {
      webhookCalls.push({ url, payload });
      return Promise.resolve();
    },

    now: () => Date.now(),
  };

  return { deps, items, jobs, templates, webhookCalls, generateCalls };
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
    similarity: null, input_data: input, data_hash: await dataHash(input),
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

// ── Review queue ─────────────────────────────────────────────────────────────

Deno.test('GET /items?status=flagged returns only flagged items for the caller site', async () => {
  const w = makeWorld();
  await seedItem(w, { status: 'flagged', item_key: 'so-chu-dao-7-su-menh-3' });
  await seedItem(w, { status: 'generated', item_key: 'so-chu-dao-7-su-menh-4' });
  const res = await call(w.deps, 'GET', '/items?status=flagged');
  const body = await res.json();
  assertEquals(body.items.length, 1);
  assertEquals(body.items[0].status, 'flagged');
});
