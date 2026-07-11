import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comboHarmony, type CoreNumber } from '../src/core.ts';
import { CORE_NUMBERS, computeComboFacts } from '../src/index.ts';

const DIGITS: CoreNumber[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

test('natural-match triads read as cộng hưởng', () => {
  assert.equal(comboHarmony(1, 5), 'cộng hưởng');
  assert.equal(comboHarmony(5, 7), 'cộng hưởng');
  assert.equal(comboHarmony(2, 8), 'cộng hưởng');
  assert.equal(comboHarmony(3, 9), 'cộng hưởng');
  for (const n of DIGITS) assert.equal(comboHarmony(n, n), 'cộng hưởng');
});

test('compatible pairs read as bổ sung', () => {
  assert.equal(comboHarmony(1, 3), 'bổ sung');
  assert.equal(comboHarmony(2, 6), 'bổ sung');
  assert.equal(comboHarmony(4, 7), 'bổ sung');
  assert.equal(comboHarmony(5, 9), 'bổ sung');
  assert.equal(comboHarmony(6, 8), 'bổ sung');
});

test('challenge pairs read as thử thách', () => {
  assert.equal(comboHarmony(7, 3), 'thử thách');
  assert.equal(comboHarmony(1, 4), 'thử thách');
  assert.equal(comboHarmony(2, 5), 'thử thách');
  assert.equal(comboHarmony(8, 9), 'thử thách');
});

test('matrix is symmetric and total over the full 12×12 grid', () => {
  for (const a of CORE_NUMBERS) {
    for (const b of CORE_NUMBERS) {
      const ab = comboHarmony(a, b);
      assert.ok(['cộng hưởng', 'bổ sung', 'thử thách'].includes(ab), `${a}×${b}`);
      assert.equal(ab, comboHarmony(b, a), `asymmetric at ${a}×${b}`);
    }
  }
});

test('masters read via their base digit', () => {
  assert.equal(comboHarmony(11, 2), comboHarmony(2, 2)); // 11 → 2
  assert.equal(comboHarmony(22, 8), comboHarmony(4, 8)); // 22 → 4
  assert.equal(comboHarmony(33, 9), comboHarmony(6, 9)); // 33 → 6
});

test('all three harmony classes are reachable (golden-set spanning is possible)', () => {
  const seen = new Set<string>();
  for (const a of DIGITS) for (const b of DIGITS) seen.add(comboHarmony(a, b));
  assert.equal(seen.size, 3);
});

// Golden files for computeComboFacts — the exact fact-set the engine feeds the
// LLM and the site recomputes at build time. If any of these change, every
// published page for the combo is stale and must be regenerated.
test('golden: computeComboFacts(7, 3)', () => {
  const f = computeComboFacts(7, 3);
  assert.deepEqual(
    { lifePath: f.lifePath, destiny: f.destiny, lpReduced: f.lpReduced, dtReduced: f.dtReduced,
      linking: f.linking, maturity: f.maturity, harmony: f.harmony, slug: f.slug },
    { lifePath: 7, destiny: 3, lpReduced: 7, dtReduced: 3,
      linking: 4, maturity: 1, harmony: 'thử thách', slug: 'so-chu-dao-7-su-menh-3' },
  );
  assert.equal(f.lp.archetype, 'Nhà tư duy');
  assert.equal(f.dt.archetype, 'Người sáng tạo');
});

test('golden: computeComboFacts(11, 22) — master × master', () => {
  const f = computeComboFacts(11, 22);
  assert.deepEqual(
    { lpReduced: f.lpReduced, dtReduced: f.dtReduced, linking: f.linking,
      maturity: f.maturity, harmony: f.harmony, slug: f.slug },
    { lpReduced: 2, dtReduced: 4, linking: 2,
      maturity: 33, harmony: 'cộng hưởng', slug: 'so-chu-dao-11-su-menh-22' },
  );
  assert.equal(f.lp.master, true);
  assert.equal(f.dt.master, true);
});

test('golden: computeComboFacts(1, 3) — compatible pair', () => {
  const f = computeComboFacts(1, 3);
  assert.deepEqual(
    { linking: f.linking, maturity: f.maturity, harmony: f.harmony, slug: f.slug },
    { linking: 2, maturity: 4, harmony: 'bổ sung', slug: 'so-chu-dao-1-su-menh-3' },
  );
});

test('enumerateComboGrid covers the full 144-combo axis', async () => {
  const { enumerateComboGrid } = await import('../src/index.ts');
  const grid = enumerateComboGrid();
  assert.equal(grid.length, 144);
  const keys = new Set(grid.map((c) => `${c.lifePath}x${c.destiny}`));
  assert.equal(keys.size, 144);
});
