/**
 * RemoteSource — the single data source: speaks to prose-admin with a Supabase
 * user JWT. There is no mock/demo source; the admin UI always shows live
 * engine data.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DashboardData, DataSource, MetricsSummary } from './types';

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
    // The actionable queue is every item awaiting a human decision: flagged
    // (needs review), generated (clean, needs approve+publish), and approved
    // (needs publish). Fetching only `flagged` stranded clean items AND made
    // Publish unreachable — an approved item dropped off the list on reload.
    const [stats, jobs, flagged, generated, approved] = await Promise.all([
      this.call('GET', '/stats'),
      this.call('GET', '/jobs?limit=30'),
      this.call('GET', '/items?status=flagged&limit=50'),
      this.call('GET', '/items?status=generated&limit=50'),
      this.call('GET', '/items?status=approved&limit=50'),
    ]);
    return {
      siteSlug: this.cfg.siteSlug,
      adminName: this.cfg.email.split('@')[0],
      // Guard: a transient /stats failure must not white-screen the dashboard.
      stats: stats.ok
        ? stats
        : { items_by_status: {}, published_total: 0, tokens_in: 0, tokens_out: 0 },
      jobs: jobs.jobs ?? [],
      review: [...(flagged.items ?? []), ...(approved.items ?? []), ...(generated.items ?? [])],
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
