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
 * is by design — but it means the shared PRIMITIVES here (digit reduction,
 * master-number preservation, maturity) must stay identical to the published
 * chart library the sites actually use, `@csessh/sochumenh` (agentics-vn's own
 * package). They are verified equal and pinned by `test/parity.csessh.test.ts`,
 * so a change on either side turns CI red instead of silently drifting.
 *
 * The COMBO layer below (comboHarmony, linkingNumber, enumerateComboGrid,
 * computeComboFacts) and the editorial NUMBER_FACTS are engine-specific — the
 * chart library has no equivalent — so they live here and only here.
 */

export * from './core.ts';
export * from './numbers.ts';

import {
  type CoreNumber,
  reduceToDigit,
  maturityNumber,
  linkingNumber,
  comboHarmony,
  comboSlug,
  type Harmony,
} from './core.ts';
import { getNumberFacts, type NumberFacts } from './numbers.ts';

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

// ── Internal linking (hub & spoke) as DATA ───────────────────────────────────
// Contract A4: spoke pages link UP to a head-term hub and SIDEWAYS to siblings,
// and those links are data the page consumes — never hardcoded hrefs. The engine
// computes them here so buildComboInput can carry them in input_data, guaranteeing
// the cluster's link graph resolves instead of the site hoping it does.

/** Head-term (pillar) page slug a combo spoke links UP to — the life-path hub.
 *  Convention: `so-chu-dao-<lifePath>` (documented in the Phase A contract). */
export function lifePathHubSlug(lifePath: CoreNumber): string {
  return `so-chu-dao-${lifePath}`;
}

/** Sibling combo slugs sharing this life-path (same số chủ đạo, other số sứ mệnh),
 *  ordered by nearest destiny, excluding self — the sideways spoke-to-spoke links. */
export function comboSiblings(lifePath: CoreNumber, destiny: CoreNumber, limit = 4): string[] {
  return CORE_NUMBERS
    .filter((d) => d !== destiny)
    .sort((a, b) => Math.abs((a as number) - (destiny as number)) - Math.abs((b as number) - (destiny as number)))
    .slice(0, limit)
    .map((d) => comboSlug(lifePath, d as CoreNumber));
}
