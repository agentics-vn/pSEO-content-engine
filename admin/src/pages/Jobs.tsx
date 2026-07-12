import { useEffect, useMemo, useState } from 'react';
import type { CreateJobInput, DataSource, JobRow, TemplateRow } from '../types';
import { countComboGrid } from '../lib/comboGrid';
import { estimateJobCost } from '../lib/format';
import { latestPerKey } from '../lib/templates';
import { drainJob } from '../lib/runJob';
import { navigate } from '../router';

type CreateMode = 'combo' | 'items';

export function JobsPage({
  source,
  notify,
}: {
  source: DataSource;
  notify: (msg: string, err?: boolean) => void;
}) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [running, setRunning] = useState<string | null>(null);

  const [createMode, setCreateMode] = useState<CreateMode>('combo');
  const [templateKey, setTemplateKey] = useState('combo-so-chu-dao-su-menh');
  const [master, setMaster] = useState<'exclude' | 'only' | 'all'>('exclude');
  const [samplePct, setSamplePct] = useState(25);
  const [jobMode, setJobMode] = useState<'generate' | 'regenerate'>('generate');
  const [itemsJson, setItemsJson] = useState('[{"item_key":"so-chu-dao-1-su-menh-1","input_data":{}}]');
  const [busy, setBusy] = useState(false);

  const templateOptions = useMemo(() => latestPerKey(templates), [templates]);

  const reload = () => {
    source.listJobs(50).then(setJobs);
    source.listTemplates().then((t) => {
      setTemplates(t);
      const latest = latestPerKey(t);
      if (latest.length && !latest.find((x) => x.key === templateKey)) setTemplateKey(latest[0].key);
    });
  };
  useEffect(() => { reload(); }, [source]);

  useEffect(() => {
    source.getTemplate(templateKey).then((t) => setMaxTokens(t?.max_tokens ?? 4096));
  }, [source, templateKey]);

  const selectedTpl = templateOptions.find((t) => t.key === templateKey);
  const comboCount = useMemo(() => {
    if (createMode !== 'combo') return 0;
    if (master === 'all') return countComboGrid({});
    return countComboGrid({ master: master === 'only' ? 'only' : 'exclude' });
  }, [createMode, master]);

  const itemCountForEstimate = useMemo(() => {
    if (createMode === 'combo') return comboCount;
    try {
      const parsed = JSON.parse(itemsJson) as unknown[];
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }, [createMode, comboCount, itemsJson]);

  const estimate = selectedTpl && itemCountForEstimate > 0
    ? estimateJobCost(itemCountForEstimate, maxTokens, selectedTpl.model)
    : null;

  const createJob = async () => {
    setBusy(true);
    let input: CreateJobInput = {
      template_key: templateKey,
      review_sample_pct: samplePct,
      mode: jobMode,
    };
    if (createMode === 'combo') {
      input = {
        ...input,
        enumerate: 'combo-grid',
        filter: master === 'all' ? {} : { master: master === 'only' ? 'only' : 'exclude' },
      };
    } else {
      try {
        const items = JSON.parse(itemsJson) as CreateJobInput['items'];
        input = { ...input, items };
      } catch {
        notify('Invalid items JSON', true);
        setBusy(false);
        return;
      }
    }
    const res = await source.createJob(input);
    if (res.ok) {
      notify(`Job created — ${res.item_count ?? 0} items (${String(res.job_id).slice(0, 8)})`);
      reload();
    } else notify(res.error ?? 'create failed', true);
    setBusy(false);
  };

  const run = async (job: JobRow) => {
    setRunning(job.id);
    notify(`Running ${job.id.slice(0, 8)}…`);
    await drainJob(source, job.id, notify);
    setRunning(null);
    reload();
  };

  return (
    <>
      <div className="topbar">
        <div className="hello">
          <h1>Jobs</h1>
          <p>Create batches, run generation, open review board</p>
        </div>
      </div>

      <div className="jobs-layout">
        <section className="card">
          <h2>Create job</h2>
          <div className="form-grid">
            <div>
              <label>Template</label>
              <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
                {templateOptions.map((t) => (
                  <option key={t.key} value={t.key}>{t.name || t.key} (v{t.version})</option>
                ))}
                {templateOptions.length === 0 && <option value={templateKey}>{templateKey}</option>}
              </select>
            </div>
            <div>
              <label>Mode</label>
              <select value={jobMode} onChange={(e) => setJobMode(e.target.value as 'generate' | 'regenerate')}>
                <option value="generate">generate</option>
                <option value="regenerate">regenerate</option>
              </select>
            </div>
            <div>
              <label>Review sample %</label>
              <input type="number" min={0} max={100} value={samplePct} onChange={(e) => setSamplePct(Number(e.target.value))} />
            </div>
            <div className="full">
              <label>Work list</label>
              <div className="seg">
                <button type="button" className={createMode === 'combo' ? 'on' : ''} onClick={() => setCreateMode('combo')}>Combo grid</button>
                <button type="button" className={createMode === 'items' ? 'on' : ''} onClick={() => setCreateMode('items')}>Raw items JSON</button>
              </div>
            </div>
            {createMode === 'combo' ? (
              <div className="full">
                <label>Master filter</label>
                <div className="seg">
                  {(['exclude', 'only', 'all'] as const).map((m) => (
                    <button key={m} type="button" className={master === m ? 'on' : ''} onClick={() => setMaster(m)}>
                      {m === 'exclude' ? 'Non-master' : m === 'only' ? 'Masters only' : 'Full grid'}
                    </button>
                  ))}
                </div>
                <p className="hint">{comboCount} combos after filter</p>
              </div>
            ) : (
              <div className="full">
                <label>items: [{`{item_key, input_data}`}, …]</label>
                <textarea rows={8} className="code-input" value={itemsJson} onChange={(e) => setItemsJson(e.target.value)} />
              </div>
            )}
          </div>
          {estimate && (
            <div className="estimate-card">
              <strong>Client estimate</strong>
              <span>{estimate.items} items · ~{estimate.estTokens.toLocaleString()} tokens · ~${estimate.estUsd}</span>
            </div>
          )}
          <button type="button" className="btn-dark" disabled={busy} onClick={createJob}>Create job</button>
        </section>

        <section className="card">
          <h2>Recent jobs</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Template</th>
                <th>Status</th>
                <th>Items</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td><code>{j.id.slice(0, 8)}</code></td>
                  <td>{j.template ?? '—'}</td>
                  <td><span className={`st st-${j.status}`}>{j.status}</span></td>
                  <td>{j.item_count}</td>
                  <td>{new Date(j.created_at).toLocaleDateString()}</td>
                  <td className="row-actions">
                    <button type="button" onClick={() => navigate({ page: 'review', jobId: j.id })}>Review</button>
                    {j.status !== 'done' && (
                      <button type="button" className="btn-yellow" disabled={running === j.id}
                        onClick={() => run(j)}>
                        {running === j.id ? 'Running…' : 'Run'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr><td colSpan={6} className="empty">No jobs yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
