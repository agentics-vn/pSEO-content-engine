import { useEffect, useMemo, useState } from 'react';
import type { DataSource, TemplateFull, TemplateRow } from '../types';
import { GateList, OutputPreview } from '../components/proseBits';
import { latestPerKey } from '../lib/templates';

const EMPTY_TEMPLATE: Omit<TemplateFull, 'id' | 'version' | 'created_at'> = {
  key: '',
  name: '',
  model: 'claude-sonnet-4-20250514',
  system_prompt: '',
  user_template: '',
  output_schema: {},
  few_shots: [],
  guards: {},
  temperature: 0.7,
  max_tokens: 4096,
};

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
          <p>Immutable versions — save bumps the version number</p>
        </div>
      </div>

      <div className="templates-layout">
        <aside className="card template-list">
          <h2>Site templates</h2>
          <ul className="tpl-rows">
            {templateList.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  className={selected === t.key ? 'on' : ''}
                  onClick={() => loadTemplate(t.key)}
                >
                  <b>{t.name || t.key}</b>
                  <span>{t.key} · v{t.version} · {t.model}</span>
                </button>
              </li>
            ))}
            {templateList.length === 0 && <p className="hint">No templates yet.</p>}
          </ul>
          <button type="button" className="btn-ghost" onClick={() => {
            setSelected('__new__');
            setEditor({ ...EMPTY_TEMPLATE, key: 'new-template', name: 'New template', id: '', version: 0, created_at: '' });
          }}>New template draft</button>
        </aside>

        <section className="card template-editor">
          {!editor ? (
            <p className="hint">Select a template to edit.</p>
          ) : (
            <>
              <div className="editor-head">
                <h2>{editor.name || editor.key}{editor.version ? ` (v${editor.version})` : ''}</h2>
                <div className="editor-actions">
                  <button type="button" className="btn-yellow" disabled={busy} onClick={saveNewVersion}>
                    Save new version
                  </button>
                </div>
              </div>
              <div className="form-grid">
                <div>
                  <label>Key</label>
                  <input value={editor.key} onChange={(e) => setEditor({ ...editor, key: e.target.value })} />
                </div>
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
                  <input type="number" value={editor.max_tokens} onChange={(e) => setEditor({ ...editor, max_tokens: Number(e.target.value) })} />
                </div>
                <div className="full">
                  <label>System prompt</label>
                  <textarea rows={6} value={editor.system_prompt} onChange={(e) => setEditor({ ...editor, system_prompt: e.target.value })} />
                </div>
                <div className="full">
                  <label>User template</label>
                  <textarea rows={8} value={editor.user_template} onChange={(e) => setEditor({ ...editor, user_template: e.target.value })} />
                </div>
                <div className="full">
                  <label>Output schema (JSON)</label>
                  <textarea rows={6} value={JSON.stringify(editor.output_schema, null, 2)}
                    onChange={(e) => {
                      try { setEditor({ ...editor, output_schema: JSON.parse(e.target.value) }); }
                      catch { /* allow partial edit */ }
                    }} />
                </div>
                <div className="full">
                  <label>Few shots (JSON array)</label>
                  <textarea rows={6} value={JSON.stringify(editor.few_shots, null, 2)}
                    onChange={(e) => {
                      try { setEditor({ ...editor, few_shots: JSON.parse(e.target.value) }); }
                      catch { /* allow partial edit */ }
                    }} />
                </div>
                <div className="full">
                  <label>Guards (JSON)</label>
                  <textarea rows={6} value={JSON.stringify(editor.guards, null, 2)}
                    onChange={(e) => {
                      try { setEditor({ ...editor, guards: JSON.parse(e.target.value) }); }
                      catch { /* allow partial edit */ }
                    }} />
                </div>
              </div>
            </>
          )}
        </section>

        <section className="card template-test">
          <h2>Test panel</h2>
          <p className="hint">Dry-run via prose-generate — nothing is persisted.</p>
          <label>Input JSON</label>
          <textarea rows={8} className="code-input" value={testJson} onChange={(e) => setTestJson(e.target.value)} />
          <button type="button" className="btn-dark" disabled={!editor || busy} onClick={runTest}>Run dry-run</button>
          {testResult && (
            <div className="test-output">
              <h3>Output</h3>
              <OutputPreview output={(testResult.output as Record<string, unknown>) ?? null} />
              {Array.isArray(testResult.gates) && <GateList gates={testResult.gates as never} />}
              {testResult.usage != null && (
                <p className="hint">Tokens: {JSON.stringify(testResult.usage)}</p>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
