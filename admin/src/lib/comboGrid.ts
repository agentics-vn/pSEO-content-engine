/** Client-side combo grid sizing — mirrors prose-admin enumerateComboGrid filters. */

const CORE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33] as const;
const MASTERS = new Set([11, 22, 33]);

function isMaster(n: number): boolean {
  return MASTERS.has(n);
}

export function countComboGrid(filter: { master?: 'exclude' | 'only' }): number {
  let n = 0;
  for (const lifePath of CORE) {
    for (const destiny of CORE) {
      if (filter.master === 'exclude' && (isMaster(lifePath) || isMaster(destiny))) continue;
      if (filter.master === 'only' && !(isMaster(lifePath) || isMaster(destiny))) continue;
      n++;
    }
  }
  return n;
}
