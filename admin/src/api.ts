/**
 * Data sources: RemoteSource speaks to prose-admin with a Supabase user JWT;
 * DemoSource is a deterministic in-memory world so the UI can be explored
 * (and screenshotted) with no engine deployed.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DashboardData, DataSource, GateResult, MetricsSummary, ReviewItem, JobRow } from './types';

export interface RemoteConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  adminApiUrl: string; // e.g. https://<ref>.supabase.co/functions/v1/prose-admin
  siteSlug: string;
  email: string;
  password: string;
}

const CONFIG_KEY = 'pseo-admin-config';

export function savedConfig(): Omit<RemoteConfig, 'password'> | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export class RemoteSource implements DataSource {
  private supabase: SupabaseClient;
  private token = '';

  constructor(private cfg: RemoteConfig) {
    this.supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  }

  async signIn(): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: this.cfg.email,
      password: this.cfg.password,
    });
    if (error || !data.session) throw new Error(error?.message ?? 'sign-in failed');
    this.token = data.session.access_token;
    const { password: _p, ...rest } = this.cfg;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(rest));
  }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.cfg.adminApiUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        'x-site-slug': this.cfg.siteSlug,
        'content-type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error ?? `HTTP ${res.status}`, ...json };
    return { ok: true, ...json };
  }

  async load(): Promise<DashboardData> {
    const [stats, jobs, review] = await Promise.all([
      this.call('GET', '/stats'),
      this.call('GET', '/jobs?limit=30'),
      this.call('GET', '/items?status=flagged&limit=30'),
    ]);
    return {
      siteSlug: this.cfg.siteSlug,
      adminName: this.cfg.email.split('@')[0],
      stats,
      jobs: jobs.jobs ?? [],
      review: review.items ?? [],
    };
  }

  metrics = async (): Promise<MetricsSummary | null> => {
    const res = await this.call('GET', '/metrics?window=28');
    return res.ok && res.items?.length ? res : null;
  };
  approve = (id: string) => this.call('POST', `/items/${id}/approve`);
  reject = (id: string) => this.call('POST', `/items/${id}/reject`, {});
  publish = (id: string) => this.call('POST', `/items/${id}/publish`);
  createJob = (input: { template_key: string; master: 'exclude' | 'only' | 'all'; review_sample_pct: number }) =>
    this.call('POST', '/jobs', {
      template_key: input.template_key,
      enumerate: 'combo-grid',
      ...(input.master === 'all' ? {} : { filter: { master: input.master } }),
      review_sample_pct: input.review_sample_pct,
    });
  runJob = (id: string) => this.call('POST', `/jobs/${id}/run`);
}

// ── Demo world ───────────────────────────────────────────────────────────────

const GATE_NAMES = ['schema', 'unicode', 'length', 'required_mentions', 'banned_phrases',
  'numeric_consistency', 'faq_shape', 'entity_consistency', 'similarity', 'phrase_frequency',
  'review_sample', 'voice'];

function demoGates(failIdx: number[]): { gates: GateResult[]; batch_gates: GateResult[] } {
  const all = GATE_NAMES.map((gate, i): GateResult => ({
    gate,
    severity: ['similarity', 'phrase_frequency', 'entity_consistency', 'review_sample', 'voice'].includes(gate) ? 'flag' : 'fail',
    passed: !failIdx.includes(i),
    detail: failIdx.includes(i) ? `${gate} needs review` : undefined,
  }));
  return { gates: all.slice(0, 8), batch_gates: all.slice(8) };
}

export class DemoSource implements DataSource {
  private review: ReviewItem[];
  private jobs: JobRow[];
  private published = 90;

  constructor() {
    const mk = (lp: number, dt: number, failIdx: number[], similarity: number): ReviewItem => ({
      id: `demo-${lp}-${dt}`,
      item_key: `so-chu-dao-${lp}-su-menh-${dt}`,
      template_key: 'combo-so-chu-dao-su-menh',
      template_version: 2,
      status: 'flagged',
      similarity,
      validation: demoGates(failIdx),
      output: { intro: '…' },
      edited_output: null,
    });
    this.review = [
      mk(7, 3, [8], 0.61),
      mk(11, 5, [5], 0.38),
      mk(2, 9, [9, 8], 0.72),
      mk(4, 22, [], 0.41),
    ];
    const day = (d: number, patch: Partial<JobRow> = {}): JobRow => ({
      id: `job-${d}`,
      status: 'done',
      mode: 'generate',
      item_count: 12,
      tokens_in: 210_000,
      tokens_out: 96_000,
      created_at: `2026-07-${String(d).padStart(2, '0')}T08:00:00Z`,
      finished_at: `2026-07-${String(d).padStart(2, '0')}T08:20:00Z`,
      template: 'combo-so-chu-dao-su-menh v2',
      ...patch,
    });
    this.jobs = [
      day(1), day(5), day(14, { item_count: 20 }), day(17), day(19),
      day(23, { item_count: 15 }), day(28, { status: 'running', finished_at: null }),
      day(11, { status: 'pending', finished_at: null, created_at: '2026-07-30T08:00:00Z' }),
    ];
  }

  load(): Promise<DashboardData> {
    return Promise.resolve({
      siteSlug: 'sochumenh',
      adminName: 'Tad',
      stats: {
        items_by_status: {
          pending: 8, generated: 112, flagged: this.review.length,
          failed_validation: 6, approved: 21, rejected: 3, published: this.published,
        },
        published_total: this.published,
        tokens_in: this.jobs.reduce((s, j) => s + j.tokens_in, 0),
        tokens_out: this.jobs.reduce((s, j) => s + j.tokens_out, 0),
      },
      jobs: this.jobs,
      review: this.review,
    });
  }

  metrics = (): Promise<MetricsSummary | null> => {
    const mk = (item_key: string, clicks: number, impressions: number, pos: number, conversions: number, revenue: number) => ({
      item_key, clicks, impressions, avg_position: pos, conversions, revenue,
      ctr: impressions ? clicks / impressions : null,
    });
    const items = [
      mk('so-chu-dao-7-su-menh-3', 1840, 21400, 4.2, 31, 15_190_000),
      mk('so-chu-dao-1-su-menh-5', 1210, 16800, 5.1, 18, 8_820_000),
      mk('so-chu-dao-9-su-menh-2', 880, 9400, 6.8, 11, 5_390_000),
      mk('so-chu-dao-3-su-menh-3', 610, 8800, 7.9, 6, 2_940_000),
      mk('so-chu-dao-8-su-menh-8', 95, 7100, 18.4, 0, 0),
      mk('so-chu-dao-2-su-menh-4', 61, 5900, 23.1, 0, 0),
      mk('so-chu-dao-6-su-menh-9', 44, 4100, 27.6, 1, 490_000),
    ];
    return Promise.resolve({
      window_days: 28,
      totals: items.reduce((t, r) => ({
        clicks: t.clicks + r.clicks, impressions: t.impressions + r.impressions,
        conversions: t.conversions + r.conversions, revenue: t.revenue + r.revenue,
      }), { clicks: 0, impressions: 0, conversions: 0, revenue: 0 }),
      items,
    });
  };

  private mutate(id: string, status: string) {
    const it = this.review.find((r) => r.id === id);
    if (!it) return { ok: false, error: 'not found' };
    const failing = [...(it.validation.gates ?? []), ...(it.validation.batch_gates ?? [])]
      .filter((g) => g.severity === 'fail' && !g.passed);
    if (status === 'approved' && failing.length > 0) {
      return { ok: false, error: `cannot approve: fail-severity gate is red (${failing.map((g) => g.gate).join(', ')})` };
    }
    if (status === 'published' && it.status !== 'approved') {
      return { ok: false, error: 'only approved items publish' };
    }
    it.status = status;
    if (status === 'published') {
      this.published++;
      this.review = this.review.filter((r) => r.id !== id);
    }
    if (status === 'rejected') this.review = this.review.filter((r) => r.id !== id);
    return { ok: true };
  }

  approve = (id: string) => Promise.resolve(this.mutate(id, 'approved'));
  reject = (id: string) => Promise.resolve(this.mutate(id, 'rejected'));
  publish = (id: string) => Promise.resolve(this.mutate(id, 'published'));
  createJob = () => {
    const id = `job-new-${this.jobs.length}`;
    this.jobs.unshift({
      id, status: 'pending', mode: 'generate', item_count: 18, tokens_in: 0, tokens_out: 0,
      created_at: new Date('2026-07-30T09:00:00Z').toISOString(), finished_at: null,
      template: 'combo-so-chu-dao-su-menh v2',
    });
    return Promise.resolve({ ok: true, job_id: id });
  };
  runJob = (id: string) => {
    const j = this.jobs.find((x) => x.id === id);
    if (j) {
      j.status = 'done';
      j.finished_at = new Date().toISOString();
      j.tokens_in = 150_000;
      j.tokens_out = 70_000;
    }
    return Promise.resolve({ ok: true, remaining: 0 });
  };
}
