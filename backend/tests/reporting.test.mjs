import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReporting, dateRange } from '../google-reporting.mjs';
await test('invalid, reversed and overlong dates are rejected before queries', () => {
  for (const [a,b] of [['2025-02-30','2025-03-01'],['2025-03-01','2025-02-01'],['2024-01-01','2025-01-01']]) assert.throws(() => dateRange(a,b), /INVALID_DATE_RANGE/);
});
await test('missing configuration never calls Google', async () => {
  const read = createReporting({ env: {}, request: () => assert.fail('unexpected request') });
  await assert.rejects(read('ads','2025-01-01','2025-01-02'), /PURCHASE_ACTIONS_REQUIRED/);
  await assert.rejects(read('ga4','2025-01-01','2025-01-02'), /GA4_PROPERTY_REQUIRED/);
  await assert.rejects(read('search-console','2025-01-01','2025-01-02'), /SEARCH_PROPERTY_REQUIRED/);
});
await test('search reports retain missing dates and final-only policy', async () => {
  const read = createReporting({ env: { SEARCH_CONSOLE_PROPERTY: 'sc-domain:example.com' }, request: async options => {
    assert.equal(options.data.dataState, 'final');
    assert.equal(options.data.type, 'web');
    return { rows: [{ keys: ['2025-01-01'], clicks: 2, impressions: 10, position: 4, ctr: .2 }] };
  } });
  const report = await read('search-console','2025-01-01','2025-01-02');
  assert.equal(report.rows.length, 1);
  assert.equal(report.timezone, 'America/Los_Angeles');
});
await test('GA4 partial exports fail closed', async () => {
  const read = createReporting({ env: { GA4_PROPERTY_ID: '123' }, request: async () => ({ rowCount: 2, rows: [] }) });
  await assert.rejects(read('ga4','2025-01-01','2025-01-02'), /GA4_REPORT_TOO_LARGE/);
});
await test('Ads separates purchase attribution from generic conversions', async () => {
  const env = { GOOGLE_ADS_CUSTOMER_ID: '1234567890', GOOGLE_ADS_DEVELOPER_TOKEN: 'test-only', GOOGLE_ADS_API_VERSION: 'v25', GOOGLE_ADS_PURCHASE_ACTION_IDS: '42' };
  const read = createReporting({ env, request: async ({ data }) => {
    const q = data.query;
    if(q.includes('FROM customer')) return { results: [{ customer: { currencyCode: 'EGP', timeZone: 'Africa/Cairo' } }] };
    if(q.includes('FROM conversion_action')) return { results: [{ conversionAction: { id: '42', category: 'PURCHASE', primaryForGoal: true } }] };
    if(q.includes('metrics.cost_micros')) return { results: [{ campaign: { id: '1', name: 'Campaign' }, segments: { date: '2025-01-01' }, metrics: { costMicros: '2000000', conversions: 9 } }] };
    return { results: [{ campaign: { id: '1' }, segments: { date: '2025-01-01' }, metrics: { conversions: .5, conversionsValue: 150 } }] };
  } });
  const report = await read('ads','2025-01-01','2025-01-02');
  assert.equal(report.rows[0].cost, 2);
  assert.equal(report.rows[0].conversions, 9);
  assert.equal(report.rows[0].purchases, .5);
  assert.equal(report.rows[0].purchaseValue, 150);
});
