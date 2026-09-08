import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
const server = await createServer({
  configFile: 'vite.pages.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { default: Dashboard } =
    await server.ssrLoadModule('/app/dashboard.tsx');
  const html = renderToString(createElement(Dashboard));
  for (const text of [
    'Performance explorer',
    'Before &amp; after',
    'Google Ads',
    'Connect sources',
    'Open real CSV reports',
    'No live business data connected',
    'No reporting source is connected yet',
    'Open private snapshot',
    'Check coverage &amp; blockers',
  ])
    assert.ok(html.includes(text), 'Missing initial UI: ' + text);
  assert.ok(
    !html.includes('Example · Shopping'),
    'Synthetic data must not be loaded by default',
  );
  assert.ok(
    html.includes('disabled'),
    'Export must be disabled before data is connected',
  );
  assert.ok(
    !html.includes('REPLACE_INSIDE_GOOGLE_ADS_ONLY'),
    'Server-only setup must not enter the UI bundle',
  );
  assert.ok(html.includes('Performance overview'));
  assert.ok(html.includes('See what is changing'));
  assert.ok(html.includes('Missing data is never shown as zero'));
  assert.ok(!html.includes('REPORTING_ACCESS_TOKEN'));
  const { default: Health } = await server.ssrLoadModule(
    '/app/data-health.tsx',
  );
  const { default: Explorer } = await server.ssrLoadModule(
    '/app/report-explorer.tsx',
  );
  const { exampleData, periods } = await import('../lib/metrics.mjs');
  const data = exampleData();
  const health = renderToString(
    createElement(Health, {
      data,
      mode: 'example',
      period: periods(data.sources.woo.to),
      length: 28,
      comparison: false,
      clock: Date.now(),
      onConnect() {},
      onWindow() {},
      onExplore() {},
      onExport() {},
    }),
  );
  for (const expected of [
    'Know which numbers you can use',
    '4',
    'Complete coverage',
    'Example only',
    'Save private snapshot',
  ])
    assert.ok(
      health.includes(expected),
      'Health rendering missing ' + expected,
    );
  data.environment = 'production';
  const imported = renderToString(
    createElement(Explorer, { data, mode: 'import', onConnect() {} }),
  );
  assert.ok(imported.includes('Imported report · not live'));
  assert.ok(imported.includes('Snapshot captured'));
  assert.ok(!imported.includes('>Connected report<'));
  console.log(
    'Server render smoke check passed. This is not browser visual or interaction QA.',
  );
} finally {
  await server.close();
}
