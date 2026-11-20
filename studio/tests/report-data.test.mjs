import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAdsFile, selectAdsRows, csvText } from '../src/report-data.mjs';
const header='Day,Campaign,Campaign ID,Impressions,Clicks,Cost,Conversions,Conversion value,Currency\n';
const input=header+'2026-11-01,"ZEE, line",1,1000,40,224.15,2.5,1200,EGP\n2026-11-03,"ZEE, line",1,350,12,50,0,0,EGP\n2026-11-03,Another,2,20,0,0,0,0,EGP\n';
test('Ads CSV sums the chosen rows while preserving missing date gaps',()=>{
  const parsed=parseAdsFile('\uFEFFCampaign report\r\n'+input);
  assert.equal(parsed.records.length,3);assert.equal(parsed.currency,'EGP');
  const report=selectAdsRows(parsed,'2026-11-01','2026-11-03');
  assert.equal(report.totals.cost,274.15);assert.equal(report.totals.conversions,2.5);
  assert.deepEqual(report.daily.map(r=>r.label),['2026-11-01','2026-11-03']);
  assert.equal(report.campaigns[0].label,'ZEE, line');
  assert.deepEqual(selectAdsRows(parsed,'2026-11-02','2026-11-02').totals,{});
});
test('Ads CSV rejects duplicate grain, mixed currencies, missing values and invalid dates',()=>{
  assert.throws(()=>parseAdsFile(input+'2026-11-03,ZEE,1,1,1,1,1,1,EGP\n'),/Duplicate campaign\/day/);
  assert.throws(()=>parseAdsFile(input+'2026-11-04,ZEE,1,1,1,1,1,1,USD\n'),/Mixed currencies/);
  assert.throws(()=>parseAdsFile(header+'2026-11-04,ZEE,1,1,,1,1,1,EGP\n'),/Invalid or missing numeric/);
  assert.throws(()=>parseAdsFile(header+'2026-02-30,ZEE,1,1,1,1,1,1,EGP\n'),/Invalid date/);
  assert.throws(()=>parseAdsFile(header+'2026-11-04,"broken'),/inside a quoted field/);
});
test('CSV exports protect formula-like labels, and quote commas and quotes',()=>{
  const result=csvText([['=SUM(A1)','  +1','"a,b"',-4,null]]);
  assert.equal(result,'\uFEFF"\'=SUM(A1)","\'  +1","""a,b""","-4",""');
});
