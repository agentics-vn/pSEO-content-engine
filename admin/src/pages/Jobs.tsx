import { useEffect, useMemo, useState } from 'react';
import type { CreateJobInput, DataSource, JobRow, TemplateRow } from '../types';
import { countComboGrid } from '../lib/comboGrid';
import { estimateJobCost, jobActualCostUsd, fmtUsd, fmtJobDate, batchStatusLabel } from '../lib/format';
import { latestPerKey } from '../lib/templates';
import { drainJob } from '../lib/runJob';
import { navigate } from '../router';

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
  const [showCreate, setShowCreate] = useState(false);

  const [templateKey, setTemplateKey] = useState('combo-so-chu-dao-su-menh');
  const [master, setMaster] = useState<'exclude' | 'only' | 'all'>('exclude');
  const [samplePct, setSamplePct] = useState(25);
  const [jobMode, setJobMode] = useState<'generate' | 'regenerate'>('generate');
  const [useRaw, setUseRaw] = useState(false);
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
    if (useRaw) return 0;
    if (master === 'all') return countComboGrid({});
    return countComboGrid({ master: master === 'only' ? 'only' : 'exclude' });
  }, [useRaw, master]);

  const estimate = selectedTpl && !useRaw
    ? estimateJobCost(comboCount, maxTokens, selectedTpl.model)
    : null;

  const createJob = async () => {
    setBusy(true);
    let input: CreateJobInput = {
      template_key: templateKey,
      review_sample_pct: samplePct,
      mode: jobMode,
    };
    if (useRaw) {
      try {
        input = { ...input, items: JSON.parse(itemsJson) };
      } catch {
        notify('Invalid items JSON', true);
        setBusy(false);
        return;
      }
    } else {
      input = {
        ...input,
        enumerate: 'combo-grid',
        filter: master === 'all' ? {} : { master: master === 'only' ? 'only' : 'exclude' },
      };
    }
    const res = await source.createJob(input);
    if (res.ok) {
      notify(`Created ${res.item_count ?? 0} items`);
      setShowCreate(false);
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
          <p>Create · run · review</p>
        </div>
        <div className="grow" />
        <button type="button" className="btn-dark" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Cancel' : 'New job'}
        </button>
      </div>

      {showCreate && (
        <section className="card">
          <h2>Create job</h2>
          <div className="form-grid">
            <div>
              <label>Template</label>
              <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)}>
                {templateOptions.map((t) => (
                  <option key={t.key} value={t.key}>{t.name || t.key} (v{t.version})</option>
                ))}
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
              <div className="seg">
                <button type="button" className={!useRaw ? 'on' : ''} onClick={() => setUseRaw(false)}>Combo grid</button>
                <button type="button" className={useRaw ? 'on' : ''} onClick={() => setUseRaw(true)}>Raw JSON</button>
              </div>
            </div>
            {!useRaw ? (
              <div className="full">
                <div className="seg">
                  {(['exclude', 'only', 'all'] as const).map((m) => (
                    <button key={m} type="button" className={master === m ? 'on' : ''} onClick={() => setMaster(m)}>
                      {m === 'exclude' ? 'Non-master' : m === 'only' ? 'Masters' : 'Full'}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  {comboCount} combos
                  {estimate ? ` · Batch estimate ~$${estimate.estUsd} (50% of sync)` : ''}
                </p>
              </div>
            ) : (
              <div className="full">
                <textarea rows={6} className="code-input" value={itemsJson} onChange={(e) => setItemsJson(e.target.value)} />
              </div>
            )}
          </div>
          <div className="actions">
            <button type="button" className="btn-dark" disabled={busy} onClick={() => void createJob()}>Create</button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Recent</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Template</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Items</th>
              <th>Actual cost</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td><code>{j.id.slice(0, 8)}</code></td>
                <td>{j.template ?? '—'}</td>
                <td>
                  <span className={`st st-${j.status}`}>{j.status}</span>
                  {batchStatusLabel(j) && (
                    <span className="st st-flagged" style={{ marginLeft: 6 }}>{batchStatusLabel(j)}</span>
                  )}
                </td>
                <td className="meta" title={j.status_updated_at ?? j.created_at}>
                  {fmtJobDate(j.status_updated_at ?? j.finished_at ?? j.created_at)}
                </td>
                <td>{j.item_count}</td>
                <td className="cost" title={`${j.tokens_in} in / ${j.tokens_out} out`}>
                  {fmtUsd(jobActualCostUsd(j))}
                </td>
                <td className="row-actions">
                  <button type="button" className="btn-ghost sm" onClick={() => navigate({ page: 'review', jobId: j.id })}>Review</button>
                  {j.status !== 'done' && (
                    <button type="button" className="btn-yellow sm" disabled={running === j.id} onClick={() => void run(j)}>
                      {running === j.id ? 'Running…' : 'Run'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={7} className="empty">No jobs — create one above.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
