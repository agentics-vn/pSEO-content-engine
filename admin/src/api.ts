/**
 * RemoteSource — the single data source: speaks to prose-admin with a Supabase
 * user JWT. There is no mock/demo source; the admin UI always shows live
 * engine data.
 *
 * Engine endpoint (URL / anon key / prose-admin) is baked at build time via
 * VITE_* — one engine DB serves every tenant site. Login only collects
 * credentials + which site to operate on.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DashboardData, DataSource, MetricsSummary } from './types';

export interface EngineConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  adminApiUrl: string;
}

export interface LoginCredentials {
  siteSlug: string;
  email: string;
  password: string;
}

export type RemoteConfig = EngineConfig & LoginCredentials;

const CONFIG_KEY = 'pseo-admin-config';

/** Baked-in engine project. Required at build time for production. */
export function engineConfig(): EngineConfig {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set at build time (see admin/.env.example)',
    );
  }
  const adminApiUrl =
    (import.meta.env.VITE_ADMIN_API_URL ?? '').replace(/\/$/, '') ||
    `${supabaseUrl}/functions/v1/prose-admin`;
  return { supabaseUrl, supabaseAnonKey, adminApiUrl };
}

export function savedCredentials(): Omit<LoginCredentials, 'password'> | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LoginCredentials>;
    if (!parsed.email && !parsed.siteSlug) return null;
    return {
      email: parsed.email ?? '',
      siteSlug: parsed.siteSlug ?? 'sochumenh',
    };
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
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({ email: this.cfg.email, siteSlug: this.cfg.siteSlug }),
    );
  }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.cfg.adminApiUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.token}`,
        apikey: this.cfg.supabaseAnonKey,
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
