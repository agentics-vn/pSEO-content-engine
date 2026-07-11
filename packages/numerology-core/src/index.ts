/**
 * @pseo/numerology-core — the SHARED, deterministic numerology math.
 *
 * This package is the single source of truth for every computed numerology
 * value. It is imported by BOTH:
 *   1. the engine (prose-generate) — to build the input_data fed to the LLM and
 *      to run the numeric-consistency gate, and
 *   2. every consuming site (e.g. sochumenh) — to recompute the same values at
 *      build time and THROW if the published prose ever drifts from them.
 *
 * If these two sides ever run different math, every page throws at build. That
 * is by design — but it means this package must be the ONLY implementation.
 * Ported verbatim from sochudao's astro/src/lib/numerology/core.ts + numbers.ts
 * (which named `packages/numerology-core` as its intended home).
 */

export * from './core';
export * from './numbers';

import {
  type CoreNumber,
  reduceToDigit,
  maturityNumber,
  linkingNumber,
  comboHarmony,
  comboSlug,
  type Harmony,
} from './core';
import { getNumberFacts, type NumberFacts } from './numbers';

/** The complete computed fact-set for one Life-Path × Destiny combo. */
export interface ComboFacts {
  lifePath: CoreNumber;
  destiny: CoreNumber;
  lpReduced: number;
  dtReduced: number;
  linking: number;
  maturity: CoreNumber;
  harmony: Harmony;
  slug: string;
  lp: NumberFacts;
  dt: NumberFacts;
}

/**
 * Build the authoritative fact-set for a combo. The engine passes this into the
 * template's user_template (so the model writes on top of real data) AND into
 * the numeric_consistency / required_mentions gates (so it validates against the
 * exact same numbers). The site recomputes this to assert no drift.
 */
export function computeComboFacts(lifePath: CoreNumber, destiny: CoreNumber): ComboFacts {
  return {
    lifePath,
    destiny,
    lpReduced: reduceToDigit(lifePath),
    dtReduced: reduceToDigit(destiny),
    linking: linkingNumber(lifePath, destiny),
    maturity: maturityNumber(lifePath, destiny),
    harmony: comboHarmony(lifePath, destiny),
    slug: comboSlug(lifePath, destiny),
    lp: getNumberFacts(lifePath),
    dt: getNumberFacts(destiny),
  };
}

/** The full 12×12 axis. Order the batch by search demand, not this order. */
export const CORE_NUMBERS: CoreNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];

/** Every combo in the grid (144). Filter out already-published to get the work-list. */
export function enumerateComboGrid(): Array<{ lifePath: CoreNumber; destiny: CoreNumber }> {
  const out: Array<{ lifePath: CoreNumber; destiny: CoreNumber }> = [];
  for (const lifePath of CORE_NUMBERS) {
    for (const destiny of CORE_NUMBERS) out.push({ lifePath, destiny });
  }
  return out;
}
