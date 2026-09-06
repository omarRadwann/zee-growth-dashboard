# Mostafa — private reporting setup

## 1. Install and restrict on staging

Upload the folder `connectors/wordpress/zee-growth-bridge` as a WordPress plugin and activate it **on staging first**. Take the normal staging backup before activation.

The plugin adds its own reporting options, private ingestion keys, two cron hooks and the `view_zee_growth` capability to administrators. It does not change products, customer accounts, prices, order status, checkout, ad settings or storefront tracking. Deactivation stops its cron hooks and removes the capability from administrators. Reporting options are retained for recovery; delete them explicitly only under an approved cleanup request.

Grant `view_zee_growth` to a dedicated reporting role for the approved team. Do not grant them `manage_options`, administrator, edit orders or campaign-edit access just to use this dashboard. The existing `omar` account's ability to edit products does **not** prove plugin-install or reporting permission.

Only `https://omarradwann.github.io` is allowed as the dashboard origin. The browser also checks the exact connection window and a fresh handshake ID. Do not change either side to `*`. The WordPress AJAX reader requires an authenticated session, reporting capability, a WordPress nonce, and returns private/no-store responses. Exclude the plugin admin page, admin AJAX and signed ingestion endpoints from CDN/page caches. Check security headers do not sever the explicitly approved popup connection; do not disable security headers globally.

## 2. Reconcile WooCommerce

- The pilot queries the last 56 days plus today in `Africa/Cairo`, in EGP, through `wc_get_orders` (HPOS-compatible API), not direct order SQL.
- It stops at 10,000 orders per refresh, detects inconsistent pagination, and keeps the previous snapshot on failure. It never returns a truncated range as complete.
- Check the actual order count and load on staging. If above this guard, do not raise it blindly: implement a resumable paginated worker/warehouse with incremental updates and reconciliation first.
- Use a real server cron for WordPress events. Do not promise minute-level updates with low-traffic WP-Cron alone.
- First run may require a cron tick and a second dashboard refresh. Confirm the source's `lastSync` changes after completion.
- Check an online paid order, pending COD order, cancelled order, partially refunded order and fully refunded order. Match totals to the same order-created cohort, not payment-date financial reports.
- Confirm COD paid timestamps and custom delivery status meanings with operations. The connector intentionally does not claim that completed orders are delivered or COD cash has been collected.
- Never join Woo totals to Ads totals by assuming every store order came from an ad.

## 3. Authorize Google Ads reporting

Use account **206-762-3227**. The initial setup account **685-671-3043** is not the intended account.

1. Sign in to the existing advertiser account and confirm account time zone/currency. The script fails closed unless they are `Africa/Cairo` / `EGP`; do not change account settings to force a match.
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

After the above passes, explicitly approve installation on production. Production generates new ingestion keys. Update the approved source adapters' destination and environment together, then reconcile again. Do not reuse staging data as production history. Do not publish secrets to GitHub to make the integration “work”.

## Verification performed in this build

- Automated metrics tests: complete-period logic, missing vs zero, ROAS/CPA/CTR arithmetic, campaign filtering, fractional attribution, Cairo/leap-date handling, duplicate detection, safe CSV export and source freshness.
- Google Ads script tested against mocked reporting APIs, including signature construction and failure cases; **not executed against the real Ads account**.
- PHP connector syntax parsed and source-level permission/read-only guards tested; **not runtime-tested in WordPress**.
- Frontend type checking and production build required before publication.
- No browser visual/interaction QA or production-data reconciliation has been claimed.
- Optional WebMCP reporting/filter tools have mocked contract tests, but no supported live WebMCP browser context was available for verification. They do not change external accounts.
