/**
 * Types for tu-tru-api's GET /v1/day-detail?mode=generic response.
 *
 * GENERIC MODE ONLY. The endpoint's personalized branch (birth_date given)
 * additionally returns purpose_rows / good_for / avoid_for / intent /
 * summary_vi / breakdown — those arrive as null in generic mode and are
 * deliberately NOT modeled here so no caller can accidentally build a page
 * on data that doesn't exist without a birth date.
 *
 * Field names mirror the API verbatim (snake_case) — the mapper
 * (mapToInputData.ts) owns the translation to template-facing facts.
 */

export interface GioSlot {
  chi: string;
  chi_name: string;
  start_hour: string; // "23:00"
  end_hour: string; //   "01:00"
  label_vi: string; //   "Tý 23:00–01:00"
  range: string; //      "23:00-01:00"
}

export interface ScoreWeight {
  factor: string;
  label_vi: string;
  max_points: number;
}

export interface SourceRef {
  ref: number;
  label_vi: string;
  description_vi: string;
}

export interface BreakdownItem {
  id: string;
  source: string;
  source_ref: number;
  type: string;
  points: number;
  reason_vi: string;
}

export type Grade = 'A' | 'B' | 'C' | 'D';

export interface DayDetailGeneric {
  status: 'success';
  date: string; //          "2026-05-28" (ISO)
  lunar_date: string; //    "Ngày 12 tháng Tư năm Bính Ngọ"
  lunar_label: string; //   same as lunar_date (contains the YEAR's Can Chi)
  can_chi: string; //       "Nhâm Dần"
  can_chi_day: string; //   the DAY's Can Chi (same value as can_chi)
  hoang_dao: boolean;
  star_name: string; //     "Thiên Lao" (hoàng/hắc đạo star)
  truc_name: string; //     "Thu" (one of the 12 Trực)
  truc_score: number;
  sao_28: string; //        "Giác" (28 lunar mansions)
  sao_element: string; //   "Mộc"
  gio_tot: GioSlot[];
  gio_xau: GioSlot[];
  hung_ngay: string[]; //   inauspicious-day rules hit (often empty)
  score: number; //         0–100
  grade: Grade;
  score_max: number; //     100
  score_methodology: { summary_vi: string; weights: ScoreWeight[] };
  sources: SourceRef[];
  personalized: false;
  breakdown_generic: BreakdownItem[];
}
