import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { adsClient, authorizeUrl, sameState, createUserAds } from '../server/ads-oauth.mjs';
import { createHttp } from '../server/http.mjs';
import { scopes } from '../server/google.mjs';

const env = {
  GOOGLE_ADS_AUTH:'user',
  GOOGLE_ADS_OAUTH_CLIENT_ID:'fixture.apps.googleusercontent.com',
  GOOGLE_ADS_OAUTH_CLIENT_SECRET:'fixture-client-secret',
  GOOGLE_ADS_OAUTH_REFRESH_TOKEN:'fixture-refresh-token',
  GOOGLE_ADS_CUSTOMER_ID:'2067623227',
};
test('desktop authorization uses Google, a matching challenge, and an Ads-only scope',()=>{
  const redirect='http://127.0.0.1:29726/ads-oauth/callback';
  const flow=authorizeUrl(adsClient(env).id,redirect);
  const u=new URL(flow.url);
  assert.equal(u.origin,'https://accounts.google.com');
  assert.equal(u.searchParams.get('redirect_uri'),redirect);
  assert.equal(u.searchParams.get('scope'),scopes.ads);
  assert.equal(u.searchParams.get('state'),flow.state);
  assert.equal(u.searchParams.get('code_challenge'),createHash('sha256').update(flow.verifier).digest('base64url'));
  assert.equal(sameState(flow.state,flow.state),true);
  assert.equal(sameState(flow.state,flow.state.slice(1)+'!'),false);
  assert.equal(u.searchParams.has('client_secret'),false);
  assert.throws(()=>adsClient({...env,GOOGLE_ADS_OAUTH_CLIENT_ID:'103944152576206756518'}),/ADS_OAUTH_CLIENT_INVALID/);
});
test('user OAuth refreshes once for parallel reports and sends credentials only to their fixed Google endpoints',async()=>{
  let exchanges=0,reads=0;
  const fetcher=async(url,init)=>{
    if(url==='https://oauth2.googleapis.com/token'){
      exchanges++; assert.equal(init.body.get('grant_type'),'refresh_token');
      assert.equal(init.body.get('refresh_token'),env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN);
      assert.equal(init.redirect,'error');
      return Response.json({access_token:'fixture-access-token',expires_in:3600,scope:scopes.ads});
    }
    reads++;
    assert.equal(url,'https://googleads.googleapis.com/v26/customers/2067623227/googleAds:search');
    assert.equal(init.headers.Authorization,'Bearer fixture-access-token');
    assert.equal(init.body.includes(env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN),false);
    return Response.json({results:[]});
  };
  const read=createUserAds(env,fetcher);
  const path='customers/2067623227/googleAds:search', query={query:'SELECT customer.id FROM customer'};
  await Promise.all([read('ads',path,query), read('ads',path,query)]);
  assert.equal(exchanges,1); assert.equal(reads,2);
  await assert.rejects(read('ads','customers/2067623227/campaigns:mutate',{query:'anything'}),/ADS_REPORT_ONLY/);
  await assert.rejects(read('ads','customers/1234567890/googleAds:search',query),/ADS_REPORT_ONLY/);
  await assert.rejects(read('ads',path,{query:'UPDATE customer'}),/ADS_REPORT_ONLY/);
  assert.equal(reads,2);
});
test('unconfigured Ads OAuth is isolated from the existing service-account path',async()=>{
  const handler=createHttp({GOOGLE_ADS_AUTH:'user'},{local:true});
  const response=await handler(new Request('http://127.0.0.1/api/reports?days=7'));
  const result=await response.json();
  assert.equal(result.sources.ads.code,'ADS_OAUTH_CLIENT_REQUIRED');
  assert.equal(result.sources.gsc.code,'CREDENTIAL_NOT_CONFIGURED');
  assert.equal(result.sources.ga.code,'CREDENTIAL_NOT_CONFIGURED');
});
