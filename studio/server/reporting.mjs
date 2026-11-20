import { GoogleError } from './google.mjs';

const day = 86_400_000;
const number = (v) => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
export const shift = (date, delta) => new Date(Date.parse(date + 'T00:00:00Z') + delta * day).toISOString().slice(0, 10);
const newDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && Number.isFinite(Date.parse(value)) && shift(value, 0) === value;
export function reportDates(params, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const stableEnd = shift(today, -4);
  const start = params.get('from');
  const end = params.get('to');
  const days = Number(params.get('days') ?? 28);
  if (start || end) {
    if (!newDate(start) || !newDate(end) || start > end || end > stableEnd || Date.parse(end) - Date.parse(start) >= 90 * day) throw new GoogleError('INVALID_DATE_RANGE', 400);
    const n = Math.round((Date.parse(end) - Date.parse(start)) / day) + 1;
    return { from: start, to: end, days: n, priorFrom: shift(start, -n), priorTo: shift(start, -1), stableEnd };
  }
  if (![7,28,56,90].includes(days)) throw new GoogleError('INVALID_DATE_RANGE', 400);
  return { from: shift(stableEnd, 1-days), to: stableEnd, days, priorFrom: shift(stableEnd, 1-2*days), priorTo: shift(stableEnd, -days), stableEnd };
}
const getBreak = (params, allowed, fallback) => allowed.includes(params.get('group')) ? params.get('group') : fallback;
const mapGsc = (row) => ({ label: row.keys?.[0], clicks: number(row.clicks), impressions: number(row.impressions), ctr: row.ctr == null ? null : row.ctr * 100, position: number(row.position) });
const gaMetrics = ['sessions','engagedSessions','ecommercePurchases','purchaseRevenue','totalUsers'];
function gaMap(row, metrics) { return Object.fromEntries(metrics.map((k,i) => [k, number(row?.metricValues?.[i]?.value)])); }
const adsMetrics = ['impressions','clicks','cost','conversions','conversionValue','ctr','cpc'];
function mapAds(row) {
  const v = row.metrics ?? {};
  const cost = number(v.costMicros ?? 0) / 1e6;
  const clicks = number(v.clicks ?? 0);
  const impressions = number(v.impressions ?? 0);
  return { impressions, clicks, cost, conversions: number(v.conversions ?? 0), conversionValue: number(v.conversionsValue ?? 0), ctr: impressions ? 100 * clicks / impressions : null, cpc: clicks ? cost / clicks : null };
}
export function createReporting(request, env) {
  const property = String(env.GSC_PROPERTY || 'sc-domain:zee-official.com');
  const gaId = String(env.GA4_PROPERTY_ID || '471870357');
  const adsId = String(env.GOOGLE_ADS_CUSTOMER_ID || '2067623227');
  const manager = String(env.GOOGLE_ADS_MANAGER_ID || '');
  const gscBase = `sites/${encodeURIComponent(property)}`;
  const cleanNumberId = value => { if (!/^\d{3,20}$/.test(value)) throw new GoogleError('INVALID_SOURCE_ID', 503); };
  const sourceMeta = { gsc: { name: 'Search Console', account: property, timeZone: 'Pacific Time' }, ga: { name: 'Google Analytics', account: gaId }, ads: { name: 'Google Ads', account: adsId } };
  async function gscReport(range, params, detail) {
    const country = params.get('country') === 'all' ? 'all' : 'egy';
    const device = getBreak(new URLSearchParams({group:params.get('device') ?? ''}), ['mobile','desktop','tablet'], 'all');
    const filters = [];
    if (country !== 'all') filters.push({dimension:'country', operator:'equals', expression:country});
    if (device !== 'all') filters.push({dimension:'device', operator:'equals', expression:device});
    const group = getBreak(params, ['page','query','country','device'], 'query');
    const ask = (from, to, dimensions, rowLimit = 500) => request('gsc', `${gscBase}/searchAnalytics/query`, {startDate:from,endDate:to,dimensions,type:'web',dataState:'final',rowLimit,...(filters.length ? {dimensionFilterGroups:[{groupType:'and',filters}]} : {})});
    const [current, prior, trend, priorTrend, breakdown] = await Promise.all([
      ask(range.from,range.to,[],1), ask(range.priorFrom,range.priorTo,[],1),
      ask(range.from,range.to,['date']), ask(range.priorFrom,range.priorTo,['date']),
      detail ? ask(range.from,range.to,[group],250) : Promise.resolve({}),
    ]);
    return { ...sourceMeta.gsc, country, device, group, current: current.rows?.[0] ? mapGsc(current.rows[0]) : {}, prior: prior.rows?.[0] ? mapGsc(prior.rows[0]) : {},
      daily: (trend.rows ?? []).map(mapGsc), priorDaily: (priorTrend.rows ?? []).map(mapGsc), rows: (breakdown.rows ?? []).map(mapGsc),
      notes: 'Finalized Web Search data. Missing dates remain gaps. Search Console limits breakdown rows and omits anonymized queries; use the independent property totals above.', cap:250 };
  }
  async function gaReport(range, params, detail) {
    cleanNumberId(gaId);
    const group = getBreak(params, ['sessionDefaultChannelGroup','landingPage','deviceCategory','country'], 'sessionDefaultChannelGroup');
    const filterOrganic = params.get('channel') === 'organic';
    const query = (from,to,dimension,limit,totals) => request('ga',`properties/${gaId}:runReport`, {
      dateRanges:[{startDate:from,endDate:to}], dimensions:[{name:dimension}], metrics:gaMetrics.map(name=>({name})),
      ...(filterOrganic ? {dimensionFilter:{filter:{fieldName:'sessionDefaultChannelGroup',stringFilter:{matchType:'EXACT',value:'Organic Search'}}}} : {}),
      orderBys:[dimension==='date' ? {dimension:{dimensionName:'date'}} : {metric:{metricName:'sessions'},desc:true}],
      limit, ...(totals ? {metricAggregations:['TOTAL']} : {}),
    });
    // Use a dimension-free query for non-additive, whole-period metrics.
    const totals = (from,to) => request('ga',`properties/${gaId}:runReport`, {
      dateRanges:[{startDate:from,endDate:to}],metrics:gaMetrics.map(name=>({name})),limit:1,
      ...(filterOrganic ? {dimensionFilter:{filter:{fieldName:'sessionDefaultChannelGroup',stringFilter:{matchType:'EXACT',value:'Organic Search'}}}} : {}),
    });
    const [current,prior,trend,priorTrend,breakdown] = await Promise.all([
      totals(range.from,range.to),totals(range.priorFrom,range.priorTo),query(range.from,range.to,'date',100,false),
      query(range.priorFrom,range.priorTo,'date',100,false),detail ? query(range.from,range.to,group,250,false) : Promise.resolve({}),
    ]);
    const mapRows = (set, isDate) => (set.rows ?? []).map(row => {
      const label = row.dimensionValues?.[0]?.value ?? '';
      return { label: isDate ? label.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : label, ...gaMap(row,gaMetrics) };
    });
    return { ...sourceMeta.ga, group, channel:filterOrganic?'Organic Search':'All channels', timeZone:current.metadata?.timeZone ?? trend.metadata?.timeZone,
      currency:current.metadata?.currencyCode ?? trend.metadata?.currencyCode, current:gaMap(current.rows?.[0],gaMetrics), prior:gaMap(prior.rows?.[0],gaMetrics),
      daily:mapRows(trend,true),priorDaily:mapRows(priorTrend,true),rows:mapRows(breakdown,false),rowCount:breakdown.rowCount,
      thresholded:[current,prior,trend,priorTrend,breakdown].some(item=>item.metadata?.subjectToThresholding),
      notes:'GA4 event-based reporting. Purchase revenue and purchase counts are analytics measurements, not WooCommerce ledger or bank totals. Users are whole-period counts.',cap:250 };
  }
  async function adsReport(range, _params, detail) {
    cleanNumberId(adsId); if (manager) cleanNumberId(manager);
    const fields = 'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value';
    const exec = query => request('ads',`customers/${adsId}/googleAds:search`,{query},manager);
    const dates = (from,to) => `segments.date BETWEEN '${from}' AND '${to}'`;
    const settings = await exec('SELECT customer.id, customer.currency_code, customer.time_zone FROM customer LIMIT 1');
    const account = settings.results?.[0]?.customer;
    if (!account) throw new GoogleError('ADS_ACCOUNT_MISSING', 503);
    const summary = (from,to) => exec(`SELECT ${fields} FROM customer WHERE ${dates(from,to)}`);
    const trend = (from,to) => exec(`SELECT segments.date, ${fields} FROM customer WHERE ${dates(from,to)} ORDER BY segments.date`);
    const [current,prior,daily,priorDaily,breakdown] = await Promise.all([
      summary(range.from,range.to),summary(range.priorFrom,range.priorTo),trend(range.from,range.to),trend(range.priorFrom,range.priorTo),
      detail ? exec(`SELECT campaign.id, campaign.name, campaign.advertising_channel_type, ${fields} FROM campaign WHERE ${dates(range.from,range.to)} ORDER BY metrics.cost_micros DESC LIMIT 250`) : Promise.resolve({}),
    ]);
    return { ...sourceMeta.ads, group:'campaign',currency:account.currencyCode,timeZone:account.timeZone,
      current:current.results?.[0] ? mapAds(current.results[0]) : {},prior:prior.results?.[0] ? mapAds(prior.results[0]) : {},
      daily:(daily.results ?? []).map(row=>({label:row.segments?.date,...mapAds(row)})),priorDaily:(priorDaily.results ?? []).map(row=>({label:row.segments?.date,...mapAds(row)})),
      rows:(breakdown.results ?? []).map(row=>({id:row.campaign?.id,label:row.campaign?.name,...mapAds(row)})),
      notes:'Google Ads conversion counts and values follow the account configuration and interaction dates. Conversions are not labeled as purchases.',cap:250 };
  }
  async function sitemaps() {
    const data = await request('gsc', `${gscBase}/sitemaps`);
    return (data.sitemap ?? []).map(row => ({ label:row.path, lastRead:row.lastDownloaded ?? null, pending:!!row.isPending, errors:number(row.errors), warnings:number(row.warnings), submitted:(row.contents ?? []).reduce((acc,item)=>acc+(number(item.submitted)??0),0) }));
  }
  return { sourceMeta, gsc:gscReport, ga:gaReport, ads:adsReport, sitemaps };
}
