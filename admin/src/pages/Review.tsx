import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataSource, JobRow, ReviewItem } from '../types';
import { gatesOf, prettyKey, jobActualCostUsd, itemActualCostUsd, fmtUsd } from '../lib/format';
import { navigate } from '../router';
import { GateList, OutputPreview, ReviewListItem, StatusPill } from '../components/proseBits';

type Filter = 'review' | 'all' | 'pending' | 'generated' | 'flagged' | 'failed_validation' | 'approved' | 'rejected';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'review', label: 'Needs review' },
  { id: 'failed_validation', label: 'Failed' },
  { id: 'flagged', label: 'Flagged' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

function matches(it: ReviewItem, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'review') return ['generated', 'flagged', 'failed_validation'].includes(it.status);
  return it.status === f;
}

export function ReviewPage({
  source,
  jobId,
  notify,
}: {
  source: DataSource;
  jobId: string;
  notify: (msg: string, err?: boolean) => void;
}) {
  const [job, setJob] = useState<JobRow | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<Filter>('review');
  const [idx, setIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editJson, setEditJson] = useState('');
  const [note, setNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [showRegen, setShowRegen] = useState(false);
  const [busy, setBusy] = useState(false);
  const idxRef = useRef(0);
  idxRef.current = idx;

  const filtered = items.filter((it) => matches(it, filter));
  const current = filtered[Math.min(idx, Math.max(filtered.length - 1, 0))] ?? null;
  const displayOutput = current?.edited_output ?? current?.output ?? null;
  const model = job?.model ?? 'claude-sonnet';
  const jobCost = job ? jobActualCostUsd(job, items) : 0;
  const itemsCost = items.reduce((s, it) => s + itemActualCostUsd(it, model), 0);

  const reload = useCallback(async (anchorId?: string) => {
    const [jobRow, list] = await Promise.all([
      source.getJob(jobId),
      source.listItems({ job_id: jobId, limit: 200 }),
    ]);
    setJob(jobRow);
    setItems(list);
    setIdx((prev) => {
      if (anchorId) {
        const nextList = list.filter((it) => matches(it, filter));
        const i = nextList.findIndex((it) => it.id === anchorId);
        if (i >= 0) return i;
      }
      const len = list.filter((it) => matches(it, filter)).length;
      return Math.min(prev, Math.max(0, len - 1));
    });
  }, [source, jobId, filter]);

  useEffect(() => { void reload(); }, [reload]);

  const selectIdx = (next: number) => {
    if (filtered.length === 0) return;
    setIdx(((next % filtered.length) + filtered.length) % filtered.length);
    setEditing(false);
    setShowReject(false);
    setShowRegen(false);
    setNote('');
  };

  const approve = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    const res = await source.approve(current.id);
    notify(res.ok ? `${prettyKey(current.item_key)} approved` : res.error ?? 'approve failed', !res.ok);
    await reload(current.id);
    setBusy(false);
  }, [busy, current, notify, reload, source]);

  const reject = useCallback(async () => {
    if (!current || busy) return;
    setBusy(true);
    const res = await source.reject(current.id, note || undefined);
    notify(res.ok ? 'Rejected' : res.error ?? 'reject failed', !res.ok);
    setShowReject(false);
    setNote('');
    await reload(current.id);
    setBusy(false);
  }, [busy, current, note, notify, reload, source]);

  const regen = useCallback(async () => {
    if (!current || busy) return;
    if ((current.regen_count ?? 0) >= 3) {
      notify('Regen cap reached (3)', true);
      return;
    }
    setBusy(true);
    const res = await source.regen(current.id, note || undefined);
    notify(res.ok ? 'Regenerating…' : res.error ?? 'regen failed', !res.ok);
    setShowRegen(false);
    setNote('');
    await reload(current.id);
    setBusy(false);
  }, [busy, current, note, notify, reload, source]);

  const startEdit = useCallback(() => {
    if (!current) return;
    setEditJson(JSON.stringify(displayOutput ?? {}, null, 2));
    setEditing(true);
  }, [current, displayOutput]);

  const saveEdit = async () => {
    if (!current) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editJson);
    } catch {
      notify('Invalid JSON', true);
      return;
    }
    setBusy(true);
    const res = await source.edit(current.id, parsed);
    notify(res.ok ? 'Saved' : res.error ?? 'edit failed', !res.ok);
    setEditing(false);
    await reload(current.id);
    setBusy(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || showReject || showRegen || busy) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
      switch (e.key) {
        case 'j': selectIdx(idxRef.current + 1); break;
        case 'k': selectIdx(idxRef.current - 1); break;
        case 'a': void approve(); break;
        case 'r': setShowReject(true); break;
        case 'e': startEdit(); break;
        case 'g': setShowRegen(true); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, showReject, showRegen, busy, approve, startEdit, filtered.length]);

  const count = (f: Filter) => items.filter((it) => matches(it, f)).length;

  return (
    <>
      <div className="topbar">
        <div className="hello">
          <h1>Review</h1>
          <p>
            <code>{jobId.slice(0, 8)}</code>
            {job && <> · {job.template} · {job.item_count} items · {job.status}</>}
            {' · '}
            <span className="cost" title="Job actual cost from recorded tokens">
              {fmtUsd(jobCost || itemsCost)}
            </span>
          </p>
        </div>
        <div className="grow" />
        <button type="button" className="btn-ghost" onClick={() => navigate({ page: 'jobs' })}>← Jobs</button>
      </div>

      <div className="filter-row">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`chip${filter === f.id ? ' on' : ''}`}
            onClick={() => { setFilter(f.id); setIdx(0); }}
          >
            {f.label} ({count(f.id)})
          </button>
        ))}
        <span className="grow" />
        <span className="hint">j/k · a approve · r reject · e edit · g regen</span>
      </div>

      {!current ? (
        <div className="card empty">No items in this filter.</div>
      ) : (
        <div className="review-layout">
          <aside className="card review-list">
            <ul className="review-items">
              {filtered.map((it, i) => (
                <li key={it.id}>
                  <button type="button" className={i === Math.min(idx, filtered.length - 1) ? 'on' : ''} onClick={() => selectIdx(i)}>
                    <ReviewListItem item={it} active={i === Math.min(idx, filtered.length - 1)} model={model} />
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="card review-detail">
            <div className="review-detail-head">
              <div>
                <b className="detail-title">{prettyKey(current.item_key)}</b>
                <span className="meta">{current.template_key} v{current.template_version}
                  {current.regen_count ? ` · regen ${current.regen_count}/3` : ''}
                  {(current.validation as { gen_retry?: number; retry_note?: string } | null)?.gen_retry
                    ? <span title={(current.validation as { retry_note?: string } | null)?.retry_note ?? 'auto-retried after a truncated/degenerate first attempt'}>
                        {` · auto-retry ×${(current.validation as { gen_retry?: number }).gen_retry}`}
                      </span>
                    : ''}
                  {' · '}
                  <span className="cost" title={`${current.tokens_in ?? 0} in / ${current.tokens_out ?? 0} out`}>
                    {fmtUsd(itemActualCostUsd(current, model))}
                  </span>
                </span>
              </div>
              <StatusPill status={current.status} />
            </div>

            <div className="review-actions">
              <button type="button" className="btn-yellow" disabled={busy} onClick={() => void approve()}>Approve</button>
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => { setShowReject(true); setShowRegen(false); }}>Reject</button>
              <button type="button" className="btn-ghost" disabled={busy} onClick={startEdit}>Edit</button>
              <button type="button" className="btn-ghost" disabled={busy || (current.regen_count ?? 0) >= 3}
                onClick={() => { setShowRegen(true); setShowReject(false); }}>Regen</button>
            </div>

            {(showReject || showRegen) && (
              <div className="note-box">
                <input
                  autoFocus
                  placeholder={showReject ? 'Reject note (optional)' : 'Regen note (optional)'}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void (showReject ? reject() : regen());
                    if (e.key === 'Escape') { setShowReject(false); setShowRegen(false); setNote(''); }
                  }}
                />
                <button type="button" className="btn-ghost sm" onClick={() => { setShowReject(false); setShowRegen(false); setNote(''); }}>Cancel</button>
                <button type="button" className={showReject ? 'btn-coral sm' : 'btn-dark sm'} disabled={busy}
                  onClick={() => void (showReject ? reject() : regen())}>
                  {showReject ? 'Reject' : 'Regen'}
                </button>
              </div>
            )}

            <div className="review-panes">
              <div>
                <h3>Output</h3>
                {editing ? (
                  <>
                    <textarea rows={18} className="code-input" value={editJson} onChange={(e) => setEditJson(e.target.value)} />
                    <div className="actions">
                      <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                      <button type="button" className="btn-dark" disabled={busy} onClick={() => void saveEdit()}>Save</button>
                    </div>
                  </>
                ) : (
                  <OutputPreview output={displayOutput} />
                )}
              </div>
              <div>
                <h3>Gates</h3>
                {current.validation.batch_error && (
                  <p className="hint" style={{ color: 'var(--bad, #a33)' }}>
                    Batch error: {current.validation.batch_error}
                  </p>
                )}
                <GateList gates={gatesOf(current)} />
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
