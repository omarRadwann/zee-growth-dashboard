const encoder = new TextEncoder();
const oauth = 'https://oauth2.googleapis.com/token';
export const scopes = {
  gsc: 'https://www.googleapis.com/auth/webmasters.readonly',
  ga: 'https://www.googleapis.com/auth/analytics.readonly',
  ads: 'https://www.googleapis.com/auth/adwords',
};
const safeCode = s => typeof s === 'string' && /^[A-Za-z0-9_]{2,90}$/.test(s) ? s : undefined;
export class GoogleError extends Error {
  constructor(code, status = 500) { super(code); this.code = code; this.status = status; }
}
function base64url(input) {
  return btoa(String.fromCharCode(...input)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
function parseKey(value) {
  if (!value) throw new GoogleError('CREDENTIAL_NOT_CONFIGURED', 503);
  let key;
  try { key = JSON.parse(value); } catch { throw new GoogleError('CREDENTIAL_INVALID', 503); }
  if (key.type !== 'service_account' || !/^[\w.-]+@[\w.-]+\.iam\.gserviceaccount\.com$/.test(key.client_email) ||
      !/^-----BEGIN PRIVATE KEY-----/.test(key.private_key ?? '')) throw new GoogleError('CREDENTIAL_INVALID', 503);
  return key;
}
export async function decodeGoogle(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const adsCode = data?.error?.details?.flatMap(d => d.errors ?? []).map(e => Object.values(e.errorCode ?? {})[0]).find(safeCode);
    const reason = data?.error?.details?.map(d => d.reason).find(safeCode) ?? data?.error?.errors?.[0]?.reason;
    throw new GoogleError(safeCode(adsCode) ?? safeCode(reason) ?? safeCode(data?.error?.status) ?? safeCode(data?.error) ?? `GOOGLE_HTTP_${response.status}`, response.status);
  }
  if (!data) throw new GoogleError('GOOGLE_INVALID_RESPONSE', 502);
  return data;
}
export function timedGoogle(fetcher, url, init) {
  return fetcher(url, { ...init, signal: AbortSignal.timeout(16000) }).catch(() => { throw new GoogleError('GOOGLE_NETWORK_OR_TIMEOUT', 502); });
}
export function createGoogle(rawKey, fetcher = fetch) {
  const key = parseKey(rawKey);
  const tokenCache = new Map();
  let signingKey;
  const json = value => base64url(encoder.encode(JSON.stringify(value)));
  async function mint(scope) {
    const issued = Math.floor(Date.now() / 1000);
    const der = Uint8Array.from(atob(key.private_key.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
    signingKey ??= crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const unsigned = `${json({ alg: 'RS256', typ: 'JWT', kid: key.private_key_id })}.${json({ iss: key.client_email, scope, aud: oauth, iat: issued, exp: issued + 3600 })}`;
    let signature;
    try { signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey, encoder.encode(unsigned)); }
    catch { throw new GoogleError('CREDENTIAL_INVALID', 503); }
    const params = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${base64url(new Uint8Array(signature))}` });
    const response = await decodeGoogle(await timedGoogle(fetcher, oauth, { method: 'POST', body: params }));
    if (!response.access_token) throw new GoogleError('GOOGLE_TOKEN_MISSING', 502);
    return response.access_token;
  }
  async function token(scope) {
    const hit = tokenCache.get(scope);
    if (hit?.until > Date.now()) return hit.promise;
    const promise = mint(scope).catch(e => { tokenCache.delete(scope); throw e; });
    tokenCache.set(scope, { promise, until: Date.now() + 50 * 60_000 });
    return promise;
  }
  const roots = {
    gsc: 'https://www.googleapis.com/webmasters/v3/',
    ga: 'https://analyticsdata.googleapis.com/v1beta/',
    gaAdmin: 'https://analyticsadmin.googleapis.com/v1beta/',
    ads: 'https://googleads.googleapis.com/v26/',
  };
  return async function request(service, path, body, manager) {
    const scope = scopes[service === 'gaAdmin' ? 'ga' : service];
    const headers = { Authorization: `Bearer ${await token(scope)}` };
    if (body) headers['Content-Type'] = 'application/json';
    if (service === 'ads' && manager) headers['login-customer-id'] = manager;
    const response = await timedGoogle(fetcher, roots[service] + path, { headers, method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined });
    if (response.status === 401) tokenCache.delete(scope);
    return decodeGoogle(response);
  };
}
