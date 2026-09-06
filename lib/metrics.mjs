/** @typedef {import('./report-types').ReportData} ReportData */
export const SOURCES = ['ads', 'woo', 'events', 'seo'];
export const EVENT_TYPES = {
  order_placed: 'Order placed',
  payment_recorded: 'Payment recorded',
  order_completed: 'Order completed',
  order_cancelled: 'Order cancelled',
  refund_recorded: 'Refund recorded',
  delivery_confirmed: 'Delivery confirmed',
  form_enquiry: 'Form enquiry',
  whatsapp_click: 'WhatsApp click',
  whatsapp_conversation: 'WhatsApp conversation',
  phone_click: 'Phone click',
  answered_call: 'Answered call',
  qualified_lead: 'Qualified lead',
  add_to_cart: 'Add to cart',
  begin_checkout: 'Checkout started',
};
export const INTENT_EVENTS = [
  'whatsapp_click',
  'phone_click',
  'add_to_cart',
  'begin_checkout',
];
const dateFormatters = new Map();
export function day(value = new Date(), zone = 'Africa/Cairo') {
  if (!dateFormatters.has(zone))
    dateFormatters.set(
      zone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
    );
  return dateFormatters.get(zone).format(new Date(value));
}
export function shift(date, n) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function validDate(date) {
  return (
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
export function days(from, to) {
  if (!validDate(from) || !validDate(to) || from > to) return [];
  const len = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (len > 731) return [];
  return Array.from({ length: len }, (_, i) => shift(from, i));
}
export function periods(end, length = 28) {
  return {
    from: shift(end, 1 - length),
    to: end,
    beforeFrom: shift(end, 1 - length * 2),
    beforeTo: shift(end, -length),
  };
}
export function changePeriods(change, length = 28) {
  return {
    from: change,
    to: shift(change, length - 1),
    beforeFrom: shift(change, -length),
    beforeTo: shift(change, -1),
  };
}
export function ratio(n, d) {
  return Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n / d : null;
}
export function delta(now, before) {
  return Number.isFinite(now) && Number.isFinite(before) && before > 0
    ? ((now - before) / before) * 100
    : null;
}
/** @returns {ReportData} */
export function emptyData() {
  return {
    version: 1,
    workspace: 'ZEE',
    environment: 'not-connected',
    currency: 'EGP',
    timezone: 'Africa/Cairo',
    generatedAt: null,
    sources: Object.fromEntries(
      SOURCES.map((s) => [
        s,
        { status: 'disconnected', lastSync: null, from: null, to: null },
      ]),
    ),
    ads: [],
    commerce: [],
    events: [],
    seo: [],
  };
}
export function covered(data, source, from, to) {
  const s = data.sources[source];
  return !!(s && s.status === 'connected' && s.from <= from && s.to >= to);
}
export function stale(source, now = Date.now()) {
  if (source.status !== 'connected' || !source.lastSync) return 'Not connected';
  const age = now - Date.parse(source.lastSync);
  return age > 48 * 3600000
    ? 'Out of date'
    : age > 3 * 3600000
      ? 'Delayed'
      : 'Updated';
}
export function adsSummary(data, from, to, campaign = 'all') {
  if (!covered(data, 'ads', from, to)) return null;
  const rows = data.ads.filter(
    (r) =>
      r.date >= from &&
      r.date <= to &&
      (campaign === 'all' || r.campaignId === campaign),
  );
  const result = Object.fromEntries(
    [
      'cost',
      'clicks',
      'impressions',
      'conversions',
      'purchases',
      'purchaseValue',
    ].map((k) => [k, rows.reduce((s, r) => s + r[k], 0)]),
  );
  return {
    ...result,
    cpc: ratio(result.cost, result.clicks),
    ctr: ratio(result.clicks, result.impressions),
    cpa: ratio(result.cost, result.purchases),
    roas: ratio(result.purchaseValue, result.cost),
  };
}
export function commerceSummary(data, from, to) {
  if (!covered(data, 'woo', from, to)) return null;
  return Object.fromEntries(
    [
      'orders',
      'paidOrders',
      'recordedPaidValue',
      'cancelledOrders',
      'completedOrders',
      'refundValue',
    ].map((k) => [
      k,
      data.commerce
        .filter((r) => r.date >= from && r.date <= to)
        .reduce((s, r) => s + r[k], 0),
    ]),
  );
}
export function seoSummary(data, from, to) {
  if (!covered(data, 'seo', from, to)) return null;
  const rows = data.seo.filter((r) => r.date >= from && r.date <= to);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: ratio(clicks, impressions),
    position: ratio(
      rows.reduce((s, r) => s + r.position * r.impressions, 0),
      impressions,
    ),
  };
}
export function eventSummary(data, from, to) {
  return Object.fromEntries(
    Object.keys(EVENT_TYPES).map((type) => [
      type,
      !covered(data, 'events', from, to) ||
      !data.sources.events.types?.includes(type)
        ? null
        : data.events
            .filter(
              (r) =>
                r.type === type &&
                day(r.at, data.timezone) >= from &&
                day(r.at, data.timezone) <= to,
            )
            .reduce((s, r) => s + r.count, 0),
    ]),
  );
}
/** @returns {never} */
function fail(message) {
  throw new Error(message);
}
function str(x, max = 200) {
  return typeof x === 'string' && x.length <= max && !/[\u0000-\u0008]/.test(x)
    ? x
    : fail('Invalid or overlong text field.');
}
function num(x, integer = false) {
  return typeof x === 'number' &&
    Number.isFinite(x) &&
    x >= 0 &&
    x <= 1e14 &&
    (!integer || Number.isInteger(x))
    ? x
    : fail('Metric values must be finite, non-negative numbers.');
}
function timestamp(x) {
  return typeof x === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(x) &&
    Number.isFinite(Date.parse(x))
    ? x
    : fail('Invalid timestamp.');
}
// Allowlist parsing: imports never retain customer identities, contact details, URLs or credentials.
export function validateData(raw) {
  if (!raw || raw.version !== 1)
    fail(
      'Use a ZEE v1 reporting export. Ordinary account downloads need conversion first.',
    );
  if (
    !['production', 'staging', 'example', 'not-connected'].includes(
      raw.environment,
    )
  )
    fail('Environment is required.');
  if (raw.currency !== 'EGP')
    fail('Only EGP reports can be combined in this workspace.');
  if (raw.timezone !== 'Africa/Cairo')
    fail(
      'This workspace requires Africa/Cairo dates. Do not mix account time zones.',
    );
  const clean = {
    ...emptyData(),
    environment: raw.environment,
    generatedAt: timestamp(raw.generatedAt),
  };
  for (const key of SOURCES) {
    const s = raw.sources?.[key];
    if (!s || s.status === 'disconnected') continue;
    if (
      s.status !== 'connected' ||
      !validDate(s.from) ||
      !validDate(s.to) ||
      !days(s.from, s.to).length
    )
      fail('Invalid source coverage dates.');
    clean.sources[key] = {
      status: 'connected',
      lastSync: timestamp(s.lastSync),
      from: s.from,
      to: s.to,
      note: str(s.note || '', 500),
    };
    if (key === 'ads') {
      if (s.accountId !== '206-762-3227')
        fail('The Ads export is not from ZEE account 206-762-3227.');
      clean.sources[key].accountId = s.accountId;
    }
    if (key === 'events')
      clean.sources.events.types = [
        ...new Set(
          (s.types || []).filter((t) => Object.hasOwn(EVENT_TYPES, t)),
        ),
      ];
  }
  const configs = {
    ads: [
      'cost',
      'clicks',
      'impressions',
      'conversions',
      'purchases',
      'purchaseValue',
    ],
    commerce: [
      'orders',
      'paidOrders',
      'recordedPaidValue',
      'cancelledOrders',
      'completedOrders',
      'refundValue',
    ],
    seo: ['clicks', 'impressions', 'position'],
  };
  for (const [key, metrics] of Object.entries(configs)) {
    const input = raw[key] || [];
    if (!Array.isArray(input) || input.length > 100000)
      fail('Export is too large. Use daily aggregates.');
    const seen = new Set();
    clean[key] = input.map((r) => {
      if (!validDate(r.date)) fail('Invalid daily reporting date.');
      const out = { date: r.date };
      metrics.forEach((k) => {
        out[k] = num(
          r[k],
          [
            'clicks',
            'impressions',
            'orders',
            'paidOrders',
            'cancelledOrders',
            'completedOrders',
          ].includes(k),
        );
      });
      if (key === 'ads') {
        out.campaignId = str(r.campaignId, 50);
        if (!out.campaignId) fail('Campaign ID is required.');
        out.campaign = str(r.campaign);
      }
      const id = r.date + (out.campaignId || '');
      if (seen.has(id))
        fail('Duplicate daily rows would double-count results.');
      seen.add(id);
      const source =
        clean.sources[{ ads: 'ads', commerce: 'woo', seo: 'seo' }[key]];
      if (
        source.status !== 'connected' ||
        r.date < source.from ||
        r.date > source.to
      )
        fail('A row falls outside its declared coverage.');
      return out;
    });
  }
  for (const [key, source] of [
    ['commerce', 'woo'],
    ['seo', 'seo'],
  ]) {
    const s = clean.sources[source];
    if (
      s.status === 'connected' &&
      clean[key].length !== days(s.from, s.to).length
    )
      fail(
        'Missing daily ' +
          key +
          ' rows. Include a verified zero row for a true zero day; never omit unavailable days.',
      );
  }
  if (!Array.isArray(raw.events || []) || (raw.events || []).length > 100000)
    fail('Too many activity events.');
  const seenEvents = new Set();
  clean.events = (raw.events || []).map((r) => {
    if (!Object.hasOwn(EVENT_TYPES, r.type)) fail('Unknown activity type.');
    const id = str(r.id, 100);
    if (!id || seenEvents.has(id))
      fail('Duplicate activity IDs would double-count results.');
    seenEvents.add(id);
    const out = {
      id,
      at: timestamp(r.at),
      type: r.type,
      channel: str(r.channel || 'Unknown', 80),
      count: num(r.count, true),
    };
    const s = clean.sources.events;
    if (
      !s.types?.includes(out.type) ||
      day(out.at) < s.from ||
      day(out.at) > s.to
    )
      fail('Event is outside declared tracking coverage.');
    return out;
  });
  return clean;
}
export function exampleData() {
  const out = emptyData();
  const to = shift(day(), -1);
  const from = shift(to, -83);
  out.environment = 'example';
  out.generatedAt = new Date().toISOString();
  SOURCES.forEach((s) => {
    out.sources[s] = {
      status: 'connected',
      lastSync: out.generatedAt,
      from,
      to,
      note: 'Synthetic example only. Not ZEE performance.',
    };
  });
  out.sources.ads.accountId = '206-762-3227';
  out.sources.events.types = Object.keys(EVENT_TYPES);
  const names = [
    'Example · Shopping',
    'Example · Brand search',
    'Example · Non-brand search',
  ];
  days(from, to).forEach((date, i) => {
    names.forEach((campaign, c) => {
      const trend = i >= 56 ? 1.16 : 1;
      const cost = Math.round(
        (800 + c * 170 + Math.sin(i * 1.6 + c) * 140) * trend,
      );
      const clicks = Math.round(cost / (3.2 + c * 0.8));
      const purchases = Math.round(clicks * (0.026 + 0.008 * (i >= 56)));
      out.ads.push({
        date,
        campaignId: String(c + 1),
        campaign,
        cost,
        clicks,
        impressions: clicks * (14 + c * 3),
        conversions: purchases + 4,
        purchases,
        purchaseValue: purchases * (1100 + c * 100),
      });
    });
    const orders = 34 + Math.round(Math.sin(i) * 9) + (i >= 56 ? 8 : 0);
    out.commerce.push({
      date,
      orders,
      paidOrders: orders - 9,
      recordedPaidValue: (orders - 9) * 1170,
      cancelledOrders: 3,
      completedOrders: orders - 12,
      refundValue: 1100,
    });
    out.seo.push({
      date,
      clicks: 140 + Math.round(Math.cos(i) * 32) + i,
      impressions: 4300 + i * 45,
      position: 7.3 - i * 0.015,
    });
    [
      'form_enquiry',
      'whatsapp_click',
      'whatsapp_conversation',
      'phone_click',
      'answered_call',
      'qualified_lead',
      'add_to_cart',
      'begin_checkout',
      'order_placed',
      'payment_recorded',
    ].forEach((type, k) =>
      out.events.push({
        id: `example-${i}-${k}`,
        at: `${date}T10:${String(k).padStart(2, '0')}:00Z`,
        type,
        count: 2 + (k % 4),
        channel: k % 2 ? 'Google Ads' : 'Unknown',
      }),
    );
  });
  return validateData(out);
}
export function csv(rows) {
  return rows
    .map((row) =>
      row
        .map((v) => {
          let s = String(v ?? '');
          if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
          return '"' + s.replaceAll('"', '""') + '"';
        })
        .join(','),
    )
    .join('\r\n');
}
