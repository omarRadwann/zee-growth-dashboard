import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { decodeGoogle, GoogleError, scopes, timedGoogle } from './google.mjs';

const tokenUrl = 'https://oauth2.googleapis.com/token';
const authorizationUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
const adsRoot = 'https://googleads.googleapis.com/v26/';
const customerId = /^\d{10}$/;

function validSecret(value) {
  return typeof value==='string'&&value.length>=8&&value.length<=4096&&!/\s/.test(value);
}
export function adsClient(env) {
  let installed;
  if (env.GOOGLE_ADS_DESKTOP_CLIENT_FILE) {
    try { installed=JSON.parse(readFileSync(env.GOOGLE_ADS_DESKTOP_CLIENT_FILE,'utf8')).installed; }
    catch { throw new GoogleError('ADS_OAUTH_CLIENT_INVALID',503); }
    if(!installed)throw new GoogleError('ADS_OAUTH_CLIENT_INVALID',503);
  } else {
    installed = {client_id:env.GOOGLE_ADS_OAUTH_CLIENT_ID,client_secret:env.GOOGLE_ADS_OAUTH_CLIENT_SECRET};
  }
  const {client_id:id,client_secret:secret}=installed;
  if(!id&&!secret)throw new GoogleError('ADS_OAUTH_CLIENT_REQUIRED',503);
  if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id??'')||!validSecret(secret))throw new GoogleError('ADS_OAUTH_CLIENT_INVALID',503);
  return { id,secret };
}
export function adsRefreshToken(env) {
  let token=env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN?.trim();
  if (!token&&env.GOOGLE_ADS_REFRESH_TOKEN_FILE) {
    try { token=readFileSync(env.GOOGLE_ADS_REFRESH_TOKEN_FILE,'utf8').trim(); }
    catch(e) { if(e.code!=='ENOENT')throw new GoogleError('ADS_OAUTH_TOKEN_FILE_UNREADABLE',503); }
  }
  if(!token)throw new GoogleError('ADS_OAUTH_CONSENT_REQUIRED',503);
  if(!validSecret(token))throw new GoogleError('ADS_OAUTH_TOKEN_INVALID',503);
  return token;
}
export function authorizeUrl(clientId, redirectUri) {
  const verifier=randomBytes(40).toString('base64url');
  const state=randomBytes(32).toString('base64url');
  const u = new URL(authorizationUrl);
  u.search = new URLSearchParams({client_id:clientId,redirect_uri:redirectUri,scope:scopes.ads,
    response_type:'code',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method:'S256',access_type:'offline',prompt:'select_account consent'}).toString();
  return { url:u.toString(),state,verifier };
}
export function sameState(expected, received) {
  if(typeof received!=='string'||expected.length!==received.length)return false;
  const a=Buffer.from(expected);const b=Buffer.from(received);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export async function adsTokenExchange(client, fields, fetcher=fetch) {
  const body=new URLSearchParams({client_id:client.id,client_secret:client.secret,...fields});
  const response=await timedGoogle(fetcher,tokenUrl,{method:'POST',body,redirect:'error'});
  const data=await decodeGoogle(response);
  if(typeof data.access_token!=='string'||!validSecret(data.access_token))throw new GoogleError('GOOGLE_TOKEN_MISSING',502);
  if(data.scope&&!data.scope.split(/\s+/).includes(scopes.ads))throw new GoogleError('ADS_OAUTH_SCOPE_REQUIRED',403);
  return data;
}
export async function readAdsSearch(accessToken,customer,manager,query,fetcher=fetch) {
  if(!customerId.test(customer)||manager&&!customerId.test(manager)||typeof query!=='string'||!/^SELECT\s/i.test(query))throw new GoogleError('ADS_REPORT_ONLY',400);
  const headers={Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'};
  if(manager)headers['login-customer-id']=manager;
  return decodeGoogle(await timedGoogle(fetcher,`${adsRoot}customers/${customer}/googleAds:search`,{headers,method:'POST',body:JSON.stringify({query}),redirect:'error'}));
}
export function createUserAds(env, fetcher=fetch, clock=Date.now) {
  let validUntil=0, tokenPromise;
  const customer=String(env.GOOGLE_ADS_CUSTOMER_ID||'2067623227');
  const manager=String(env.GOOGLE_ADS_MANAGER_ID||'');
  async function token() {
    if(tokenPromise&&validUntil>clock())return tokenPromise;
    // Coalesce concurrent report subqueries during the token exchange.
    validUntil=clock()+20_000;
    tokenPromise=Promise.resolve().then(()=>adsTokenExchange(adsClient(env),{grant_type:'refresh_token',refresh_token:adsRefreshToken(env)},fetcher))
      .then(data=>{
        const lifespan=Number(data.expires_in);
        validUntil=clock()+(Number.isFinite(lifespan)?Math.max(0,Math.min(lifespan-60,3500)):60)*1000;
        return data.access_token;
      }).catch(e=>{tokenPromise=undefined;validUntil=0;throw e;});
    return tokenPromise;
  }
  return async (_service,path,body,requestedManager) => {
    if(path!==`customers/${customer}/googleAds:search`||String(requestedManager??'')!==manager||typeof body?.query!=='string'||!/^SELECT\s/i.test(body.query)) throw new GoogleError('ADS_REPORT_ONLY',400);
    try { return await readAdsSearch(await token(),customer,manager,body.query,fetcher); }
    catch(e) {if(e instanceof GoogleError&&e.status===401){tokenPromise=undefined;validUntil=0;}throw e;}
  };
}
