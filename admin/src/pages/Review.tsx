import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataSource, JobRow, ReviewItem } from '../types';
import { gatesOf, prettyKey } from '../lib/format';
import { navigate } from '../router';
import { GateList, ItemTitle, OutputPreview, StatusPill } from '../components/proseBits';

const STATUSES = ['', 'generated', 'flagged', 'approved', 'rejected', 'failed_validation'] as const;

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
  const [statusFilter, setStatusFilter] = useState('');
  const [idx, setIdx] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editJson, setEditJson] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [regenNote, setRegenNote] = useState('');
  const [showRegen, setShowRegen] = useState(false);
  const [busy, setBusy] = useState(false);
  const idxRef = useRef(idx);
  idxRef.current = idx;

  const filterList = useCallback(
    (list: ReviewItem[], status: string) =>
      status ? list.filter((it) => it.status === status) : list,
    [],
  );

  const reload = useCallback(async (opts?: { anchorItemId?: string }) => {
    const [jobRow, list] = await Promise.all([
      source.getJob(jobId),
      source.listItems({ job_id: jobId, limit: 200 }),
    ]);
    setJob(jobRow);
    setItems(list);
    const fl = filterList(list, statusFilter);
    setIdx((prev) => {
      if (opts?.anchorItemId) {
        const i = fl.findIndex((it) => it.id === opts.anchorItemId);
        if (i >= 0) return i;
      }
      return Math.min(prev, Math.max(0, fl.length - 1));
    });
  }, [source, jobId, statusFilter, filterList]);

  useEffect(() => { void reload(); }, [reload]);

  const filtered = filterList(items, statusFilter);
  const current = filtered[idx] ?? null;
  const displayOutput = current?.edited_output ?? current?.output ?? null;

  const selectIdx = useCallback((next: number) => {
    setIdx(() => {
      const len = filterList(items, statusFilter).length;
      if (len === 0) return 0;
      return ((next % len) + len) % len;
    });
    setEditing(false);
    setShowReject(false);
    setShowRegen(false);
  }, [items, statusFilter, filterList]);

  const approve = useCallback(async () => {
    if (!current) return;
    const anchor = current.id;
    setBusy(true);
    const res = await source.approve(current.id);
    notify(res.ok ? `${prettyKey(current.item_key)} approved` : res.error ?? 'approve failed', !res.ok);
    await reload({ anchorItemId: anchor });
    setBusy(false);
  }, [current, notify, reload, source]);

  const reject = useCallback(async () => {
    if (!current) return;
    const anchor = current.id;
    setBusy(true);
    const res = await source.reject(current.id, rejectNote || undefined);
    notify(res.ok ? 'Rejected' : res.error ?? 'reject failed', !res.ok);
    setShowReject(false);
    setRejectNote('');
    await reload({ anchorItemId: anchor });
    setBusy(false);
  }, [current, notify, rejectNote, reload, source]);

  const regen = useCallback(async () => {
    if (!current) return;
    if ((current.regen_count ?? 0) >= 3) {
      notify('Regen cap reached (3)', true);
      return;
    }
    const anchor = current.id;
    setBusy(true);
    const res = await source.regen(current.id, regenNote || undefined);
    notify(res.ok ? 'Regeneration queued' : res.error ?? 'regen failed', !res.ok);
    setShowRegen(false);
    setRegenNote('');
    await reload({ anchorItemId: anchor });
    setBusy(false);
  }, [current, notify, regenNote, reload, source]);

  const startEdit = useCallback(() => {
    if (!current) return;
    setEditJson(JSON.stringify(displayOutput ?? {}, null, 2));
    setEditing(true);
  }, [current, displayOutput]);

  const saveEdit = useCallback(async () => {
    if (!current) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editJson);
    } catch {
      notify('Invalid JSON', true);
      return;
    }
    const anchor = current.id;
    setBusy(true);
    const res = await source.edit(current.id, parsed);
    notify(res.ok ? 'Saved edit' : res.error ?? 'edit failed', !res.ok);
    setEditing(false);
    await reload({ anchorItemId: anchor });
    setBusy(false);
  }, [current, editJson, notify, reload, source]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || showReject || showRegen) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case 'j': selectIdx(idxRef.current + 1); break;
        case 'k': selectIdx(idxRef.current - 1); break;
        case 'a': void approve(); break;
        case 'e': startEdit(); break;
        case 'r': setShowRegen(true); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, showReject, showRegen, selectIdx, approve, startEdit]);

  return (
    <>
      <div className="topbar">
        <div className="hello">
          <h1>Review</h1>
          <p>
            Job <code>{jobId.slice(0, 8)}</code>
            {job && <> · {job.template} · {job.item_count} items · {job.status}</>}
          </p>
        </div>
        <div className="grow" />
        <button type="button" className="btn-ghost" onClick={() => navigate({ page: 'jobs' })}>← Jobs</button>
      </div>

      <div className="review-toolbar card">
        <label>
          Status
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setIdx(0); }}>
            <option value="">All ({items.length})</option>
            {STATUSES.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s} ({items.filter((it) => it.status === s).length})</option>
            ))}
          </select>
        </label>
        <span className="hint">j/k navigate · a approve · e edit · r regen</span>
        <span className="grow" />
        <span>{filtered.length ? `${idx + 1} / ${filtered.length}` : '0 items'}</span>
      </div>

      {!current ? (
        <div className="card empty">No items match this filter.</div>
      ) : (
        <div className="review-layout">
          <aside className="card review-list">
            <h2>Items</h2>
            <ul className="review-items">
              {filtered.map((it, i) => (
                <li key={it.id}>
                  <button type="button" className={i === idx ? 'on' : ''} onClick={() => selectIdx(i)}>
                    <b>{prettyKey(it.item_key)}</b>
                    <StatusPill status={it.status} />
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="card review-detail">
            <div className="review-detail-head">
              <ItemTitle item={current} />
              <StatusPill status={current.status} />
              {current.regen_count != null && <span className="hint">regen {current.regen_count}/3</span>}
            </div>
            <div className="review-actions">
              <button type="button" className="btn-yellow" disabled={busy} onClick={() => void approve()}>Approve (a)</button>
              <button type="button" disabled={busy} onClick={() => setShowReject(true)}>Reject</button>
              <button type="button" disabled={busy} onClick={startEdit}>Edit (e)</button>
              <button type="button" disabled={busy || (current.regen_count ?? 0) >= 3} onClick={() => setShowRegen(true)}>Regen (r)</button>
            </div>

            {showReject && (
              <div className="reject-box">
                <label>Review note (optional)</label>
                <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
                <div className="actions">
                  <button type="button" className="btn-ghost" onClick={() => setShowReject(false)}>Cancel</button>
                  <button type="button" className="btn-coral" disabled={busy} onClick={() => void reject()}>Confirm reject</button>
                </div>
              </div>
            )}

            {showRegen && (
              <div className="reject-box">
                <label>Regen note (optional)</label>
                <input value={regenNote} onChange={(e) => setRegenNote(e.target.value)} />
                <div className="actions">
                  <button type="button" className="btn-ghost" onClick={() => { setShowRegen(false); setRegenNote(''); }}>Cancel</button>
                  <button type="button" className="btn-dark" disabled={busy} onClick={() => void regen()}>Confirm regen</button>
                </div>
              </div>
            )}

            <div className="review-panes">
              <div>
                <h3>Output</h3>
                {editing ? (
                  <>
                    <textarea rows={16} className="code-input" value={editJson} onChange={(e) => setEditJson(e.target.value)} />
                    <div className="actions">
                      <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                      <button type="button" className="btn-dark" disabled={busy} onClick={() => void saveEdit()}>Save edit</button>
                    </div>
                  </>
                ) : (
                  <OutputPreview output={displayOutput} />
                )}
              </div>
              <div>
                <h3>Gates</h3>
                <GateList gates={gatesOf(current)} />
                {current.input_data && (
                  <>
                    <h3>Input</h3>
                    <OutputPreview output={current.input_data} />
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
