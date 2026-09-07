import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { validateData } from '../lib/metrics.mjs';

const code = fs.readFileSync(
  new URL('../connectors/search-console/Code.gs', import.meta.url),
  'utf8',
);
function setup(options = {}) {
  const properties = {
    ZEE_REPORT_SECRET: 'a'.repeat(64),
    ...options.properties,
  };
  const calls = [],
    logs = [],
    triggers = [];
  let released = 0;
  const rows = options.rows || [
    { keys: ['2026-09-03'], clicks: 10, impressions: 100, position: 3 },
    { keys: ['2026-09-04'], clicks: 20, impressions: 200, position: 4 },
  ];
  const context = {
    console: { log: (value) => logs.push(value) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => properties[key],
        setProperty: (key, value) => {
          properties[key] = value;
        },
      }),
    },
    Utilities: {
      formatDate: () => '2026-09-07',
      computeHmacSha256Signature: (body, key) => [
        ...crypto.createHmac('sha256', key).update(body).digest(),
      ],
    },
    ScriptApp: {
      getOAuthToken: () => 'test-token',
      getProjectTriggers: () => triggers,
      newTrigger: (handler) => ({
        timeBased: () => ({
          everyHours: (hours) => ({
            create: () =>
              triggers.push({ getHandlerFunction: () => handler, hours }),
          }),
        }),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => released++,
      }),
    },
    UrlFetchApp: {
      fetch: (url, request) => {
        calls.push({ url, ...request });
        const google = url.startsWith('https://www.googleapis.com/');
        const query = JSON.parse(request.payload);
        const result = google
          ? {
              rows: query.dimensions.length
                ? rows
                : [
                    {
                      clicks: options.badTotal
                        ? 99
                        : rows.reduce((n, r) => n + r.clicks, 0),
                      impressions: rows.reduce((n, r) => n + r.impressions, 0),
                    },
                  ],
            }
          : {
              ok: true,
              source: 'seo',
              rows: options.badReceipt ? 99 : rows.length,
            };
        return {
          getResponseCode: () => (google ? 200 : options.deliveryStatus || 200),
          getContentText: () => JSON.stringify(result),
        };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  return {
    context,
    calls,
    logs,
    properties,
    triggers,
    released: () => released,
  };
}
test('SEO collector reconciles finalized Egypt daily totals and signs private delivery', () => {
  const s = setup();
  s.context.syncZeeSearch();
  const sent = s.calls[2],
    data = validateData(JSON.parse(sent.payload));
  assert.equal(data.seo.length, 2);
  assert.equal(data.environment, 'staging');
  const query = JSON.parse(s.calls[0].payload);
  assert.equal(query.dataState, 'final');
  assert.equal(query.type, 'web');
  assert.equal(query.dimensionFilterGroups[0].filters[0].expression, 'egy');
  const expected = crypto
    .createHmac('sha256', 'a'.repeat(64))
    .update(sent.headers['X-Zee-Timestamp'] + '.' + sent.payload)
    .digest('hex');
  assert.equal(sent.headers['X-Zee-Signature'], expected);
  assert.equal(sent.followRedirects, false);
  assert.ok(s.properties.ZEE_LAST_SUCCESS);
  assert.equal(s.released(), 1);
  assert.doesNotMatch(s.logs.join(''), /test-token|aaaaaaaaaaaaaaaa/);
});
test('SEO preview never transmits to WordPress or installs a schedule', () => {
  const s = setup();
  s.context.previewZeeSearch();
  assert.equal(s.calls.length, 2);
  assert.ok(
    s.calls.every((c) => c.url.startsWith('https://www.googleapis.com/')),
  );
  assert.equal(s.triggers.length, 0);
  assert.equal(s.properties.ZEE_LAST_SUCCESS, undefined);
});
test('SEO collector rejects gaps, duplicate days, malformed metrics and unreconciled totals', () => {
  for (const rows of [
    [
      { keys: ['2026-09-02'], clicks: 1, impressions: 2, position: 1 },
      { keys: ['2026-09-04'], clicks: 1, impressions: 2, position: 1 },
    ],
    [
      { keys: ['2026-09-04'], clicks: 1, impressions: 2, position: 1 },
      { keys: ['2026-09-04'], clicks: 1, impressions: 2, position: 1 },
    ],
    [{ keys: ['2026-09-04'], clicks: -1, impressions: 2, position: 1 }],
  ]) {
    const s = setup({ rows });
    assert.throws(() => s.context.syncZeeSearch());
    assert.ok(
      s.calls.every((c) => c.url.startsWith('https://www.googleapis.com/')),
    );
  }
  assert.throws(
    () => setup({ badTotal: true }).context.syncZeeSearch(),
    /reconcile/,
  );
});
test('SEO failed receipt or delivery never records success and always releases the lock', () => {
  for (const options of [{ deliveryStatus: 403 }, { badReceipt: true }]) {
    const s = setup(options);
    assert.throws(() => s.context.syncZeeSearch());
    assert.equal(s.properties.ZEE_LAST_SUCCESS, undefined);
    assert.equal(s.released(), 1);
  }
});
test('SEO scheduler requires a verified run and does not duplicate its own trigger', () => {
  const s = setup();
  assert.throws(() => s.context.scheduleZeeSearch(), /verify/);
  s.context.syncZeeSearch();
  s.context.scheduleZeeSearch();
  s.context.scheduleZeeSearch();
  assert.equal(s.triggers.length, 1);
  assert.equal(s.triggers[0].hours, 6);
});
test('SEO collector rejects arbitrary destinations and unapproved production configuration', () => {
  assert.throws(
    () =>
      setup({
        properties: { ZEE_REPORT_ENDPOINT: 'https://example.com/' },
      }).context.syncZeeSearch(),
    /Unapproved/,
  );
  assert.throws(
    () =>
      setup({
        properties: {
          ZEE_REPORT_ENDPOINT:
            'https://zee-official.com/wp-json/zee-growth/v1/ingest/seo',
        },
      }).context.syncZeeSearch(),
    /explicit approval/,
  );
});
