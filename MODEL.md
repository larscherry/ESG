# Data Model

## Core Entities

### Organization (multi-tenancy)
Every record is scoped to an `Organization`. This is the top-level tenant boundary. In production, every API call would be authenticated and scoped to an org; in the prototype, the org is selected implicitly from the DataSource.

### DataSource
Represents a configured data pipeline: SAP fuel, utility electricity, or corporate travel. Stores the `source_type` which determines the normalizer used during ingestion. The `config` JSON field would hold API endpoints, credentials, or schedule settings in production.

### IngestionBatch
A batch is one upload event. Tracks status through: `importing` → `staged` → `reviewing` → `approved` → `locked`. Counts passed/failed/suspicious rows at ingestion time so the dashboard doesn't need to recompute.

### SourceRecord (immutable)
The raw parsed row from the CSV, stored as `raw_data` (JSON). This is never modified — it is the source of truth for what was actually uploaded. The `raw_quantity`, `raw_unit`, `raw_date` fields are extracted during ingestion for quick reference but the full original row lives in `raw_data`.

Fields:
- `status`: staged | passed | failed | suspicious
- `failure_reasons`: list of error strings for failed records
- `validation_warnings`: list of warning strings for suspicious records

**Why immutability matters**: In an audit, you must be able to prove that the normalized record corresponds to an actual source document. If we allowed editing SourceRecords, an auditor could never trust the chain of custody.

### NormalizedRecord (derived, versioned)
The output of the normalization pipeline. One SourceRecord produces one NormalizedRecord. Fields:

- **Scope & Category**: Determined by the normalizer based on source type and content. Scope 1 = direct fuel burn, Scope 2 = purchased electricity, Scope 3 = business travel & procurement.
- **Quantity & Unit**: Normalized to standard units (liters, kWh, km, nights).
- **CO2e**: Computed using emission factors from the `EmissionFactor` table.
- **raw_values**: Snapshot of key raw fields for the diff view in the UI.
- **Status**: needs_review → approved/rejected/flagged → locked.
- **Version**: Increments on edit (not yet implemented — would be triggered by analyst correcting a value).

### EmissionFactor
Separate table decoupling factors from code. Each factor has a category, region, valid_from/valid_to date range, and source citation (e.g., "DEFRA 2024"). This means:
- Factors can be updated without a deploy
- Multiple regions can coexist (US eGRID vs EU JRC)
- Historical factors are preserved for point-in-time recalculation

### UnitConversion
Maps raw units to normalized units. For example, GAL → L (×3.78541), MWh → kWh (×1000), KG → kWh for natural gas (×13.6). Separated from code so new units can be added without a deploy.

### AuditLog
Every action that changes state is logged: batch created, record approved, batch locked, etc. The `changes` JSON field captures what changed. This is the audit trail an external auditor would review.

## Relationship Diagram

```
Organization
  └─ DataSource (sap_fuel | utility_electricity | corporate_travel)
       └─ IngestionBatch (one upload = one batch)
            ├─ SourceRecord (raw, immutable)
            └─ NormalizedRecord (derived, status-tracked, versioned)
  └─ EmissionFactor (lookup)
  └─ UnitConversion (lookup)
  └─ AuditLog (all state changes)
```

## Key Design Decisions in the Model

**Why separate SourceRecord and NormalizedRecord instead of one table?**
Two-table design preserves provenance. The SourceRecord is the receipt — it proves a row existed in the source file. The NormalizedRecord is the interpretation. If the normalization logic changes, old batches can be re-normalized from the source data without re-uploading.

**Why denormalize raw_values onto NormalizedRecord?**
The diff view needs to show "before" and "after" side by side. Rather than joining back to SourceRecord on every page load (which requires a JSON field extract), we snapshot the relevant raw fields onto the NormalizedRecord at creation time. This is a read-optimization for the analyst's primary workflow.

**Why soft locks instead of hard locks?**
Hard write-once locks require a migration to reverse. Soft locks (a status flag with audit logging) let an admin unlock with a traceable reason. In practice, auditors want to see who unlocked and why, not that unlocking is impossible.

**Why emission factors in the DB instead of code?**
Emission factors change annually (DEFRA publishes new factors each year). Hardcoding them means a deploy for every factor update. Storing them with date ranges means we can retrospectively calculate CO2e using the factor that was valid at the activity date, which is the correct accounting practice.
