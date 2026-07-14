import { useEffect, useMemo, useRef, useState } from 'react';
import type { CreateJobInput, DataSource, JobRow, TemplateRow } from '../types';
import { countComboGrid } from '../lib/comboGrid';
import { estimateJobCost, jobActualCostUsd, fmtUsd, fmtJobDate, batchStatusLabel } from '../lib/format';
import { latestPerKey } from '../lib/templates';
import { drainJob } from '../lib/runJob';
import {
  buildCreateJobFromRawJson,
  clearSavedWorklist,
  ingestWorklistText,
  readWorklistFile,
  restoreWorklistState,
  saveWorklist,
} from '../lib/worklistJson';
import { navigate } from '../router';

const DEFAULT_ITEMS_JSON = '[{"item_key":"so-chu-dao-1-su-menh-1","input_data":{}}]';

function applyFormPatch(
  patch: ReturnType<typeof restoreWorklistState>['formPatch'],
  setters: {
    setTemplateKey: (k: string) => void;
    setJobMode: (m: 'generate' | 'regenerate') => void;
    setSamplePct: (n: number) => void;
  },
) {
  if (patch.templateKey) setters.setTemplateKey(patch.templateKey);
  if (patch.jobMode) setters.setJobMode(patch.jobMode);
  if (patch.samplePct !== undefined) setters.setSamplePct(patch.samplePct);
}

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

  const init = restoreWorklistState(source.siteSlug, DEFAULT_ITEMS_JSON);

  const [templateKey, setTemplateKey] = useState(init.formPatch.templateKey ?? 'combo-so-chu-dao-su-menh');
  const [master, setMaster] = useState<'exclude' | 'only' | 'all'>('exclude');
  const [samplePct, setSamplePct] = useState(init.formPatch.samplePct ?? 25);
  const [jobMode, setJobMode] = useState<'generate' | 'regenerate'>(init.formPatch.jobMode ?? 'generate');
  const [useRaw, setUseRaw] = useState(init.useRaw);
  const [itemsJson, setItemsJson] = useState(init.itemsJson);
  const [worklistName, setWorklistName] = useState(init.worklistName);
  const [prioritiesJson, setPrioritiesJson] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    const restored = restoreWorklistState(source.siteSlug, DEFAULT_ITEMS_JSON);
    setItemsJson(restored.itemsJson);
    setWorklistName(restored.worklistName);
    setUseRaw(restored.useRaw);
    applyFormPatch(restored.formPatch, { setTemplateKey, setJobMode, setSamplePct });
  }, [source.siteSlug]);

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

  const rawItemCount = useMemo(() => {
    if (!useRaw) return 0;
    try {
      return ingestWorklistText(itemsJson).itemCount;
    } catch {
      return 0;
    }
  }, [useRaw, itemsJson]);

  const applyWorklist = (text: string, name: string, notifyOk = true) => {
    try {
      const ingested = ingestWorklistText(text);
      setItemsJson(ingested.jsonText);
      setWorklistName(name);
      const saveResult = saveWorklist(source.siteSlug, ingested.jsonText, name);
      applyFormPatch(ingested.formPatch, { setTemplateKey, setJobMode, setSamplePct });
      setUseRaw(true);
      if (notifyOk) {
        const loaded = ingested.isFullBody
          ? `Loaded ${name} — ${ingested.itemCount} items (full job body)`
          : `Loaded ${name} — ${ingested.itemCount} items`;
        if (saveResult === 'quota') {
          notify(`${loaded} — too large to remember between sessions`, true);
        } else {
          notify(loaded);
        }
      }
      return true;
    } catch {
      notify('Invalid JSON — use an items array or a worklist.golden.*.json file', true);
      return false;
    }
  };

  const onWorklistFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { text, name } = await readWorklistFile(file);
      applyWorklist(text, name);
    } catch {
      notify('Could not read file', true);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearWorklist = () => {
    setItemsJson(DEFAULT_ITEMS_JSON);
    setWorklistName('');
    clearSavedWorklist(source.siteSlug);
    setUseRaw(false);
    notify('Cleared worklist');
  };

  const createJob = async () => {
    setBusy(true);
    let input: CreateJobInput = {
      template_key: templateKey,
      review_sample_pct: samplePct,
      mode: jobMode,
    };
    if (useRaw) {
      try {
        input = buildCreateJobFromRawJson(itemsJson, input);
      } catch {
        notify('Invalid JSON — paste an items array OR a full job body (worklist file)', true);
        setBusy(false);
        return;
      }
    } else {
      input = {
        ...input,
        enumerate: 'combo-grid',
        filter: master === 'all' ? {} : { master: master === 'only' ? 'only' : 'exclude' },
      };
      if (prioritiesJson.trim()) {
        try {
          const parsed = JSON.parse(prioritiesJson);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
          if (!Object.values(parsed).every((v) => typeof v === 'number' && Number.isFinite(v))) {
            throw new Error('non-numeric value');
          }
          input = { ...input, priorities: parsed as Record<string, number> };
        } catch {
          notify('Invalid priorities JSON — expected { "item_key": number }', true);
          setBusy(false);
          return;
        }
      }
    }
    const res = await source.createJob(input);
    if (res.ok) {
      if (useRaw) saveWorklist(source.siteSlug, itemsJson, worklistName || 'pasted worklist');
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
                  {' · ~'}{Math.round(comboCount * samplePct / 100)} to review
                  {selectedTpl ? ` · using ${selectedTpl.key} v${selectedTpl.version} · ${selectedTpl.model}` : ''}
                </p>
                <details className="advanced">
                  <summary>Search-demand priorities (optional)</summary>
                  <p className="hint" style={{ marginTop: 8 }}>
                    Higher = generated &amp; reviewed first. Paste the <code>priorities</code> map from
                    {' '}<code>node scripts/keywords-to-worklist.mjs seeds/&lt;client&gt;/keywords.csv</code>.
                    Combos you omit default to 0.
                  </p>
                  <textarea
                    rows={4}
                    className="code-input"
                    placeholder={'{ "so-chu-dao-7-su-menh-3": 480, "so-chu-dao-1-su-menh-5": 90 }'}
                    value={prioritiesJson}
                    onChange={(e) => setPrioritiesJson(e.target.value)}
                  />
                </details>
              </div>
            ) : (
              <div className="full">
                <div className="worklist-upload">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="worklist-upload-input"
                    onChange={(e) => void onWorklistFile(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    className="btn-ghost sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload JSON
                  </button>
                  {worklistName && (
                    <span className="worklist-upload-name" title={worklistName}>
                      {worklistName}
                    </span>
                  )}
                  <button type="button" className="btn-ghost sm" onClick={clearWorklist}>
                    Clear
                  </button>
                </div>
                <textarea rows={6} className="code-input" value={itemsJson} onChange={(e) => {
                  setItemsJson(e.target.value);
                  setWorklistName('');
                }} />
                <p className="hint">
                  {rawItemCount > 0 ? `${rawItemCount} items loaded` : 'No valid items yet'}
                  {worklistName ? ` · ${worklistName}` : ''}
                  {' · '}Upload a <code>worklist.golden.*.json</code> or paste below. Remembered per site between sessions.
                  Full job body fields (template_key, mode, priorities, sample&nbsp;%) win over the form above.
                </p>
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
        <div className="table-wrap">
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
        </div>
      </section>
    </>
  );
}
