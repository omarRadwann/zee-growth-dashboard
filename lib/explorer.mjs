import { validDate, shift, ratio, periods, days, csv } from './metrics.mjs';

export const DIMENSIONS = {
  date: 'Date',
  campaign: 'Campaign',
  campaignType: 'Campaign type',
  campaignStatus: 'Campaign status',
  adGroup: 'Ad group',
  query: 'Search term',
  device: 'Device',
  network: 'Network',
  country: 'Country',
  product: 'Product',
  status: 'Order status',
  payment: 'Payment method',
  channel: 'Channel',
  page: 'Landing page',
  language: 'Query language',
  brand: 'Brand / non-brand',
  matchType: 'Match type',
};
export const METRICS = {
  cost: 'Ad spend',
  clicks: 'Clicks',
  impressions: 'Impressions',
  conversions: 'Ads conversions (all configured goals)',
  purchases: 'Ads-attributed purchases',
  purchaseValue: 'Ads purchase value',
  conversionValue: 'All-goal conversion value',
  orders: 'Orders',
  paidOrders: 'Orders with payment recorded',
  recordedPaidValue: 'Recorded paid order value',
  cancelledOrders: 'Cancelled orders',
  completedOrders: 'Completed orders',
  refundValue: 'Refund value',
  grossSales: 'Gross sales',
  netSales: 'Net sales',
  units: 'Units sold',
  shipping: 'Shipping',
  tax: 'Tax',
  position: 'Average search position',
  ctr: 'Click-through rate',
  cpc: 'Cost per click',
  costPerConversion: 'Cost per configured conversion',
  roas: 'Purchase ROAS',
  aov: 'Recorded paid value per paid order',
};
const DIM_ALIASES = {
  date: ['day', 'date'],
  campaign: ['campaign'],
  campaignType: ['campaign type', 'campaign_type'],
  campaignStatus: ['campaign status'],
  adGroup: ['ad group'],
  query: ['search term', 'search terms', 'top queries', 'query'],
  device: ['device'],
  network: ['network', 'network (with search partners)'],
  country: ['country', 'countries'],
  product: ['product', 'product name', 'product title'],
  status: ['order status', 'status'],
  payment: ['payment method'],
  channel: ['channel', 'session default channel group'],
  page: ['top pages', 'landing page', 'page'],
  matchType: ['match type'],
};
const METRIC_ALIASES = {
  cost: ['cost', 'cost_egp', 'ad spend'],
  clicks: ['clicks'],
  impressions: ['impr.', 'impressions'],
  conversions: ['conversions'],
  conversionValue: ['conv. value', 'conversion value'],
  purchases: ['purchases', 'ads-attributed purchases'],
  purchaseValue: ['purchase value', 'ads purchase value'],
  orders: ['orders'],
  paidOrders: ['paid orders', 'orders with payment recorded'],
  recordedPaidValue: ['recorded paid value', 'recorded paid order value'],
  cancelledOrders: ['cancelled orders'],
  completedOrders: ['completed orders'],
  refundValue: ['refund value', 'returns'],
  grossSales: ['gross sales'],
  netSales: ['net sales'],
  units: ['items sold', 'units sold'],
  shipping: ['shipping'],
  tax: ['taxes', 'tax'],
  position: ['position', 'average position'],
};
const normalize = (x) =>
  String(x)
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase();
const alias = (name, dict) =>
  Object.keys(dict).find((k) => dict[k].includes(normalize(name)));
export function parseCSV(text) {
  if (typeof text !== 'string' || text.length > 100 * 1024 * 1024)
    throw Error('Use a CSV smaller than 100 MB.');
  const first = text.slice(0, 100000).split(/\r?\n/).slice(0, 12).join('\n');
  const delimiter = first.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [],
    value = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (!quoted && value.trim()) {
        throw Error('Malformed CSV quotation.');
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(value);
      value = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(value);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      value = '';
    } else value += c;
  }
  if (quoted) throw Error('The CSV ends inside a quoted field.');
  row.push(value);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length > 600005)
    throw Error(
      'Use an export with at most 600,000 rows. Split larger reports by month.',
    );
  return rows;
}
function numeric(v, name) {
  if (v === '' || v === '--' || v === '—' || v === 'N/A') return null;
  const literal = v.trim().replace(/EGP\s*|\s*EGP/g, '');
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(literal))
    throw Error(
      'Ambiguous number formatting. Export English-locale CSV with decimal points.',
    );
  const cleaned = literal.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned))
    throw Error(
      'Cannot read ' +
        name +
        ' value. Export English-locale CSV with decimal points.',
    );
  const n = Number(cleaned);
  if (!Number.isFinite(n) || Math.abs(n) > 1e14)
    throw Error('Invalid metric value.');
  if (n < 0 && !['refundValue', 'netSales'].includes(name))
    throw Error(
      'Negative ' + name + ' is unsupported; check export adjustments.',
    );
  return name === 'refundValue' ? Math.abs(n) : n;
}
export function classifyQuery(q) {
  const clean = q.toLowerCase().normalize('NFKC');
  const ar = /[\u0600-\u06ff]/.test(clean),
    en = /[a-z]/.test(clean);
  return {
    language: ar
      ? en
        ? 'Arabic + English'
        : 'Arabic'
      : en
        ? 'English'
        : 'Other',
    brand: /(^|[^a-z])zee([^a-z]|$)|(^|[\s،])زي([\s،]|$)/.test(clean)
      ? 'Brand term'
      : 'Non-brand / unclassified',
  };
}
export function importReport(text, name = 'Report.csv') {
  const sourceRows = parseCSV(text);
  const headerIndex = sourceRows.findIndex(
    (r, i) => i < 12 && r.filter((x) => alias(x, METRIC_ALIASES)).length >= 2,
  );
  if (headerIndex < 0)
    throw Error(
      'No supported report header. Use an English-column Google Ads, Search Console or WooCommerce CSV export.',
    );
  const header = sourceRows[headerIndex];
  const dims = header.map((x) => alias(x, DIM_ALIASES));
  const mets = header.map((x) => alias(x, METRIC_ALIASES));
  const keys = [...dims, ...mets].filter(Boolean);
  if (new Set(keys).size !== keys.length)
    throw Error('Repeated reporting columns would double-count data.');
  const kind = mets.includes('cost')
    ? 'ads'
    : mets.some((x) =>
          ['orders', 'grossSales', 'netSales', 'recordedPaidValue'].includes(x),
        )
      ? 'store'
      : 'seo';
  const currencies = new Set();
  let skippedTotals = 0;
  const rows = [];
  const currencyIndex = header.findIndex((x) =>
    ['currency code', 'currency'].includes(normalize(x)),
  );
  const seen = new Set();
  for (const r of sourceRows.slice(headerIndex + 1)) {
    if (/^total(?:\s*:|$)/i.test((r[0] || '').trim())) {
      skippedTotals++;
      continue;
    }
    if (r.length !== header.length)
      throw Error(
        'A CSV row has the wrong number of columns. Export the report again.',
      );
    if (currencyIndex >= 0 && r[currencyIndex])
      currencies.add(r[currencyIndex].trim());
    const out = {};
    for (let i = 0; i < header.length; i++) {
      if (dims[i]) {
        if (r[i].length > 1000) throw Error('A dimension label is too long.');
        out[dims[i]] = r[i].trim();
      }
      if (mets[i]) out[mets[i]] = numeric(r[i], mets[i]);
    }
    if (out.date && !validDate(out.date))
      throw Error(
        'Daily reports require YYYY-MM-DD dates. No date interpretation is guessed.',
      );
    if (dims.includes('date') && !out.date)
      throw Error('A daily row is missing its date.');
    if (out.query) Object.assign(out, classifyQuery(out.query));
    const rawIdentity = JSON.stringify(r);
    if (seen.has(rawIdentity))
      throw Error(
        'Duplicate identical rows detected. Export one report at a time.',
      );
    seen.add(rawIdentity);
    rows.push(out);
  }
  if (!rows.length) throw Error('This report has no detail rows.');
  if (currencies.size > 1 || (currencies.size === 1 && !currencies.has('EGP')))
    throw Error(
      'Only EGP monetary reports are supported. Currency was not converted.',
    );
  if (
    kind === 'ads' &&
    !currencies.size &&
    !header.some((x) => normalize(x) === 'cost_egp')
  )
    throw Error('The Ads report needs a Currency code column containing EGP.');
  const dimensions = [...new Set(dims.filter(Boolean))];
  if (dimensions.includes('query')) dimensions.push('language', 'brand');
  const metrics = mets.filter(Boolean);
  const dates = rows
    .map((r) => r.date)
    .filter(Boolean)
    .sort();
  return {
    id: crypto.randomUUID(),
    name,
    kind,
    rows,
    dimensions,
    metrics,
    from: dates[0] || null,
    to: dates.at(-1) || null,
    period:
      sourceRows
        .slice(0, headerIndex)
        .map((r) => r.join(' '))
        .join(' · ') || 'Period not supplied in this file',
    loadedAt: new Date().toISOString(),
    skippedTotals,
    scope: dimensions.includes('query')
      ? 'Visible query rows only; not the full account. Hidden / anonymised search terms are excluded.'
      : 'Imported rows only. Confirm source account, currency and report filters before sharing.',
    currency: currencies.size
      ? 'EGP'
      : kind === 'store'
        ? 'Unconfirmed'
        : 'Not applicable',
    historical: true,
  };
}
export function reportFromFeed(data, kind) {
  const key = { ads: 'ads', store: 'woo', seo: 'seo' }[kind];
  const src = data.sources[key];
  if (src?.status !== 'connected') return null;
  const rows =
    kind === 'ads' ? data.ads : kind === 'store' ? data.commerce : data.seo;
  const metrics =
    kind === 'ads'
      ? [
          'cost',
          'clicks',
          'impressions',
          'conversions',
          'purchases',
          'purchaseValue',
        ]
      : kind === 'store'
        ? [
            'orders',
            'paidOrders',
            'recordedPaidValue',
            'cancelledOrders',
            'completedOrders',
            'refundValue',
          ]
        : ['clicks', 'impressions', 'position'];
  return {
    id: 'feed-' + kind,
    name: {
      ads: 'Google Ads · connected report',
      store: 'WooCommerce · connected report',
      seo: 'Search Console · connected report',
    }[kind],
    kind,
    rows,
    dimensions: kind === 'ads' ? ['date', 'campaign'] : ['date'],
    metrics,
    from: src.from,
    to: src.to,
    period: src.from + ' to ' + src.to,
    loadedAt: src.lastSync,
    skippedTotals: 0,
    scope: src.note || 'Connected source',
    currency: data.currency,
    historical: false,
    environment: data.environment,
    completeCoverage: true,
  };
}
export function filterRows(report, filters = {}) {
  return report.rows.filter((r) => {
    if (filters.from && (!r.date || r.date < filters.from)) return false;
    if (filters.to && (!r.date || r.date > filters.to)) return false;
    if (
      filters.search &&
      !report.dimensions.some((k) =>
        String(r[k] || '')
          .toLowerCase()
          .includes(filters.search.toLowerCase()),
      )
    )
      return false;
    return Object.entries(filters.dimensions || {}).every(
      ([k, v]) => !v || v === 'all' || r[k] === v,
    );
  });
}
export function summarize(rows, metrics) {
  const out = {};
  for (const k of metrics) {
    out[k] = rows.some((r) => r[k] === null || r[k] === undefined)
      ? null
      : rows.reduce((a, r) => a + r[k], 0);
  }
  if (metrics.includes('position'))
    out.position = rows.some((r) => r.position == null || r.impressions == null)
      ? null
      : ratio(
          rows.reduce((a, r) => a + r.position * r.impressions, 0),
          out.impressions,
        );
  for (const [key, n, d] of [
    ['ctr', 'clicks', 'impressions'],
    ['cpc', 'cost', 'clicks'],
    ['costPerConversion', 'cost', 'conversions'],
    ['roas', 'purchaseValue', 'cost'],
    ['aov', 'recordedPaidValue', 'paidOrders'],
  ])
    if (metrics.includes(n) && metrics.includes(d))
      out[key] = ratio(out[n], out[d]);
  return out;
}
export function groupRows(rows, dimension, metrics, granularity = 'day') {
  const buckets = new Map();
  for (const r of rows) {
    let key = r[dimension] || 'Not supplied';
    if (dimension === 'date' && validDate(key)) {
      if (granularity === 'week') {
        const d = new Date(key + 'T12:00:00Z');
        key = shift(key, -((d.getUTCDay() + 6) % 7));
      }
      if (granularity === 'month') key = key.slice(0, 7);
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }
  return [...buckets].map(([name, items]) => ({
    name,
    rows: items.length,
    ...summarize(items, metrics),
  }));
}
export function comparable(report, from, to) {
  if (!from || !to || !validDate(from) || !validDate(to) || from > to)
    return null;
  const length = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  const p = periods(to, length);
  if (!report.from || report.from > p.beforeFrom || report.to < to) return null;
  if (!report.completeCoverage) {
    const seen = new Set(report.rows.map((r) => r.date));
    if (!days(p.beforeFrom, to).every((d) => seen.has(d))) return null;
  }
  return p;
}
export function trendRows(rows, metrics, from, to, granularity = 'day') {
  const source = groupRows(rows, 'date', metrics, granularity);
  const map = new Map(source.map((r) => [r.name, r]));
  const keys = groupRows(
    days(from, to).map((date) => ({ date })),
    'date',
    [],
    granularity,
  ).map((r) => r.name);
  return keys.map(
    (name) =>
      map.get(name) || {
        name,
        rows: 0,
        ...Object.fromEntries(metrics.map((k) => [k, null])),
      },
  );
}
export function exportGroups(groups, dimension, metrics) {
  return csv([
    [
      DIMENSIONS[dimension] || dimension,
      ...metrics.map((k) => METRICS[k] || k),
    ],
    ...groups.map((r) => [
      r.name,
      ...metrics.map((k) => r[k] ?? 'Unavailable'),
    ]),
  ]);
}
