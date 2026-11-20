# ZEE Analytics Studio

Fresh implementation for `omarRadwann/zee-growth-dashboard`. The legacy dashboard, Pages publication and connectors remain intact while this replacement is reviewed.

## Run locally with live data

Use Node 22.13 or later:

```powershell
cd studio
npm ci
npm run build
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:/path/outside/this/repository/to/service-account.json'
npm start
```

Open http://127.0.0.1:4173/. Only the local machine can reach this server unless you configure a private HTTPS reverse proxy. The credential stays on the server. Do not commit it, put it in a Vite variable, save it in a GitHub Pages artifact, or pass it to the browser. Prefer a rotated credential or a managed identity for team hosting. Cloud project service-account identities and browser OAuth clients are different; the supplied service-account OAuth numeric ID is not a web sign-in client ID.

`npm run probe -- 2026-11-09 2026-11-15` checks real API calls and prints only status, source timezone/currency and row counts. Reports never store the credential or downloaded metrics in this repository; Google access tokens are short-lived and cached in server memory. The app does not fall back to example numbers.

## Sources

| Source | Configuration | Reports |
| --- | --- | --- |
| Search Console | `GSC_PROPERTY`, defaults to `sc-domain:zee-official.com` | Finalized Web search totals, daily trend, queries, landing pages, device/country and submitted sitemaps |
| GA4 | `GA4_PROPERTY_ID`, defaults to verified Zee Official New property `471870357` | Sessions, engaged sessions, purchases, revenue, users, acquisition/device/country/landing pages |
| Google Ads | `GOOGLE_ADS_CUSTOMER_ID`, defaults to `2067623227`; optional `GOOGLE_ADS_MANAGER_ID` | Spend, clicks, configured conversions and campaign breakdown |

The service account must be granted access on each correct Google property. Ask the Ads administrator to verify direct read-only access and invitation acceptance for the service account, or confirm manager routing. If Ads then reports that the Cloud project is not approved for production, enable the appropriate API access level in the Google Cloud project. Do not request a legacy developer token. No campaign, billing, checkout, or WordPress writes are implemented.

## Team access and GitHub Pages

GitHub Pages can serve the built frontend but **cannot run the private reports server**. This branch does not deploy to the legacy public Pages site. Keep the repo as the source of truth and serve the build and its API together on a private Node host. For a private HTTPS reverse proxy on that host, preserve the request Host header, terminate TLS, and set `ZEE_HTTPS_ORIGIN` plus `ZEE_GATE_PASSWORD` (24+ characters, generated and stored in the host's secrets; Basic auth user is `zee`). Keep the Node listener loopback-only. Prefer team SSO at the private gateway and use a rotated service-account key stored only in a runtime secret or mounted credential file. The auth gate is not a substitute for a team permissions policy. Do not forward a public site directly to the unprotected local mode.

## Reporting rules

- Presets: 7, 28, 56 and 90 days; custom up to 90 days. The newest four Cairo calendar dates are excluded using a conservative common cutoff, not a guarantee that all providers finalized every date. Search Console uses Pacific dates, GA4 and Ads use their own reporting calendars. Dates aren't reinterpreted as one timezone.
- Property totals are queried independently. Search Console breakdowns may omit rows; GA4 users are not summed from days or landing pages. Missing days stay blank. Blank and zero are different. GA4 thresholding is shown when Google reports it.
- Search Console CTR changes use percentage points; position changes use rank points. Users can compare the preceding equal-length window. Comparison does not prove causation.
- GA4 purchase revenue is a measured event outcome, not settled cash. Ads conversions are account-configured events, not purchases by default. No cross-source order merging or profit claims.
- Browser-local journal and CSV exports are optional. CSV values are protected against common formula injection. No tracking pixel, background schedule, team sharing or automatic alerting is enabled.

## Verify

```
npm test
npm run typecheck
npm run build
```
