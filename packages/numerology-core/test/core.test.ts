import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reduceNumber,
  reduceToDigit,
  isMaster,
  maturityNumber,
  linkingNumber,
  comboSlug,
} from '../src/core.ts';

test('reduceNumber reduces multi-digit numbers to a single digit', () => {
  assert.equal(reduceNumber(39), 3); // 3+9 = 12 → 1+2 = 3
  assert.equal(reduceNumber(48), 3); // 4+8 = 12 → 3
  assert.equal(reduceNumber(7), 7);
});

test('reduceNumber preserves master numbers, including mid-reduction', () => {
  assert.equal(reduceNumber(11), 11);
  assert.equal(reduceNumber(22), 22);
  assert.equal(reduceNumber(33), 33);
  // 38 → 3+8 = 11: reduction STOPS on a master number (doc comment on
  // reduceNumber). An early planning doc claimed reduceNumber(38)=2; the
  // shipped, master-preserving implementation is the source of truth
  // (verified equal to @csessh/sochumenh by parity.csessh.test.ts).
  assert.equal(reduceNumber(38), 11);
});

test('reduceToDigit collapses masters to their base digit', () => {
  assert.equal(reduceToDigit(11), 2);
  assert.equal(reduceToDigit(22), 4);
  assert.equal(reduceToDigit(33), 6);
  assert.equal(reduceToDigit(7), 7);
});

test('isMaster', () => {
  assert.equal(isMaster(11), true);
  assert.equal(isMaster(22), true);
  assert.equal(isMaster(33), true);
  assert.equal(isMaster(9), false);
});

test('maturityNumber = lifePath + destiny, reduced (masters preserved)', () => {
  assert.equal(maturityNumber(7, 3), 1); // 10 → 1
  assert.equal(maturityNumber(2, 9), 11); // 11 stays master
  assert.equal(maturityNumber(4, 7), 11);
  assert.equal(maturityNumber(9, 9), 9); // 18 → 9
  assert.equal(maturityNumber(11, 11), 22); // 22 stays master
});

test('linkingNumber = |reduced lifePath − reduced destiny|', () => {
  assert.equal(linkingNumber(11, 3), 1); // |2 − 3| = 1
  assert.equal(linkingNumber(7, 3), 4);
  assert.equal(linkingNumber(7, 7), 0);
  assert.equal(linkingNumber(33, 1), 5); // |6 − 1| = 5
});

test('comboSlug', () => {
  assert.equal(comboSlug(7, 3), 'so-chu-dao-7-su-menh-3');
  assert.equal(comboSlug(11, 22), 'so-chu-dao-11-su-menh-22');
});
