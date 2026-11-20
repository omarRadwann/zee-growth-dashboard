import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleError } from '../server/google.mjs';
import { reportDates, createReporting } from '../server/reporting.mjs';
import { createHttp } from '../server/http.mjs';

const params = v => new URLSearchParams(v);
const now = new Date('2026-11-20T10:00:00Z');
test('adjacent inclusive comparisons are date-safe and bounded',()=>{
  assert.deepEqual(reportDates(params({days:'7'}),now),{from:'2026-11-10',to:'2026-11-16',days:7,priorFrom:'2026-11-03',priorTo:'2026-11-09',stableEnd:'2026-11-16',compare:'previous'});
  for(const p of [{from:'2026-09-01',to:'2026-11-18'},{from:'2026-02-30',to:'2026-03-05'},{days:'91'},{from:'2026-11-01'}]) assert.throws(()=>reportDates(params(p),now),/INVALID_DATE_RANGE/);
});
test('comparison choices enforce equal lengths, calendar years and nonoverlapping custom windows',()=>{
  const year=reportDates(params({days:'7',compare:'year'}),now);
  assert.equal(year.priorFrom,'2025-11-10');assert.equal(year.priorTo,'2025-11-16');
  const leap=reportDates(params({from:'2024-02-29',to:'2024-03-01',compare:'year'}),new Date('2024-04-01T10:00:00Z'));
  assert.equal(leap.priorFrom,'2023-02-28');assert.equal(leap.priorTo,'2023-03-01');
  const custom=reportDates(params({days:'7',compare:'custom',compareFrom:'2026-10-01'}),now);
  assert.equal(custom.priorTo,'2026-10-07');
  assert.throws(()=>reportDates(params({days:'7',compare:'custom',compareFrom:'2026-11-08'}),now),/INVALID_DATE_RANGE/);
  const off=reportDates(params({days:'7',compare:'off'}),now);assert.equal(off.priorFrom,null);
  assert.equal(reportDates(params({from:'2025-10-01',to:'2025-10-05',compare:'year'}),now).comparisonUnavailable,true);
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
  assert.equal((await report(new Request('https://example.com/api/reports',{headers:{'oai-authenticated-user-id':'untrusted','oai-authenticated-user-email':'fake@example.com'}}))).status,401);
  const local=createHttp({}, {local:true});
  assert.equal((await local(new Request('http://127.0.0.1/api/reports',{method:'POST'}))).status,405);
  assert.equal((await local(new Request('http://127.0.0.1/api/reports',{headers:{'sec-fetch-site':'cross-site'}}))).status,403);
  assert.equal((await local(new Request('http://127.0.0.1/api/reports?source=unknown'))).status,400);
});
test('comparison off saves upstream requests and a failing detail never hides valid totals',async()=>{
  const calls=[];
  const svc=createReporting(async (_,__,q)=>{
    calls.push(q);
    if(q.dimensions.includes('searchAppearance'))throw new GoogleError('UNAVAILABLE',503);
    return {rows:[{keys:['2026-11-10'],clicks:9,impressions:30,ctr:.3,position:2}]};
  },{});
  const out=await svc.gsc(reportDates(params({days:'7',compare:'off'}),now),params({group:'searchAppearance',gscLanguage:'ar',gscBrand:'nonbrand',queryText:'sandals'}),true);
  assert.equal(calls.length,3);assert.equal(out.current.clicks,9);
  assert.deepEqual(out.prior,{});
  assert.deepEqual(out.warnings,[{label:'Breakdown',code:'UNAVAILABLE'}]);
  assert.deepEqual(calls[0].dimensionFilterGroups[0].filters.map(x=>x.operator),['equals','includingRegex','excludingRegex','contains']);
});
test('a transient failure is marked stale, but revoked access clears the cached metrics',async()=>{
  let instant=Date.parse('2026-11-20T10:00:00Z');let state='ready';let calls=0;
  const req=async()=>{calls++;if(state!=='ready')throw new GoogleError(state,503);return {rows:[{keys:['2026-11-10'],clicks:4,impressions:10,ctr:.4,position:3}]};};
  const app=createHttp({}, {local:true,request:req,clock:()=>instant});
  const read=async()=> (await (await app(new Request('http://127.0.0.1/api/reports?source=gsc&days=7&refresh=1'))).json()).sources.gsc;
  const first=await read();const before=calls;
  await read();assert.equal(calls,before);
  instant+=31_000;state='UNAVAILABLE';
  const second=await read();assert.equal(second.stale,true);assert.equal(second.checkedAt,first.checkedAt);assert.equal(second.current.clicks,4);
  instant+=31_000;state='PERMISSION_DENIED';
  const third=await read();assert.equal(third.status,'error');assert.equal(third.current,undefined);
});
test('shop events and realtime are independent requests with explicit null for missing metrics',async()=>{
  const calls=[];
  const raw=async (_s,path,q)=>{calls.push({path,q});return path.endsWith('runRealtimeReport')?{rows:[{metricValues:[{value:'0'}]}]}:{rows:[{dimensionValues:[{value:'view_item'}],metricValues:[{value:'24'}]}]};};
  const service=createReporting(raw,{});
  const events=await service.gaEvents(reportDates(params({days:'7',compare:'off'}),now),params({channel:'organic'}));
  assert.equal(events.rows[0].current,24);assert.equal(events.rows[1].current,null);
  assert.deepEqual(await service.gaRealtime(),{activeUsers:0,minutes:30});
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].q.dimensionFilter.andGroup.expressions[1].filter.inListFilter.values,['view_item','add_to_cart','begin_checkout','purchase']);
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
