import { useEffect, useState } from 'react';
import type { DashboardData, DataSource, JobRow, MetricsSummary, ReviewItem } from '../types';
import { fmt, fmtK, prettyKey } from '../lib/format';
import { drainJob } from '../lib/runJob';
import { navigate } from '../router';
import { GatePills } from '../components/proseBits';
import {
  IconArchive, IconChevron, IconDots, IconPencil, IconPlus, IconSearch,
} from '../icons';

export function Overview({
  source,
  notify,
}: {
  source: DataSource;
  notify: (msg: string, err?: boolean) => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [perf, setPerf] = useState<MetricsSummary | null>(null);
  const [query, setQuery] = useState('');

  const reload = () => {
    source.load().then(setData);
    source.metrics().then(setPerf).catch(() => setPerf(null));
  };
  useEffect(() => { reload(); }, [source]);

  const act = async (verb: 'approve' | 'reject' | 'publish', it: ReviewItem) => {
    const past = { approve: 'approved', reject: 'rejected', publish: 'published' } as const;
    const res = await source[verb](it.id);
    if (res.ok) notify(`${prettyKey(it.item_key)} — ${past[verb]}`);
    else notify(res.error ?? `${verb} refused`, true);
    reload();
  };

  if (!data) return <div className="page-loading"><p>Loading…</p></div>;

  const s = data.stats.items_by_status;
  const generated = (s.generated ?? 0) + (s.approved ?? 0) + (s.published ?? 0);
  const flaggedCount = (s.flagged ?? 0) + (s.failed_validation ?? 0);
  const tokens = data.stats.tokens_in + data.stats.tokens_out;
  const firstPassDenom = generated + (s.failed_validation ?? 0);
  const passRate = firstPassDenom === 0 ? 0 : Math.round((generated / firstPassDenom) * 100);

  const review = data.review.filter((it) =>
    !query || it.item_key.includes(query.toLowerCase()) || prettyKey(it.item_key).toLowerCase().includes(query.toLowerCase()));

  return (
    <>
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
        <button className="btn-dark" onClick={() => navigate({ page: 'jobs' })}>New Job</button>
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
          onNewJob={() => navigate({ page: 'jobs' })}
          onReviewJob={(jobId) => navigate({ page: 'review', jobId })}
          onRun={async (job) => {
            notify(`Running job ${job.id.slice(0, 8)}…`);
            await drainJob(source, job.id, notify);
            reload();
          }}
        />
      </div>

      {perf && <PerformanceCard perf={perf} />}
    </>
  );
}

function BubblesCard({ generated, flagged, tokens }: { generated: number; flagged: number; tokens: number }) {
  return (
    <section className="card bubbles-card">
      <h2>Your Generation Results for Today</h2>
      <button className="corner-chip" title="Job history" onClick={() => navigate({ page: 'jobs' })}><IconArchive /></button>
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
  const lead = (first.getUTCDay() + 6) % 7;
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
  const arcSpan = 0.78;
  const frac = Math.min(passRate, 100) / 100;
  return (
    <section className="card gauge-card">
      <div className="txt">
        <h2>Gate Pass Rate</h2>
        <div className="sub">Keep the batch clean</div>
        <button className="link-btn" type="button">Change Goal <i><IconPencil /></i></button>
      </div>
      <div className="gauge-wrap">
        <svg viewBox="0 0 158 158">
          <g transform="rotate(130 79 79)">
            <circle cx="79" cy="79" r={R} fill="none" stroke="var(--pill-off)" strokeWidth="3"
              strokeLinecap="round" pathLength={100} style={{ strokeDasharray: '0.6 3.4' }} />
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

function QueueCard({ review, jobs, onAct, onNewJob, onReviewJob, onRun }: {
  review: ReviewItem[];
  jobs: JobRow[];
  onAct: (verb: 'approve' | 'reject' | 'publish', it: ReviewItem) => void;
  onNewJob: () => void;
  onReviewJob: (jobId: string) => void;
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
        {review.map((it) => (
            <div className="row" key={it.id}>
              <div className="face" aria-hidden>{/^so-chu-dao-(\d+)/.exec(it.item_key)?.[1] ?? '•'}</div>
              <div className="who" title={`${it.template_key} v${it.template_version} — ${it.item_key}`}>
                <b>{prettyKey(it.item_key)}</b>
                <span><span className={`st st-${it.status}`}>{it.status}</span> · v{it.template_version}{it.similarity !== null ? ` · sim ${it.similarity.toFixed(2)}` : ''}</span>
              </div>
              <GatePills item={it} />
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
          ))}
      </div>

      {runnable.length > 0 && (
        <div className="jobs-strip">
          <h3>Jobs waiting to run</h3>
          {runnable.map((j) => (
            <div className="job-line" key={j.id}>
              <i style={{ background: j.status === 'running' ? 'var(--yellow)' : 'var(--dark-3)' }} />
              <span>{j.template ?? j.id.slice(0, 8)}</span>
              <span className="grow">{j.item_count} items · {j.status}</span>
              <button type="button" onClick={() => onReviewJob(j.id)}>Review</button>
              <button type="button" onClick={() => onRun(j)}>Run</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PerformanceCard({ perf }: { perf: MetricsSummary }) {
  const top = perf.items.slice(0, 4);
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
