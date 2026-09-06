# Mostafa — private reporting setup

## Current handoff — 7 September 2026

- The existing private bridge v0.3.0 was installed and activated on production on 6 September. The installation log confirms success, but production reconciliation and an authorized dashboard session are still unverified. Do not reinstall it to fix an empty dashboard.
- The owner now requires an explanation and approval BEFORE every further production mutation, including plugin updates, settings, tracking and content. Dashboard-only GitHub changes do not update WordPress.
- Staging prepared all 57 daily cohorts; a 36-day intermediate sample matched the Woo REST count (2 orders). The final 57-day snapshot contains 19 staging orders. This is not production history or a high-volume load test.
- Version 0.3.0's already installed reader can advance bounded jobs while the user-authorized connection window is open. With WP-Cron disabled on staging, verify real server scheduling before claiming unattended refresh. Do not enable or alter production scheduling without approval.
- Google Ads scripting remains unconfigured. An existing authorized administrator can handle the reporting script; do not upgrade a viewer's role merely to view numbers. A read-only API implementation is a separate route needing its own private backend, OAuth and developer token.
- Search Console access works. A private manual snapshot was collected from all 92 DAYS rows, with Web / Egypt filters. No private dataset is in this repository. Source exports are snapshots, not live connections.
- The dashboard now exposes coverage, missing-history warnings, private snapshot export/import and bridge collection progress. Snapshot mode is explicitly distinguished from live transport.

## 1. Install and restrict on staging

Upload the folder `connectors/wordpress/zee-growth-bridge` as a WordPress plugin and activate it **on staging first**. Take the normal staging backup before activation.

The plugin adds its own reporting options, private ingestion keys, two cron hooks and the `view_zee_growth` capability to administrators. It does not change products, customer accounts, prices, order status, checkout, ad settings or storefront tracking. Deactivation stops its cron hooks and removes the capability from administrators. Reporting options are retained for recovery; delete them explicitly only under an approved cleanup request.

Grant `view_zee_growth` to a dedicated reporting role for the approved team. Do not grant them `manage_options`, administrator, edit orders or campaign-edit access just to use this dashboard. The existing `omar` account's ability to edit products does **not** prove plugin-install or reporting permission.

Only `https://omarradwann.github.io` is allowed as the dashboard origin. The browser also checks the exact connection window and a fresh handshake ID. Do not change either side to `*`. The WordPress AJAX reader requires an authenticated session, reporting capability, a WordPress nonce, and returns private/no-store responses. Exclude the plugin admin page, admin AJAX and signed ingestion endpoints from CDN/page caches. Check security headers do not sever the explicitly approved popup connection; do not disable security headers globally.

## 2. Reconcile WooCommerce

- The pilot queries the last 56 days plus today in `Africa/Cairo`, in EGP, through `wc_get_orders` (HPOS-compatible API), not direct order SQL.
- It reads at most 100 orders per background job and stores a resumable daily aggregate. It checks count consistency, ascending IDs, Cairo dates, currency and concurrent order changes before publishing a complete day. Partial days never appear as complete.
- Coverage grows backwards from today as whole days finish. Order changes mark the affected created-date cohort for refresh; current-day checks target five minutes and historical reconciliation targets six hours when cron runs. In v0.3.0, lastSync is the latest successful daily refresh, not proof every historical day was rechecked then. The progress payload also carries the oldest included day check.
- Reconcile actual counts and execution time on staging, including a day exceeding 100 orders. Large total history is no longer loaded into one synchronous job. This does not remove the need for a scale test and reliable cron.
- Use a real server cron for WordPress events. Do not promise minute-level updates with low-traffic WP-Cron alone.
- First run may require a cron tick and a second dashboard refresh. Confirm the source's `lastSync` changes after completion.
- Check an online paid order, pending COD order, cancelled order, partially refunded order and fully refunded order. Match totals to the same order-created cohort, not payment-date financial reports.
- Confirm COD paid timestamps and custom delivery status meanings with operations. The connector intentionally does not claim that completed orders are delivered or COD cash has been collected.
- Never join Woo totals to Ads totals by assuming every store order came from an ad.

## 3. Authorize Google Ads reporting

Use account **206-762-3227**. The initial setup account **685-671-3043** is not the intended account.

1. Sign in to the existing advertiser account and confirm account time zone/currency. The script fails closed unless they are `Africa/Cairo` / `EGP`; do not change account settings to force a match.
   On 6 September 2026, the reporting user's account role was verified as Read only. An existing Ads administrator should install and authorize the script; the reporting user does not need broad campaign-editing permissions. Script creation was not possible in that read-only session.
2. Audit purchase conversion actions. Select the primary purchase action IDs that represent actual purchases. Avoid counting both a Google tag purchase and its imported GA4 duplicate. Confirm `transaction_id` deduplication, currency, value, refunds and attribution settings.
3. Copy `connectors/google-ads-report.js` to an authorized Google Ads script.
4. Set `purchaseActionIds`. Copy the private **Ads** ingestion key from the staging ZEE Growth admin page into the Google Ads editor, not GitHub.
5. Run Preview. The script checks the account, action categories and metrics but sends nothing in Preview. It contains no campaign, bid or budget mutation commands.
6. Reconcile a complete day against the Google Ads report: campaign IDs, cost (micros ÷ 1,000,000), clicks, impressions, primary purchases and their values. The script's daily rows use **interaction date**, not purchase occurrence date.
7. Run once after approval and verify the signed receipt. Configure the schedule supported by the account UI. Do not promise that a script schedule or browser refresh removes Google's reporting lag.
8. The full rolling window is replaced each run, not added to previous totals. This captures later attribution changes within that window. Archive longer-term daily snapshots in a proper private warehouse if needed; this pilot does not retain an immutable baseline warehouse.

The script refreshes 84 days plus today by default. Complete 56-day before/after comparisons require at least 112 days of Ads coverage. A dashboard dash outside coverage is expected. The PHP endpoint accepts at most 10,000 rows / 2 MB; the script has a stricter pre-send payload guard. Do not truncate a report and still claim complete coverage.

## 4. Add the remaining feeds

Source-specific adapters are still needed; a receiver alone is not an integration.

Event | Required evidence
--- | ---
Form enquiry | Server-accepted, non-spam submission with a stable event ID
WhatsApp click | Consented button-click event; intent only
WhatsApp conversation | Confirmed inbound conversation/message evidence from the WhatsApp Business platform or CRM; define session/deduplication window
Phone click | `tel:` click; intent only
Answered call | Call-platform/CRM confirmation and agreed minimum-duration rules
Qualified lead | CRM qualification event; stable lead/event IDs and rule definition
Add to cart / checkout | Correctly configured commerce events, excluding internal/test traffic
Delivery confirmed | Approved courier/operations delivery confirmation, separate from order completion
Organic search | Correct Search Console property, Search type Web, Egypt filter, complete daily totals; do not derive daily data from a single screenshot total

Search Console's daily calendar is Pacific Time; preserve those dates. The workspace clock and WooCommerce calendar are Cairo. Never relabel Search Console daily buckets as Cairo or infer hour-level sales attribution from matching date labels. See [Google's data definitions](https://support.google.com/webmasters/answer/96568).

The signed `/ingest/events` and `/ingest/seo` routes accept complete version-1 snapshots, not arbitrary public browser events. Build authenticated provider adapters which normalize to the documented schema. Never expose ingestion keys to storefront JavaScript. Do not send customer names, phone numbers, addresses or email addresses. Use opaque event IDs, agreed channel names and aggregate counts. Do not infer “Google Ads” from the fact that an ad was running.

For GA4, verify consent and ecommerce events before adding report and article-path breakdowns. The current build has no GA4 connector. Do not install duplicate tags or use tracking to bypass consent choices.

## 5. Security and data-quality acceptance

- Logged-out user cannot read the private reader; unauthorized logged-in user gets HTTP 403.
- The right reporting role works; removing that capability stops the next read.
- Missing/invalid nonce fails. Reports are not cached publicly.
- Wrong origin/window/handshake cannot receive data. Closing the connection window stops refresh. Already displayed data remains in tab memory until cleared/closed.
- Invalid HMAC, old timestamp, wrong account, wrong environment, mixed currency, duplicate rows or incomplete data are rejected. Repeat delivery replaces the snapshot and never increments it.
- Ingestion snapshots must have complete declared coverage, not just the most recent 60 events. Otherwise event counts would be wrong. The UI truncates display only, not the underlying totals.
- Verify no PII, key or raw private export is in the GitHub repository or `/docs` output.
- Reconcile a 28-day report and the prior 28 days. Label later attribution/restated order cohorts. Preserve an approved launch baseline outside this rolling-snapshot pilot if immutability is required.
- Review retention: imported Ads/event/SEO options older than 120 days since last sync are purged by this plugin's daily cleanup. Normal backups still need the team's retention policy. The Woo snapshot is retained until replaced or explicitly removed.
- Test on mobile and desktop, including popup behavior and browsers with cross-origin opener restrictions, before production approval.

## 6. Production transition

Installation has already occurred; do not repeat it. Finish read-only reconciliation and user sign-in first. Any further production changes require the owner's approval. Source-adapter configuration and scheduling must be separately reviewed and authorized. Never reuse staging data as production history, and never publish secrets or business totals to GitHub to make the dashboard appear populated.

## Verification performed in this build

- Automated metrics tests: complete-period logic, missing vs zero, ROAS/CPA/CTR arithmetic, campaign filtering, fractional attribution, Cairo/leap-date handling, duplicate detection, safe CSV export and source freshness.
- Google Ads script tested against mocked reporting APIs, including signature construction and failure cases; **not executed against the real Ads account**.
- PHP connector syntax parsed and source-level permission/read-only guards tested. On staging, installation/activation succeeded; signed-in aggregate reads returned HTTP 200 with no-store, anonymous reads were blocked, unsigned ingestion returned HTTP 401, and background collection produced dated Woo data. Full reconciliation, non-admin permission revocation and high-volume load testing remain pending.
- Frontend type checking and production build required before publication.
- No browser visual/interaction QA or production-data reconciliation has been claimed.
- Optional WebMCP reporting/filter tools have mocked contract tests, but no supported live WebMCP browser context was available for verification. They do not change external accounts.
