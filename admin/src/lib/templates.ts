import type { TemplateRow } from '../types';

/** One row per template key — highest version wins (API returns all versions). */
export function latestPerKey(rows: TemplateRow[]): TemplateRow[] {
  const byKey = new Map<string, TemplateRow>();
  for (const t of rows) {
    const prev = byKey.get(t.key);
    if (!prev || t.version > prev.version) byKey.set(t.key, t);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}
