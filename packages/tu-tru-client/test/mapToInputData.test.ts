/**
 * Fixture-based tests for the pure mapper. The fixture is a verbatim copy of
 * tu-tru-api's own golden fixture (docs/fixtures/direction-c/
 * day-detail-generic.json, date 2026-05-28) — NO live network calls here,
 * matching numerology-core's pure-function test pattern.
 *
 * The gradeLabel assertions double as the drift alarm for the GRADE_PLAIN
 * mirror: if tu-tru-api changes its grade thresholds/labels and this fixture
 * is refreshed, these tests fail loudly instead of the mirror silently lying.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mapToInputData } from '../src/mapToInputData.ts';
import type { DayDetailGeneric } from '../src/types.ts';

const fixture = JSON.parse(readFileSync(
  fileURLToPath(new URL('./fixtures/day-detail-generic-2026-05-28.json', import.meta.url)),
  'utf8',
)) as DayDetailGeneric;

test('maps the real 2026-05-28 fixture to template facts', () => {
  const f = mapToInputData(fixture);
  assert.equal(f.date, '2026-05-28');
  assert.equal(f.dateVi, '28 tháng 5 năm 2026');
  assert.equal(f.dateSlash, '28/05/2026');
  assert.equal(f.dateShort, '28/5');
  assert.equal(f.titleVariant, 'A'); // day 28 is even → variant A (seo spec §2.2)
  assert.equal(f.dowVi, 'Thứ Năm'); // 2026-05-28 is a Thursday
  assert.equal(f.searchPhraseDate, 'ngày 28/05/2026');
  assert.equal(f.canChiDay, 'Nhâm Dần');
  assert.equal(f.lunarLabel, 'Ngày 12 tháng Tư năm Bính Ngọ');
  assert.equal(f.hoangDao, false);
  assert.equal(f.hoangDaoLabel, 'Ngày Hắc Đạo');
  assert.equal(f.starName, 'Thiên Lao');
  assert.equal(f.trucName, 'Thu');
  assert.equal(f.sao28, 'Giác');
  assert.equal(f.saoElement, 'Mộc');
  assert.equal(f.score, 35);
  assert.equal(f.scoreMax, 100);
  assert.equal(f.grade, 'D');
  assert.equal(f.gradeLabel, 'Ngày không tốt, nên cân nhắc tránh việc quan trọng');
});

test('flattens hour slots and breakdown into renderable lines', () => {
  const f = mapToInputData(fixture);
  assert.equal(f.gioTotList.length, 6);
  assert.equal(f.gioTotList[0], 'Tý 23:00–01:00');
  assert.equal(f.gioXauList.length, 6);
  assert.equal(f.gioXauList[5], 'Hợi 21:00–23:00');
  assert.equal(f.breakdownLines.length, 4);
  assert.ok(f.breakdownLines[0].startsWith('Trực ngày: Trực Thu'));
  // fixture has no hung_ngay rules hit → deterministic "không có"
  assert.equal(f.hungNgayText, 'không có');
});

test('hung_ngay rules join when present; grade labels cover A–C too', () => {
  const withHung = mapToInputData({
    ...fixture,
    hung_ngay: ['Tam Nương', 'Nguyệt Kỵ'],
    score: 82,
    grade: 'A',
  });
  assert.equal(withHung.hungNgayText, 'Tam Nương, Nguyệt Kỵ');
  assert.equal(withHung.gradeLabel, 'Ngày rất tốt');
  assert.equal(mapToInputData({ ...fixture, grade: 'B' }).gradeLabel, 'Ngày tốt');
  assert.equal(mapToInputData({ ...fixture, grade: 'C' }).gradeLabel, 'Ngày bình thường');
});

test('title variant flips on day parity; single-digit days pad in dateSlash only', () => {
  const odd = mapToInputData({ ...fixture, date: '2026-08-01' });
  assert.equal(odd.titleVariant, 'B'); // day 1 is odd → B
  assert.equal(odd.dateSlash, '01/08/2026'); // padded canonical form
  assert.equal(odd.dateShort, '1/8'); //        unpadded short form
  assert.equal(odd.searchPhraseDate, 'ngày 01/08/2026');
});

test('rejects a malformed date instead of silently mis-deriving dowVi', () => {
  assert.throws(() => mapToInputData({ ...fixture, date: '28/05/2026' }));
});
