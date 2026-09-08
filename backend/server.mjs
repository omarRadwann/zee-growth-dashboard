import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { createReporting } from './google-reporting.mjs';
import { createApi } from './http-api.mjs';
const env = process.env;
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/adwords', 'https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/webmasters.readonly'] });
const verifier = new OAuth2Client();
const reporting = createReporting({ env, request: async options => {
  const client = await auth.getClient();
  return (await client.request({ ...options, timeout: 30000, retry: false })).data;
} });
createApi({ env, reporting, verifyIdentity: async (idToken, audience) => (await verifier.verifyIdToken({ idToken, audience })).getPayload() })
  .listen(Number(env.PORT || 8080), env.HOST || '127.0.0.1', () => console.log('Reporting API running. Use authenticated source checks to verify Google access.'));
