import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyData, exampleData } from '../lib/metrics.mjs';
import {
  mergeSnapshot,
  availableSources,
  missingViewSources,
} from '../lib/snapshot-import.mjs';
function source(key, environment = 'production') {
  const sample = exampleData(),
    result = emptyData();
  result.environment = environment;
  result.generatedAt = sample.generatedAt;
  result.sources[key] = sample.sources[key];
  const rows = { woo: 'commerce', ads: 'ads', events: 'events', seo: 'seo' }[
    key
  ];
  result[rows] = sample[rows];
  return result;
}
test('SEO-only snapshot never supplies sales or enquiry data', () => {
  const { data } = mergeSnapshot(emptyData(), source('seo'), 'empty');
  assert.deepEqual(availableSources(data), ['seo']);
  assert.deepEqual(missingViewSources(data, 'activity'), ['woo', 'events']);
  assert.deepEqual(missingViewSources(data, 'seo'), []);
});
test('adding organic data preserves existing store sources and values', () => {
  const store = source('woo');
  const copy = structuredClone(store);
  const { data } = mergeSnapshot(store, source('seo'), 'import');
  assert.deepEqual(data.commerce, store.commerce);
  assert.deepEqual(availableSources(data), ['woo', 'seo']);
  assert.deepEqual(store, copy);
});
test('reimport replaces that source rather than double counting', () => {
  const one = source('seo');
  const { data } = mergeSnapshot(one, one, 'import');
  assert.equal(data.seo.length, one.seo.length);
});
test('environment mismatch fails without erasing current data', () => {
  const store = source('woo');
  assert.throws(
    () => mergeSnapshot(store, source('seo', 'staging'), 'import'),
    /Do not mix/,
  );
  assert.ok(store.commerce.length);
});
test('manual imports do not silently disconnect a bridge', () => {
  assert.throws(
    () => mergeSnapshot(source('woo'), source('seo'), 'bridge'),
    /connection was not stopped/,
  );
});
test('snapshot import handler neither redirects nor disconnects', () => {
  const source = fs.readFileSync(
    new URL('../app/dashboard.tsx', import.meta.url),
    'utf8',
  );
  const handler = source
    .split('async function importFile')[1]
    .split('function connect')[0];
  assert.doesNotMatch(handler, /\bgo\s*\(|\bsetView\s*\(|\bdisconnect\s*\(/);
  assert.match(handler, /mergeSnapshot/);
});
