/**
 * Pure mapper: DayDetailGeneric (raw API response) → the input_data facts
 * the ngay-tot-xau template renders. No network, no clock, no randomness —
 * fully unit-testable against a checked-in fixture.
 *
 * Derivation policy (architecture.md principle #2 — real facts only):
 * - dateVi / dowVi are pure functions of the ISO date (day-of-week is
 *   computable, not fabricated).
 * - gradeLabel mirrors tu-tru-api's internal GRADE_PLAIN thresholds
 *   (A≥80, B≥65, C≥50 in its scoring.py). PROVISIONAL: generic mode does
 *   not expose this label as an API field, so this is a private mirror of
 *   an undocumented server constant — the fixture regression test exists
 *   to fail loudly if a future fixture refresh reveals drift.
 * - Everything else is a pass-through or a lossless reshaping (arrays of
 *   label strings) of the API's own values.
 */
import type { DayDetailGeneric, Grade } from './types.ts';

export interface NgayTotXauFacts {
  date: string; //             "2026-05-28" (ISO, becomes part of item_key)
  dateVi: string; //           "28 tháng 5 năm 2026" — display + required_mentions token
  dowVi: string; //            "Thứ Năm"
  searchPhraseDate: string; // "ngày 28 tháng 5" — PROVISIONAL keyword_density phrase
  lunarLabel: string; //       contains the YEAR's Can Chi as embedded text
  canChiDay: string; //        the DAY's Can Chi
  hoangDao: boolean;
  hoangDaoLabel: string; //    "Ngày Hoàng Đạo" | "Ngày Hắc Đạo"
  starName: string;
  trucName: string;
  sao28: string;
  saoElement: string;
  score: number;
  scoreMax: number;
  grade: Grade;
  gradeLabel: string;
  gioTotList: string[]; //     label_vi per giờ hoàng đạo slot
  gioXauList: string[];
  hungNgayText: string; //     joined hung_ngay rules, "không có" when none hit
  breakdownLines: string[]; // "<source>: <reason_vi>" per scoring factor
}

const DOW_VI = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

// Mirror of tu-tru-api scoring.py GRADE_THRESHOLDS/GRADE_PLAIN (A:80 B:65 C:50).
const GRADE_LABEL_VI: Record<Grade, string> = {
  A: 'Ngày rất tốt',
  B: 'Ngày tốt',
  C: 'Ngày bình thường',
  D: 'Ngày không tốt, nên cân nhắc tránh việc quan trọng',
};

export function mapToInputData(raw: DayDetailGeneric): NgayTotXauFacts {
  const [y, m, d] = raw.date.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`bad ISO date from API: ${JSON.stringify(raw.date)}`);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();

  return {
    date: raw.date,
    dateVi: `${d} tháng ${m} năm ${y}`,
    dowVi: DOW_VI[dow],
    searchPhraseDate: `ngày ${d} tháng ${m}`,
    lunarLabel: raw.lunar_label,
    canChiDay: raw.can_chi_day,
    hoangDao: raw.hoang_dao,
    hoangDaoLabel: raw.hoang_dao ? 'Ngày Hoàng Đạo' : 'Ngày Hắc Đạo',
    starName: raw.star_name,
    trucName: raw.truc_name,
    sao28: raw.sao_28,
    saoElement: raw.sao_element,
    score: raw.score,
    scoreMax: raw.score_max,
    grade: raw.grade,
    gradeLabel: GRADE_LABEL_VI[raw.grade],
    gioTotList: raw.gio_tot.map((s) => s.label_vi),
    gioXauList: raw.gio_xau.map((s) => s.label_vi),
    hungNgayText: raw.hung_ngay.length ? raw.hung_ngay.join(', ') : 'không có',
    breakdownLines: raw.breakdown_generic.map((b) => `${b.source}: ${b.reason_vi}`),
  };
}
