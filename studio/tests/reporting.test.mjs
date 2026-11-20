import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleError } from '../server/google.mjs';
import { reportDates, createReporting } from '../server/reporting.mjs';
import { createHttp } from '../server/http.mjs';

const params = v => new URLSearchParams(v);
const now = new Date('2026-11-20T10:00:00Z');
test('adjacent inclusive comparisons are date-safe and bounded',()=>{
  assert.deepEqual(reportDates(params({days:'7'}),now),{from:'2026-11-10',to:'2026-11-16',days:7,priorFrom:'2026-11-03',priorTo:'2026-11-09',stableEnd:'2026-11-16'});
  for(const p of [{from:'2026-09-01',to:'2026-11-18'},{from:'2026-02-30',to:'2026-03-05'},{days:'91'},{from:'2026-11-01'}]) assert.throws(()=>reportDates(params(p),now),/INVALID_DATE_RANGE/);
});
test('Search Console uses distinct total, daily and query reports with filters',async()=>{
  const calls=[];
  const service=createReporting(async (source,path,body)=>{
    calls.push({source,path,body});
    return {rows:[{keys:body.dimensions.length?['2026-11-10']:undefined,clicks:3,impressions:20,ctr:.15,position:4.2}]};
  },{});
  const result=await service.gsc(reportDates(params({days:'7'}),now),params({country:'egy',device:'mobile',group:'query'}),true);
  assert.equal(result.current.ctr,15);
  assert.equal(result.daily.length,1);
  assert.equal(calls.length,5);
  assert.ok(calls.every(x=>x.body.dataState==='final'&&x.body.dimensionFilterGroups[0].filters.length===2));
  assert.equal(calls.filter(x=>x.body.dimensions.length===0).length,2);
  assert.match(calls[0].path,/sc-domain%3Azee-official.com/);
});
test('GA4 does not sum per-day users and preserves missing values and threshold flags',async()=>{
  const svc=createReporting(async (_,__,q)=>({metadata:{currencyCode:'EGP',timeZone:'Africa/Cairo',subjectToThresholding:!!q.dimensions},rows:[
    {dimensionValues:q.dimensions?[{value:'20261110'}]:[],metricValues:[{value:'100'},{value:'40'},{value:'2'},{value:'1499.75'},{value:q.dimensions?'90':'70'}]}
  ]}),{});
  const out=await svc.ga(reportDates(params({days:'7'}),now),params({channel:'organic'}),true);
  assert.equal(out.current.totalUsers,70);assert.equal(out.daily[0].totalUsers,90);
  assert.equal(out.daily[0].label,'2026-11-10');assert.equal(out.currency,'EGP');assert.equal(out.thresholded,true);
});
test('unauthenticated/external requests are denied and API is read only',async()=>{
  const report=createHttp({});
  assert.equal((await report(new Request('https://example.com/api/reports'))).status,401);
  const local=createHttp({}, {local:true});
  assert.equal((await local(new Request('http://127.0.0.1/api/reports',{method:'POST'}))).status,405);
  assert.equal((await local(new Request('http://127.0.0.1/api/reports',{headers:{'sec-fetch-site':'cross-site'}}))).status,403);
  assert.equal((await local(new Request('http://127.0.0.1/api/reports?source=unknown'))).status,400);
});
test('returns service states, strips raw Google failures and caches repeated reads',async()=>{
  let calls=0;
  const request=async source=>{calls++;if(source==='ads')throw new GoogleError('NOT_ADS_USER',401);return {rows:[]};};
  const web=createHttp({}, {local:true,request});
  const make=()=>new Request('http://127.0.0.1/api/reports?days=7');
  const response=await web(make());const result=await response.json();
  const before=calls;
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(result.sources.gsc.status,'ready');
  assert.deepEqual(result.sources.gsc.current,{});
  assert.equal(result.sources.ads.code,'NOT_ADS_USER');
  assert.equal(result.sources.ads.status,'error');
  await web(make());assert.equal(calls,before);
});
