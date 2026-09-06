import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyData,
  exampleData,
  periods,
  shift,
  day,
  validateData,
} from '../lib/metrics.mjs';
import {
  coverageStatus,
  latestWindow,
  safeProgress,
  reviewInsights,
} from '../lib/readiness.mjs';
test('missing sources never pass coverage', () => {
  assert.deepEqual(coverageStatus(emptyData(), 'woo', periods('2026-09-06')), {
    connected: false,
    current: false,
    before: false,
    days: 0,
  });
});
test('latest window excludes today and never silently shortens history', () => {
  const d = exampleData();
  d.sources.woo.to = day();
  assert.equal(latestWindow(d, 'woo', 28, day()).to, shift(day(), -1));
  assert.equal(latestWindow(d, 'woo', 56, day(), true), null);
  assert.ok(latestWindow(d, 'woo', 28, day(), true));
});
test('sync progress is allowlisted and bounded', () => {
  assert.equal(safeProgress({ completeDays: 90, targetDays: 57 }), null);
  assert.equal(safeProgress({ completeDays: -1, targetDays: 57 }), null);
  assert.equal(safeProgress({ completeDays: 1, targetDays: 0 }), null);
  const p = safeProgress({
    completeDays: 5,
    targetDays: 57,
    workingDate: 'bad',
    secret: 'private',
  });
  assert.equal(p.workingDate, null);
  assert.equal(p.secret, undefined);
});
test('insights only use complete comparisons', () => {
  assert.deepEqual(reviewInsights(emptyData(), periods('2026-09-06')), []);
  const d = exampleData();
  assert.equal(reviewInsights(d, periods(d.sources.woo.to)).length, 3);
  assert.equal(reviewInsights(d, periods(d.sources.woo.to, 56)).length, 0);
});
test('missing daily store or SEO rows cannot be silently counted as zero', () => {
  for (const key of ['commerce', 'seo']) {
    const d = exampleData();
    d[key].splice(1, 1);
    assert.throws(() => validateData(d), /Missing daily/);
  }
});
