// Local companion for a Google OAuth Desktop client. Only the user can consent.
import { createServer } from 'node:http';
import { once } from 'node:events';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adsClient, adsTokenExchange, authorizeUrl, readAdsSearch, sameState } from './ads-oauth.mjs';
import { GoogleError } from './google.mjs';

function targetFile(value) {
  if(!value||!isAbsolute(value))throw new GoogleError('ADS_TOKEN_NEEDS_ABSOLUTE_PRIVATE_PATH');
  const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
  const path = resolve(realpathSync(dirname(value)), basename(value));
  const rel = relative(repo,path);
  if(!rel || (!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep)))throw new GoogleError('ADS_TOKEN_MUST_STAY_OUTSIDE_REPOSITORY');
  if(existsSync(path))throw new GoogleError('ADS_TOKEN_FILE_ALREADY_EXISTS_CHOOSE_A_NEW_PATH');
  return path;
}
function respond(res,code,message) {
  res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store',
    'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});
  res.end(message);
}

let server,timer;
try {
  if(!process.env.GOOGLE_ADS_DESKTOP_CLIENT_FILE)throw new GoogleError('ADS_DESKTOP_CLIENT_FILE_REQUIRED');
  const client=adsClient(process.env);
  const file=targetFile(process.env.GOOGLE_ADS_REFRESH_TOKEN_FILE);
  const customer=String(process.env.GOOGLE_ADS_CUSTOMER_ID||'2067623227');
  const manager=String(process.env.GOOGLE_ADS_MANAGER_ID||'');
  if(!/^\d{10}$/.test(customer)||manager&&!/^\d{10}$/.test(manager))throw new GoogleError('ADS_CUSTOMER_OR_MANAGER_ID_INVALID');
  let redirect, flow, used=false, finish, fail;
  const done=new Promise((a,b)=>{finish=a;fail=b;});
  server=createServer(async(req,res)=>{
    if(!redirect||req.method!=='GET'||req.headers.host!==redirect.host)return respond(res,404,'Not found.');
    const path=new URL(req.url,redirect.origin);
    if(path.pathname!==redirect.pathname)return respond(res,404,'Not found.');
    const state=path.searchParams.get('state');
    if(used||!sameState(flow.state,state))return respond(res,400,'This login request is invalid or was already used.');
    used=true;
    try {
      if(path.searchParams.has('error'))throw new GoogleError('ADS_AUTHORIZATION_DECLINED');
      const code=path.searchParams.get('code');
      if(!code||code.length>4096)throw new GoogleError('ADS_AUTHORIZATION_CODE_MISSING');
      const tokens=await adsTokenExchange(client,{grant_type:'authorization_code',code,redirect_uri:redirect.href,code_verifier:flow.verifier});
      if(typeof tokens.refresh_token!=='string'||tokens.refresh_token.length<8||tokens.refresh_token.length>4096||/\s/.test(tokens.refresh_token))throw new GoogleError('ADS_OAUTH_REFRESH_TOKEN_NOT_RETURNED');
      // Do not retain a token unless this exact customer can already be read.
      const result=await readAdsSearch(tokens.access_token,customer,manager,'SELECT customer.id FROM customer LIMIT 1');
      if(String(result.results?.[0]?.customer?.id??'')!==customer)throw new GoogleError('ADS_CUSTOMER_NOT_VERIFIED');
      writeFileSync(file,tokens.refresh_token+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
      respond(res,200,'The dashboard verified this Ads customer. Return to the terminal and start the Studio in user OAuth mode.');
      finish();
    } catch(e) {
      respond(res,400,'The dashboard could not verify Google Ads access. No authorization was saved. Check the terminal for the error code.');
      fail(e);
    }
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  redirect=new URL('http://127.0.0.1:'+server.address().port+'/ads-oauth/callback');
  flow=authorizeUrl(client.id,redirect.href);
  console.log('Open the Google consent URL below in your normal browser. Choose the Google account that can access Ads '+customer+'.');
  console.log(flow.url);
  timer=setTimeout(()=>fail(new GoogleError('ADS_AUTHORIZATION_TIMED_OUT')),5*60_000);
  await done;
  console.log('Verified Ads '+customer+'. Authorization saved to the supplied private path. Set GOOGLE_ADS_AUTH=user and start the dashboard.');
} catch(e) {
  console.error(e instanceof GoogleError? e.code:'ADS_AUTHORIZATION_FAILED');
  process.exitCode=1;
} finally {
  clearTimeout(timer);
  server?.close();
}
