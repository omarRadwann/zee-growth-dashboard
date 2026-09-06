import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
const server = await createServer({ configFile: 'vite.pages.config.ts', server: { middlewareMode: true }, appType: 'custom' });
try {
  const { default: Dashboard } = await server.ssrLoadModule('/app/dashboard.tsx');
  const html = renderToString(createElement(Dashboard));
  for (const text of ['A clearer picture of growth.', 'Before &amp; after', 'Google Ads', 'Connect data', 'Explore example', 'No live business data connected', 'Private data by design']) assert.ok(html.includes(text), 'Missing initial UI: ' + text);
  assert.ok(!html.includes('Example · Shopping'), 'Synthetic data must not be loaded by default');
  assert.ok(html.includes('disabled'), 'Export must be disabled before data is connected');
  assert.ok(!html.includes('REPLACE_INSIDE_GOOGLE_ADS_ONLY'), 'Server-only setup must not enter the UI bundle');
  console.log('Server render smoke check passed. This is not browser visual or interaction QA.');
} finally { await server.close(); }
