import { createServer } from 'node:http';
import { ReportError, dateRange } from './google-reporting.mjs';
export function configuration(env) {
  return { signIn: Boolean(env.GOOGLE_WEB_CLIENT_ID && env.ALLOWED_EMAILS), ads: Boolean(env.GOOGLE_ADS_CUSTOMER_ID && env.GOOGLE_ADS_DEVELOPER_TOKEN && env.GOOGLE_ADS_PURCHASE_ACTION_IDS), searchConsole: Boolean(env.SEARCH_CONSOLE_PROPERTY), ga4: Boolean(env.GA4_PROPERTY_ID) };
}
export function createApi({ env, reporting, verifyIdentity, now = Date.now }) {
  const origins = new Set((env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean));
  const emails = new Set((env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  const cache = new Map(); let active = 0;
  return createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Vary', 'Origin');
    const send = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
    const origin = req.headers.origin;
    if (origin && !origins.has(origin)) return send(403, { error: 'ORIGIN_NOT_ALLOWED' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET'); res.setHeader('Access-Control-Allow-Headers', 'Authorization'); res.setHeader('Access-Control-Max-Age', '600'); return send(204, undefined); }
    if (req.method !== 'GET') return send(405, { error: 'METHOD_NOT_ALLOWED' });
    let url; try { url = new URL(req.url, 'http://localhost'); } catch { return send(400, { error: 'INVALID_URL' }); }
    if (url.pathname === '/health') return send(200, { status: 'running', googleAccessVerified: false });
    if (url.pathname === '/config') return send(200, { clientId: env.GOOGLE_WEB_CLIENT_ID || null, signInConfigured: configuration(env).signIn });
    if (!configuration(env).signIn) return send(503, { error: 'SIGN_IN_CONFIGURATION_MISSING' });
    const token = /^Bearer ([^\s]+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token || token.length > 8192) return send(401, { error: 'SIGN_IN_REQUIRED' });
    try { const identity = await verifyIdentity(token, env.GOOGLE_WEB_CLIENT_ID); if (identity?.email_verified !== true || !emails.has(String(identity.email).toLowerCase()) || !Number.isFinite(identity.exp) || identity.exp * 1000 <= now()) return send(403, { error: 'ACCOUNT_NOT_ALLOWED' }); } catch { return send(401, { error: 'SIGN_IN_EXPIRED_OR_INVALID' }); }
    if (url.pathname === '/v1/status') return send(200, { configured: configuration(env), googleAccessVerified: false });
    const match = /^\/v1\/(ads|search-console|ga4)$/.exec(url.pathname); if (!match) return send(404, { error: 'NOT_FOUND' });
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    try { dateRange(from, to); } catch(error) { return send(400, { error: error.code }); }
    const key = `${match[1]}:${from}:${to}`, cached = cache.get(key);
    if (cached && now() - cached.at < 300000) return send(200, cached.report);
    if (active >= 3) { res.setHeader('Retry-After', '30'); return send(429, { error: 'REPORT_BUSY' }); }
    active++;
    try { const result = await reporting(match[1], from, to); const report = { generatedAt: new Date(now()).toISOString(), ...result }; if (Buffer.byteLength(JSON.stringify(report)) <= 4000000) { if (cache.size >= 3) cache.delete(cache.keys().next().value); cache.set(key, { at: now(), report }); } send(200, report); }
    catch(error) { const upstream = Number(error.response?.status || 0); send(error instanceof ReportError ? error.status : 502, { error: error instanceof ReportError ? error.code : 'GOOGLE_REQUEST_FAILED', ...(upstream ? { upstreamStatus: upstream } : {}) }); }
    finally { active--; }
  });
}
