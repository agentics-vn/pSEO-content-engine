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
import { corsHeaders, corsPreflight } from '../_shared/cors.ts';
import { assembleItemGates } from '../prose-generate/lib.ts';
import { KNOWN_MODELS, isKnownModel } from '../_shared/models.ts';

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
  /**
   * The tenant-generic work-list: explicit rows of (item_key, input_data).
   * This is how ANY vertical onboards with zero engine code — the client's
   * backend (or a CSV import in the admin UI) supplies the structured data
   * each page stands on, and the engine hashes it into the cache key.
   */
  items?: Array<{ item_key: string; input_data: Record<string, unknown>; priority?: number }>;
  /** Convenience for keys resolvable by a built-in input builder (combo axis). */
  item_keys?: string[];
  /** 'combo-grid' enumerates the full 12×12 axis minus already-published. */
  enumerate?: 'combo-grid';
  /**
   * K1: search-demand priority per item_key (higher = built/reviewed first).
   * Real query volumes are strategy data the engine never invents — the operator
   * derives these from keywords.csv (see scripts/keywords-to-worklist.mjs) and
   * passes them in; the drain orders by priority DESC. Applies to the
   * item_keys/enumerate paths; explicit `items` rows may also set `priority`.
   */
  priorities?: Record<string, number>;
  filter?: {
    master?: 'exclude' | 'only';
    life_paths?: number[];
    destinies?: number[];
  };
  review_sample_pct?: number;
  mode?: 'generate' | 'regenerate';
}

/** editor: templates/jobs; reviewer: + review actions; owner: everything. */
const ROLE_RANK: Record<string, number> = { editor: 1, reviewer: 2, owner: 3 };
function atLeast(role: string, needed: 'editor' | 'reviewer'): boolean {
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK[needed];
}

export interface ItemOutcome {
  status: string;
  validation: { gates?: GateResult[]; batch_gates?: GateResult[] };
}

/**
 * Adaptive sampling: when a job omits review_sample_pct, derive it from the
 * template's recent first-pass gate history. Human review is the unit
 * economics of the whole pipeline — spend it where the model still fails.
 * Auto-flagged items ALWAYS reach the queue regardless of this number; this
 * only tunes the extra random-sample rate on clean items.
 */
export function computeAutoSamplePct(outcomes: ItemOutcome[]): { pct: number; basis: string } {
  const considered = outcomes.filter((o) => o.status !== 'pending');
  if (considered.length < 15) {
    return { pct: 100, basis: `golden phase: only ${considered.length} generated items on record` };
  }
  const failures = considered.filter((o) =>
    o.status === 'failed_validation' ||
    [...(o.validation?.gates ?? []), ...(o.validation?.batch_gates ?? [])]
      .some((g) => g.severity === 'fail' && !g.passed)).length;
  const rate = 1 - failures / considered.length;
  const pct = rate >= 0.99 ? 5 : rate >= 0.95 ? 10 : 25;
  return { pct, basis: `first-pass rate ${(rate * 100).toFixed(1)}% over last ${considered.length} items` };
}

export interface AdminItemRow {
  id: string;
  site_id: string;
  job_id: string;
  template_key: string;
  template_version: number;
  item_key: string;
  status: string;
  input_data: Record<string, unknown>;
  output: Record<string, unknown> | null;
  edited_output: Record<string, unknown> | null;
  validation: {
    gates?: GateResult[];
    batch_gates?: GateResult[];
    review_sampled?: boolean;
  };
  similarity: number | null;
  regen_count?: number;
  tokens_in?: number;
  tokens_out?: number;
  usage_channel?: string | null;
}

export interface AdminDeps {
  /** Resolve the caller's user id from their JWT (null = unauthenticated). */
  getUserId(jwt: string): Promise<string | null>;
  getMemberships(userId: string): Promise<SiteMembership[]>;

  getLatestTemplateVersion(siteId: string, key: string): Promise<number | null>;
  getTemplate(siteId: string, key: string, version: number): Promise<
    | { id: string; key: string; version: number; guards: Record<string, unknown>; output_schema: Record<string, unknown> }
    | null
  >;
  listTemplates(siteId: string): Promise<Array<{
    id: string; key: string; version: number; name: string; model: string; created_at: string;
  }>>;
  getTemplateFull(siteId: string, key: string, version: number): Promise<Record<string, unknown> | null>;
  insertTemplate(siteId: string, userId: string, row: TemplateInput & { version: number }): Promise<{ id: string; version: number }>;
  /** Site persona (sites.persona) — fetched here so the dry-run proxy can carry
   *  it (the dry-run envelope has no site_id and prose-generate stays DB-free). */
  getSitePersona(siteId: string): Promise<string | null>;
  invokeDryRun(siteId: string, template: Record<string, unknown>, inputData: Record<string, unknown>, itemKey?: string, persona?: string | null): Promise<{
    ok: boolean; output?: Record<string, unknown>; gates?: GateResult[];
    tokens_in?: number; tokens_out?: number; error?: string;
  }>;

  getPublishedItemKeys(siteId: string, templateKey: string): Promise<Set<string>>;
  insertJob(row: {
    site_id: string; template_id: string; review_sample_pct: number;
    mode: string; item_count: number; created_by: string;
  }): Promise<{ id: string }>;
  /** Insert pending items; ON CONFLICT (cache key) DO NOTHING. Returns rows inserted. */
  insertItems(rows: Array<{
    site_id: string; job_id: string; template_key: string; template_version: number;
    item_key: string; data_hash: string; input_data: unknown; status: string; priority?: number;
  }>): Promise<number>;
  /**
   * Regenerate: reset EXISTING non-published rows for these item_keys (at this
   * template_version) back to pending under the new job so the run loop
   * re-generates them. Published rows are left untouched — refreshing live
   * content requires a new template_version (immutable-version + cache-key
   * design), so those keys are returned separately for the caller to surface.
   */
  resetItemsForRegenerate(
    siteId: string, templateKey: string, version: number, itemKeys: string[], jobId: string,
  ): Promise<{ reset: string[]; published: string[] }>;

  getJob(siteId: string, jobId: string): Promise<
    | {
      id: string; site_id: string; template_id: string; status: string; mode: string;
      review_sample_pct: number; item_count?: number; tokens_in?: number; tokens_out?: number;
      tokens_in_batch?: number; tokens_out_batch?: number; tokens_in_sync?: number; tokens_out_sync?: number;
      created_at?: string; finished_at?: string | null;
      anthropic_batch_id?: string | null; batch_status?: string | null; run_channel?: string;
    }
    | null
  >;
  getTemplateById(templateId: string): Promise<{ key: string; version: number; guards: Record<string, unknown> } | null>;
  getPendingItemIds(jobId: string, limit: number): Promise<string[]>;
  countPending(jobId: string): Promise<number>;
  getJobItemsWithOutput(jobId: string): Promise<AdminItemRow[]>;
  saveBatchResults(itemId: string, similarity: number | null, batchGates: GateResult[]): Promise<void>;
  markJobDone(jobId: string): Promise<void>;
  /** Patch job columns (e.g. run_channel on sync escape hatch). */
  updateJob(jobId: string, patch: Record<string, unknown>): Promise<void>;

  listItems(siteId: string, filter: { status?: string; job_id?: string; template_key?: string; limit: number }): Promise<AdminItemRow[]>;
  getItem(siteId: string, itemId: string): Promise<AdminItemRow | null>;
  updateItem(itemId: string, patch: Record<string, unknown>): Promise<void>;

  /** Invoke prose-generate for one item (service-role, internal). */
  generate(itemId: string, mode?: string): Promise<{ ok: boolean; status?: string; cached?: boolean; error?: string }>;

  submitBatch(jobId: string): Promise<{
    ok: boolean; batch_id?: string; request_count?: number; remaining?: number;
    batch_status?: string; error?: string;
  }>;
  collectBatch(jobId: string): Promise<{
    ok: boolean; batch_status?: string; request_counts?: Record<string, number>;
    processed?: number; remaining?: number; failures?: number; error?: string;
  }>;

  getWebhooks(siteId: string): Promise<Array<{ url: string; secret: string }>>;
  fireWebhook(url: string, payload: unknown, secret?: string): Promise<void>;

  /** Dashboard reads. */
  listJobs(siteId: string, limit: number): Promise<Array<Record<string, unknown>>>;
  getStats(siteId: string): Promise<{
    items_by_status: Record<string, number>;
    published_total: number;
    tokens_in: number;
    tokens_out: number;
    tokens_in_batch?: number;
    tokens_out_batch?: number;
    tokens_in_sync?: number;
    tokens_out_sync?: number;
  }>;

  /** Performance loop reads. */
  getMetricsSummary(siteId: string, sinceDate: string): Promise<Array<{
    item_key: string;
    clicks: number;
    impressions: number;
    avg_position: number | null;
    conversions: number;
    revenue: number;
  }>>;
  getItemKeysForTemplate(siteId: string, templateKey: string): Promise<Set<string>>;
  /** Recent non-pending items of a template, newest first (for auto sampling). */
  getRecentItemOutcomes(siteId: string, templateKey: string, limit: number): Promise<ItemOutcome[]>;

  /** Milliseconds of budget left for the run loop (serverless wall clock). */
  now(): number;
}

function json(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders(req) },
  });
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
    // Browser preflight from Admin UI (Fly / localhost) — must run before auth.
    if (req.method === 'OPTIONS') return corsPreflight(req);

    const url = new URL(req.url);
    // Function may be served under /prose-admin or /functions/v1/prose-admin.
    const path = url.pathname.replace(/^.*?\/prose-admin/, '') || '/';
    const reply = (body: unknown, status = 200) => json(body, status, req);

    // ── Auth: human admin via site_admins, one site per request ────────────
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt) return reply({ error: 'missing bearer token' }, 401);
    const userId = await deps.getUserId(jwt);
    if (!userId) return reply({ error: 'invalid token' }, 401);
    const memberships = await deps.getMemberships(userId);
    if (memberships.length === 0) return reply({ error: 'no site membership' }, 403);
    const wantSlug = req.headers.get('x-site-slug');
    const site = wantSlug
      ? memberships.find((m) => m.slug === wantSlug)
      : memberships.length === 1 ? memberships[0] : undefined;
    if (!site) {
      return reply({
        error: wantSlug ? `not a member of site "${wantSlug}"` : 'multiple site memberships — set x-site-slug',
      }, 403);
    }

    const body = async <T>(): Promise<T> => (await req.json()) as T;

    try {
      // Write endpoints require at least editor; review actions reviewer+.
      const isWrite = req.method === 'POST';
      if (isWrite && !atLeast(site.role, 'editor')) {
        return reply({ error: `role "${site.role}" cannot modify the pipeline` }, 403);
      }

      // ── GET /templates — list site templates ─────────────────────────────
      if (req.method === 'GET' && path === '/templates') {
        const templates = await deps.listTemplates(site.site_id);
        return reply({ ok: true, templates });
      }

      const templateKeyMatch = path.match(/^\/templates\/([^/]+)$/);
      if (req.method === 'GET' && templateKeyMatch) {
        const key = decodeURIComponent(templateKeyMatch[1]);
        const versionParam = url.searchParams.get('version');
        const version = versionParam
          ? Number(versionParam)
          : await deps.getLatestTemplateVersion(site.site_id, key);
        if (version === null || !Number.isFinite(version)) {
          return reply({ error: `no template "${key}"` }, 404);
        }
        const tpl = await deps.getTemplateFull(site.site_id, key, version);
        if (!tpl) return reply({ error: `no template "${key}" v${version}` }, 404);
        return reply({ ok: true, template: tpl });
      }

      // ── POST /templates/test — dry-run without persisting ────────────────
      if (req.method === 'POST' && path === '/templates/test') {
        const t = await body<{ key: string; version?: number; input_data: Record<string, unknown>; item_key?: string }>();
        if (!t.key || !t.input_data || typeof t.input_data !== 'object') {
          return reply({ error: 'key and input_data required' }, 400);
        }
        const version = t.version ?? (await deps.getLatestTemplateVersion(site.site_id, t.key));
        if (version === null) return reply({ error: `no template "${t.key}"` }, 404);
        const tpl = await deps.getTemplateFull(site.site_id, t.key, version);
        if (!tpl) return reply({ error: `no template "${t.key}" v${version}` }, 404);
        // Thread the site persona so Template Studio tests match real generation.
        const persona = await deps.getSitePersona(site.site_id);
        const result = await deps.invokeDryRun(site.site_id, tpl, t.input_data, t.item_key, persona);
        return reply(result, result.ok ? 200 : 422);
      }

      // ── POST /templates — create/version (immutable per version) ─────────
      if (req.method === 'POST' && path === '/templates') {
        const t = await body<TemplateInput>();
        if (!t.key || !t.name || !t.system_prompt || !t.user_template || !t.output_schema || !t.model) {
          return reply({ error: 'key, name, system_prompt, user_template, output_schema, model are required' }, 400);
        }
        // Hard-block an unknown model at the write point (the Sonnet→Haiku flip is
        // a new template version through here). A typo would otherwise 404 at
        // generation — 144 failed rows + wasted spend. Add new ids to
        // _shared/models.ts when a model ships.
        if (!isKnownModel(t.model)) {
          return reply({ error: `model "${t.model}" is not a known model id (${KNOWN_MODELS.join(', ')}); add it to _shared/models.ts if it is real` }, 400);
        }
        const latest = await deps.getLatestTemplateVersion(site.site_id, t.key);
        const version = t.version ?? (latest ?? 0) + 1;
        if (latest !== null && version <= latest) {
          return reply({ error: `version ${version} already exists (latest ${latest}); versions are immutable` }, 409);
        }
        const created = await deps.insertTemplate(site.site_id, userId, { ...t, version });
        return reply({ ok: true, template_id: created.id, key: t.key, version: created.version }, 201);
      }

      // ── POST /jobs — create a job over a work-list ────────────────────────
      if (req.method === 'POST' && path === '/jobs') {
        const j = await body<JobInput>();
        if (!j.template_key) return reply({ error: 'template_key required' }, 400);
        const version = j.template_version ?? (await deps.getLatestTemplateVersion(site.site_id, j.template_key));
        if (version === null) return reply({ error: `no template "${j.template_key}"` }, 404);
        const template = await deps.getTemplate(site.site_id, j.template_key, version);
        if (!template) return reply({ error: `no template "${j.template_key}" v${version}` }, 404);

        // Build the work-list: explicit (item_key, input_data) rows are the
        // tenant-generic path; item_keys/enumerate resolve through the
        // built-in combo input builder.
        let workList: Array<{ item_key: string; input_data: Record<string, unknown> }>;
        if (j.items?.length) {
          const bad = j.items.find((it) => !it.item_key || !/^[a-z0-9][a-z0-9-]*$/.test(it.item_key)
            || !it.input_data || typeof it.input_data !== 'object');
          if (bad) return reply({ error: `invalid work-list row (item_key must be a slug, input_data an object): ${JSON.stringify(bad).slice(0, 120)}` }, 400);
          const keys = new Set(j.items.map((it) => it.item_key));
          if (keys.size !== j.items.length) return reply({ error: 'duplicate item_key in work-list' }, 400);
          workList = j.items;
        } else {
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
            return reply({ error: 'items, item_keys, or enumerate required' }, 400);
          }
          // buildComboInput throws on a key the built-in enumerator can't
          // resolve — that's a client input error (400), not a server 500.
          // For non-combo verticals, callers pass explicit `items` with
          // input_data instead of `item_keys`.
          try {
            workList = itemKeys.map((item_key) => ({
              item_key,
              input_data: buildComboInput(item_key) as unknown as Record<string, unknown>,
            }));
          } catch (e) {
            return reply({ error: `item_keys not resolvable by the built-in input builder (use explicit \`items\` with input_data for this vertical): ${e instanceof Error ? e.message : e}` }, 400);
          }
        }

        const mode = j.mode ?? 'generate';
        // Generate: drop already-published keys (WP4 — don't re-generate live
        // pages; new keys only). Regenerate: KEEP them — resetItemsForRegenerate
        // below classifies existing rows (re-queue non-published; report
        // published as needs_version_bump). Pre-filtering here would strip the
        // very keys a regenerate job is meant to act on.
        if (mode !== 'regenerate') {
          const published = await deps.getPublishedItemKeys(site.site_id, j.template_key);
          workList = workList.filter((w) => !published.has(w.item_key));
          if (workList.length === 0) return reply({ error: 'work-list is empty after excluding published items' }, 400);
        }

        // Sampling: explicit value wins; otherwise adapt to the template's
        // recent first-pass gate history.
        let samplePct = j.review_sample_pct;
        let sampleBasis = 'explicit';
        if (samplePct === undefined) {
          const outcomes = await deps.getRecentItemOutcomes(site.site_id, j.template_key, 200);
          ({ pct: samplePct, basis: sampleBasis } = computeAutoSamplePct(outcomes));
        } else if (samplePct < 0 || samplePct > 100) {
          return reply({ error: 'review_sample_pct must be 0–100' }, 400);
        }

        const job = await deps.insertJob({
          site_id: site.site_id,
          template_id: template.id,
          review_sample_pct: samplePct,
          mode: j.mode ?? 'generate',
          item_count: workList.length,
          created_by: userId,
        });

        const rows = await Promise.all(workList.map(async (w) => ({
          site_id: site.site_id,
          job_id: job.id,
          template_key: j.template_key,
          template_version: version,
          item_key: w.item_key,
          data_hash: await dataHash(w.input_data),
          input_data: w.input_data,
          status: 'pending',
          // K1: priority from the demand map, else a per-row value, else 0.
          priority: j.priorities?.[w.item_key] ?? (w as { priority?: number }).priority ?? 0,
        })));
        const inserted = await deps.insertItems(rows);

        // Regenerate: brand-new facts insert as fresh pending rows above; for
        // item_keys that ALREADY exist at this version, reset the non-published
        // ones to pending under this job (else they'd sit un-queued and the run
        // loop would no-op — the whole point of a regenerate job). Published
        // keys can't be redone in place; report them so the operator bumps the
        // template_version instead.
        let regenerated = 0;
        let needsVersionBump: string[] = [];
        if (mode === 'regenerate') {
          const existing = workList.map((w) => w.item_key);
          const r = await deps.resetItemsForRegenerate(
            site.site_id, j.template_key, version, existing, job.id,
          );
          regenerated = r.reset.length;
          needsVersionBump = r.published;
        }

        return reply({
          ok: true, job_id: job.id, item_count: workList.length,
          inserted, regenerated,
          deduped: workList.length - inserted - regenerated - needsVersionBump.length,
          needs_version_bump: needsVersionBump,
          review_sample_pct: samplePct, sample_basis: sampleBasis,
        }, 201);
      }

      // ── POST /jobs/{id}/run — batch submit/collect (default) or sync loop ─
      const run = path.match(/^\/jobs\/([0-9a-f-]+)\/run$/);
      if (req.method === 'POST' && run) {
        const job = await deps.getJob(site.site_id, run[1]);
        if (!job) return reply({ error: 'job not found' }, 404);

        const runBody = await req.json().catch(() => ({})) as { channel?: 'sync' | 'batch' };
        const useSync = runBody.channel === 'sync';

        if (useSync) {
          await deps.updateJob(job.id, { run_channel: 'sync', status: 'running' });
          const started = deps.now();
          let processed = 0;
          const failures: string[] = [];
          const attempted = new Set<string>();
          while (deps.now() - started < runBudgetMs) {
            const ids = (await deps.getPendingItemIds(job.id, 500)).filter((id) => !attempted.has(id)).slice(0, 5);
            if (ids.length === 0) break;
            for (const id of ids) {
              if (deps.now() - started >= runBudgetMs) break;
              attempted.add(id);
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
              if (it.status === 'generated' && r.gates.some((g) => !g.passed)) {
                await deps.updateItem(it.id, { status: 'flagged' });
              }
            }
            await deps.markJobDone(job.id);
            batchGatesRan = true;
          }
          return reply({
            ok: true, processed, remaining, batch_gates_ran: batchGatesRan, failures, channel: 'sync',
          });
        }

        // Default: Anthropic Message Batch submit-or-collect.
        let processed = 0;
        const failures: string[] = [];
        let batchStatus = job.batch_status ?? undefined;
        let requestCounts: Record<string, number> | undefined;

        if (job.anthropic_batch_id) {
          const collected = await deps.collectBatch(job.id);
          if (!collected.ok) return reply({ error: collected.error ?? 'collect failed' }, 422);
          processed = collected.processed ?? 0;
          batchStatus = collected.batch_status;
          requestCounts = collected.request_counts;
          if ((collected.failures ?? 0) > 0) {
            failures.push(`${collected.failures} batch request(s) failed or expired`);
          }
        } else {
          const pending = await deps.countPending(job.id);
          if (pending > 0) {
            const submitted = await deps.submitBatch(job.id);
            if (!submitted.ok) return reply({ error: submitted.error ?? 'submit failed' }, 422);
            // Zero requests (e.g. all hash-drift skips) — do not pretend a batch is in flight.
            if ((submitted.request_count ?? 0) === 0 || !submitted.batch_id) {
              return reply({
                ok: true,
                processed: 0,
                remaining: submitted.remaining ?? pending,
                batch_gates_ran: false,
                failures: ['submit produced zero batch requests'],
                channel: 'batch',
              });
            }
            batchStatus = submitted.batch_status ?? 'in_progress';
            return reply({
              ok: true,
              processed: 0,
              remaining: submitted.remaining ?? pending,
              batch_id: submitted.batch_id,
              batch_status: batchStatus,
              request_count: submitted.request_count,
              batch_gates_ran: false,
              failures: [],
              channel: 'batch',
            });
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
            if (it.status === 'generated' && r.gates.some((g) => !g.passed)) {
              await deps.updateItem(it.id, { status: 'flagged' });
            }
          }
          await deps.markJobDone(job.id);
          batchGatesRan = true;
        }

        return reply({
          ok: true,
          processed,
          remaining,
          batch_gates_ran: batchGatesRan,
          failures,
          batch_status: batchStatus,
          request_counts: requestCounts,
          channel: 'batch',
        });
      }

      // ── GET /jobs/{id}, GET /jobs — dashboard reads ──────────────────────
      const jobGet = path.match(/^\/jobs\/([0-9a-f-]+)$/);
      if (req.method === 'GET' && jobGet) {
        const job = await deps.getJob(site.site_id, jobGet[1]);
        if (!job) return reply({ error: 'job not found' }, 404);
        return reply({ ok: true, job });
      }
      if (req.method === 'GET' && path === '/jobs') {
        const jobs = await deps.listJobs(site.site_id, Number(url.searchParams.get('limit') ?? 20));
        return reply({ ok: true, jobs });
      }
      if (req.method === 'GET' && path === '/stats') {
        const stats = await deps.getStats(site.site_id);
        return reply({ ok: true, ...stats });
      }

      // ── GET /metrics — the performance loop's read side ──────────────────
      if (req.method === 'GET' && path === '/metrics') {
        const rawWindow = Number(url.searchParams.get('window') ?? 28);
        const windowDays = Number.isFinite(rawWindow) ? Math.min(Math.max(rawWindow, 1), 180) : 28;
        const since = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
        let rows = await deps.getMetricsSummary(site.site_id, since);
        const template = url.searchParams.get('template');
        if (template) {
          const keys = await deps.getItemKeysForTemplate(site.site_id, template);
          rows = rows.filter((r) => keys.has(r.item_key));
        }
        const totals = rows.reduce((t, r) => ({
          clicks: t.clicks + r.clicks,
          impressions: t.impressions + r.impressions,
          conversions: t.conversions + r.conversions,
          revenue: t.revenue + r.revenue,
        }), { clicks: 0, impressions: 0, conversions: 0, revenue: 0 });
        // Sorted by clicks desc — the UI slices top/bottom; ctr precomputed.
        const items = rows
          .map((r) => ({ ...r, ctr: r.impressions > 0 ? r.clicks / r.impressions : null }))
          .sort((a, b) => b.clicks - a.clicks);
        return reply({ ok: true, window_days: windowDays, totals, items });
      }

      // ── GET /items — review queue ────────────────────────────────────────
      if (req.method === 'GET' && path === '/items') {
        const items = await deps.listItems(site.site_id, {
          status: url.searchParams.get('status') ?? undefined,
          job_id: url.searchParams.get('job_id') ?? undefined,
          template_key: url.searchParams.get('template') ?? undefined,
          limit: Number(url.searchParams.get('limit') ?? 100),
        });
        return reply({ ok: true, items });
      }

      // ── Per-item actions ─────────────────────────────────────────────────
      const regenMatch = path.match(/^\/items\/([0-9a-f-]+)\/regen$/);
      if (req.method === 'POST' && regenMatch) {
        if (!atLeast(site.role, 'reviewer')) {
          return reply({ error: `role "${site.role}" cannot regen items` }, 403);
        }
        const itemId = regenMatch[1];
        const item = await deps.getItem(site.site_id, itemId);
        if (!item) return reply({ error: 'item not found' }, 404);
        if (item.status === 'published') return reply({ error: 'published items are immutable' }, 409);
        const regenCount = item.regen_count ?? 0;
        if (regenCount >= 3) return reply({ error: 'regen limit reached (max 3)' }, 409);
        const note = (await req.json().catch(() => ({}))) as { review_note?: string };
        const patch: Record<string, unknown> = { status: 'pending' };
        if (note.review_note) patch.review_note = note.review_note;
        await deps.updateItem(itemId, patch);
        const res = await deps.generate(itemId, 'regenerate');
        if (!res.ok) return reply({ error: res.error ?? 'regen failed' }, 422);
        return reply({ ok: true, status: res.status, regen_count: regenCount + 1 });
      }

      const action = path.match(/^\/items\/([0-9a-f-]+)\/(approve|reject|publish|edit)$/);
      if (req.method === 'POST' && action) {
        const [, itemId, verb] = action;
        // Review decisions are a reviewer/owner power — an editor can create
        // templates and jobs but never move content toward publish.
        if (!atLeast(site.role, 'reviewer')) {
          return reply({ error: `role "${site.role}" cannot ${verb} items` }, 403);
        }
        const item = await deps.getItem(site.site_id, itemId);
        if (!item) return reply({ error: 'item not found' }, 404);

        switch (verb) {
          case 'approve': {
            // ═══ GROUND RULE 1 — NON-NEGOTIABLE ═══
            // Refuse while any fail-severity gate (item OR batch) is red.
            if (hasFailingGate(allGates(item))) {
              return reply({
                error: 'cannot approve: fail-severity gate is red',
                gates: allGates(item).filter((g) => g.severity === 'fail' && !g.passed),
              }, 409);
            }
            if (!REVIEWABLE.has(item.status)) {
              return reply({ error: `cannot approve from status "${item.status}"` }, 409);
            }
            await deps.updateItem(itemId, { status: 'approved', reviewer: userId });
            return reply({ ok: true, status: 'approved' });
          }
          case 'reject': {
            if (item.status === 'published') return reply({ error: 'published items are immutable' }, 409);
            const note = (await req.json().catch(() => ({}))) as { review_note?: string };
            await deps.updateItem(itemId, { status: 'rejected', reviewer: userId, review_note: note.review_note ?? null });
            return reply({ ok: true, status: 'rejected' });
          }
          case 'edit': {
            // Publishing is one-way (§5): a published item is never mutated.
            if (item.status === 'published') return reply({ error: 'published items are immutable — bump template_version and republish' }, 409);
            const b = (await req.json()) as { edited_output?: Record<string, unknown> };
            if (!b.edited_output || typeof b.edited_output !== 'object') return reply({ error: 'edited_output (object) required' }, 400);
            // RE-GATE the edit — otherwise a reviewer could edit clean content to
            // insert a banned phrase / bad length / unbacked number and it would
            // publish against STALE (green) gate results, defeating ground rule 1.
            // (§ audit) Per-item gates recompute here; batch gates persist as-is.
            const patch: Record<string, unknown> = { edited_output: b.edited_output, reviewer: userId };
            const tpl = await deps.getTemplate(site.site_id, item.template_key, item.template_version);
            if (tpl) {
              const gates = assembleItemGates(
                b.edited_output,
                { output_schema: tpl.output_schema, guards: tpl.guards },
                item.input_data,
              );
              patch.validation = { ...(item.validation ?? {}), gates };
            }
            await deps.updateItem(itemId, patch);
            return reply({ ok: true, regated: !!tpl });
          }
          case 'publish': {
            if (item.status === 'published') return reply({ ok: true, status: 'published', already: true });
            if (item.status !== 'approved') {
              return reply({ error: `only approved items publish (status "${item.status}")` }, 409);
            }
            // Belt & braces: approve is the gate-blocking step, but never let
            // a red fail gate through even if state was mangled manually.
            if (hasFailingGate(allGates(item))) {
              return reply({ error: 'cannot publish: fail-severity gate is red' }, 409);
            }
            await deps.updateItem(itemId, { status: 'published', updated_at: new Date().toISOString() });
            const hooks = await deps.getWebhooks(site.site_id);
            // Enriched so a consumer knows WHAT changed (not just "something did")
            // and can do an incremental pull; HMAC-signed per hook.
            const payload = {
              site: site.slug,
              template: item.template_key,
              template_version: item.template_version,
              item_key: item.item_key,
              item_count: 1,
            };
            await Promise.allSettled(hooks.map((h) => deps.fireWebhook(h.url, payload, h.secret)));
            return reply({ ok: true, status: 'published' });
          }
        }
      }

      return reply({ error: 'not found' }, 404);
    } catch (err) {
      if (err instanceof SyntaxError) return reply({ error: 'invalid JSON body' }, 400);
      return reply({ error: String(err instanceof Error ? err.message : err) }, 500);
    }
  };
}
