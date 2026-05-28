# Tradeoffs — Three Things Deliberately Not Built

## 1. Real-time data refresh

The analytics dashboard fetches data on page load and does not auto-refresh.
A user who approves a batch must manually reload to see updated charts.

**Why not**: The free Render tier has a 512 MB RAM limit and a single web
process. Adding WebSockets or polling would consume memory and complicate the
architecture for a demo. The current chart data is server-aggregated (via the
`/api/analytics` endpoint), so a full page refresh is already fast.

**When to build**: If the app transitions to a "monitoring" use case where
users watch dashboards live, add server-sent events (SSE) or periodic
polling (every 30s).

---

## 2. Inline record editing

Users cannot edit a `NormalizedRecord` directly — the only write operations
are approve, reject, flag, and lock. To correct a misclassified record, a user
would need to re-upload the source data.

**Why not**: Inline editing introduces versioning complexity (what happens to
`co2e` when quantity changes? do we re-normalize?). The current model treats
`NormalizedRecord` as a derived, auditable artifact — every change creates a
paper trail. An inline editor would need field-level validation, re-normalization
triggers, and a diff UI.

**When to build**: If users consistently need to correct minor errors (wrong
unit, typo in description) without re-uploading, add a PATCH endpoint with
re-normalization and an additional `record_edited` audit action.

---

## 3. Automated email/Slack notifications

When a batch finishes ingestion or a record is flagged, no notification is sent.
Users must visit the app to see pending reviews.

**Why not**: Notifications require an outgoing email/SMTP setup (or Slack
webhook integration), which adds credentials, configuration, and failure modes.
For a demo, in-app notifications (the bell icon with pending count) are
sufficient.

**When to build**: If the app is used by teams that don't check it daily, add
email summaries (e.g., "3 batches pending review") or Slack webhook
integration on batch completion.
