/**
 * RemoteSource — speaks to prose-admin with a Supabase user JWT.
 * Engine endpoint is baked at build time via VITE_*.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  ApiResult,
  CreateJobInput,
  DashboardData,
  DataSource,
  JobRow,
  MetricsSummary,
  ReviewItem,
  TemplateFull,
  TemplateRow,
} from './types';

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

function mapJob(j: Record<string, unknown>): JobRow {
  const tpl = j.prose_templates as { key?: string } | null;
  return {
    id: j.id as string,
    status: j.status as string,
    mode: j.mode as string,
    item_count: Number(j.item_count ?? 0),
    tokens_in: Number(j.tokens_in ?? 0),
    tokens_out: Number(j.tokens_out ?? 0),
    created_at: j.created_at as string,
    finished_at: (j.finished_at as string | null) ?? null,
    template: tpl?.key,
    review_sample_pct: j.review_sample_pct as number | undefined,
  };
}

export class RemoteSource implements DataSource {
  private supabase: SupabaseClient;
  private token = '';
  readonly siteSlug: string;
  readonly adminName: string;

  constructor(private cfg: RemoteConfig) {
    this.supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    this.siteSlug = cfg.siteSlug;
    this.adminName = cfg.email.split('@')[0];
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

  private async call<T extends ApiResult = ApiResult>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
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
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) return { ...json, ok: false, error: String(json.error ?? `HTTP ${res.status}`) } as T;
    return { ...json, ok: true } as T;
  }

  async load(): Promise<DashboardData> {
    const [stats, jobs, flagged, generated, approved] = await Promise.all([
      this.call('GET', '/stats'),
      this.call('GET', '/jobs?limit=30'),
      this.call('GET', '/items?status=flagged&limit=50'),
      this.call('GET', '/items?status=generated&limit=50'),
      this.call('GET', '/items?status=approved&limit=50'),
    ]);
    return {
      siteSlug: this.cfg.siteSlug,
      adminName: this.adminName,
      stats: stats.ok
        ? (stats as unknown as DashboardData['stats'])
        : { items_by_status: {}, published_total: 0, tokens_in: 0, tokens_out: 0 },
      jobs: (jobs.jobs as Record<string, unknown>[] ?? []).map(mapJob),
      review: [
        ...((flagged.items as ReviewItem[]) ?? []),
        ...((approved.items as ReviewItem[]) ?? []),
        ...((generated.items as ReviewItem[]) ?? []),
      ],
    };
  }

  metrics = async (): Promise<MetricsSummary | null> => {
    const res = await this.call('GET', '/metrics?window=28');
    return res.ok && (res.items as unknown[])?.length ? (res as unknown as MetricsSummary) : null;
  };

  listTemplates = async (): Promise<TemplateRow[]> => {
    const res = await this.call('GET', '/templates');
    return res.ok ? (res.templates as TemplateRow[]) ?? [] : [];
  };

  getTemplate = async (key: string, version?: number): Promise<TemplateFull | null> => {
    const q = version ? `?version=${version}` : '';
    const res = await this.call('GET', `/templates/${encodeURIComponent(key)}${q}`);
    return res.ok ? (res.template as TemplateFull) : null;
  };

  createTemplate = (row: Omit<TemplateFull, 'id' | 'version' | 'created_at'> & { version?: number }) =>
    this.call('POST', '/templates', row);

  testTemplate = (key: string, inputData: Record<string, unknown>, version?: number, itemKey?: string) =>
    this.call('POST', '/templates/test', { key, version, input_data: inputData, item_key: itemKey });

  listJobs = async (limit = 30): Promise<JobRow[]> => {
    const res = await this.call('GET', `/jobs?limit=${limit}`);
    return res.ok ? ((res as ApiResult & { jobs?: Record<string, unknown>[] }).jobs ?? []).map(mapJob) : [];
  };

  getJob = async (id: string): Promise<JobRow | null> => {
    const res = await this.call<ApiResult & { job?: Record<string, unknown> }>('GET', `/jobs/${id}`);
    return res.ok && res.job ? mapJob(res.job) : null;
  };

  createJob = (input: CreateJobInput) =>
    this.call<ApiResult & { job_id?: string; item_count?: number }>('POST', '/jobs', input);

  runJob = (id: string) =>
    this.call<ApiResult & { remaining?: number; processed?: number }>('POST', `/jobs/${id}/run`);

  listItems = async (filter: { status?: string; job_id?: string; template?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.job_id) params.set('job_id', filter.job_id);
    if (filter.template) params.set('template', filter.template);
    params.set('limit', String(filter.limit ?? 100));
    const res = await this.call('GET', `/items?${params}`);
    return res.ok ? ((res.items as ReviewItem[]) ?? []) : [];
  };

  approve = (id: string) => this.call('POST', `/items/${id}/approve`);
  reject = (id: string, note?: string) => this.call('POST', `/items/${id}/reject`, { review_note: note });
  publish = (id: string) => this.call('POST', `/items/${id}/publish`);
  edit = (id: string, editedOutput: Record<string, unknown>) =>
    this.call('POST', `/items/${id}/edit`, { edited_output: editedOutput });
  regen = (id: string, note?: string) => this.call('POST', `/items/${id}/regen`, { review_note: note });
}