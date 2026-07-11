/**
 * prose-admin — pure routing + handlers with injected deps (doc §5, WP4).
 * The operator surface: templates, jobs, the generate run-loop, review,
 * approve/reject, one-way publish. Human admin auth via site_admins — one
 * site per login; every query is scoped by the caller's membership.
 *
 * HARD RULE (doc §7, ground rule 1): approve REFUSES (409) while any
 * fail-severity gate — per-item or batch — is red. The block lives HERE, on
 * the approve handler, not just on editing published items. Two structurally
 * broken items reached production in the reference project before this was
 * enforced at the right step.
 */

import { enumerateComboGrid, comboSlug, isMaster, type CoreNumber } from '@pseo/numerology-core';
import { buildComboInput } from '../_shared/inputs.ts';
import { dataHash } from '../_shared/hash.ts';
import { hasFailingGate, runBatchGates, type GateResult } from '../_shared/gates/index.ts';

// ── Types ────────────────────────────────────────────────────────────────────

export interface SiteMembership {
  site_id: string;
  slug: string;
  role: string;
}

export interface TemplateInput {
  key: string;
  version?: number;
  name: string;
  system_prompt: string;
  user_template: string;
  output_schema: Record<string, unknown>;
  few_shots?: unknown[];
  guards?: Record<string, unknown>;
  model: string;
  temperature?: number;
  max_tokens?: number;
}

export interface JobInput {
  template_key: string;
  template_version?: number;
  item_keys?: string[];
  /** 'combo-grid' enumerates the full 12×12 axis minus already-published. */
  enumerate?: 'combo-grid';
  filter?: {
    master?: 'exclude' | 'only';
    life_paths?: number[];
    destinies?: number[];
  };
  review_sample_pct?: number;
  mode?: 'generate' | 'regenerate';
}

export interface AdminItemRow {
  id: string;
  site_id: string;
  job_id: string;
  template_key: string;
  template_version: number;
  item_key: string;
  status: string;
  output: Record<string, unknown> | null;
  edited_output: Record<string, unknown> | null;
  validation: {
    gates?: GateResult[];
    batch_gates?: GateResult[];
    review_sampled?: boolean;
  };
  similarity: number | null;
}

export interface AdminDeps {
  /** Resolve the caller's user id from their JWT (null = unauthenticated). */
  getUserId(jwt: string): Promise<string | null>;
  getMemberships(userId: string): Promise<SiteMembership[]>;

  getLatestTemplateVersion(siteId: string, key: string): Promise<number | null>;
  getTemplate(siteId: string, key: string, version: number): Promise<
    | { id: string; key: string; version: number; guards: Record<string, unknown> }
    | null
  >;
  insertTemplate(siteId: string, userId: string, row: TemplateInput & { version: number }): Promise<{ id: string; version: number }>;

  getPublishedItemKeys(siteId: string, templateKey: string): Promise<Set<string>>;
  insertJob(row: {
    site_id: string; template_id: string; review_sample_pct: number;
    mode: string; item_count: number; created_by: string;
  }): Promise<{ id: string }>;
  /** Insert pending items; ON CONFLICT (cache key) DO NOTHING. Returns rows inserted. */
  insertItems(rows: Array<{
    site_id: string; job_id: string; template_key: string; template_version: number;
    item_key: string; data_hash: string; input_data: unknown; status: string;
  }>): Promise<number>;

  getJob(siteId: string, jobId: string): Promise<
    | { id: string; site_id: string; template_id: string; status: string; mode: string; review_sample_pct: number }
    | null
  >;
  getTemplateById(templateId: string): Promise<{ key: string; version: number; guards: Record<string, unknown> } | null>;
  getPendingItemIds(jobId: string, limit: number): Promise<string[]>;
  countPending(jobId: string): Promise<number>;
  getJobItemsWithOutput(jobId: string): Promise<AdminItemRow[]>;
  saveBatchResults(itemId: string, similarity: number | null, batchGates: GateResult[]): Promise<void>;
  markJobDone(jobId: string): Promise<void>;

  listItems(siteId: string, filter: { status?: string; job_id?: string; template_key?: string; limit: number }): Promise<AdminItemRow[]>;
  getItem(siteId: string, itemId: string): Promise<AdminItemRow | null>;
  updateItem(itemId: string, patch: Record<string, unknown>): Promise<void>;

  /** Invoke prose-generate for one item (service-role, internal). */
  generate(itemId: string, mode?: string): Promise<{ ok: boolean; status?: string; cached?: boolean; error?: string }>;

  getWebhooks(siteId: string): Promise<Array<{ url: string }>>;
  fireWebhook(url: string, payload: unknown): Promise<void>;

  /** Dashboard reads. */
  listJobs(siteId: string, limit: number): Promise<Array<Record<string, unknown>>>;
  getStats(siteId: string): Promise<{
    items_by_status: Record<string, number>;
    published_total: number;
    tokens_in: number;
    tokens_out: number;
  }>;

  /** Milliseconds of budget left for the run loop (serverless wall clock). */
  now(): number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** All fail-severity gates across per-item AND batch scopes. */
export function allGates(item: AdminItemRow): GateResult[] {
  return [...(item.validation?.gates ?? []), ...(item.validation?.batch_gates ?? [])];
}

const REVIEWABLE = new Set(['generated', 'flagged']);

// ── Handler factory ──────────────────────────────────────────────────────────

export function makeAdminHandler(deps: AdminDeps, opts: { runBudgetMs?: number } = {}) {
  const runBudgetMs = opts.runBudgetMs ?? 45_000;

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    // Function may be served under /prose-admin or /functions/v1/prose-admin.
    const path = url.pathname.replace(/^.*?\/prose-admin/, '') || '/';

    // ── Auth: human admin via site_admins, one site per request ────────────
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'missing bearer token' }, 401);
    const userId = await deps.getUserId(jwt);
    if (!userId) return json({ error: 'invalid token' }, 401);
    const memberships = await deps.getMemberships(userId);
    if (memberships.length === 0) return json({ error: 'no site membership' }, 403);
    const wantSlug = req.headers.get('x-site-slug');
    const site = wantSlug
      ? memberships.find((m) => m.slug === wantSlug)
      : memberships.length === 1 ? memberships[0] : undefined;
    if (!site) {
      return json({
        error: wantSlug ? `not a member of site "${wantSlug}"` : 'multiple site memberships — set x-site-slug',
      }, 403);
    }

    const body = async <T>(): Promise<T> => (await req.json()) as T;

    try {
      // ── POST /templates — create/version (immutable per version) ─────────
      if (req.method === 'POST' && path === '/templates') {
        const t = await body<TemplateInput>();
        if (!t.key || !t.name || !t.system_prompt || !t.user_template || !t.output_schema || !t.model) {
          return json({ error: 'key, name, system_prompt, user_template, output_schema, model are required' }, 400);
        }
        const latest = await deps.getLatestTemplateVersion(site.site_id, t.key);
        const version = t.version ?? (latest ?? 0) + 1;
        if (latest !== null && version <= latest) {
          return json({ error: `version ${version} already exists (latest ${latest}); versions are immutable` }, 409);
        }
        const created = await deps.insertTemplate(site.site_id, userId, { ...t, version });
        return json({ ok: true, template_id: created.id, key: t.key, version: created.version }, 201);
      }

      // ── POST /jobs — create a job over a work-list ────────────────────────
      if (req.method === 'POST' && path === '/jobs') {
        const j = await body<JobInput>();
        if (!j.template_key) return json({ error: 'template_key required' }, 400);
        const version = j.template_version ?? (await deps.getLatestTemplateVersion(site.site_id, j.template_key));
        if (version === null) return json({ error: `no template "${j.template_key}"` }, 404);
        const template = await deps.getTemplate(site.site_id, j.template_key, version);
        if (!template) return json({ error: `no template "${j.template_key}" v${version}` }, 404);

        let itemKeys: string[];
        if (j.enumerate === 'combo-grid') {
          const f = j.filter ?? {};
          itemKeys = enumerateComboGrid()
            .filter(({ lifePath, destiny }) => {
              if (f.master === 'exclude' && (isMaster(lifePath) || isMaster(destiny))) return false;
              if (f.master === 'only' && !(isMaster(lifePath) || isMaster(destiny))) return false;
              if (f.life_paths && !f.life_paths.includes(lifePath as number)) return false;
              if (f.destinies && !f.destinies.includes(destiny as number)) return false;
              return true;
            })
            .map(({ lifePath, destiny }) => comboSlug(lifePath as CoreNumber, destiny as CoreNumber));
        } else if (j.item_keys?.length) {
          itemKeys = j.item_keys;
        } else {
          return json({ error: 'item_keys or enumerate required' }, 400);
        }

        // Filter out already-published keys (WP4: build-the-work-list step).
        const published = await deps.getPublishedItemKeys(site.site_id, j.template_key);
        itemKeys = itemKeys.filter((k) => !published.has(k));
        if (itemKeys.length === 0) return json({ error: 'work-list is empty after excluding published items' }, 400);

        const job = await deps.insertJob({
          site_id: site.site_id,
          template_id: template.id,
          review_sample_pct: j.review_sample_pct ?? 25,
          mode: j.mode ?? 'generate',
          item_count: itemKeys.length,
          created_by: userId,
        });

        const rows = await Promise.all(itemKeys.map(async (item_key) => {
          const input_data = buildComboInput(item_key);
          return {
            site_id: site.site_id,
            job_id: job.id,
            template_key: j.template_key,
            template_version: version,
            item_key,
            data_hash: await dataHash(input_data),
            input_data,
            status: 'pending',
          };
        }));
        const inserted = await deps.insertItems(rows);
        return json({ ok: true, job_id: job.id, item_count: itemKeys.length, inserted, deduped: itemKeys.length - inserted }, 201);
      }

      // ── POST /jobs/{id}/run — loop prose-generate, then batch gates ──────
      const run = path.match(/^\/jobs\/([0-9a-f-]+)\/run$/);
      if (req.method === 'POST' && run) {
        const job = await deps.getJob(site.site_id, run[1]);
        if (!job) return json({ error: 'job not found' }, 404);

        const started = deps.now();
        let processed = 0;
        const failures: string[] = [];
        // One item per generate invocation; loop until drained or out of budget.
        while (deps.now() - started < runBudgetMs) {
          const ids = await deps.getPendingItemIds(job.id, 5);
          if (ids.length === 0) break;
          for (const id of ids) {
            if (deps.now() - started >= runBudgetMs) break;
            const res = await deps.generate(id, job.mode);
            processed++;
            if (!res.ok) failures.push(`${id}: ${res.error}`);
          }
        }

        const remaining = await deps.countPending(job.id);
        let batchGatesRan = false;
        if (remaining === 0) {
          const template = await deps.getTemplateById(job.template_id);
          const items = await deps.getJobItemsWithOutput(job.id);
          const results = runBatchGates(
            items.map((it) => ({ id: it.id, output: (it.edited_output ?? it.output)! })),
            template?.guards ?? {},
          );
          for (const it of items) {
            const r = results.get(it.id);
            if (!r) continue;
            await deps.saveBatchResults(it.id, r.similarity, r.gates);
            // A red batch flag on a clean item pulls it into the review queue.
            if (it.status === 'generated' && r.gates.some((g) => !g.passed)) {
              await deps.updateItem(it.id, { status: 'flagged' });
            }
          }
          await deps.markJobDone(job.id);
          batchGatesRan = true;
        }
        return json({ ok: true, processed, remaining, batch_gates_ran: batchGatesRan, failures });
      }

      // ── GET /jobs, GET /stats — dashboard reads ──────────────────────────
      if (req.method === 'GET' && path === '/jobs') {
        const jobs = await deps.listJobs(site.site_id, Number(url.searchParams.get('limit') ?? 20));
        return json({ ok: true, jobs });
      }
      if (req.method === 'GET' && path === '/stats') {
        const stats = await deps.getStats(site.site_id);
        return json({ ok: true, ...stats });
      }

      // ── GET /items — review queue ────────────────────────────────────────
      if (req.method === 'GET' && path === '/items') {
        const items = await deps.listItems(site.site_id, {
          status: url.searchParams.get('status') ?? undefined,
          job_id: url.searchParams.get('job_id') ?? undefined,
          template_key: url.searchParams.get('template') ?? undefined,
          limit: Number(url.searchParams.get('limit') ?? 100),
        });
        return json({ ok: true, items });
      }

      // ── Per-item actions ─────────────────────────────────────────────────
      const action = path.match(/^\/items\/([0-9a-f-]+)\/(approve|reject|publish|edit)$/);
      if (req.method === 'POST' && action) {
        const [, itemId, verb] = action;
        const item = await deps.getItem(site.site_id, itemId);
        if (!item) return json({ error: 'item not found' }, 404);

        switch (verb) {
          case 'approve': {
            // ═══ GROUND RULE 1 — NON-NEGOTIABLE ═══
            // Refuse while any fail-severity gate (item OR batch) is red.
            if (hasFailingGate(allGates(item))) {
              return json({
                error: 'cannot approve: fail-severity gate is red',
                gates: allGates(item).filter((g) => g.severity === 'fail' && !g.passed),
              }, 409);
            }
            if (!REVIEWABLE.has(item.status)) {
              return json({ error: `cannot approve from status "${item.status}"` }, 409);
            }
            await deps.updateItem(itemId, { status: 'approved', reviewer: userId });
            return json({ ok: true, status: 'approved' });
          }
          case 'reject': {
            if (item.status === 'published') return json({ error: 'published items are immutable' }, 409);
            const note = (await req.json().catch(() => ({}))) as { review_note?: string };
            await deps.updateItem(itemId, { status: 'rejected', reviewer: userId, review_note: note.review_note ?? null });
            return json({ ok: true, status: 'rejected' });
          }
          case 'edit': {
            // Publishing is one-way (§5): a published item is never mutated.
            if (item.status === 'published') return json({ error: 'published items are immutable — bump template_version and republish' }, 409);
            const b = (await req.json()) as { edited_output?: Record<string, unknown> };
            if (!b.edited_output) return json({ error: 'edited_output required' }, 400);
            await deps.updateItem(itemId, { edited_output: b.edited_output, reviewer: userId });
            return json({ ok: true });
          }
          case 'publish': {
            if (item.status === 'published') return json({ ok: true, status: 'published', already: true });
            if (item.status !== 'approved') {
              return json({ error: `only approved items publish (status "${item.status}")` }, 409);
            }
            // Belt & braces: approve is the gate-blocking step, but never let
            // a red fail gate through even if state was mangled manually.
            if (hasFailingGate(allGates(item))) {
              return json({ error: 'cannot publish: fail-severity gate is red' }, 409);
            }
            await deps.updateItem(itemId, { status: 'published', updated_at: new Date().toISOString() });
            const hooks = await deps.getWebhooks(site.site_id);
            await Promise.allSettled(hooks.map((h) =>
              deps.fireWebhook(h.url, { site: site.slug, template: item.template_key, item_count: 1 }),
            ));
            return json({ ok: true, status: 'published' });
          }
        }
      }

      return json({ error: 'not found' }, 404);
    } catch (err) {
      if (err instanceof SyntaxError) return json({ error: 'invalid JSON body' }, 400);
      return json({ error: String(err instanceof Error ? err.message : err) }, 500);
    }
  };
}
