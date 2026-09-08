# ZEE Growth

The reporting website for `omarRadwann/zee-growth-dashboard`.

## Direct API update — September 2026

The React interface includes a direct Google API connection panel and a separate Node backend. See [backend setup and exact remaining blockers](backend/README.md). Google sign-in, allowlisted reporting access, cached API reads and browser refresh are implemented and tested with mocks, but hosting and live credentials are not configured. The older setup notes below describe the previous connector route; they are not evidence of current live connectivity or production installation state.

## What works now

- Responsive dashboard: overview, Google Ads campaigns, before/after, sales and enquiries, organic search, source freshness, and a change journal.
- 7-, 28- and 56-day comparisons. Today is excluded from completed-period reports.
- Campaign filtering, an independent newest-first activity stream, and CSV summary export.
- Explicit synthetic example mode. The initial website contains **no real performance data**.
- Validated reporting JSON imports. Imported data stays in this browser tab's memory; no upload or persistent business-data storage.
- Private WordPress bridge installed on staging and a prepared reporting-only Google Ads script. Publishing GitHub code alone does not connect private accounts.

## What is not live yet

On 6 September 2026, the correct Google Ads account was signed in and real reports were readable. The account access page confirmed **Read only** permission. New script creation failed. An existing Ads administrator must install/authorize the reporting-only script; do not request broad campaign editing access merely to view reports. Google Ads, production WooCommerce, Search Console, GA4, WhatsApp, calls and CRM remain unconnected.

The WordPress connector v0.2.0 is installed and active on staging. Its authenticated reader returned HTTP 200 with private/no-store headers; anonymous reading was rejected and unsigned ingestion returned HTTP 401. Background jobs produced a dated staging-only Woo snapshot. Full history reconciliation and production approval remain required. No production plugin was installed.

Source | Prepared integration | Still required
--- | --- | ---
Google Ads | Read-only Ads script; signed daily campaign snapshots; approved purchase-action allowlist | Existing administrator installation, purchase-action audit, private key configuration, Preview reconciliation, execution authorization and a supported schedule
WooCommerce | Staging private aggregation using `wc_get_orders`, no order mutation | Full count/status/refund reconciliation, reliable server cron, scale/load review and explicit production approval
Forms / WhatsApp / calls / delivery | Signed aggregate snapshot ingestion and separate event types | Provider/CRM-specific adapters, event deduplication, complete coverage, confirmed outcomes and consent review; these adapters are **not implemented**
Search Console | Validated daily aggregate data contract and signed snapshot receiver | Authenticated exporter/API adapter for the correct property with Egypt/Web filters; **not implemented**
GA4 | Measurement definitions in the guide | GA4 connector, event audit, attribution and article-journey reporting; **not implemented**

## Run and publish

```sh
npm ci
npm run dev:pages
npm test
npm run typecheck
npm run build:pages
```

GitHub Pages publishes `/docs` on the repository's default branch (`codex/growth-dashboard`). Only the static browser application is built there. No backend is deployed to GitHub Pages. The generated Sites scaffold and its Shadcn/Base UI components were reused; GitHub is the explicitly requested publishing destination. Use the `*:pages` scripts for this deployment.

Do not put credentials, service-account files, raw order exports or customer data in this repository. The private ingestion keys are generated on the WordPress server at plugin activation and shown only to administrators. They are not GitHub or browser configuration values.

## Team use

1. Open the website. Use **Explore example** to learn the screens; these numbers are made up.
2. After the private connector is installed, choose **Connect data**, select staging, sign in on ZEE's own WordPress website, and explicitly allow sharing with the dashboard tab.
3. Keep the small connection window open. Dashboard refresh requests run once per minute. Woo snapshots refresh in the background about every five minutes when server cron runs; source delays remain visible.
4. Record important changes in **Change journal**. The journal is device-local, not shared; export it for the team.
5. Use **Before & after** to compare complete periods, then check budget, promotions, stock and seasonal effects. Do not claim causality from a simple comparison.

## Interpretation safeguards

- Ads purchase value / spend = purchase ROAS, **not profit or bank receipts**.
- Ads purchases are interaction-date, attribution-based counts. Fractional attribution is retained.
- Store totals are order-created-date cohorts, with current order status and refunds as of the snapshot. All configured order statuses are included except drafts/trash; cancellations and refunds are shown separately.
- Recorded paid value is the gross total of orders with a payment date, before refunds, including order tax/shipping as recorded. It is **not cash settlement**, particularly for COD. “Completed” is not verified delivery.
- Intent events such as WhatsApp clicks never become confirmed conversations automatically. Enquiry/event counts are not deduplicated unique people.
- A dash means missing data or an undefined ratio. No partial-coverage totals or zero-baseline percentage growth are invented.
- The activity stream is independent of the selected historical report period so new events can appear. It displays up to 60 newest records; event counters use the selected reporting period.

## Staging acceptance before production

See [Mostafa setup and acceptance](SETUP-MOSTAFA.md). Production publication of this frontend does not authorize changes to ad spend, campaigns, consent settings or the production checkout.
# Performance explorer update

The website now opens on the report explorer. It accepts real English-column Google Ads, Google Search Console and aggregate WooCommerce CSV exports in a background worker (UTF-8 and BOM-marked UTF-16). It supports custom dates, intersecting available dimensions, Arabic/English query classification, brand-term filtering, top-group bar charts, daily/weekly/monthly trends, comparison tables, pagination and filtered CSV export.

Only dimensions supplied in a report appear. Generic Ads conversions are not presented as purchases. Imported search-term rows are not account totals. Missing dates are chart gaps; comparison requires complete observed date coverage or an explicitly covered connected feed. Files remain in the current tab, are not uploaded, and are not automatically refreshed. This importer is a historical-analysis fallback, not a substitute for the private live service.

## Current live-service status

- The public website contains no real financial datasets or credentials.
- Production reporting access was verified read-only on 6 September 2026. The old sales report showed inconsistent recent coverage; do not use it as the sales source of truth without reconciliation.
- A bulk production order-history extraction was stopped before collection, pending explicit approval. No reporting plugin was installed on production.
- Google Ads is signed in, but the reporting user's verified Read only role cannot install a script. Current Ads/GA4/Search Console automatic feeds remain unconnected.
- The installed staging connector uses resumable 100-order jobs instead of the old 10,000-order full-refresh limit. It publishes only contiguous reconciled days, retries changed counts, and queues affected days after order changes. Recent days refresh first; historical days have a six-hour reconciliation target when cron runs. Initial collection is progressive, not instantly complete.
- Ads scripts, Google OAuth/service authorization, approved purchase-action mapping, and any GA4/CRM adapters still require setup and source reconciliation. None are implied by CSV support.
