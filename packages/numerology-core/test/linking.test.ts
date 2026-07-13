import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comboSiblings, lifePathHubSlug } from '../src/index.ts';

test('lifePathHubSlug is the head-term pillar slug', () => {
  assert.equal(lifePathHubSlug(7), 'so-chu-dao-7');
  assert.equal(lifePathHubSlug(11), 'so-chu-dao-11');
});

test('comboSiblings share the life-path, exclude self, ordered by nearest destiny', () => {
  const sibs = comboSiblings(7, 3);
  assert.equal(sibs.length, 4);
  // all share life-path 7, none is self
  assert.ok(sibs.every((s) => s.startsWith('so-chu-dao-7-su-menh-')));
  assert.ok(!sibs.includes('so-chu-dao-7-su-menh-3'));
  // nearest destinies to 3 are 2 and 4 → those slugs come first
  assert.deepEqual(sibs.slice(0, 2).sort(), ['so-chu-dao-7-su-menh-2', 'so-chu-dao-7-su-menh-4']);
});

test('comboSiblings respects the limit', () => {
  assert.equal(comboSiblings(1, 5, 2).length, 2);
});
