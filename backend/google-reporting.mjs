export class ReportError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export function dateRange(from, to) {
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to) || from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 185) throw new ReportError('INVALID_DATE_RANGE');
  if (to >= new Date().toISOString().slice(0, 10)) throw new ReportError('USE_COMPLETED_DAYS');
  return { from, to };
}
const numeric = value => /^\d+$/.test(value || '');
export function createReporting({ request, env }) {
  const queryAds = async query => {
    if (!numeric(env.GOOGLE_ADS_CUSTOMER_ID) || !env.GOOGLE_ADS_DEVELOPER_TOKEN) throw new ReportError('ADS_CONFIGURATION_MISSING', 503);
    if (!/^v\d+$/.test(env.GOOGLE_ADS_API_VERSION || '')) throw new ReportError('ADS_API_VERSION_REQUIRED', 503);
    if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID && !numeric(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)) throw new ReportError('INVALID_MANAGER_ID', 503);
    const headers = { 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN };
    if (env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers['login-customer-id'] = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
    let pageToken; const result = [];
    do {
      const data = await request({ url: `https://googleads.googleapis.com/${env.GOOGLE_ADS_API_VERSION}/customers/${env.GOOGLE_ADS_CUSTOMER_ID}/googleAds:search`, method: 'POST', headers, data: { query, ...(pageToken ? { pageToken } : {}) } });
      result.push(...(data.results || []));
      pageToken = data.nextPageToken;
      if (result.length > 100000) throw new ReportError('REPORT_TOO_LARGE', 422);
    } while (pageToken);
    return result;
  };
  return async (source, from, to) => {
    dateRange(from, to);
    if (source === 'ads') {
      const ids = (env.GOOGLE_ADS_PURCHASE_ACTION_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
      if (!ids.length || ids.some(id => !numeric(id))) throw new ReportError('PURCHASE_ACTIONS_REQUIRED', 503);
      const account = await queryAds('SELECT customer.currency_code, customer.time_zone FROM customer LIMIT 1');
      if (account[0]?.customer?.currencyCode !== 'EGP') throw new ReportError('UNEXPECTED_ADS_CURRENCY', 422);
      const actions = await queryAds('SELECT conversion_action.id, conversion_action.category, conversion_action.primary_for_goal FROM conversion_action');
      const valid = new Set(actions.filter(r => r.conversionAction?.category === 'PURCHASE' && r.conversionAction.primaryForGoal).map(r => String(r.conversionAction.id)));
      if (ids.some(id => !valid.has(id))) throw new ReportError('PURCHASE_ACTION_REVIEW_REQUIRED', 422);
      const filter = `segments.date BETWEEN '${from}' AND '${to}'`;
      const stats = await queryAds(`SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE ${filter}`);
      const purchase = await queryAds(`SELECT campaign.id, segments.date, metrics.conversions, metrics.conversions_value FROM campaign WHERE ${filter} AND segments.conversion_action IN (${ids.map(id => `'customers/${env.GOOGLE_ADS_CUSTOMER_ID}/conversionActions/${id}'`).join(',')})`);
      const rows = new Map(stats.map(r => [`${r.segments.date}:${r.campaign.id}`, { date: r.segments.date, campaignId: String(r.campaign.id), campaign: r.campaign.name, cost: Number(r.metrics.costMicros || 0) / 1e6, clicks: Number(r.metrics.clicks || 0), impressions: Number(r.metrics.impressions || 0), conversions: Number(r.metrics.conversions || 0), purchases: 0, purchaseValue: 0 }]));
      for (const r of purchase) {
        const row = rows.get(`${r.segments.date}:${r.campaign.id}`);
        if (!row) throw new ReportError('ADS_ROW_RECONCILIATION_FAILED', 422);
        row.purchases += Number(r.metrics.conversions || 0); row.purchaseValue += Number(r.metrics.conversionsValue || 0);
      }
      return { source, from, to, accountId: env.GOOGLE_ADS_CUSTOMER_ID, currency: 'EGP', timezone: account[0].customer.timeZone, attribution: 'ad-interaction-date', rows: [...rows.values()] };
    }
    if (source === 'search-console') {
      if (!env.SEARCH_CONSOLE_PROPERTY) throw new ReportError('SEARCH_PROPERTY_REQUIRED', 503);
      const data = await request({ url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.SEARCH_CONSOLE_PROPERTY)}/searchAnalytics/query`, method: 'POST', data: { startDate: from, endDate: to, dimensions: ['date'], type: 'web', dataState: 'final', rowLimit: 25000 } });
      return { source, from, to, timezone: 'America/Los_Angeles', property: env.SEARCH_CONSOLE_PROPERTY, rows: (data.rows || []).map(r => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position, ctr: r.ctr })), note: 'Final Web search data. An absent date is not asserted to be complete.' };
    }
    if (source === 'ga4') {
      if (!numeric(env.GA4_PROPERTY_ID)) throw new ReportError('GA4_PROPERTY_REQUIRED', 503);
      const data = await request({ url: `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA4_PROPERTY_ID}:runReport`, method: 'POST', data: { dateRanges: [{ startDate: from, endDate: to }], dimensions: [{ name: 'date' }, { name: 'eventName' }], metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }], limit: 100000, returnPropertyQuota: true } });
      if (Number(data.rowCount || 0) > (data.rows || []).length) throw new ReportError('GA4_REPORT_TOO_LARGE', 422);
      return { source, from, to, metadata: data.metadata, rows: (data.rows || []).map(r => ({ date: r.dimensionValues[0].value, event: r.dimensionValues[1].value, count: Number(r.metricValues[0].value), users: Number(r.metricValues[1].value) })), note: 'Event counts are not unique leads. Users must not be summed across events or dates. Thresholding and sampling metadata is retained.' };
    }
    throw new ReportError('UNKNOWN_SOURCE', 404);
  };
}
