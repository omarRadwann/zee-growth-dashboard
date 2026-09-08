import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../http-api.mjs';
async function fixture(t, overrides = {}) {
  let calls = 0;
  const api = createApi({ env: { GOOGLE_WEB_CLIENT_ID: 'test-client', ALLOWED_EMAILS: 'team@example.com', ALLOWED_ORIGINS: 'https://omarradwann.github.io' }, verifyIdentity: async token => { if (token !== 'valid') throw Error('secret details'); return { email: 'team@example.com', email_verified: true, exp: Date.now()/1000+100 }; }, reporting: async () => { calls++; return { rows: [{ count: 2 }] }; }, ...overrides });
  await new Promise(resolve => api.listen(0,'127.0.0.1',resolve)); t.after(() => new Promise(resolve => api.close(resolve)));
  return { url: `http://127.0.0.1:${api.address().port}`, calls: () => calls };
}
await test('anonymous and invalid sessions cannot read reports', async t => {
  const { url, calls } = await fixture(t);
  for (const headers of [{}, { Authorization: 'Bearer invalid' }]) assert.equal((await fetch(url+'/v1/ads?from=2025-01-01&to=2025-01-02', { headers })).status,401); assert.equal(calls(),0);
});
await test('approved user receives cached reports but authentication remains required', async t => {
  const { url, calls } = await fixture(t), path = '/v1/ads?from=2025-01-01&to=2025-01-02';
  for (let i=0;i<2;i++) assert.equal((await fetch(url+path,{headers:{Authorization:'Bearer valid'}})).status,200);
  assert.equal(calls(),1); assert.equal((await fetch(url+path)).status,401);
});
await test('unapproved accounts and untrusted origins are denied', async t => {
  const { url, calls } = await fixture(t,{verifyIdentity:async()=>({email:'other@example.com',email_verified:true,exp:Date.now()/1000+100})});
  assert.equal((await fetch(url+'/v1/status',{headers:{Authorization:'Bearer valid'}})).status,403);
  assert.equal((await fetch(url+'/config',{headers:{Origin:'https://untrusted.example'}})).status,403); assert.equal(calls(),0);
});
await test('public config never discloses private settings', async t => {
  const { url } = await fixture(t,{env:{GOOGLE_ADS_DEVELOPER_TOKEN:'private-secret'}});
  assert.ok(!(await (await fetch(url+'/config')).text()).includes('private-secret'));
  assert.equal((await fetch(url+'/v1/status',{headers:{Authorization:'Bearer valid'}})).status,503);
});
await test('upstream errors are sanitized', async t => {
  const { url } = await fixture(t,{reporting:async()=>{throw Error('private-secret');}});
  const response = await fetch(url+'/v1/ads?from=2025-01-01&to=2025-01-02',{headers:{Authorization:'Bearer valid'}});
  assert.equal(response.status,502); assert.ok(!(await response.text()).includes('private-secret'));
});
