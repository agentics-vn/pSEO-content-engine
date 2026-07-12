/**
 * Parity guard — pins @pseo/numerology-core's shared primitives to the
 * published @csessh/sochumenh chart library (agentics-vn's own package that the
 * consuming sites use). Both must reduce, preserve master numbers, and compute
 * maturity IDENTICALLY, or a person's (lifePath × sứ mệnh) pair — and therefore
 * which combo page they land on — would differ between the engine and the site.
 * That is the A1 "same math on both sides" rule, enforced in CI instead of by
 * trust. If this test ever goes red, @csessh changed its math: reconcile
 * `packages/numerology-core/src/core.ts` before shipping.
 *
 * Scope: only the OVERLAPPING primitives are guarded here (reduce / master /
 * maturity). The combo layer (comboHarmony, linkingNumber, enumerateComboGrid)
 * is engine-only — @csessh has no equivalent — so it has its own tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lifePath, expression, maturity } from '@csessh/sochumenh';
import {
  CORE_NUMBERS,
  maturityNumber,
  reduceNumber,
  reduceToDigit,
  isMaster,
  type CoreNumber,
} from '../src/index.ts';

const CORE = new Set<number>(CORE_NUMBERS);

// Real (name, dob) fixtures chosen to span normal digits, a master EXPRESSION
// (số sứ mệnh = 11), and a master MATURITY (số trưởng thành = 11) so the
// master-preserving path is exercised, not just the plain reduction.
const FIXTURES: Array<{ name: string; dob: { day: number; month: number; year: number } }> = [
  { name: 'Nguyen Van A',        dob: { day: 15, month: 3,  year: 1990 } }, // lp1  ex1  mt2
  { name: 'Tran Thi Bich Ngoc',  dob: { day: 15, month: 3,  year: 1990 } }, // lp1  ex11 mt3  (master expression)
  { name: 'Tran Thi Bich Ngoc',  dob: { day: 22, month: 7,  year: 1985 } }, // lp7  ex11 mt9
  { name: 'Nguyen Thi Hoa',      dob: { day: 28, month: 10, year: 1965 } }, // lp5  ex6  mt11 (master maturity)
  { name: 'Le Van Thanh',        dob: { day: 14, month: 6,  year: 1989 } }, // lp2  ex9  mt11 (master maturity)
  { name: 'Tran Duc Anh',        dob: { day: 7,  month: 4,  year: 1991 } }, // lp4  ex7  mt11 (master maturity)
  { name: 'Pham Minh Tuan',      dob: { day: 9,  month: 9,  year: 1999 } },
  { name: 'Hoang Van Nam',       dob: { day: 4,  month: 4,  year: 1993 } },
];

test('@csessh lifePath & expression always land in the engine CoreNumber space', () => {
  for (const { name, dob } of FIXTURES) {
    const lp = lifePath(dob).value;
    const ex = expression(name).value;
    assert.ok(CORE.has(lp), `lifePath ${lp} for ${name} is not a CoreNumber`);
    assert.ok(CORE.has(ex), `expression ${ex} for ${name} is not a CoreNumber`);
  }
});

test('maturity formula agrees: engine maturityNumber(lp, sứ mệnh) === @csessh maturity', () => {
  let sawMasterMaturity = false;
  for (const { name, dob } of FIXTURES) {
    const lp = lifePath(dob).value as CoreNumber;
    const ex = expression(name).value as CoreNumber;
    const csessh = maturity(name, dob).value;
    const engine = maturityNumber(lp, ex);
    assert.equal(
      engine,
      csessh,
      `maturity drift for ${name} (lp ${lp}, sứ mệnh ${ex}): engine ${engine} vs @csessh ${csessh}`,
    );
    if (isMaster(engine)) sawMasterMaturity = true;
  }
  assert.ok(sawMasterMaturity, 'fixtures must exercise at least one master maturity');
});

// Lock the engine's own reduction semantics too (independent of @csessh), so a
// change to core.ts is caught even offline. These are the values @csessh's
// sumDigit(_, {checkMaster}) / sumDigit(_) produce for the same inputs.
test('reduceNumber preserves master numbers; reduceToDigit collapses them', () => {
  assert.equal(reduceNumber(29), 11); // 2+9=11 → master, stop
  assert.equal(reduceNumber(38), 11);
  assert.equal(reduceNumber(11), 11);
  assert.equal(reduceNumber(22), 22);
  assert.equal(reduceNumber(33), 33);
  assert.equal(reduceNumber(44), 8);  // 4+4=8, no master
  assert.equal(reduceToDigit(11 as CoreNumber), 2);
  assert.equal(reduceToDigit(22 as CoreNumber), 4);
  assert.equal(reduceToDigit(33 as CoreNumber), 6);
});
