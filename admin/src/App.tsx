import { useEffect, useState } from 'react';
import type { DashboardData, DataSource, MetricsSummary, ReviewItem, JobRow } from './types';
import { RemoteSource, savedConfig } from './api';
import {
  IconArchive, IconBell, IconCalendar, IconChevron, IconDoc, IconDots, IconFlag,
  IconGear, IconHome, IconLogout, IconPencil, IconPlus, IconSearch, IconSpark,
} from './icons';

// ── Small helpers ────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('en-US');
const fmtK = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1000 ? `${Math.round(n / 1000)}k`
  : String(n);

function prettyKey(itemKey: string): string {
  const m = /^so-chu-dao-(\d+)-su-menh-(\d+)$/.exec(itemKey);
  return m ? `Chủ đạo ${m[1]} × Sứ mệnh ${m[2]}` : itemKey;
}

function gatesOf(it: ReviewItem) {
  return [...(it.validation.gates ?? []), ...(it.validation.batch_gates ?? [])];
}

// ── App shell: pick a data source, then render the dashboard ────────────────

export default function App() {
  const [source, setSource] = useState<DataSource | null>(null);
  return source
    ? <Dashboard source={source} onLogout={() => setSource(null)} />
    : <Login onReady={setSource} />;
}

// ── Login ────────────────────────────────────────────────────────────────────

function Login({ onReady }: { onReady: (s: DataSource) => void }) {
  const saved = savedConfig();
  const [f, setF] = useState({
    supabaseUrl: saved?.supabaseUrl ?? '',
    supabaseAnonKey: saved?.supabaseAnonKey ?? '',
    adminApiUrl: saved?.adminApiUrl ?? '',
    siteSlug: saved?.siteSlug ?? 'sochumenh',
    email: saved?.email ?? '',
    password: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  const signIn = async () => {
    setBusy(true);
    setErr('');
    try {
      const src = new RemoteSource(f);
      await src.signIn();
      await src.load(); // fail fast if the API/site is wrong
      onReady(src);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="login">
        <div className="brand"><IconSpark /><span style={{ fontSize: 16, fontWeight: 800 }}>pSEO.engine</span></div>
        <div className="card">
          <p className="hint">Sign in with your engine admin account (site_admins membership).</p>
          <div><label>Supabase URL</label><input value={f.supabaseUrl} onChange={set('supabaseUrl')} placeholder="https://xxxx.supabase.co" /></div>
          <div><label>Supabase anon key</label><input value={f.supabaseAnonKey} onChange={set('supabaseAnonKey')} placeholder="eyJ…" /></div>
          <div><label>prose-admin URL</label><input value={f.adminApiUrl} onChange={set('adminApiUrl')} placeholder="https://xxxx.supabase.co/functions/v1/prose-admin" /></div>
          <div><label>Site slug</label><input value={f.siteSlug} onChange={set('siteSlug')} /></div>
          <div><label>Email</label><input value={f.email} onChange={set('email')} /></div>
          <div><label>Password</label><input type="password" value={f.password} onChange={set('password')} /></div>
          {err && <p className="hint" style={{ color: 'var(--coral)' }}>{err}</p>}
          <button className="btn-dark" disabled={busy} onClick={signIn}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ source, onLogout }: { source: DataSource; onLogout: () => void }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [perf, setPerf] = useState<MetricsSummary | null>(null);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const [dialog, setDialog] = useState(false);

  const reload = () => {
    source.load().then(setData);
    source.metrics().then(setPerf).catch(() => setPerf(null));
  };
  useEffect(() => { reload(); }, [source]);

  const notify = (msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 3500);
  };

  const act = async (verb: 'approve' | 'reject' | 'publish', it: ReviewItem) => {
    const past = { approve: 'approved', reject: 'rejected', publish: 'published' } as const;
    const res = await source[verb](it.id);
    if (res.ok) notify(`${prettyKey(it.item_key)} — ${past[verb]}`);
    else notify(res.error ?? `${verb} refused`, true);
    reload();
  };

  if (!data) return <div className="login-wrap"><div className="hello"><p>Loading…</p></div></div>;

  const s = data.stats.items_by_status;
  const generated = (s.generated ?? 0) + (s.approved ?? 0) + (s.published ?? 0);
  const flaggedCount = (s.flagged ?? 0) + (s.failed_validation ?? 0);
  const tokens = data.stats.tokens_in + data.stats.tokens_out;
  const firstPassDenom = generated + (s.failed_validation ?? 0);
  const passRate = firstPassDenom === 0 ? 0 : Math.round((generated / firstPassDenom) * 100);

  const review = data.review.filter((it) =>
    !query || it.item_key.includes(query.toLowerCase()) || prettyKey(it.item_key).toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="frame">
      <aside className="side">
        <div className="brand"><IconSpark /><span>pSEO.engine</span></div>
        <nav className="nav">
          <button className="nav-btn active" title="Dashboard"><IconHome /></button>
          <button className="nav-btn" title="Review queue"><IconFlag /></button>
          <button className="nav-btn" title="Jobs"><IconCalendar /></button>
          <button className="nav-btn" title="Templates"><IconDoc /></button>
        </nav>
        <nav className="nav secondary">
          <button className="nav-btn" title="Alerts"><IconBell />{flaggedCount > 0 && <span className="dot" />}</button>
          <button className="nav-btn" title="Settings"><IconGear /></button>
        </nav>
        <div className="spacer" />
        <nav className="nav secondary">
          <button className="nav-btn" title="Sign out" onClick={onLogout}><IconLogout /></button>
        </nav>
        <div className="avatar">{data.adminName.slice(0, 1).toUpperCase()}</div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="hello">
            <h1>Hi, {data.adminName}!</h1>
            <p>Here's the {data.siteSlug} pipeline today</p>
          </div>
          <div className="grow" />
          <label className="search">
            <IconSearch />
            <input placeholder="Search review queue" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button className="btn-dark" onClick={() => setDialog(true)}>New Job</button>
        </div>

        <div className="grid r1">
          <BubblesCard generated={generated} flagged={flaggedCount} tokens={tokens} />
          <CalendarCard jobs={data.jobs} />
        </div>

        <div className="grid r2">
          <div className="col">
            <GaugeCard passRate={passRate} />
            <CoverageCard published={data.stats.published_total} total={144} />
          </div>
          <QueueCard
            review={review}
            jobs={data.jobs}
            onAct={act}
            onNewJob={() => setDialog(true)}
            onRun={async (job) => {
              // Each run invocation is wall-clock-bounded server-side; keep
              // re-invoking while it makes progress so one click drains the job.
              notify(`Running job ${job.id.slice(0, 8)}…`);
              let last = Infinity;
              for (let round = 0; round < 30; round++) {
                const res = await source.runJob(job.id);
                if (!res.ok) { notify(res.error ?? 'run failed', true); break; }
                const remaining = res.remaining ?? 0;
                if (remaining === 0) { notify('Job drained — batch gates ran'); break; }
                if (remaining >= last) { notify(`${remaining} items keep failing — see job log`, true); break; }
                last = remaining;
                notify(`${remaining} items remaining…`);
              }
              reload();
            }}
          />
        </div>

        {perf && <PerformanceCard perf={perf} />}
      </main>

      {dialog && (
        <NewJobDialog
          onClose={() => setDialog(false)}
          onCreate={async (input) => {
            const res = await source.createJob(input);
            notify(res.ok ? `Job created (${res.job_id?.slice(0, 8)})` : res.error ?? 'create failed', !res.ok);
            setDialog(false);
            reload();
          }}
        />
      )}
      {toast && <div className={`toast${toast.err ? ' err' : ''}`}>{toast.msg}</div>}
    </div>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────

function BubblesCard({ generated, flagged, tokens }: { generated: number; flagged: number; tokens: number }) {
  return (
    <section className="card bubbles-card">
      <h2>Your Generation Results for Today</h2>
      <button className="corner-chip" title="Job history"><IconArchive /></button>
      <div className="bubble-stage" aria-hidden>
        <div className="glow yellow" />
        <div className="glow coral" />
      </div>
      <div className="bubble-dark"><span>{fmtK(tokens)}</span><small>tokens</small></div>
      <div className="bubble-label on-yellow"><span style={{ fontSize: 17 }}>{fmt(generated)}</span><small>generated</small></div>
      <div className="bubble-label on-coral"><span style={{ fontSize: 15 }}>{fmt(flagged)}</span><small>in review</small></div>
      <div className="legend">
        <div><i style={{ background: 'var(--yellow)' }} /> Items generated</div>
        <div><i style={{ background: 'var(--coral)' }} /> Flagged for review</div>
        <div><i style={{ background: 'var(--dark-2)' }} /> Tokens spent</div>
      </div>
    </section>
  );
}

function CalendarCard({ jobs }: { jobs: JobRow[] }) {
  // Show the month of the most recent job (falls back to today).
  const anchor = jobs.length ? new Date(jobs[0].created_at) : new Date();
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const monthName = anchor.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });

  const byDay = new Map<number, 'done' | 'sched'>();
  for (const j of jobs) {
    const d = new Date(j.created_at);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month) continue;
    const day = d.getUTCDate();
    const state = j.status === 'done' ? 'done' : 'sched';
    if (byDay.get(day) !== 'done') byDay.set(day, state);
  }

  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const today = new Date();
  const isToday = (d: number) =>
    today.getUTCFullYear() === year && today.getUTCMonth() === month && today.getUTCDate() === d;

  return (
    <section className="cal-card">
      <div className="cal-head">
        <h2>Your Job Runs</h2>
        <span className="month">{monthName} <IconChevron /></span>
      </div>
      <div className="cal-grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="dow">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`x${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const state = byDay.get(d);
          const cls = ['day', state === 'done' ? 'done' : '', state === 'sched' ? 'sched' : '', isToday(d) ? 'today' : '']
            .filter(Boolean).join(' ');
          return <span key={d} className={cls}>{d}</span>;
        })}
      </div>
      <div className="cal-legend">
        <span><i style={{ boxShadow: 'inset 0 0 0 1.5px #8d887d' }} /> Current day</span>
        <span><i style={{ background: 'var(--yellow)' }} /> Job done</span>
        <span><i style={{ background: 'var(--dark-3)' }} /> Scheduled</span>
      </div>
    </section>
  );
}

function GaugeCard({ passRate }: { passRate: number }) {
  const R = 62;
  const arcSpan = 0.78; // 280° open arc, like the reference
  const frac = Math.min(passRate, 100) / 100;
  return (
    <section className="card gauge-card">
      <div className="txt">
        <h2>Gate Pass Rate</h2>
        <div className="sub">Keep the batch clean</div>
        <button className="link-btn">Change Goal <i><IconPencil /></i></button>
      </div>
      <div className="gauge-wrap">
        <svg viewBox="0 0 158 158">
          <g transform="rotate(130 79 79)">
            <circle cx="79" cy="79" r={R} fill="none" stroke="var(--pill-off)" strokeWidth="3"
              strokeDasharray={`1 7`} strokeLinecap="round"
              // dotted remainder over the open arc only
              pathLength={100} strokeDashoffset={0} style={{ strokeDasharray: '0.6 3.4', strokeDashoffset: 0 }} />
            <circle cx="79" cy="79" r={R} fill="none" stroke="var(--coral)" strokeWidth="9" strokeLinecap="round"
              pathLength={100} strokeDasharray={`${frac * arcSpan * 100} ${100 - frac * arcSpan * 100}`} />
          </g>
        </svg>
        <div className="gauge-center">
          <small>Goal</small>
          <strong>90%</strong>
        </div>
        <span className="gauge-badge">{passRate}%</span>
      </div>
    </section>
  );
}

function CoverageCard({ published, total }: { published: number; total: number }) {
  const pct = Math.round((published / total) * 100);
  return (
    <section className="card">
      <div className="cov-head">
        <div>
          <h2>Grid Coverage</h2>
          <div className="sub">Published combos</div>
        </div>
        <div className="pct"><strong>{pct}%</strong><div>Completed</div></div>
      </div>
      <div className="track">
        <div className="fill" style={{ width: `${pct}%` }} />
        <div className="ticks" aria-hidden>{Array.from({ length: 18 }, (_, i) => <i key={i} />)}</div>
        <div className="knob" style={{ left: `${pct}%` }}>{published}</div>
      </div>
      <div className="track-ends"><span>0</span><span>{total} combos</span></div>
    </section>
  );
}

function QueueCard({ review, jobs, onAct, onNewJob, onRun }: {
  review: ReviewItem[];
  jobs: JobRow[];
  onAct: (verb: 'approve' | 'reject' | 'publish', it: ReviewItem) => void;
  onNewJob: () => void;
  onRun: (job: JobRow) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const runnable = jobs.filter((j) => j.status !== 'done').slice(0, 3);

  return (
    <section className="card">
      <div className="queue-head">
        <h2>Review Queue</h2>
        <button className="add" onClick={onNewJob}>Add New <i><IconPlus /></i></button>
      </div>
      <div className="rows">
        {review.length === 0 && <div className="empty">Queue is clear — nothing waiting on review.</div>}
        {review.map((it) => {
          const gates = gatesOf(it);
          const passed = gates.filter((g) => g.passed).length;
          const redFails = gates.filter((g) => g.severity === 'fail' && !g.passed);
          return (
            <div className="row" key={it.id}>
              <div className="face" aria-hidden>{/^so-chu-dao-(\d+)/.exec(it.item_key)?.[1] ?? '•'}</div>
              <div className="who" title={`${it.template_key} v${it.template_version} — ${it.item_key}`}>
                <b>{prettyKey(it.item_key)}</b>
                <span><span className={`st st-${it.status}`}>{it.status}</span> · v{it.template_version}{it.similarity !== null ? ` · sim ${it.similarity.toFixed(2)}` : ''}</span>
              </div>
              <div className="gates">
                {redFails.length > 0 && (
                  <span className="fail-chip" title={`red fail gates: ${redFails.map((g) => g.gate).join(', ')}`}>
                    {redFails.length} fail
                  </span>
                )}
                <span className="count">Gates passed: <b>{passed}/{gates.length}</b></span>
                <div className="pills" aria-hidden>
                  {gates.map((g, i) => (
                    <i key={i} className={g.passed ? 'on' : g.severity === 'fail' ? 'redfail' : ''}
                      title={`${g.gate}: ${g.passed ? 'passed' : g.detail ?? 'needs review'}`} />
                  ))}
                </div>
                <div className="menu">
                  <button onClick={() => setOpen(open === it.id ? null : it.id)} title="Actions"><IconDots /></button>
                  {open === it.id && (
                    <div className="menu-pop" onMouseLeave={() => setOpen(null)}>
                      <button className="yellow" onClick={() => { setOpen(null); onAct('approve', it); }}>Approve</button>
                      <button onClick={() => { setOpen(null); onAct('publish', it); }}>Publish</button>
                      <button className="coral" onClick={() => { setOpen(null); onAct('reject', it); }}>Reject</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {runnable.length > 0 && (
        <div className="jobs-strip">
          <h3>Jobs waiting to run</h3>
          {runnable.map((j) => (
            <div className="job-line" key={j.id}>
              <i style={{ background: j.status === 'running' ? 'var(--yellow)' : 'var(--dark-3)' }} />
              <span>{j.template ?? j.id.slice(0, 8)}</span>
              <span className="grow">{j.item_count} items · {j.status}</span>
              <button onClick={() => onRun(j)}>Run</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PerformanceCard({ perf }: { perf: MetricsSummary }) {
  const top = perf.items.slice(0, 4);
  // Needs attention: measurable impressions but poor position/CTR.
  const attention = [...perf.items]
    .filter((r) => r.impressions >= 500 && (r.avg_position ?? 0) > 10)
    .sort((a, b) => (b.avg_position ?? 0) - (a.avg_position ?? 0))
    .slice(0, 4);
  const t = perf.totals;

  const Row = ({ r, accent }: { r: MetricsSummary['items'][0]; accent: string }) => (
    <div className="perf-row">
      <i style={{ background: accent }} />
      <span className="key">{prettyKey(r.item_key)}</span>
      <span className="num">{fmt(r.clicks)} clicks</span>
      <span className="num">pos {r.avg_position?.toFixed(1) ?? '—'}</span>
      <span className="num rev">{r.revenue > 0 ? `₫${fmtK(r.revenue)}` : '—'}</span>
    </div>
  );

  return (
    <section className="card">
      <div className="queue-head">
        <div>
          <h2>Search Performance</h2>
          <div className="sub">Last {perf.window_days} days · refresh & batch decisions rank by this, not by volume</div>
        </div>
        <div className="perf-totals">
          <span><b>{fmtK(t.clicks)}</b> clicks</span>
          <span><b>{fmtK(t.impressions)}</b> impressions</span>
          <span><b>{fmt(t.conversions)}</b> conversions</span>
          <span className="rev"><b>₫{fmtK(t.revenue)}</b> revenue</span>
        </div>
      </div>
      <div className="perf-cols">
        <div>
          <h3>Top pages</h3>
          {top.map((r) => <Row key={r.item_key} r={r} accent="var(--yellow)" />)}
        </div>
        <div>
          <h3>Needs attention (page 2+)</h3>
          {attention.length === 0 && <div className="empty">Nothing ranking poorly with real impressions.</div>}
          {attention.map((r) => <Row key={r.item_key} r={r} accent="var(--coral)" />)}
        </div>
      </div>
    </section>
  );
}

function NewJobDialog({ onClose, onCreate }: {
  onClose: () => void;
  onCreate: (input: { template_key: string; master: 'exclude' | 'only' | 'all'; review_sample_pct: number }) => void;
}) {
  const [templateKey, setTemplateKey] = useState('combo-so-chu-dao-su-menh');
  const [master, setMaster] = useState<'exclude' | 'only' | 'all'>('exclude');
  const [pct, setPct] = useState(25);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>New Job</h2>
        <div>
          <label>Template key</label>
          <input value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} />
        </div>
        <div>
          <label>Combo grid</label>
          <div className="seg">
            {(['exclude', 'only', 'all'] as const).map((m) => (
              <button key={m} className={master === m ? 'on' : ''} onClick={() => setMaster(m)}>
                {m === 'exclude' ? 'Non-master' : m === 'only' ? 'Masters only' : 'Full grid'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label>Review sample %</label>
          <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(Number(e.target.value))} />
        </div>
        <div className="actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-yellow" onClick={() => onCreate({ template_key: templateKey, master, review_sample_pct: pct })}>
            Create job
          </button>
        </div>
      </div>
    </div>
  );
}
