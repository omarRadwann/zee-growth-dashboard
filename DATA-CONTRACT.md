# Version-1 reporting snapshot

The dashboard's **Data connections → Download example format** produces a valid, explicitly synthetic example. It is not ZEE business data. The parser implementation and types are in `lib/metrics.mjs` and `lib/report-types.ts`.

```json
{
  "version": 1,
  "environment": "staging",
  "currency": "EGP",
  "timezone": "Africa/Cairo",
  "generatedAt": "2026-09-06T12:00:00Z",
  "sources": {
    "ads": {
      "status": "connected",
      "accountId": "206-762-3227",
      "lastSync": "2026-09-06T12:00:00Z",
      "from": "2026-07-01",
      "to": "2026-09-05",
      "note": "Complete daily campaign export; interaction-date reporting."
    }
  },
  "ads": [
    { "date": "2026-09-05", "campaignId": "EXAMPLE_ONLY", "campaign": "Example only", "cost": 100, "clicks": 50, "impressions": 1000, "conversions": 4, "purchases": 2, "purchaseValue": 2000 }
  ]
}
```

The snippet illustrates shape only, not complete reporting coverage. In a real payload, declared `from`/`to` means the entire source was queried successfully for that range. Zero-activity daily campaign rows can be omitted only if the complete query is confirmed. Do not declare a long range around one selected row. Unconnected sources are omitted or `status: disconnected`.

`commerce` is one row per order-created day: `orders`, `paidOrders`, `recordedPaidValue`, `cancelledOrders`, `completedOrders`, `refundValue`. Counts are integers. The source is called `woo`.

`seo` is one row per day: `clicks`, `impressions`, `position`. Position is the source's impression-weighted daily value; the dashboard weights again by impressions across days. Country/search-type filters must remain consistent in the exporting adapter.

`events` contains unique `id`, ISO `at`, allowlisted `type`, `count` and `channel`. A source must explicitly declare `sources.events.types`. Untracked types stay unavailable. Records can be aggregate buckets if their labels/timestamps correctly represent those buckets; do not label a daily bucket as an individual real-time event. Use stable event IDs that contain no direct customer identifiers.

## Server-to-server signature

POST to the corresponding exact source route, with the matching private per-source key:

```text
X-Zee-Timestamp: <Unix seconds>
X-Zee-Signature: hex(HMAC-SHA256(timestamp + "." + exact_body, source_key))
Content-Type: application/json
```

The server requires HTTPS and a timestamp within five minutes. Requests replace complete snapshots. Older sync timestamps cannot overwrite newer ones. Do not send keys to the static dashboard. The frontend communicates through an authorized WordPress connection window, not the ingestion route.
