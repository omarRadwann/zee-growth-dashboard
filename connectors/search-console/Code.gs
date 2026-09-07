/** ZEE read-only Search Console collector. NOT installed or authorized by adding this file to GitHub.
 * Set ZEE_REPORT_ENDPOINT and ZEE_REPORT_SECRET in private Script Properties.
 * Default target is staging. Never publish secrets or deploy this project as a public web app.
 */
function zeeSearchConfig() {
  var p = PropertiesService.getScriptProperties();
  var endpoint = p.getProperty('ZEE_REPORT_ENDPOINT') || 'https://staging.zenithweave.help/wp-json/zee-growth/v1/ingest/seo';
  var secret = p.getProperty('ZEE_REPORT_SECRET') || '';
  var production = endpoint === 'https://zee-official.com/wp-json/zee-growth/v1/ingest/seo';
  if (!production && endpoint !== 'https://staging.zenithweave.help/wp-json/zee-growth/v1/ingest/seo') throw Error('Unapproved reporting destination.');
  if (production && p.getProperty('ZEE_PRODUCTION_APPROVED') !== 'yes') throw Error('Production reporting needs the owner’s explicit approval. Start on staging.');
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw Error('Configure the SEO ingestion key in private Script Properties.');
  return { endpoint: endpoint, secret: secret, environment: production ? 'production' : 'staging' };
}

function zeeDateShift(date, count) {
  var d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0, 10);
}
function zeeQuery(body) {
  var response = UrlFetchApp.fetch('https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Azee-official.com/searchAnalytics/query', {
    method: 'post', contentType: 'application/json', followRedirects: false, muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, payload: JSON.stringify(body)
  });
  if (response.getResponseCode() !== 200) throw Error('Search Console request failed (HTTP ' + response.getResponseCode() + '). Verify API enablement and read-only property access.');
  var result = JSON.parse(response.getContentText());
  if (!Array.isArray(result.rows)) throw Error('No finalized source rows returned; the last good report was kept.');
  return result.rows;
}
function zeeBuildSeoReport(cfg) {
  var today = Utilities.formatDate(new Date(), 'America/Los_Angeles', 'yyyy-MM-dd');
  var query = { startDate: zeeDateShift(today, -180), endDate: zeeDateShift(today, -1), dimensions: ['date'], type: 'web', dataState: 'final', aggregationType: 'byProperty', rowLimit: 1000,
    dimensionFilterGroups: [{groupType: 'and', filters: [{dimension: 'country', operator: 'equals', expression: 'egy'}]}] };
  var input = zeeQuery(query), seen = {}, rows = [];
  input.forEach(function(row) {
    var date = row.keys && row.keys[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || new Date(date).toISOString().slice(0, 10) !== date || seen[date] || date < query.startDate || date > query.endDate) throw Error('Invalid, duplicate or out-of-range source date.');
    ['clicks','impressions','position'].forEach(function(key) { if (typeof row[key] !== 'number' || !isFinite(row[key]) || row[key] < 0 || row[key] > 1e14) throw Error('Invalid source metric.'); });
    if (!Number.isInteger(row.clicks) || !Number.isInteger(row.impressions)) throw Error('Invalid click or impression count.');
    seen[date] = true; rows.push({date: date, clicks: row.clicks, impressions: row.impressions, position: row.position});
  });
  rows.sort(function(a,b) { return a.date.localeCompare(b.date); });
  if (!rows.length || rows.length > 180) throw Error('No valid reporting window.');
  // Missing dates are not manufactured as zeros. Restrict boundaries to observed final dates.
  for (var i=1;i<rows.length;i++) if (zeeDateShift(rows[i-1].date,1) !== rows[i].date) throw Error('Missing daily source rows; reconcile the gap before publishing. Last good report was kept.');
  var from = rows[0].date, to = rows[rows.length-1].date;
  var totalsQuery = Object.assign({},query,{startDate:from,endDate:to,dimensions:[]});
  var totals = zeeQuery(totalsQuery);
  if (totals.length !== 1 || rows.reduce(function(s,r){return s+r.clicks;},0) !== totals[0].clicks || rows.reduce(function(s,r){return s+r.impressions;},0) !== totals[0].impressions) throw Error('Daily totals do not reconcile with Search Console. Nothing was sent.');
  var captured = new Date().toISOString();
  return {version:1, workspace:'ZEE', environment:cfg.environment,currency:'EGP',timezone:'Africa/Cairo',generatedAt:captured,
    sources:{seo:{status:'connected',from:from,to:to,lastSync:captured,note:'Search Console API: sc-domain:zee-official.com; Web; Egypt; finalized dates; byProperty. Native daily calendar is Pacific Time, not Cairo. Daily clicks and impressions reconciled against the period total. Last sync is collection time, not Google processing time. Scheduled collection is not second-by-second reporting.'}},seo:rows};
}
function previewZeeSearch() {
  // Read-only verification does not require or transfer the private receiver key.
  var report = zeeBuildSeoReport({environment:'staging'});
  console.log(JSON.stringify({preview:true,sent:false,days:report.seo.length,from:report.sources.seo.from,to:report.sources.seo.to}));
  return report.seo.length;
}
function syncZeeSearch() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw Error('Another collection is running.');
  try {
    var cfg = zeeSearchConfig(), report = zeeBuildSeoReport(cfg), payload = JSON.stringify(report);
    var timestamp = String(Math.floor(Date.now()/1000));
    var signature = Utilities.computeHmacSha256Signature(timestamp+'.'+payload,cfg.secret).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');
    var response = UrlFetchApp.fetch(cfg.endpoint,{method:'post',contentType:'application/json',payload:payload,followRedirects:false,muteHttpExceptions:true,headers:{'X-Zee-Timestamp':timestamp,'X-Zee-Signature':signature}});
    if (response.getResponseCode() !== 200) throw Error('Private report delivery failed (HTTP '+response.getResponseCode()+').');
    var receipt = JSON.parse(response.getContentText());
    if (receipt.ok !== true || receipt.source !== 'seo' || receipt.rows !== report.seo.length) throw Error('The reporting receiver did not confirm this snapshot.');
    PropertiesService.getScriptProperties().setProperty('ZEE_LAST_SUCCESS',report.generatedAt);
    console.log(JSON.stringify({ok:true,environment:cfg.environment,days:report.seo.length,through:report.sources.seo.to}));
  } finally { lock.releaseLock(); }
}
function scheduleZeeSearch() {
  zeeSearchConfig();
  if (!PropertiesService.getScriptProperties().getProperty('ZEE_LAST_SUCCESS')) throw Error('Run and verify syncZeeSearch before scheduling.');
  var exists = ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='syncZeeSearch';});
  if (!exists) ScriptApp.newTrigger('syncZeeSearch').timeBased().everyHours(6).create();
  console.log(exists ? 'This project already has a search-report trigger; no duplicate created.' : 'Search reporting scheduled every six hours under the authorizing Google account.');
}
