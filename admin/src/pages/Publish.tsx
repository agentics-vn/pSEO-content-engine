import { useEffect, useState } from 'react';
import type { DataSource, JobRow, ReviewItem } from '../types';
import { prettyKey } from '../lib/format';
import { ItemTitle, StatusPill } from '../components/proseBits';

export function PublishPage({
  source,
  notify,
}: {
  source: DataSource;
  notify: (msg: string, err?: boolean) => void;
}) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [jobFilter, setJobFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<{ id: string; error: string }[]>([]);

  const reload = () => {
    const params: { status: string; job_id?: string; limit: number } = { status: 'approved', limit: 200 };
    if (jobFilter) params.job_id = jobFilter;
    source.listItems(params).then(setItems);
    source.listJobs(30).then(setJobs);
    setSelected(new Set());
    setFailures([]);
  };
  useEffect(() => { reload(); }, [source, jobFilter]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((it) => it.id)));
  };

  const publishSelected = async () => {
    const ids = [...selected];
    if (!ids.length) {
      notify('Select items to publish', true);
      return;
    }
    setBusy(true);
    const fails: { id: string; error: string }[] = [];
    let ok = 0;
    for (const id of ids) {
      const res = await source.publish(id);
      if (res.ok) ok++;
      else fails.push({ id, error: res.error ?? 'publish failed' });
    }
    setFailures(fails);
    notify(`Published ${ok}/${ids.length}${fails.length ? ` — ${fails.length} failed` : ''}`, fails.length > 0);
    reload();
    setBusy(false);
  };

  const publishOne = async (it: ReviewItem) => {
    setBusy(true);
    const res = await source.publish(it.id);
    if (res.ok) notify(`${prettyKey(it.item_key)} published`);
    else {
      notify(res.error ?? 'publish failed', true);
      setFailures([{ id: it.id, error: res.error ?? 'publish failed' }]);
    }
    reload();
    setBusy(false);
  };

  return (
    <>
      <div className="topbar">
        <div className="hello">
          <h1>Publish</h1>
          <p>Push approved items live — consumers pull via content-api</p>
        </div>
        <div className="grow" />
        <button type="button" className="btn-dark" disabled={busy || selected.size === 0} onClick={publishSelected}>
          Publish selected ({selected.size})
        </button>
      </div>

      <div className="card publish-note">
        <p>
          After publish, items appear in <code>GET /v1/sites/{source.siteSlug}/published</code> on content-api.
          Use your site API key from seed load.
        </p>
      </div>

      <div className="publish-toolbar card">
        <label>
          Filter by job
          <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
            <option value="">All approved (site-wide)</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>{j.id.slice(0, 8)} — {j.template} ({j.item_count})</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-ghost" onClick={toggleAll}>
          {selected.size === items.length && items.length ? 'Deselect all' : 'Select all'}
        </button>
      </div>

      {failures.length > 0 && (
        <div className="card publish-failures">
          <h2>Failures</h2>
          <ul>
            {failures.map((f) => (
              <li key={f.id}><code>{f.id.slice(0, 8)}</code> — {f.error}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="card">
        <h2>Approved items ({items.length})</h2>
        <div className="rows">
          {items.length === 0 && <div className="empty">Nothing approved yet.</div>}
          {items.map((it) => (
            <div className="row publish-row" key={it.id}>
              <label className="check">
                <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
              </label>
              <ItemTitle item={it} />
              <StatusPill status={it.status} />
              <div className="grow" />
              <button type="button" className="btn-yellow" disabled={busy} onClick={() => publishOne(it)}>Publish</button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
