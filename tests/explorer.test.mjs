import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseCSV,
  importReport,
  filterRows,
  summarize,
  groupRows,
  classifyQuery,
  comparable,
  reportFromFeed,
  exportGroups,
  trendRows,
} from '../lib/explorer.mjs';
import { exampleData, emptyData } from '../lib/metrics.mjs';
const sample =
  'Search terms report\nAll time\nSearch term,Campaign,Device,Currency code,Clicks,Impr.,Cost,Conversions\n"zee shoes",Brand,Mobile,EGP,10,100,50,2.5\n"شبشب رجالي",Generic,Mobile,EGP,5,200,25,1\n"صندل زي",Brand,Desktop,EGP,2,40,10,0\nTotal: Account,,,,17,340,85,3.5';
test('CSV quotes, escaped quotes, BOM and CRLF', () => {
  assert.deepEqual(parseCSV('\uFEFFDate,Clicks\r\n"a,""b""",2\r\n'), [
    ['\uFEFFDate', 'Clicks'],
    ['a,"b"', '2'],
  ]);
  assert.throws(() => parseCSV('a,b\n"unclosed'), /quoted/);
});
test('recognizes actual Google Ads export structure and excludes totals', () => {
  const r = importReport(sample);
  assert.equal(r.kind, 'ads');
  assert.equal(r.rows.length, 3);
  assert.equal(r.skippedTotals, 1);
  assert.equal(r.from, null);
  assert.equal(summarize(r.rows, r.metrics).cost, 85);
  assert.equal(summarize(r.rows, r.metrics).conversions, 3.5);
  assert.equal(summarize(r.rows, r.metrics).roas, undefined);
});
test('Arabic classification retains Arabic names and distinguishes language from audience', () => {
  assert.equal(classifyQuery('زي zee shoes').language, 'Arabic + English');
  assert.equal(classifyQuery('شبشب زي').brand, 'Brand term');
  assert.equal(classifyQuery('zeebra').brand, 'Non-brand / unclassified');
});
test('filters intersect rather than union, and source data is unchanged', () => {
  const r = importReport(sample);
  const original = JSON.stringify(r);
  const rows = filterRows(r, {
    dimensions: { device: 'Mobile', language: 'Arabic' },
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].query, 'شبشب رجالي');
  assert.equal(JSON.stringify(r), original);
});
test('aggregate rates use numerator and denominator totals', () => {
  const r = importReport(sample);
  const s = summarize(r.rows, r.metrics);
  assert.equal(s.cpc, 5);
  assert.equal(s.ctr, 17 / 340);
  assert.equal(s.costPerConversion, 85 / 3.5);
  assert.equal(
    groupRows(r.rows, 'campaign', r.metrics).find((x) => x.name === 'Brand')
      .cost,
    60,
  );
});
test('missing metric is not replaced with zero', () => {
  const r = importReport(
    'Campaign,Currency code,Clicks,Cost,Conversions\nA,EGP,1,10,--',
  );
  assert.equal(summarize(r.rows, r.metrics).conversions, null);
  assert.equal(summarize(r.rows, r.metrics).costPerConversion, null);
});
test('Search Console weighted position and no invented date history', () => {
  const r = importReport(
    'Top queries,Clicks,Impressions,CTR,Position\nclogs,20,100,20%,2\nslides,10,300,3%,6',
  );
  assert.equal(r.kind, 'seo');
  assert.equal(summarize(r.rows, r.metrics).position, 5);
  assert.equal(comparable(r, '2026-08-01', '2026-08-28'), null);
});
test('strict dates, currencies, repeated headers, duplicate records, and malformed rows', () => {
  for (const text of [
    'Date,Clicks,Impressions\n09/01/26,1,2',
    'Campaign,Currency code,Cost,Clicks\nA,USD,1,2',
    'Campaign,Cost,Clicks\nA,1,2',
    'Campaign,Cost,Cost,Clicks\nA,1,1,2',
    'Date,Clicks,Impressions\n2026-08-01,1,2\n2026-08-01,1,2',
    'Date,Clicks,Impressions\n2026-08-01,1',
  ])
    assert.throws(() => importReport(text));
});
test('PII and unrelated columns never retained', () => {
  const r = importReport(
    'Date,Orders,Gross sales,Customer email,Phone\n2026-08-01,10,4000,private@example.com,01012345678',
  );
  assert.equal(r.currency, 'Unconfirmed');
  assert.ok(!JSON.stringify(r).includes('private@example.com'));
  assert.ok(!JSON.stringify(r).includes('01012345678'));
});
test('date comparison rejects missing-day coverage', () => {
  const r = importReport(
    'Date,Clicks,Impressions\n2026-08-01,1,10\n2026-08-28,2,20',
  );
  assert.equal(comparable(r, '2026-08-15', '2026-08-28'), null);
  assert.equal(comparable(r, '2026-08-01', '2026-08-28'), null);
  assert.equal(comparable(r, '2026-08-20', '2026-08-10'), null);
});
test('dated reports with complete observed days support equal-period comparison', () => {
  const r = importReport(
    'Date,Clicks,Impressions\n2026-08-01,1,10\n2026-08-02,2,20',
  );
  assert.ok(comparable(r, '2026-08-02', '2026-08-02'));
});
test('trend gaps are explicit nulls, not connected missing dates or fake zeroes', () => {
  const rows = trendRows(
    [
      { date: '2026-08-01', clicks: 4 },
      { date: '2026-08-03', clicks: 5 },
    ],
    ['clicks'],
    '2026-08-01',
    '2026-08-03',
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[1].clicks, null);
});
test('weekly buckets start on Monday; negative net sales are retained', () => {
  const r = importReport(
    'Date,Orders,Net sales,Returns\n2026-09-06,1,-10,-20\n2026-09-07,2,40,0',
  );
  const g = groupRows(r.rows, 'date', r.metrics, 'week');
  assert.equal(g[0].name, '2026-08-31');
  assert.equal(g[1].name, '2026-09-07');
  assert.equal(summarize(r.rows, r.metrics).netSales, 30);
  assert.equal(summarize(r.rows, r.metrics).refundValue, 20);
});
test('CSV export neutralizes spreadsheet formulas in dimension values', () => {
  assert.ok(
    exportGroups([{ name: '=1+1', clicks: 2 }], 'query', ['clicks']).includes(
      "'=1+1",
    ),
  );
});
test('decimal-comma amounts cannot silently become hundred-fold values', () => {
  assert.throws(
    () => importReport('Campaign,Currency code,Cost,Clicks\nA,EGP,"1,23",2'),
    /formatting/,
  );
  assert.equal(
    importReport('Campaign,Currency code,Cost,Clicks\nA,EGP,"1,234.56",2')
      .rows[0].cost,
    1234.56,
  );
});
test('connected reports reuse verified feed definitions; empty source stays absent', () => {
  assert.equal(reportFromFeed(emptyData(), 'ads'), null);
  const r = reportFromFeed(exampleData(), 'ads');
  assert.equal(r.environment, 'example');
  assert.ok(r.metrics.includes('purchaseValue'));
});
