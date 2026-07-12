import { useEffect, useMemo, useState } from 'react';
import type { DataSource, TemplateFull, TemplateRow } from '../types';
import { GateList, OutputPreview } from '../components/proseBits';
import { latestPerKey } from '../lib/templates';

export function TemplatesPage({
  source,
  notify,
}: {
  source: DataSource;
  notify: (msg: string, err?: boolean) => void;
}) {
  const [list, setList] = useState<TemplateRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editor, setEditor] = useState<TemplateFull | null>(null);
  const [testJson, setTestJson] = useState('{\n  "life_path": 1,\n  "destiny": 1\n}');
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [busy, setBusy] = useState(false);

  const templateList = useMemo(() => latestPerKey(list), [list]);

  const reload = () => source.listTemplates().then(setList);
  useEffect(() => { reload(); }, [source]);

  const loadTemplate = async (key: string) => {
    setSelected(key);
    const t = await source.getTemplate(key);
    setEditor(t);
    setTestResult(null);
  };

  const saveNewVersion = async () => {
    if (!editor) return;
    setBusy(true);
    const { id: _id, version: _v, created_at: _c, ...body } = editor;
    const res = await source.createTemplate(body);
    if (res.ok) {
      notify(`Saved ${editor.key} v${(res.version as number) ?? 'new'}`);
      await reload();
      await loadTemplate(editor.key);
    } else notify(res.error ?? 'save failed', true);
    setBusy(false);
  };

  const runTest = async () => {
    if (!editor) return;
    let inputData: Record<string, unknown>;
    try {
      inputData = JSON.parse(testJson);
    } catch {
      notify('Invalid test JSON', true);
      return;
    }
    setBusy(true);
    const res = await source.testTemplate(editor.key, inputData, editor.version);
    if (res.ok) {
      setTestResult(res as Record<string, unknown>);
      notify('Dry-run complete');
    } else notify(res.error ?? 'test failed', true);
    setBusy(false);
  };

  return (
    <>
      <div className="topbar">
        <div className="hello">
          <h1>Templates</h1>
          <p>Save creates a new immutable version</p>
        </div>
      </div>

      <div className="templates-layout">
        <aside className="card template-list">
          <h2>Templates</h2>
          <ul className="tpl-rows">
            {templateList.map((t) => (
              <li key={t.key}>
                <button type="button" className={selected === t.key ? 'on' : ''} onClick={() => void loadTemplate(t.key)}>
                  <b>{t.name || t.key}</b>
                  <span>v{t.version} · {t.model}</span>
                </button>
              </li>
            ))}
            {templateList.length === 0 && <p className="hint">No templates.</p>}
          </ul>
        </aside>

        <section className="card template-editor">
          {!editor ? (
            <p className="hint">Select a template.</p>
          ) : (
            <>
              <div className="editor-head">
                <div>
                  <h2>{editor.name || editor.key}</h2>
                  <span className="meta">{editor.key} · v{editor.version}</span>
                </div>
                <div className="editor-actions">
                  <button type="button" className="btn-ghost" onClick={() => setShowTest((v) => !v)}>
                    {showTest ? 'Hide test' : 'Test'}
                  </button>
                  <button type="button" className="btn-yellow" disabled={busy} onClick={() => void saveNewVersion()}>
                    Save new version
                  </button>
                </div>
              </div>

              <div className="form-grid">
                <div>
                  <label>Name</label>
                  <input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
                </div>
                <div>
                  <label>Model</label>
                  <input value={editor.model} onChange={(e) => setEditor({ ...editor, model: e.target.value })} />
                </div>
                <div>
                  <label>Temperature</label>
                  <input type="number" step={0.1} min={0} max={2} value={editor.temperature}
                    onChange={(e) => setEditor({ ...editor, temperature: Number(e.target.value) })} />
                </div>
                <div>
                  <label>Max tokens</label>
                  <input type="number" value={editor.max_tokens}
                    onChange={(e) => setEditor({ ...editor, max_tokens: Number(e.target.value) })} />
                </div>
                <div className="full">
                  <label>System prompt</label>
                  <textarea rows={5} value={editor.system_prompt}
                    onChange={(e) => setEditor({ ...editor, system_prompt: e.target.value })} />
                </div>
                <div className="full">
                  <label>User template</label>
                  <textarea rows={7} value={editor.user_template}
                    onChange={(e) => setEditor({ ...editor, user_template: e.target.value })} />
                </div>
              </div>

              <button type="button" className="btn-ghost" onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? 'Hide' : 'Show'} schema / few-shots / guards
              </button>

              {showAdvanced && (
                <div className="form-grid" style={{ marginTop: 12 }}>
                  <div className="full">
                    <label>Output schema (JSON)</label>
                    <textarea rows={5} value={JSON.stringify(editor.output_schema, null, 2)}
                      onChange={(e) => { try { setEditor({ ...editor, output_schema: JSON.parse(e.target.value) }); } catch { /* */ } }} />
                  </div>
                  <div className="full">
                    <label>Few shots (JSON)</label>
                    <textarea rows={5} value={JSON.stringify(editor.few_shots, null, 2)}
                      onChange={(e) => { try { setEditor({ ...editor, few_shots: JSON.parse(e.target.value) }); } catch { /* */ } }} />
                  </div>
                  <div className="full">
                    <label>Guards (JSON)</label>
                    <textarea rows={4} value={JSON.stringify(editor.guards, null, 2)}
                      onChange={(e) => { try { setEditor({ ...editor, guards: JSON.parse(e.target.value) }); } catch { /* */ } }} />
                  </div>
                </div>
              )}

              {showTest && (
                <div className="test-panel">
                  <h3>Dry-run test</h3>
                  <textarea rows={5} className="code-input" value={testJson} onChange={(e) => setTestJson(e.target.value)} />
                  <button type="button" className="btn-dark" disabled={busy} onClick={() => void runTest()}>Run dry-run</button>
                  {testResult && (
                    <div className="test-output">
                      <OutputPreview output={(testResult.output as Record<string, unknown>) ?? null} />
                      {Array.isArray(testResult.gates) && <GateList gates={testResult.gates as never} />}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
