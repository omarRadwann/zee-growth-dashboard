import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportSnapshot, reportingUrl } from '../lib/direct-report.mjs';
await test('reporting URLs reject credentials, insecure hosts and paths', () => {
  for(const url of ['http://example.com','https://user:password@example.com','https://example.com/path']) assert.throws(()=>reportingUrl(url)); assert.equal(reportingUrl('https://example.com/'),'https://example.com');
});
await test('missing SEO days are not fabricated', () => {
  assert.throws(()=>reportSnapshot({source:'search-console',from:'2025-01-01',to:'2025-01-02',rows:[],generatedAt:'2025-01-03T00:00:00Z'}),/missing/);
});
await test('wrong Ads account is rejected', () => { assert.throws(()=>reportSnapshot({source:'ads',accountId:'other',rows:[]}),/Unexpected/); });
