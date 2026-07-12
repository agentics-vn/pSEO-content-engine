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
  regen_count?: number;
  validation: { gates?: GateResult[]; batch_gates?: GateResult[] };
  output: Record<string, unknown> | null;
  edited_output: Record<string, unknown> | null;
  input_data?: Record<string, unknown>;
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
  review_sample_pct?: number;
}

export interface TemplateRow {
  id: string;
  key: string;
  version: number;
  name: string;
  model: string;
  created_at: string;
}

export interface TemplateFull extends TemplateRow {
  system_prompt: string;
  user_template: string;
  output_schema: Record<string, unknown>;
  few_shots: unknown[];
  guards: Record<string, unknown>;
  temperature: number;
  max_tokens: number;
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
  items: MetricItem[];
}

export interface CreateJobInput {
  template_key: string;
  review_sample_pct?: number;
  mode?: 'generate' | 'regenerate';
  template_version?: number;
  enumerate?: 'combo-grid';
  filter?: { master?: 'exclude' | 'only'; life_paths?: number[]; destinies?: number[] };
  items?: Array<{ item_key: string; input_data: Record<string, unknown> }>;
  item_keys?: string[];
}

export interface ApiResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

/** The operator surface the UI needs — backed by prose-admin (RemoteSource). */
export interface DataSource {
  siteSlug: string;
  adminName: string;
  load(): Promise<DashboardData>;
  metrics(): Promise<MetricsSummary | null>;
  listTemplates(): Promise<TemplateRow[]>;
  getTemplate(key: string, version?: number): Promise<TemplateFull | null>;
  createTemplate(row: Omit<TemplateFull, 'id' | 'version' | 'created_at'> & { version?: number }): Promise<ApiResult>;
  testTemplate(key: string, inputData: Record<string, unknown>, version?: number, itemKey?: string): Promise<ApiResult>;
  listJobs(limit?: number): Promise<JobRow[]>;
  getJob(id: string): Promise<JobRow | null>;
  createJob(input: CreateJobInput): Promise<ApiResult & { job_id?: string; item_count?: number }>;
  runJob(id: string): Promise<ApiResult & { remaining?: number; processed?: number }>;
  listItems(filter: { status?: string; job_id?: string; template?: string; limit?: number }): Promise<ReviewItem[]>;
  approve(itemId: string): Promise<ApiResult>;
  reject(itemId: string, note?: string): Promise<ApiResult>;
  publish(itemId: string): Promise<ApiResult>;
  edit(itemId: string, editedOutput: Record<string, unknown>): Promise<ApiResult>;
  regen(itemId: string, note?: string): Promise<ApiResult>;
}
