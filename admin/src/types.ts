export interface GateResult {
  gate: string;
  severity: 'fail' | 'flag';
  passed: boolean;
  detail?: string;
}

export interface ReviewItem {
  id: string;
  item_key: string;
  template_key: string;
  template_version: number;
  status: string;
  similarity: number | null;
  validation: { gates?: GateResult[]; batch_gates?: GateResult[] };
  output: Record<string, unknown> | null;
  edited_output: Record<string, unknown> | null;
}

export interface JobRow {
  id: string;
  status: string;
  mode: string;
  item_count: number;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
  finished_at: string | null;
  template?: string;
}

export interface Stats {
  items_by_status: Record<string, number>;
  published_total: number;
  tokens_in: number;
  tokens_out: number;
}

export interface DashboardData {
  siteSlug: string;
  adminName: string;
  stats: Stats;
  jobs: JobRow[];
  review: ReviewItem[];
}

export interface MetricItem {
  item_key: string;
  clicks: number;
  impressions: number;
  avg_position: number | null;
  conversions: number;
  revenue: number;
  ctr: number | null;
}

export interface MetricsSummary {
  window_days: number;
  totals: { clicks: number; impressions: number; conversions: number; revenue: number };
  items: MetricItem[]; // sorted by clicks desc
}

/** The operator surface the UI needs — backed by prose-admin (RemoteSource). */
export interface DataSource {
  load(): Promise<DashboardData>;
  metrics(): Promise<MetricsSummary | null>;
  approve(itemId: string): Promise<{ ok: boolean; error?: string }>;
  reject(itemId: string): Promise<{ ok: boolean; error?: string }>;
  publish(itemId: string): Promise<{ ok: boolean; error?: string }>;
  createJob(input: { template_key: string; master: 'exclude' | 'only' | 'all'; review_sample_pct: number }): Promise<{ ok: boolean; error?: string; job_id?: string }>;
  runJob(jobId: string): Promise<{ ok: boolean; remaining?: number; error?: string }>;
}
