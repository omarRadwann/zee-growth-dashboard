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

The service account must be granted access on each correct Google property. Have a Google Ads administrator open **Admin → Access and security → Users** in customer `206-762-3227` and verify direct read-only access for the service account, or confirm the manager account and supply its ID. See [Google’s service-account access instructions](https://developers.google.com/google-ads/api/docs/oauth/service-accounts). If Ads next reports that the Cloud project is not approved for production, enable the appropriate API access level in the Google Cloud project. Do not request a legacy developer token. No campaign, billing, checkout, or WordPress writes are implemented.

## Use the reporting controls

- **Organic Search:** choose search type, country, device, URL language or a known-brand segment. Apply literal query and URL text filters independently. See query, page, device, country and Search Appearance tables. Brand matching is a heuristic. Query filters exclude anonymized queries, and page filters can change the aggregation level.
- **Site Analytics:** filter acquisition, country and device. Shopping events are explicit aggregate event counts, not a user funnel. The separate active-user card queries the property-wide last 30 minutes on demand.
- **Paid Media:** live access errors stay visible. Until access is fixed, download the template and open a UTF-8 Google Ads campaign-by-day CSV in the local file workspace. Use one currency, ISO dates and no extra segmentation. Duplicate campaign/day rows and missing numeric cells are rejected. Add the Currency column if necessary. CSV results are based only on included rows, never merged into live totals, and not uploaded. The import is removed on reload or leaving Paid Media.
- **Export report:** saves the selected source's totals, daily data and returned breakdown together with the date windows, applied filters, units, check time and warnings. The filtered table export is for specific rows. Missing values produce blank cells.
- **Report coverage:** the dashboard shows observed daily rows, not a promise of complete provider coverage. It marks provider warnings and transient cached results visibly. Prior-period or breakdown failures do not hide valid current totals; permissions errors do not use a stale fallback. Source visits, reports and dates do not write to any external account.

## Team access and GitHub Pages

GitHub Pages can serve the built frontend but **cannot run the private reports server**. This branch does not deploy to the legacy public Pages site. Keep the repo as the source of truth and serve the build and its API together on a private Node host. For a private HTTPS reverse proxy on that host, preserve the request Host header, terminate TLS, and set `ZEE_HTTPS_ORIGIN` plus `ZEE_GATE_PASSWORD` (24+ characters, generated and stored in the host's secrets; Basic auth user is `zee`). Keep the Node listener loopback-only. Prefer team SSO at the private gateway and use a rotated service-account key stored only in a runtime secret or mounted credential file. The auth gate is not a substitute for a team permissions policy. Do not forward a public site directly to the unprotected local mode.

## Reporting rules

- Presets: 7, 28, 56 and 90 days; custom up to 90 days. Compare the preceding period, a same-length window starting on the equivalent date last year, another nonoverlapping custom start, or no comparison. Report dates are restricted to the most recent 487 days; comparison windows outside that range are reported as unavailable. The newest four Cairo calendar dates are excluded using a conservative common cutoff, not a guarantee that all providers finalized every date. Search Console uses Pacific dates, GA4 and Ads use their own reporting calendars. Dates aren't reinterpreted as one timezone.
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
