import { SOURCES, validateData } from './metrics.mjs';

const rowKey = { ads: 'ads', woo: 'commerce', events: 'events', seo: 'seo' };
export const SOURCE_LABELS = {
  ads: 'Google Ads',
  woo: 'WooCommerce sales',
  events: 'Enquiries & activity',
  seo: 'Search Console',
};
export function availableSources(data) {
  return SOURCES.filter((key) => data.sources[key]?.status === 'connected');
}

// Imports replace the incoming source snapshots, never append daily records.
// The caller intentionally keeps the active view unchanged.
export function mergeSnapshot(current, raw, mode) {
  if (mode === 'bridge')
    throw Error(
      'An automatic connection is active. Stop it using Data connections → Disconnect & clear data before opening manual snapshots. The connection was not stopped.',
    );
  const incoming = validateData(raw);
  const sources = availableSources(incoming);
  if (!sources.length)
    throw Error(
      'This file contains no reporting sources. Existing data was kept.',
    );
  if (!availableSources(current).length) return { data: incoming, sources };
  if (current.environment !== incoming.environment)
    throw Error(
      'Do not mix production, staging or example data. Use Disconnect & clear data before switching environments. Existing data was kept.',
    );
  const merged = {
    ...current,
    sources: { ...current.sources },
    generatedAt:
      Date.parse(current.generatedAt) > Date.parse(incoming.generatedAt)
        ? current.generatedAt
        : incoming.generatedAt,
  };
  for (const key of sources) {
    merged.sources[key] = incoming.sources[key];
    merged[rowKey[key]] = incoming[rowKey[key]];
  }
  return { data: validateData(merged), sources };
}

export function missingViewSources(data, view) {
  /** @type {Record<string, string[]>} */
  const requirements = {
    campaigns: ['ads'],
    activity: ['woo', 'events'],
    seo: ['seo'],
  };
  const required = requirements[view] || [];
  return required.filter((key) => data.sources[key]?.status !== 'connected');
}
