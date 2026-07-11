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
 * Deterministic relationship between two core numbers, based on numerology
 * "mặt phẳng" (planes) grouping. Simplified demo heuristic — the production
 * engine replaces this with a vetted compatibility matrix passed through the
 * human-review gate, but the interface (and the compile-time consistency
 * check) stays the same.
 */
const PLANE: Record<number, 'trí tuệ' | 'thực tế' | 'cảm xúc'> = {
  1: 'trí tuệ', 5: 'trí tuệ', 7: 'trí tuệ',
  2: 'thực tế', 4: 'thực tế', 8: 'thực tế',
  3: 'cảm xúc', 6: 'cảm xúc', 9: 'cảm xúc',
};

export function comboHarmony(a: CoreNumber, b: CoreNumber): Harmony {
  const pa = PLANE[reduceToDigit(a)];
  const pb = PLANE[reduceToDigit(b)];
  if (pa === pb) return 'cộng hưởng';
  // Trí tuệ (chiều sâu) + Cảm xúc (biểu đạt) bù trừ cho nhau.
  const complementary =
    (pa === 'trí tuệ' && pb === 'cảm xúc') || (pa === 'cảm xúc' && pb === 'trí tuệ');
  return complementary ? 'bổ sung' : 'thử thách';
}

/** Canonical slug for a life-path × destiny combo page. */
export function comboSlug(lifePath: CoreNumber, destiny: CoreNumber): string {
  return `so-chu-dao-${lifePath}-su-menh-${destiny}`;
}
