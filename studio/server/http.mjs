import { createGoogle, GoogleError } from './google.mjs';
import { createReporting, reportDates } from './reporting.mjs';

const safeHeaders = { 'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow' };
const send = (body,status=200) => Response.json(body,{status,headers:safeHeaders});
const connected = ['gsc','ga','ads'];
const aliases = {
  NOT_ADS_USER:'Google Ads does not recognize this service account for the configured customer. Have an Ads administrator verify read-only access under Admin → Access and security → Users.',
  USER_PERMISSION_DENIED:'The service account cannot access the configured Ads customer. Check direct access or the manager account routing.',
  CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION:'The Google Cloud project needs production Ads API access (Explorer, Basic or Standard).',
  SERVICE_DISABLED:'The matching Google API is disabled for this project.',
  PERMISSION_DENIED:'Google denied access to this property or account. Verify the service account’s reporting permissions.',
  CREDENTIAL_NOT_CONFIGURED:'A runtime Google service account key has not been configured. No example figures are shown.',
  CREDENTIAL_INVALID:'The runtime credential is not a valid Google service account key.',
  INVALID_DATE_RANGE:'Use a valid period of up to 90 days within the available history. A custom comparison must end before the selected period starts.',
  INVALID_FILTER:'Use plain filter text of up to 120 characters.',
  GOOGLE_NETWORK_OR_TIMEOUT:'Google did not respond in time. Try again shortly.',
  TOO_MANY_REQUESTS:'Too many refreshes. Please wait a minute.',
  RESOURCE_EXHAUSTED:'The Google report quota was reached. Try again later.',
};
const reportFailure = e => {
  const code = e instanceof GoogleError ? e.code : 'REPORT_FAILED';
  return {status:code==='CREDENTIAL_NOT_CONFIGURED'?'setup':'error',code,message:aliases[code]??'The report is unavailable. Verify source access and retry.'};
};

export function createHttp(env, { local = false, request: injected, clock = Date.now } = {}) {
  const ttl = 10 * 60_000;
  const cache = new Map();
  const hits = new Map();
  let reporting;
  const getReporting = () => reporting ??= createReporting(injected ?? createGoogle(env.GOOGLE_SERVICE_ACCOUNT_JSON),env);
  async function read(key,fn,force,lifetime=ttl) {
    const found=cache.get(key);
    const time=clock();
    const cooldown=Math.min(lifetime,30_000);
    if (found && (found.pending || (found.until>time && (!force||time-found.started<cooldown)))) return found.promise;
    if (cache.size>=72) cache.delete(cache.keys().next().value);
    const entry={pending:true,started:time,until:time+lifetime,promise:null,previous:found?.previous};
    entry.promise=Promise.resolve().then(fn).then(data=>{
      const value={status:'ready',checkedAt:new Date(clock()).toISOString(),...data};
      entry.previous=value;return value;
    }).catch(e=>{
      entry.until=clock()+Math.min(lifetime,60_000);
      const failure=reportFailure(e);
      // Never surface a cached report after permissions or credential validity changes.
      const transient=['GOOGLE_NETWORK_OR_TIMEOUT','RESOURCE_EXHAUSTED','UNAVAILABLE','DEADLINE_EXCEEDED','INTERNAL','GOOGLE_HTTP_500','GOOGLE_HTTP_502','GOOGLE_HTTP_503','GOOGLE_HTTP_504'].includes(failure.code);
      const maxStale=lifetime<=30_000?60_000:30*60_000;
      if (transient && entry.previous && clock()-Date.parse(entry.previous.checkedAt)<=maxStale) return {...entry.previous,stale:true,retryCode:failure.code};
      entry.previous=undefined;
      return {...failure,checkedAt:new Date(clock()).toISOString()};
    }).finally(()=>{entry.pending=false;});
    cache.set(key,entry);
    return entry.promise;
  }
  return async (req) => {
    const url=new URL(req.url);
    const isLocal=local && ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
    if (!isLocal) return send({code:'AUTH_REQUIRED'},401);
    if (req.headers.get('sec-fetch-site') === 'cross-site') return send({code:'CROSS_SITE_REQUEST'},403);
    if (req.method !== 'GET') return send({code:'METHOD_NOT_ALLOWED'},405);
    const endpoint=url.pathname.replace(/\/$/,'');
    if (!['/api/reports','/api/sitemaps','/api/ga-events','/api/ga-realtime'].includes(endpoint)) return send({code:'NOT_FOUND'},404);
    const now=clock();
    if (hits.size>128) for(const [k,v] of hits) {if(v.until<=now) hits.delete(k);}
    const id='local';
    const old=hits.get(id);
    const bucket=old?.until>now?old:{count:0,until:now+60_000};
    if (++bucket.count>30) return send(reportFailure(new GoogleError('TOO_MANY_REQUESTS')),429);
    hits.set(id,bucket);
    try {
      const force=url.searchParams.get('refresh')==='1';
      if(endpoint==='/api/sitemaps') return send(await read('sitemaps',async()=>({rows:await getReporting().sitemaps()}),force));
      if(endpoint==='/api/ga-realtime') return send(await read('ga-realtime',()=>getReporting().gaRealtime(),force,30_000));
      const range=reportDates(url.searchParams,new Date(clock()));
      const selected=url.searchParams.get('source');
      if (selected && !connected.includes(selected)) return send({code:'INVALID_SOURCE'},400);
      const sources=selected?[selected]:connected;
      const p=new URLSearchParams();
      const filters={ group:['page','query','country','device','searchAppearance','sessionDefaultChannelGroup','landingPage','deviceCategory'],country:['egy','all'],device:['all','mobile','desktop','tablet'],channel:['all','organic'],gscType:['web','image','video','news'],gscLanguage:['all','ar','en'],gscBrand:['all','brand','nonbrand'],gaDevice:['all','mobile','desktop','tablet'],gaCountry:['all','EG'] };
      for(const [k,values] of Object.entries(filters)) {const v=url.searchParams.get(k);if(values.includes(v)) p.set(k,v);}
      for(const k of ['queryText','pageText']) {
        const v=(url.searchParams.get(k)??'').trim();
        if(v.length>120||/[\u0000-\u001f\u007f]/.test(v)) throw new GoogleError('INVALID_FILTER',400);
        if(v) p.set(k,v);
      }
      const key=[range.from,range.to,range.priorFrom,range.priorTo,range.comparisonUnavailable??false].join('|');
      const grouped={gsc:['country','device','gscType','gscLanguage','gscBrand','queryText','pageText'],ga:['channel','gaCountry','gaDevice'],ads:[]};
      const narrow=(s,includeGroup)=>new URLSearchParams([...p].filter(([k])=>grouped[s].includes(k)||(includeGroup&&k==='group')));
      if(endpoint==='/api/ga-events'){
        const g=narrow('ga',false);
        return send(await read(`ga-events|${key}|${g}`,()=>getReporting().gaEvents(range,g),force));
      }
      const all=await Promise.all(sources.map(async s=>{
        const subset=narrow(s,!!selected&&s!=='ads');
        return [s,await read(`${s}|${key}|${!!selected}|${subset}`,()=>getReporting()[s](range,subset,!!selected),force)];
      }));
      return send({ range, sources:Object.fromEntries(all) });
    } catch(e) { return send(reportFailure(e),e instanceof GoogleError ? e.status : 500); }
  };
}
