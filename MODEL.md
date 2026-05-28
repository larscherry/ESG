# Data Model

## Overview

Eight models supporting a multi-tenant ESG data ingestion, normalization, and audit platform.

```
Organization ──┬── DataSource ── IngestionBatch ──┬── SourceRecord
               │                                   └── NormalizedRecord
               ├── AuditLog
               └── UserProfile (→ User)

EmissionFactor (global, no org)
UnitConversion (global, no org)
```

---

## Multi-Tenancy

Each `UserProfile` links a Django `User` to exactly one `Organization`. Middleware
sets `request.organization` on every request, and every viewset filters its
queryset by that org. Staff users can see all orgs.

---

## Models

### Organization

| Field | Type | Notes |
|-------|------|-------|
| `name` | CharField | Display name |
| `slug` | SlugField, unique | URL-safe identifier |
| `created_at` | DateTimeField, auto | |

Granularity: a company/tenant. A single-org deployment has one row; multi-tenant
adds rows per customer.

### UserProfile

| Field | Type | Notes |
|-------|------|-------|
| `user` | OneToOneField → User | |
| `organization` | ForeignKey → Organization | |

Enforces which org a user sees. Created by `seed_sample_data`.

### DataSource

| Field | Type | Notes |
|-------|------|-------|
| `organization` | ForeignKey → Organization | Scoping |
| `source_type` | CharField | `sap_fuel`, `utility_electricity`, `corporate_travel` |
| `name` | CharField | Human-readable label |
| `config` | JSONField, default={} | Extensible per-source config |

A source is a named integration (e.g. "SAP MM – Fuel & Procurement"). Each
source belongs to one org.

### IngestionBatch

| Field | Type | Notes |
|-------|------|-------|
| `source` | ForeignKey → DataSource | |
| `status` | CharField | `importing` → `staged` → `approved`/`locked` |
| `total_records` | IntegerField | |
| `passed_count` | IntegerField | Passed normalization |
| `failed_count` | IntegerField | Failed normalization |
| `suspicious_count` | IntegerField | Flagged as suspicious |
| `uploaded_by` | CharField | Username from request |

A batch is one file upload. The status lifecycle tracks review progress.

### SourceRecord

| Field | Type | Notes |
|-------|------|-------|
| `batch` | ForeignKey → IngestionBatch | |
| `row_number` | IntegerField | 1-based line in CSV |
| `raw_data` | JSONField | Full original row (every column preserved) |
| `data_source` | CharField | Source type denormalized for query performance |
| `raw_quantity`, `raw_unit`, `raw_date`, `raw_description` | CharField/TextField | Pre-parsed raw values |
| `status` | CharField | `staged`, `passed`, `failed`, `suspicious` |
| `failure_reasons` | JSONField, default=[] | |
| `validation_warnings` | JSONField, default=[] | |

The "source of truth" row – immutable snapshot of what the CSV contained.
Every normalization result links back here via `NormalizedRecord.source_record`.

### NormalizedRecord

| Field | Type | Notes |
|-------|------|-------|
| `source_record` | ForeignKey → SourceRecord, nullable | Links to raw origin |
| `batch` | ForeignKey → IngestionBatch | |
| `organization` | ForeignKey → Organization | Denormalized for query performance |
| `scope` | IntegerField | 1, 2, or 3 |
| `category` | CharField | `diesel`, `grid_electricity`, `flight_short`, etc. |
| `source_type` | CharField | Denormalized |
| `activity_date` | DateField | |
| `facility` | CharField | |
| `description` | TextField | |
| `quantity` | DecimalField(20,6) | Normalized to base unit |
| `unit` | CharField | Normalized unit string |
| `co2e` | DecimalField(20,6), nullable | Calculated CO₂ equivalent |
| `co2e_unit` | CharField, default=`tonnes_CO2e` | |
| `metadata` | JSONField | Extensible |
| `raw_values` | JSONField | Snapshot of raw values for diff view |
| `status` | CharField | `needs_review`, `approved`, `rejected`, `flagged`, `locked` |
| `version` | IntegerField, default=1 | Bumped on every status change |
| `reviewed_by` | CharField | Username |
| `reviewed_at` | DateTimeField, nullable | |
| `rejection_reason` | TextField | |

**Source-of-truth tracking**: Each record has `source_record → SourceRecord → batch → source`, giving a complete provenance chain (`source → batch → source_record → normalized_record`). The `version` field increments on each status change, and `AuditLog` records every transition.

**Scope categorization**: `scope` is assigned during normalization based on the emission category (Scope 1: direct fuel burn; Scope 2: purchased electricity; Scope 3: flights, hotels, rental cars).

### AuditLog

| Field | Type | Notes |
|-------|------|-------|
| `organization` | ForeignKey → Organization | |
| `action` | CharField | `batch_created`, `record_approved`, `record_flagged`, etc. |
| `actor` | CharField | Username |
| `record_type` | CharField | Model name |
| `record_id` | IntegerField, nullable | |
| `changes` | JSONField, default={} | `{old_status, new_status}` on status transitions |
| `description` | TextField | Human-readable summary |
| `created_at` | DateTimeField, auto | |

Every user action (upload, approve, reject, flag, lock) creates an audit log entry. The `changes` field captures the before/after for status transitions.

### EmissionFactor

| Field | Type | Notes |
|-------|------|-------|
| `category` | CharField | Matches NormalizedRecord.category |
| `scope` | IntegerField | |
| `region` | CharField | `GLOBAL`, `US`, `EU`, `UK` |
| `factor` | DecimalField(20,10) | tonnes CO₂e per unit |
| `factor_unit` | CharField | e.g. `tonnes_CO2e_per_liter` |
| `source` | CharField | e.g. `DEFRA 2024` |
| `valid_from` / `valid_to` | DateField | Temporal validity |

Factors are queried by `(category, region, valid_date)` with a hardcoded dict fallback if the DB table is empty.

### UnitConversion

| Field | Type | Notes |
|-------|------|-------|
| `from_unit` | CharField | |
| `to_unit` | CharField | |
| `factor` | DecimalField(20,10) | |
| `category` | CharField, blank | Optional restriction to emission category |

Used during normalization to convert raw units (GAL → L, MWh → kWh, etc.) to the canonical unit for the emission factor lookup.

---

## Why This Model

1. **Multi-tenancy**: Organization FK on every scoped model + UserProfile link → data never leaks between tenants.
2. **Source-of-truth**: SourceRecord preserves the raw CSV row immutably; NormalizedRecord tracks provenance via `source_record`. Edits are logged, not overwritten.
3. **Audit trail**: Every status transition is logged with before/after values.
4. **Unit normalization**: UnitConversion table + fallback dict allows admin overrides without code changes.
5. **Versioning**: `NormalizedRecord.version` on every status change enables "what changed and when" reporting.
