import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getNumberFacts, NUMBER_FACTS } from '../src/numbers.ts';
import { CORE_NUMBERS } from '../src/index.ts';

test('every core number has complete canonical facts', () => {
  for (const n of CORE_NUMBERS) {
    const f = getNumberFacts(n);
    assert.equal(f.n, n);
    assert.ok(f.archetype.length > 0, `archetype for ${n}`);
    assert.ok(f.keyword.length > 0, `keyword for ${n}`);
    assert.ok(f.essence.length > 50, `essence for ${n} should be real prose`);
    assert.ok(f.lifePathFraming.length > 0, `lifePathFraming for ${n}`);
    assert.ok(f.destinyFraming.length > 0, `destinyFraming for ${n}`);
    assert.equal(f.strengths.length, 3, `3 strengths for ${n}`);
    assert.equal(f.challenges.length, 3, `3 challenges for ${n}`);
  }
});

test('master numbers are marked as such', () => {
  assert.equal(NUMBER_FACTS[11].master, true);
  assert.equal(NUMBER_FACTS[22].master, true);
  assert.equal(NUMBER_FACTS[33].master, true);
  assert.equal(NUMBER_FACTS[7].master, undefined);
});

test('getNumberFacts throws on a number outside the grid', () => {
  assert.throws(() => getNumberFacts(10 as never));
});

test('all facts strings are NFC-normalized (unicode gate mirror)', () => {
  for (const n of CORE_NUMBERS) {
    const f = getNumberFacts(n);
    for (const s of [f.archetype, f.keyword, f.essence, f.lifePathFraming, f.destinyFraming,
                     ...f.strengths, ...f.challenges]) {
      assert.equal(s.normalize('NFC'), s, `non-NFC string in facts for ${n}`);
    }
  }
});
