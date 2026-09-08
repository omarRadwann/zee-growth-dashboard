# ZEE direct Google reporting — deployment handoff

## Ready in the repository

The React dashboard now has **Data connections → Direct Google API**. It signs in with Google, reads Ads and Search Console into existing charts, and shows GA4 event counts separately. It refreshes every five minutes while the tab is open and its sign-in token remains valid. It stops when the session expires; this is not an unattended ingestion system.

The Node API is implemented with Google Application Default Credentials, verified Google ID tokens, an explicit email allowlist, exact-origin CORS, bounded concurrency, sanitized errors and a five-minute bounded cache. No Google Ads script or production shop plugin is needed.

**Not yet deployed or verified against live Google reports.** Local checks found no Cloud CLI/login, no ADC credentials and the missing settings below. Mock tests are not proof of account access.

## Already configured locally

- Google project: `zee-official-489812`
- Service identity for hosting: `new-dashboard-for-zee@zee-official-489812.iam.gserviceaccount.com`
- Google Ads account: `2067623227`
- API version: `v25`
- Search Console property: `sc-domain:zee-official.com` (access still needs a successful API request)
- Website origin: `https://omarradwann.github.io`
- No supplied API key or private credentials were placed in code.

## What Mostafa must supply or configure

| Setting | Where / why |
|---|---|
| GOOGLE_WEB_CLIENT_ID | Google Cloud → APIs & Services → Credentials → OAuth client, **Web application**. This signs the team into the dashboard; it does not grant Google reporting access. Add authorized JavaScript origin `https://omarradwann.github.io` (and `http://127.0.0.1:5174` for local testing). Use an existing appropriate web client if available. Configure consent/testing users if required. |
| ALLOWED_EMAILS | Comma-separated exact Google emails of people approved to see ZEE reports. No wildcard/domain-wide access. |
| GOOGLE_ADS_DEVELOPER_TOKEN | Obtain from Google Ads **manager account → API Center**, with access to real accounts. Store in **Secret Manager**, not the config file, browser, chat or GitHub. |
| GOOGLE_ADS_PURCHASE_ACTION_IDS | Confirm primary PURCHASE conversion actions in this Ads account. The previously discussed action must be rechecked; this is not permission to change goals. |
| GA4_PROPERTY_ID | Analytics → Admin → Property details → numeric property ID (not a G- measurement ID). |
| Hosting administrator | Sign into Google Cloud CLI with an administrator allowed to build/deploy Cloud Run and attach the service identity. Choose region and approve hosting/build costs. |

The service account's access inside each Google product can remain as Mostafa configured it. **Its email alone is not a credential**: attach it to Cloud Run so Google supplies short-lived credentials automatically. Grant it Secret Manager access to the developer-token secret only. Enable the relevant reporting APIs if not already enabled.

## Deploy, after approval

1. Install/sign into Google Cloud CLI on the administrator's device. Confirm the active project is ZEE.
2. Copy `deployment-config.example.json` to a private file **outside the repository**, fill the blank non-secret settings, and optionally add GOOGLE_ADS_LOGIN_CUSTOMER_ID when accessing through a manager.
3. Create the developer-token secret in Secret Manager through Google's console. Do not paste the token into shell command history.
4. Review `deploy.ps1`. It is restricted to the ZEE project/account, attaches the specified service account, caps instances at two, and uses Secret Manager. It does not modify WordPress, orders, ads, budgets or goals.
5. Run in PowerShell 7:

```powershell
./deploy.ps1 -ConfigPath C:/private/zee-config.json -AdsTokenSecret YOUR_SECRET_NAME -Region YOUR_APPROVED_REGION -ApproveHostingAndPublicEndpoint
```

**Network access versus report access:** the browser must reach the Cloud Run endpoint, so this script uses `--allow-unauthenticated` at the network layer. The application still requires a verified Google ID token and the exact email allowlist for **every reporting request**, including cached requests. Only health and the non-secret sign-in client ID are public. If your organisation prohibits public network endpoints, stop and use an approved IAP/proxy architecture instead; do not remove application authentication.

6. Copy the resulting HTTPS origin into **ZEE Growth → Data connections → Direct Google API**, select **Connect & sign in**, and use an allowlisted Google account. No service-account private key or Ads token belongs in the website.
7. Test that an unapproved account cannot get reports. Compare Ads figures against identical dates/actions, Search Console against final Web data and GA4 against its event definitions. Use an ending date a few days back for initial Search Console validation.

## Local checks

Inside backend: `npm ci`, `npm test`, `npm run check`, `npm start`. The ignored local .env contains known non-secret ZEE defaults. Fill missing settings privately for local authentication. Default bind is 127.0.0.1:8080. The Docker image binds to 0.0.0.0 for hosting.

Routes: GET /health, /config, /v1/status, /v1/ads, /v1/search-console, /v1/ga4. Reports take from/to ISO dates and require a Bearer Google ID token. Requests are capped at 186 days and exclude today in UTC. Finality/processing delay is source-specific; missing Search Console days are rejected by the dashboard adapter rather than filled with invented zeroes.

## Still separate work

- WooCommerce/Operations reconciliation: order date, statuses, discounts, refunds, cash collection and delivery definitions must be aligned. Google authentication cannot fix that discrepancy.
- GA4 event counts are not unique leads or cash received. Confirmed WhatsApp conversations, answered calls and qualified leads require their own providers/CRM.
- Background collection after all browsers close requires a scheduler and private durable storage. This release offers automatic refresh while signed in, not 24/7 collection.
- The older script connector test suite has five known failures in existing local setup changes. Those files were preserved; they are not used by this direct API route.

References: [Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [Google Ads authentication](https://developers.google.com/google-ads/api/rest/auth), [developer token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token), [Cloud Run identity](https://cloud.google.com/run/docs/securing/service-identity).
