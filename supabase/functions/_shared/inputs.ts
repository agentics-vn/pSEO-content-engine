/**
 * Domain input builders — the one domain-aware seam in the engine. Both
 * prose-admin (creating pending items with input_data + data_hash) and
 * prose-generate (verifying before spending tokens) resolve item keys through
 * the SHARED @pseo/numerology-core (ground rule 2), via this module, so the
 * two sides can never compute different facts.
 */

import { computeComboFacts, type ComboFacts, type CoreNumber } from '@pseo/numerology-core';

const COMBO_KEY_RE = /^so-chu-dao-(\d{1,2})-su-menh-(\d{1,2})$/;

export type ComboInput = ComboFacts & { maturitySum: number };

/**
 * Build input_data for a combo item_key. `maturitySum` is included so the
 * numeric_consistency gate accepts the intermediate "7 + 3 = 10" the prose is
 * explicitly asked to show.
 */
export function buildComboInput(itemKey: string): ComboInput {
  const m = COMBO_KEY_RE.exec(itemKey);
  if (!m) throw new Error(`[inputs] item_key "${itemKey}" is not a combo key`);
  const facts = computeComboFacts(Number(m[1]) as CoreNumber, Number(m[2]) as CoreNumber);
  if (facts.slug !== itemKey) throw new Error(`[inputs] slug drift for "${itemKey}"`);
  return { ...facts, maturitySum: (facts.lifePath as number) + (facts.destiny as number) };
}
