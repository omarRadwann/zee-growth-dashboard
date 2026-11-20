import { createGoogle, GoogleError } from './google.mjs';
import { createReporting, reportDates } from './reporting.mjs';

const safeHeaders = { 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow', Vary:'Cookie' };
const send = (body,status=200) => Response.json(body,{status,headers:safeHeaders});
const connected = ['gsc','ga','ads'];
const aliases = {
  NOT_ADS_USER:'This service account is not recognized as a Google Ads user for the configured customer. Confirm the account invitation/access and acceptance.',
  USER_PERMISSION_DENIED:'The service account cannot access the configured Ads customer. Check direct access or the manager account routing.',
  CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION:'The Google Cloud project needs production Ads API access (Explorer, Basic or Standard).',
  SERVICE_DISABLED:'The matching Google API is disabled for this project.',
  PERMISSION_DENIED:'Google denied access to this property or account. Verify the service account’s reporting permissions.',
  CREDENTIAL_NOT_CONFIGURED:'A runtime Google service account key has not been configured. No example figures are shown.',
  CREDENTIAL_INVALID:'The runtime credential is not a valid Google service account key.',
  INVALID_DATE_RANGE:'Use a valid period of up to 90 days ending on or before the latest available reporting window.',
  GOOGLE_NETWORK_OR_TIMEOUT:'Google did not respond in time. Try again shortly.',
  TOO_MANY_REQUESTS:'Too many refreshes. Please wait a minute.',
  RESOURCE_EXHAUSTED:'The Google report quota was reached. Try again later.',
};
const reportFailure = e => {
  const code = e instanceof GoogleError ? e.code : 'REPORT_FAILED';
  return {status:code==='CREDENTIAL_NOT_CONFIGURED'?'setup':'error',code,message:aliases[code]??'The report is unavailable. Verify source access and retry.'};
};

export function createHttp(env, { local = false, request: injected } = {}) {
  const ttl = 10 * 60_000;
  const cache = new Map();
  const hits = new Map();
  let reporting;
  const getReporting = () => reporting ??= createReporting(injected ?? createGoogle(env.GOOGLE_SERVICE_ACCOUNT_JSON),env);
  async function read(key,fn,force) {
    const found=cache.get(key);
    if (found && (found.pending || (!force && found.until>Date.now()))) return found.promise;
    if (cache.size>=72) cache.delete(cache.keys().next().value);
    const entry={pending:true,until:Date.now()+ttl,promise:null};
    entry.promise=Promise.resolve().then(fn).then(data=>({status:'ready',checkedAt:new Date().toISOString(),...data})).catch(e=>{
      entry.until=Date.now()+60_000;
      return {...reportFailure(e),checkedAt:new Date().toISOString()};
    }).finally(()=>{entry.pending=false;});
    cache.set(key,entry);
    return entry.promise;
  }
  return async (req) => {
    const url=new URL(req.url);
    const uid=req.headers.get('oai-authenticated-user-id');
    const email=req.headers.get('oai-authenticated-user-email');
    const allow=String(env.ZEE_ALLOWED_EMAILS??'').toLowerCase().split(',').map(v=>v.trim()).filter(Boolean);
    const isLocal=local && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if (!isLocal && (!uid || !email || (allow.length && !allow.includes(email.toLowerCase())))) return send({code:'AUTH_REQUIRED'},401);
    if (req.headers.get('sec-fetch-site') === 'cross-site') return send({code:'CROSS_SITE_REQUEST'},403);
    if (req.method !== 'GET') return send({code:'METHOD_NOT_ALLOWED'},405);
    const endpoint=url.pathname.replace(/\/$/,'');
    if (!['/api/reports','/api/sitemaps'].includes(endpoint)) return send({code:'NOT_FOUND'},404);
    const now=Date.now();
    if (hits.size>128) for(const [k,v] of hits) {if(v.until<=now) hits.delete(k);}
    if (hits.size>200 && !hits.has(isLocal?'local':uid)) return send(reportFailure(new GoogleError('TOO_MANY_REQUESTS')),429);
    const id=isLocal?'local':uid;
    const old=hits.get(id);
    const bucket=old?.until>now?old:{count:0,until:now+60_000};
    if (++bucket.count>30) return send(reportFailure(new GoogleError('TOO_MANY_REQUESTS')),429);
    hits.set(id,bucket);
    try {
      const force=url.searchParams.get('refresh')==='1';
      if(endpoint==='/api/sitemaps') return send(await read('sitemaps',async()=>({rows:await getReporting().sitemaps()}),force));
      const range=reportDates(url.searchParams);
      const selected=url.searchParams.get('source');
      if (selected && !connected.includes(selected)) return send({code:'INVALID_SOURCE'},400);
      const sources=selected?[selected]:connected;
      const p=new URLSearchParams();
      const filters={ group:['page','query','country','device','sessionDefaultChannelGroup','landingPage','deviceCategory'],country:['egy','all'],device:['all','mobile','desktop','tablet'],channel:['all','organic'] };
      for(const [k,values] of Object.entries(filters)) {const v=url.searchParams.get(k);if(values.includes(v)) p.set(k,v);}
      const all=await Promise.all(sources.map(async s=>[s,await read(`${s}|${range.from}|${range.to}|${!!selected}|${p}`,()=>getReporting()[s](range,p,!!selected),force)]));
      return send({ range, sources:Object.fromEntries(all) });
    } catch(e) { return send(reportFailure(e),e instanceof GoogleError ? e.status : 500); }
  };
}
