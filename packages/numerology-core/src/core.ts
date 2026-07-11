/**
 * Numerology core — pure, deterministic calculations.
 *
 * Seed of the future `packages/numerology-core`. Every programmatic page must
 * stand on values computed here (the "dữ kiện thật" behind each page), so the
 * prose is a layer on top of real data, not a doorway template. The same
 * functions back the paid report in `app/`, keeping SEO content and product
 * perfectly consistent.
 */

export type CoreNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 11 | 22 | 33;

const MASTER_NUMBERS = new Set<number>([11, 22, 33]);

function sumDigits(n: number): number {
  return String(n)
    .split('')
    .reduce((acc, d) => acc + Number(d), 0);
}

/** Reduce to a single digit, preserving master numbers 11/22/33. */
export function reduceNumber(input: number): CoreNumber {
  let n = Math.abs(Math.trunc(input));
  while (n > 9 && !MASTER_NUMBERS.has(n)) {
    n = sumDigits(n);
  }
  return n as CoreNumber;
}

/** Reduce fully to 1–9 (masters collapse to their base: 11→2, 22→4, 33→6). */
export function reduceToDigit(n: CoreNumber): number {
  let x = n as number;
  while (x > 9) x = sumDigits(x);
  return x;
}

export function isMaster(n: CoreNumber): boolean {
  return MASTER_NUMBERS.has(n);
}

/** Số trưởng thành = số chủ đạo + số sứ mệnh, rút gọn. */
export function maturityNumber(lifePath: CoreNumber, destiny: CoreNumber): CoreNumber {
  return reduceNumber((lifePath as number) + (destiny as number));
}

/**
 * Chỉ số liên kết (bridge number) = |số chủ đạo − số sứ mệnh|, đã rút về 1 chữ số.
 * Đây là cách thị trường VN quen gọi "cầu nối" giữa hai chỉ số — một chữ số 0–8
 * cho biết khoảng cách/độ dễ hoà hợp giữa đường đời và sứ mệnh.
 */
export function linkingNumber(lifePath: CoreNumber, destiny: CoreNumber): number {
  return Math.abs(reduceToDigit(lifePath) - reduceToDigit(destiny));
}

export type Harmony = 'cộng hưởng' | 'bổ sung' | 'thử thách';

/**
 * Deterministic relationship between two core numbers, from the classic
 * Pythagorean compatibility chart (natural-match / compatible / challenge),
 * replacing the Phase-0 planes demo heuristic. Same signature and the same
 * compile-time consistency check downstream — only the read changed.
 *
 * - 'cộng hưởng' (natural match): the three natural-match triads
 *   {1,5,7} (mind), {2,4,8} (business/practical), {3,6,9} (creative/emotional).
 * - 'bổ sung' (compatible): the chart's "compatible" pairs, symmetric.
 * - 'thử thách' (challenge): everything else.
 *
 * Master numbers read via their base digit (11→2, 22→4, 33→6), matching how
 * linkingNumber treats them; the master quality is carried by NUMBER_FACTS,
 * not by this pairwise read.
 */
const NATURAL_TRIAD: Record<number, number> = {
  1: 1, 5: 1, 7: 1,
  2: 2, 4: 2, 8: 2,
  3: 3, 6: 3, 9: 3,
};

// Symmetric "compatible" pairs; every listed pair is mirrored in the check.
const COMPATIBLE: ReadonlyArray<readonly [number, number]> = [
  [1, 2], [1, 3], [1, 9],
  [2, 3], [2, 6], [2, 9],
  [3, 5],
  [4, 6], [4, 7],
  [5, 9],
  [6, 8],
];

export function comboHarmony(a: CoreNumber, b: CoreNumber): Harmony {
  const da = reduceToDigit(a);
  const db = reduceToDigit(b);
  if (NATURAL_TRIAD[da] === NATURAL_TRIAD[db]) return 'cộng hưởng';
  if (COMPATIBLE.some(([x, y]) => (x === da && y === db) || (x === db && y === da))) {
    return 'bổ sung';
  }
  return 'thử thách';
}

/** Canonical slug for a life-path × destiny combo page. */
export function comboSlug(lifePath: CoreNumber, destiny: CoreNumber): string {
  return `so-chu-dao-${lifePath}-su-menh-${destiny}`;
}
