import { useEffect, useState } from 'react';
import type { DashboardData, DataSource, JobRow, ReviewItem } from '../types';
import { fmt, prettyKey, jobActualCostUsd, fmtUsd, batchStatusLabel } from '../lib/format';
import { drainJob } from '../lib/runJob';
import { navigate } from '../router';
import { ReviewListItem } from '../components/proseBits';

export function Overview({
  source,
  notify,
}: {
  source: DataSource;
  notify: (msg: string, err?: boolean) => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const reload = () => { source.load().then(setData); };
  useEffect(() => { reload(); }, [source]);

  if (!data) return <div className="page-loading"><p>Loading…</p></div>;

  const s = data.stats.items_by_status;
  const needsReview = (s.generated ?? 0) + (s.flagged ?? 0) + (s.failed_validation ?? 0);
  // Site-wide spend from /stats — prefer channel splits when present.
  const homeModel = data.jobs.length > 0 && data.jobs.every((j) => /haiku/i.test(j.model ?? ''))
    ? 'claude-haiku'
    : 'claude-sonnet';
  const totalCost = jobActualCostUsd({
    tokens_in: data.stats.tokens_in,
    tokens_out: data.stats.tokens_out,
    tokens_in_batch: data.stats.tokens_in_batch,
    tokens_out_batch: data.stats.tokens_out_batch,
    tokens_in_sync: data.stats.tokens_in_sync,
    tokens_out_sync: data.stats.tokens_out_sync,
    run_channel: 'sync',
    model: homeModel,
  });
  const runnable = data.jobs.filter((j) => j.status !== 'done');
  const queue = data.review.filter((it) =>
    ['generated', 'flagged', 'failed_validation'].includes(it.status),
  ).slice(0, 20);

  const run = async (job: JobRow) => {
    setRunning(job.id);
    notify(`Running ${job.id.slice(0, 8)}…`);
    await drainJob(source, job.id, notify);
    setRunning(null);
    reload();
  };

  const act = async (verb: 'approve' | 'reject', it: ReviewItem) => {
    const res = await source[verb](it.id);
    notify(res.ok ? `${prettyKey(it.item_key)} — ${verb === 'approve' ? 'approved' : 'rejected'}` : res.error ?? `${verb} refused`, !res.ok);
    reload();
  };

  return (
    <>
      <div className="topbar">
        <div className="hello">
          <h1>{data.siteSlug}</h1>
          <p>Pipeline · {data.adminName}</p>
        </div>
        <div className="grow" />
        <button type="button" className="btn-dark" onClick={() => navigate({ page: 'jobs' })}>New job</button>
      </div>

      <div className="stat-strip">
        <div className="stat"><b>{fmt(needsReview)}</b><span>needs review</span></div>
        <div className="stat"><b>{fmt(s.approved ?? 0)}</b><span>approved</span></div>
        <div className="stat"><b>{fmt(data.stats.published_total)}</b><span>published</span></div>
        <div className="stat"><b>{fmtUsd(totalCost)}</b><span>actual cost</span></div>
      </div>

      <div className="ops-layout">
        <section className="card">
          <div className="section-head">
            <h2>Jobs</h2>
            <button type="button" className="btn-ghost" onClick={() => navigate({ page: 'jobs' })}>All jobs</button>
          </div>
          {runnable.length === 0 && data.jobs.length === 0 && (
            <p className="empty">No jobs yet — create one to generate content.</p>
          )}
          {runnable.length === 0 && data.jobs.length > 0 && (
            <p className="empty">All jobs drained. <button type="button" className="linkish" onClick={() => navigate({ page: 'jobs' })}>Create another</button></p>
          )}
          <ul className="ops-list">
            {runnable.map((j) => (
              <li key={j.id} className="ops-row">
                <span className={`rli-status rli-status--${j.status === 'running' ? 'flagged' : 'pending'}`} />
                <div className="ops-body">
                  <b>{j.template ?? j.id.slice(0, 8)}</b>
                  <span className="meta">
                    {j.item_count} items · {j.status}
                    {batchStatusLabel(j) ? ` · ${batchStatusLabel(j)}` : ''}
                    {' · '}{j.id.slice(0, 8)}
                    {' · '}
                    <span className="cost">{fmtUsd(jobActualCostUsd(j))}</span>
                  </span>
                </div>
                <div className="ops-actions">
                  <button type="button" className="btn-ghost sm" onClick={() => navigate({ page: 'review', jobId: j.id })}>Review</button>
                  <button type="button" className="btn-yellow sm" disabled={running === j.id} onClick={() => void run(j)}>
                    {running === j.id ? 'Running…' : 'Run'}
                  </button>
                </div>
              </li>
            ))}
            {data.jobs.filter((j) => j.status === 'done').slice(0, 3).map((j) => (
              <li key={j.id} className="ops-row muted">
                <span className="rli-status rli-status--approved" />
                <div className="ops-body">
                  <b>{j.template ?? j.id.slice(0, 8)}</b>
                  <span className="meta">
                    {j.item_count} items · done · {j.id.slice(0, 8)}
                    {' · '}
                    <span className="cost">{fmtUsd(jobActualCostUsd(j))}</span>
                  </span>
                </div>
                <div className="ops-actions">
                  <button type="button" className="btn-ghost sm" onClick={() => navigate({ page: 'review', jobId: j.id })}>Review</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <div className="section-head">
            <h2>Needs review</h2>
            <button type="button" className="btn-ghost" onClick={() => navigate({ page: 'publish' })}>Publish →</button>
          </div>
          {queue.length === 0 && <p className="empty">Queue clear.</p>}
          <ul className="ops-list">
            {queue.map((it) => (
              <li key={it.id} className="ops-row">
                <ReviewListItem item={it} active={false} />
                <div className="ops-actions">
                  {it.job_id && (
                    <button type="button" className="btn-ghost sm" onClick={() => navigate({ page: 'review', jobId: it.job_id! })}>Open</button>
                  )}
                  <button type="button" className="btn-yellow sm" onClick={() => void act('approve', it)}>Approve</button>
                  <button type="button" className="btn-ghost sm" onClick={() => void act('reject', it)}>Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
