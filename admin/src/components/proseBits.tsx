import type { GateResult } from '../types';
import { gatesOf, prettyKey, shortStatus } from '../lib/format';
import type { ReviewItem } from '../types';

export function StatusPill({ status }: { status: string }) {
  return <span className={`st st-${status}`}>{shortStatus(status)}</span>;
}

/** Status dot + item name — no text labels. */
export function ReviewListItem({ item, active }: { item: ReviewItem; active: boolean }) {
  return (
    <span className={`review-list-item${active ? ' on' : ''}`}>
      <span
        className={`rli-status rli-status--${item.status}`}
        title={shortStatus(item.status)}
        aria-label={shortStatus(item.status)}
      />
      <span className="rli-title" title={prettyKey(item.item_key)}>{prettyKey(item.item_key)}</span>
    </span>
  );
}

export function GateList({ gates }: { gates: GateResult[] }) {
  if (!gates.length) return <p className="hint">No gates recorded.</p>;
  return (
    <ul className="gate-list">
      {gates.map((g, i) => (
        <li key={i} className={g.passed ? 'pass' : g.severity === 'fail' ? 'fail' : 'flag'}>
          <span className={`gate-dot ${g.passed ? 'ok' : g.severity === 'fail' ? 'bad' : 'warn'}`} />
          <strong>{g.gate}</strong>
          {g.detail && !g.passed && <span className="detail"> — {g.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

export function OutputPreview({ output }: { output: Record<string, unknown> | null }) {
  if (!output) return <p className="hint">No output yet.</p>;
  return <pre className="code-preview">{JSON.stringify(output, null, 2)}</pre>;
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
  return (
    <div className="pills" aria-hidden>
      {gates.map((g, i) => (
        <i key={i} className={g.passed ? 'on' : g.severity === 'fail' ? 'redfail' : ''}
          title={`${g.gate}: ${g.passed ? 'passed' : g.detail ?? 'needs review'}`} />
      ))}
    </div>
  );
}
