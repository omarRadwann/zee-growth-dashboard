import { emptyData, validateData, days } from './metrics.mjs';
export function reportSnapshot(report) {
  const data = emptyData(); data.environment = 'production'; data.generatedAt = report.generatedAt;
  if (report.source === 'ads') {
    if (report.accountId !== '2067623227') throw Error('Unexpected Google Ads account.');
    if (report.timezone !== 'Africa/Cairo' || report.currency !== 'EGP') throw Error('Ads calendar or currency does not match this workspace.');
    data.sources.ads = { status: 'connected', from: report.from, to: report.to, lastSync: report.generatedAt, accountId: '206-762-3227', note: 'Direct Google API · ad-interaction dates · attributed value, not collected cash.' }; data.ads = report.rows;
  } else if (report.source === 'search-console') {
    const observed = new Set(report.rows.map(r => r.date));
    if (days(report.from, report.to).some(date => !observed.has(date))) throw Error('Search Console has missing or not-yet-final days. Choose an earlier ending date; no zeroes were invented.');
    data.sources.seo = { status: 'connected', from: report.from, to: report.to, lastSync: report.generatedAt, note: 'Direct Google API · final Web data · Search Console Pacific calendar, not Cairo intraday data.' }; data.seo = report.rows;
  } else throw Error('Not a dashboard sales or search snapshot.');
  return validateData(data);
}
export function reportingUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('Use the backend origin only, without a path, password or query string.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw Error('The backend must use HTTPS. HTTP is allowed only on this device.');
  return url.origin;
}
