# Automatic Search Console reporting — prepared, not connected

This collector runs on Google Apps Script, independently of a laptop. It reads finalized daily Web/Egypt data for the ZEE domain property, reconciles clicks and impressions with Google's period total, and sends signed aggregates to the existing private reporting bridge. It neither changes Search Console settings nor changes store products/orders. It writes reporting snapshots and its own scheduled-task state.

## One-time setup and approval

1. In ZEE's authorized Google account, create a private Apps Script project. Add `Code.gs` and the manifest `appsscript.json`. Do not deploy a public web app or share editor access broadly.
2. Enable the Search Console API in the linked Google Cloud project if required. Use the read-only Search Console scope listed in the manifest; no write scope is needed.
3. In Script Properties, set `ZEE_REPORT_ENDPOINT` to the staging `/wp-json/zee-growth/v1/ingest/seo` endpoint and `ZEE_REPORT_SECRET` to the staging SEO ingestion key. The key stays in private Script Properties, never in GitHub or chat.
4. The account owner reviews and accepts Google's authorization. This is a required user action; a browser sign-in does not authorize this collector.
5. Run `previewZeeSearch`: it only reads Google data and sends no data to WordPress. Review dates and reconcile source filters.
6. After approval to send these aggregate metrics to staging, run `syncZeeSearch` and verify the result through the private dashboard connection. Then run `scheduleZeeSearch` once; it avoids creating duplicate triggers for this handler.
7. Verify a later scheduled execution, failure notifications, data freshness and the existing private reader. Do not call the feed automatic until an unattended run has succeeded.

## Production is a separate approval

Do not point this collector at production without the owner's approval. The exact proposed production change is: accept signed Search Console daily aggregates into the **existing** reporting plugin's options every six hours. No new WordPress plugin, visitor tag, order edit, product edit or campaign change is required for this source.

After approval, use the production SEO key, set the production endpoint, and set `ZEE_PRODUCTION_APPROVED=yes` in private Script Properties. Verify a manual and a scheduled production run. A configuration flag is a safeguard, not a substitute for actual approval.

## Limits and remaining work

- Google may report with delay. This is automatic scheduled collection, not instant Google statistics.
- Queries use Pacific Time daily dates. The dashboard's Cairo clock must not relabel those buckets.
- It covers at most 180 days. Rows missing inside the observed date range stop the delivery instead of inventing zeros. Older reports remain in the receiver when collection fails.
- It covers daily organic totals, not Search Console URL/query breakdowns, Ads, GA4, forms, WhatsApp, phone outcomes or delivery. Those need their own approved data sources.
- The existing dashboard reader still needs an authorized WordPress connection window. Removing that popup requires a separately designed authenticated reporting service; this collector alone does not implement that.
- Apps Script triggers execute under the authorizing account. Keep that account's access valid and monitor its execution failures. This repository does not install or authorize a script merely by publishing code.

References: [Search Console query API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [read-only authorization](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing), [Google-hosted scheduled triggers](https://developers.google.com/apps-script/guides/triggers/installable).
