import { GoogleError } from './google.mjs';

const day = 86_400_000;
const number = (v) => v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
export const shift = (date, delta) => new Date(Date.parse(date + 'T00:00:00Z') + delta * day).toISOString().slice(0, 10);
const newDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && Number.isFinite(Date.parse(value)) && shift(value, 0) === value;
const failRange = () => { throw new GoogleError('INVALID_DATE_RANGE', 400); };
export function reportDates(params, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const stableEnd = shift(today, -4);
  const earliest = shift(stableEnd, -486);
  let from = params.get('from');
  let to = params.get('to');
  let days = Number(params.get('days') ?? 28);
  if (from || to) {
    if (!newDate(from) || !newDate(to) || from < earliest || from > to || to > stableEnd || Date.parse(to) - Date.parse(from) >= 90 * day) failRange();
    days = (Date.parse(to) - Date.parse(from)) / day + 1;
  } else {
    if (![7,28,56,90].includes(days)) failRange();
    from = shift(stableEnd, 1-days); to = stableEnd;
  }
  const mode = params.get('compare') ?? 'previous';
  if (!['previous','year','custom','off'].includes(mode)) failRange();
  if (mode === 'off') return {from,to,days,priorFrom:null,priorTo:null,stableEnd,compare:'off'};
  let priorFrom = shift(from,-days);
  if (mode === 'custom') {
    priorFrom = params.get('compareFrom');
    if (!newDate(priorFrom) || priorFrom < earliest) failRange();
  } else if (mode === 'year') {
    // Preserve month/day; clamp Feb 29 to Feb 28 in a non-leap year.
    const previous = `${Number(from.slice(0, 4))-1}${from.slice(4)}`;
    priorFrom = newDate(previous) ? previous : previous.replace(/-02-29$/, '-02-28');
  }
  const priorTo = shift(priorFrom, days-1);
  if (mode === 'custom' && priorTo >= from) failRange();
  return {from,to,days,priorFrom,priorTo,stableEnd,compare:mode,...(priorFrom<earliest?{comparisonUnavailable:true}:{})};
}
const getBreak = (params, allowed, fallback) => allowed.includes(params.get('group')) ? params.get('group') : fallback;
const compare = r => !!r.priorFrom && !r.comparisonUnavailable;
const empty = () => Promise.resolve({});
const settled = promise => promise.then(value=>({value}),e=>({value:{},code:e instanceof GoogleError?e.code:'REPORT_FAILED'}));
function reportWarnings(...results) {
  return results.flatMap(([label,result])=>result.code?[{label,code:result.code}]:[]);
}
const mapGsc = (row) => ({ label: row.keys?.[0], clicks: number(row.clicks), impressions: number(row.impressions), ctr: row.ctr == null ? null : row.ctr * 100, position: number(row.position) });
const gaMetrics = ['sessions','engagedSessions','ecommercePurchases','purchaseRevenue','totalUsers','engagementRate'];
function gaMap(row, metrics) { return Object.fromEntries(metrics.map((k,i) => [k, number(row?.metricValues?.[i]?.value)])); }
const eventNames = ['view_item','add_to_cart','begin_checkout','purchase'];
const brandPattern = '(?i)(^|[^a-z0-9])(zee|z[ .-]+e[ .-]+e)([^a-z0-9]|$)|(^|[\\s،])زي(\\s|$)';
function gaFilters(params) {
  return [
    ...(params.get('channel')==='organic'?[{fieldName:'sessionDefaultChannelGroup',value:'Organic Search'}]:[]),
    ...(['mobile','desktop','tablet'].includes(params.get('gaDevice'))?[{fieldName:'deviceCategory',value:params.get('gaDevice')}]:[]),
    ...(params.get('gaCountry')==='EG'?[{fieldName:'countryId',value:'EG'}]:[]),
  ].map(({fieldName,value})=>({filter:{fieldName,stringFilter:{matchType:'EXACT',value,caseSensitive:false}}}));
}
const dimensionFilter = (expressions) => expressions.length ? {dimensionFilter:{andGroup:{expressions}}} : {};
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
    const gscType = ['image','video','news'].includes(params.get('gscType'))?params.get('gscType'):'web';
    const gscLanguage = params.get('gscLanguage');
    const gscBrand = params.get('gscBrand');
    const queryText = params.get('queryText');
    const pageText = params.get('pageText');
    if (['ar','en'].includes(gscLanguage)) filters.push({dimension:'page',operator:gscLanguage==='ar'?'includingRegex':'excludingRegex',expression:'^https?://[^/]+/ar(/|$)'});
    if (['brand','nonbrand'].includes(gscBrand)) filters.push({dimension:'query',operator:gscBrand==='brand'?'includingRegex':'excludingRegex',expression:brandPattern});
    if (queryText) filters.push({dimension:'query',operator:'contains',expression:queryText});
    if (pageText) filters.push({dimension:'page',operator:'contains',expression:pageText});
    const group = getBreak(params, ['page','query','country','device','searchAppearance'], 'query');
    const ask = (from, to, dimensions, rowLimit = 500) => request('gsc', `${gscBase}/searchAnalytics/query`, {startDate:from,endDate:to,dimensions,type:gscType,dataState:'final',rowLimit,aggregationType:'auto',...(filters.length ? {dimensionFilterGroups:[{groupType:'and',filters}]} : {})});
    const [current, priorRead, trend, priorTrendRead, breakdownRead] = await Promise.all([
      ask(range.from,range.to,[],1), settled(compare(range)?ask(range.priorFrom,range.priorTo,[],1):empty()),
      ask(range.from,range.to,['date']), settled(compare(range)?ask(range.priorFrom,range.priorTo,['date']):empty()),
      settled(detail ? ask(range.from,range.to,[group],250) : empty()),
    ]);
    const prior=priorRead.value;const priorTrend=priorTrendRead.value;const breakdown=breakdownRead.value;
    return { ...sourceMeta.gsc, country, device, group, current: current.rows?.[0] ? mapGsc(current.rows[0]) : {}, prior: prior.rows?.[0] ? mapGsc(prior.rows[0]) : {},
      daily: (trend.rows ?? []).map(mapGsc), priorDaily: (priorTrend.rows ?? []).map(mapGsc), rows: (breakdown.rows ?? []).map(mapGsc),
      warnings:reportWarnings(['Comparison totals',priorRead],['Comparison series',priorTrendRead],['Breakdown',breakdownRead]),
      scope:[gscType, country==='all'?'All countries':'Egypt',device==='all'?'All devices':device,['ar','en'].includes(gscLanguage)?gscLanguage.toUpperCase()+' URLs':null,gscBrand&&gscBrand!=='all'?gscBrand==='brand'?'Branded queries':'Non-brand queries':null,queryText?'Query contains: '+queryText:null,pageText?'Page contains: '+pageText:null].filter(Boolean),
      notes: 'Finalized Search Console data. Missing days stay blank. Query filters exclude anonymized queries. URL filters can change aggregation from property to page. Breakdown rows can be limited or overlap; do not sum them as property totals.', cap:250 };
  }
  async function gaReport(range, params, detail) {
    cleanNumberId(gaId);
    const group = getBreak(params, ['sessionDefaultChannelGroup','landingPage','deviceCategory','country'], 'sessionDefaultChannelGroup');
    const scoped = gaFilters(params);
    const query = (from,to,dimension,limit) => request('ga',`properties/${gaId}:runReport`, {
      dateRanges:[{startDate:from,endDate:to}], dimensions:[{name:dimension}], metrics:gaMetrics.map(name=>({name})),
      ...dimensionFilter(scoped),
      orderBys:[dimension==='date' ? {dimension:{dimensionName:'date'}} : {metric:{metricName:'sessions'},desc:true}],
      limit,
    });
    // Use a dimension-free query for non-additive, whole-period metrics.
    const totals = (from,to) => request('ga',`properties/${gaId}:runReport`, {
      dateRanges:[{startDate:from,endDate:to}],metrics:gaMetrics.map(name=>({name})),limit:1,
      ...dimensionFilter(scoped),
    });
    const [current,priorRead,trend,priorTrendRead,breakdownRead] = await Promise.all([
      totals(range.from,range.to),settled(compare(range)?totals(range.priorFrom,range.priorTo):empty()),query(range.from,range.to,'date',100),
      settled(compare(range)?query(range.priorFrom,range.priorTo,'date',100):empty()),settled(detail ? query(range.from,range.to,group,250) : empty()),
    ]);
    const prior=priorRead.value;const priorTrend=priorTrendRead.value;const breakdown=breakdownRead.value;
    const numbers = row => { const result=gaMap(row,gaMetrics);return {...result,engagementRate:result.engagementRate==null?null:100*result.engagementRate}; };
    const mapRows = (set, isDate) => (set.rows ?? []).map(row => {
      const label = row.dimensionValues?.[0]?.value ?? '';
      return { label: isDate ? label.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : label, ...numbers(row) };
    });
    return { ...sourceMeta.ga, group, scope:[params.get('channel')==='organic'?'Organic Search':'All channels',params.get('gaCountry')==='EG'?'Egypt':'All countries',params.get('gaDevice')&&params.get('gaDevice')!=='all'?params.get('gaDevice'):'All devices'], timeZone:current.metadata?.timeZone ?? trend.metadata?.timeZone,
      currency:current.metadata?.currencyCode ?? trend.metadata?.currencyCode, current:numbers(current.rows?.[0]), prior:numbers(prior.rows?.[0]),
      daily:mapRows(trend,true),priorDaily:mapRows(priorTrend,true),rows:mapRows(breakdown,false),rowCount:breakdown.rowCount,
      warnings:reportWarnings(['Comparison totals',priorRead],['Comparison series',priorTrendRead],['Breakdown',breakdownRead]),
      thresholded:[current,prior,trend,priorTrend,breakdown].some(item=>item.metadata?.subjectToThresholding), sampled:[current,prior,trend,priorTrend,breakdown].some(item=>item.metadata?.samplingMetadatas?.length), otherRow:[current,prior,trend,priorTrend,breakdown].some(item=>item.metadata?.dataLossFromOtherRow),
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
    const [current,priorRead,daily,priorDailyRead,breakdownRead] = await Promise.all([
      summary(range.from,range.to),settled(compare(range)?summary(range.priorFrom,range.priorTo):empty()),trend(range.from,range.to),settled(compare(range)?trend(range.priorFrom,range.priorTo):empty()),
      settled(detail ? exec(`SELECT campaign.id, campaign.name, campaign.advertising_channel_type, ${fields} FROM campaign WHERE ${dates(range.from,range.to)} ORDER BY metrics.cost_micros DESC LIMIT 250`) : empty()),
    ]);
    const prior=priorRead.value;const priorDaily=priorDailyRead.value;const breakdown=breakdownRead.value;
    return { ...sourceMeta.ads, group:'campaign',currency:account.currencyCode,timeZone:account.timeZone,
      current:current.results?.[0] ? mapAds(current.results[0]) : {},prior:prior.results?.[0] ? mapAds(prior.results[0]) : {},
      daily:(daily.results ?? []).map(row=>({label:row.segments?.date,...mapAds(row)})),priorDaily:(priorDaily.results ?? []).map(row=>({label:row.segments?.date,...mapAds(row)})),
      rows:(breakdown.results ?? []).map(row=>({id:row.campaign?.id,label:row.campaign?.name,...mapAds(row)})),
      warnings:reportWarnings(['Comparison totals',priorRead],['Comparison series',priorDailyRead],['Breakdown',breakdownRead]),
      notes:'Google Ads conversion counts and values follow the account configuration and interaction dates. Conversions are not labeled as purchases.',cap:250 };
  }
  async function gaEvents(range, params) {
    cleanNumberId(gaId);
    const pick= (from,to)=>request('ga',`properties/${gaId}:runReport`,{
      dateRanges:[{startDate:from,endDate:to}],dimensions:[{name:'eventName'}], metrics:[{name:'eventCount'}],limit:10,
      ...dimensionFilter([...gaFilters(params),{filter:{fieldName:'eventName',inListFilter:{values:eventNames,caseSensitive:true}}}]),
    });
    const [current,priorRead]=await Promise.all([pick(range.from,range.to),settled(compare(range)?pick(range.priorFrom,range.priorTo):empty())]);
    const parse = set=>new Map((set.rows??[]).map(r=>[r.dimensionValues?.[0]?.value,number(r.metricValues?.[0]?.value)]));
    const a=parse(current), b=parse(priorRead.value);
    return {rows:eventNames.map(label=>({label,current:a.get(label)??null,prior:b.get(label)??null})),
      thresholded:[current,priorRead.value].some(i=>i.metadata?.subjectToThresholding),warnings:reportWarnings(['Comparison events',priorRead])};
  }
  async function gaRealtime(){
    cleanNumberId(gaId);
    const data=await request('ga',`properties/${gaId}:runRealtimeReport`,{metrics:[{name:'activeUsers'}],minuteRanges:[{startMinutesAgo:29,endMinutesAgo:0,name:'Last 30 minutes'}],limit:1});
    return {activeUsers:number(data.rows?.[0]?.metricValues?.[0]?.value),minutes:30};
  }
  async function sitemaps() {
    const data = await request('gsc', `${gscBase}/sitemaps`);
    return (data.sitemap ?? []).map(row => ({ label:row.path, lastRead:row.lastDownloaded ?? null, pending:!!row.isPending, errors:number(row.errors), warnings:number(row.warnings), submitted:(row.contents ?? []).reduce((acc,item)=>acc+(number(item.submitted)??0),0) }));
  }
  return { sourceMeta, gsc:gscReport, ga:gaReport, ads:adsReport, gaEvents, gaRealtime, sitemaps };
}
