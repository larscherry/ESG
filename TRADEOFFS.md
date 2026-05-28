# Tradeoffs: Three Things Deliberately Not Built

## 1. PDF Bill Parsing for Utility Data

**What it would do**: Accept uploaded PDF utility bills, extract meter readings, usage amounts, billing periods, and tariff information via OCR and template matching.

**Why not built**: PDF parsing is a horizontal product problem, not a vertical integration problem. Each utility formats their PDF differently — there is no standard. A parser that handles PECO's PDF will break on SCE's, and vice versa. The effort to build a reliable utility PDF parser (10-20 formats minimum for meaningful coverage) exceeds the effort of the entire rest of the application.

**What I'd do instead**: Focus on Green Button CSV, which covers ~80% of commercial utility data access today. For the remaining 20% where only PDF is available, the correct answer is either: (a) ask the utility to enable CSV export (most will for commercial accounts), or (b) use a third-party service like Arcadia or UtilityAPI that normalizes utility data across hundreds of providers.

**What I'd ask the PM**: "Are any of our clients' utilities PDF-only for commercial accounts? If yes, let's scope which ones and budget for a dedicated PDF pipeline, possibly using a vendor."

## 2. Real-Time API Polling for Concur/Navan

**What it would do**: Continuously poll the Concur Expense API or Navan API for new/submitted expense reports, ingest them automatically, and surface them for review without manual file upload.

**Why not built**: The standard T&E-to-ERP integration pattern is batch, not real-time. Concur's own documentation shows the primary integration path as "Standard Accounting Extract (SAE)" — a scheduled batch export to CSV. Navan similarly offers SFTP-based batch exports. Real-time polling adds:
- OAuth token management with refresh cycles
- Rate limiting and pagination handling
- Webhook callback receivers (if available)
- Error handling for partial API failures
- State management for which records have been seen

None of this complexity benefits the analyst. Daily batch ingestion via CSV upload is the same result with dramatically less infrastructure. If the PM confirms sub-day latency requirements, we'd build API integration — but only for the specific platform(s) needed.

**Compromise**: The "Upload" page accepts CSV files that can be manually exported from any T&E platform. The CSV schema matches what Concur and Navan actually produce, so the workflow is: analyst exports from Concur → uploads to Breathe → reviews → approves.

## 3. Automated Emission Factor Updates

**What it would do**: Periodically fetch the latest DEFRA, EPA eGRID, or IPCC emission factors and automatically update the factor table, then recalculate CO2e for all affected records.

**Why not built**: Emission factors changing silently under locked records is an audit nightmare. If a factor changes and CO2e values shift, an auditor needs to know: which values used which factor, when the factor was updated, and whether locked records should be recalculated. The correct accounting treatment is:

- Locked records keep the factor that was valid at the time of locking (point-in-time calculation)
- Updated factors apply only to new records
- If a new factor is materially different, the analyst should be notified and decide whether to recalculate

This is a policy decision, not a technical one. Building the auto-updater without the policy framework creates more problems than it solves.

**Compromise**: Factors are stored in the DB with valid_from/valid_to dates. The admin can import new factors manually via the Django admin. All CO2e calculations log which factor version was used (via the factor's DB ID). A future "recalculate" feature would create new NormalizedRecord versions with a clear audit trail.
