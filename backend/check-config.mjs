import { GoogleAuth } from 'google-auth-library';
import { configuration } from './http-api.mjs';
console.log(JSON.stringify({ configured: configuration(process.env), missing: ['GOOGLE_WEB_CLIENT_ID','ALLOWED_EMAILS','GOOGLE_ADS_DEVELOPER_TOKEN','GOOGLE_ADS_PURCHASE_ACTION_IDS','GA4_PROPERTY_ID'].filter(key => !process.env[key]) }, null, 2));
try { await new GoogleAuth().getClient(); console.log('Google credentials found; live product access is not yet verified.'); } catch { console.log('Google credentials are not available. Attach the approved service account to the hosted service.'); }
