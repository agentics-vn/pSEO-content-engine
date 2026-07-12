import type { GateResult } from '../types';
import { gatesOf, prettyKey } from '../lib/format';
import type { ReviewItem } from '../types';

export function StatusPill({ status }: { status: string }) {
  return <span className={`st st-${status}`}>{status.replace('_', ' ')}</span>;
}

export function GateList({ gates }: { gates: GateResult[] }) {
  if (!gates.length) return <p className="hint">No gates recorded.</p>;
  return (
    <ul className="gate-list">
      {gates.map((g, i) => (
        <li key={i} className={g.passed ? 'pass' : g.severity === 'fail' ? 'fail' : 'flag'}>
          <strong>{g.gate}</strong> · {g.severity} · {g.passed ? 'passed' : 'failed'}
          {g.detail && <span className="detail"> — {g.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

export function OutputPreview({ output }: { output: Record<string, unknown> | null }) {
  if (!output) return <p className="hint">No output yet.</p>;
  return (
    <pre className="code-preview">{JSON.stringify(output, null, 2)}</pre>
  );
}

export function ItemTitle({ item }: { item: ReviewItem }) {
  return (
    <div className="item-title">
      <b>{prettyKey(item.item_key)}</b>
      <span className="meta">{item.template_key} v{item.template_version}</span>
    </div>
  );
}

export function GatePills({ item }: { item: ReviewItem }) {
  const gates = gatesOf(item);
  const passed = gates.filter((g) => g.passed).length;
  const redFails = gates.filter((g) => g.severity === 'fail' && !g.passed);
  return (
    <div className="gates">
      {redFails.length > 0 && (
        <span className="fail-chip" title={redFails.map((g) => g.gate).join(', ')}>
          {redFails.length} fail
        </span>
      )}
      <span className="count">Gates: <b>{passed}/{gates.length}</b></span>
      <div className="pills" aria-hidden>
        {gates.map((g, i) => (
          <i key={i} className={g.passed ? 'on' : g.severity === 'fail' ? 'redfail' : ''}
            title={`${g.gate}: ${g.passed ? 'passed' : g.detail ?? 'needs review'}`} />
        ))}
      </div>
    </div>
  );
}
