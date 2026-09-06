/**
 * ZEE reporting-only Google Ads Script.
 * Install in the ZEE advertiser account, not an MCC manager script.
 * No Ads mutation methods are used. Run Preview, reconcile, then authorize Run/scheduling.
 * Keep the ingestion key ONLY in the authorized Google Ads script, never in GitHub.
 */
const ZEE_CONFIG = {
  endpoint: 'https://staging.zenithweave.help/wp-json/zee-growth/v1/ingest/ads',
  environment: 'staging',
  secret: 'REPLACE_INSIDE_GOOGLE_ADS_ONLY',
  accountId: '206-762-3227',
  // Must be approved primary purchase actions, deduplicated at transaction level.
  // Do not select both a native purchase tag and its imported duplicate.
  purchaseActionIds: [],
  days: 84,
};

function main() {
  const cfg = ZEE_CONFIG;
  const account = AdsApp.currentAccount();
  if (account.getCustomerId() !== cfg.accountId) throw new Error('Wrong account. Use ZEE 206-762-3227.');
  if (account.getCurrencyCode() !== 'EGP' || account.getTimeZone() !== 'Africa/Cairo') throw new Error('Account must report EGP / Africa/Cairo. Do not silently mix time zones.');
  if (!/^https:\/\/(staging\.zenithweave\.help|zee-official\.com)\/wp-json\/zee-growth\/v1\/ingest\/ads$/.test(cfg.endpoint)) throw new Error('Unapproved reporting destination.');
  if (!/^[a-f0-9]{64}$/i.test(cfg.secret)) throw new Error('Configure the private ingestion key inside Google Ads.');
  if (!Array.isArray(cfg.purchaseActionIds) || !cfg.purchaseActionIds.length || cfg.purchaseActionIds.some(id => !/^\d+$/.test(String(id)))) throw new Error('Approve purchase conversion action IDs first. No ROAS will be invented.');
  if (!Number.isInteger(cfg.days) || cfg.days < 1 || cfg.days > 365) throw new Error('Invalid reporting window.');
  const actions = AdsApp.search('SELECT conversion_action.id, conversion_action.category, conversion_action.primary_for_goal FROM conversion_action');
  const valid = new Set();
  while (actions.hasNext()) { const row = actions.next().conversionAction; if (row.category === 'PURCHASE' && row.primaryForGoal) valid.add(String(row.id)); }
  if (cfg.purchaseActionIds.some(id => !valid.has(String(id)))) throw new Error('Selected actions must be primary PURCHASE actions. Reconcile their goals and values before enabling.');
  const today = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd');
  function shift(date, n) { const value = new Date(date + 'T12:00:00Z'); value.setUTCDate(value.getUTCDate() + n); return value.toISOString().slice(0, 10); }
  const from = shift(today, -cfg.days); const to = today;
  const during = "segments.date BETWEEN '" + from + "' AND '" + to + "'";
  const rows = new Map();
  const stats = AdsApp.search('SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE ' + during);
  while (stats.hasNext()) { const r = stats.next(); const id = r.segments.date + '|' + r.campaign.id; rows.set(id, { date: r.segments.date, campaignId: String(r.campaign.id), campaign: r.campaign.name, cost: Number(r.metrics.costMicros) / 1e6, clicks: Number(r.metrics.clicks), impressions: Number(r.metrics.impressions), conversions: Number(r.metrics.conversions), purchases: 0, purchaseValue: 0 }); }
  const resources = cfg.purchaseActionIds.map(id => "'customers/" + cfg.accountId.replace(/-/g, '') + '/conversionActions/' + id + "'").join(',');
  const purchases = AdsApp.search('SELECT campaign.id, campaign.name, segments.date, segments.conversion_action, metrics.conversions, metrics.conversions_value FROM campaign WHERE ' + during + ' AND segments.conversion_action IN (' + resources + ')');
  while (purchases.hasNext()) { const r = purchases.next(); const id = r.segments.date + '|' + r.campaign.id; if (!rows.has(id)) rows.set(id, { date: r.segments.date, campaignId: String(r.campaign.id), campaign: r.campaign.name, cost: 0, clicks: 0, impressions: 0, conversions: 0, purchases: 0, purchaseValue: 0 }); const item = rows.get(id); item.purchases += Number(r.metrics.conversions); item.purchaseValue += Number(r.metrics.conversionsValue); }
  const generatedAt = new Date().toISOString();
  const report = { version: 1, environment: cfg.environment, currency: 'EGP', timezone: 'Africa/Cairo', generatedAt, sources: { ads: { status: 'connected', accountId: cfg.accountId, lastSync: generatedAt, from, to, note: 'Interaction-date reporting. Approved primary purchase actions only. Today is incomplete; attribution may be revised.' } }, ads: [...rows.values()] };
  // Fail closed on partial exports; never declare a truncated window complete.
  const body = JSON.stringify(report);
  if (report.ads.length > 10000 || body.length > 1500000) throw new Error('Snapshot is too large. Use a paginated server-side connector; do not truncate.');
  if (AdsApp.getExecutionInfo().isPreview()) { Logger.log('Preview only. Validated ' + report.ads.length + ' daily campaign rows. Nothing sent.'); return; }
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = Utilities.computeHmacSha256Signature(timestamp + '.' + body, cfg.secret, Utilities.Charset.UTF_8).map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
  const response = UrlFetchApp.fetch(cfg.endpoint, { method: 'post', contentType: 'application/json', payload: body, headers: { 'X-Zee-Timestamp': timestamp, 'X-Zee-Signature': signature }, muteHttpExceptions: true, followRedirects: false });
  if (response.getResponseCode() !== 200) throw new Error('Report delivery failed with HTTP ' + response.getResponseCode() + '. Review the private connector; no campaign settings were changed.');
  const result = JSON.parse(response.getContentText());
  if (!result.ok) throw new Error('Reporting destination did not confirm receipt.');
  Logger.log('Delivered ' + report.ads.length + ' aggregate rows. No campaigns were changed.');
}
