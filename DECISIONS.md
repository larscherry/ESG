# Decisions

## 1. Ingestion Mechanism: CSV Upload for All Three Sources

**Chosen**: File upload (CSV) via Django REST endpoint.

**Why**: All three sources in the real world expose data through export mechanisms that produce structured files. SAP exports via MB5B/ALV grid to spreadsheet. Utility portals support Green Button CSV download. Concur/Navan provide scheduled CSV extracts via SFTP. An API-first approach would require OAuth credentials, per-provider integration code, and rate-limit handling — all irrelevant in a prototype where we control the data.

**What I'd ask the PM**: "Do any of these sources require real-time ingestion, or is daily batch sufficient? If batch, CSV is fine. If real-time, we need API integration and that changes the timeline."

## 2. SAP Export Format: MB5B Flat File (CSV)

**Chosen**: Model the SAP data as a CSV export from transaction MB5B (Stocks for Posting Date).

**Why**: MB5B is the standard SAP MM transaction for inventory movements over time. It exports as an ALV grid that can be saved as spreadsheet/CSV. This is how hundreds of SAP shops send data to non-SAP systems. IDocs are more structured but require EDI middleware setup. OData requires S/4HANA or SAP Gateway. BAPIs require RFC calls. The flat file is the lowest-friction integration pattern and matches what Breathe ESG would actually receive from a client.

**Subset handled**:
- Movement types 101 (goods receipt), 102 (reversal), 261 (goods issue to cost center), 321 (bulk fuel issue to plant)
- Materials with material groups FUEL, NG, MFG, UTIL
- German column headers (Werk, Buch.datum) and English (Plant, BUDAT)
- Units: L, GAL, KG, kWh, STK

**Ignored**: Batch management, serial numbers, pipeline materials, consignment stock, customs/MID codes, WM-linked movements. These add complexity without changing the carbon calculation.

## 3. Utility Format: Green Button CSV (US Standard)

**Chosen**: Model utility data after the Green Button Download My Data CSV format.

**Why**: Green Button is the de facto standard for US utility data export, mandated by many state PUCs. PECO, SCE, BGE, and dozens of other utilities support it. The format is simple: meter ID, start/end date, usage, units, cost, and optional notes flagging estimated readings.

**Why not PDF**: PDF parsing is fragile per-utility format, requires OCR, and produces uncertain results. Every utility formats their PDF differently. CSV is the correct ingestion path for commercial accounts; PDF is what you fall back to for residential where portals don't exist.

**Why not API**: Very few utilities offer APIs for customer usage data, and those that do (e.g., Oracle Utility Opower) require separate integration contracts.

**Billing periods handled**: Monthly billing cycles that don't align with calendar months (modeled as start/end date pairs). Interval data (hourly/15-min) would be a future addition.

## 4. Corporate Travel Format: Concur Expense CSV

**Chosen**: Model travel data after a Concur expense report extract CSV.

**Why**: Concur dominates corporate T&E. Its expense extract (available via SAE or Financial Integration API) produces CSV files with expense type codes (AIRFR, HOTEL, CAR, BUSML), transaction amounts, dates, and optional origin/destination. Navan (TripActions) similarly supports CSV extracts via SFTP.

**Categories handled**:
- Airfare (AIRFR) → flight emission categories based on distance
- Hotel (HOTEL) → per-night emission factor
- Car rental (CAR_RENTAL) → estimated daily km
- Rail (RAIL) → per-km emission factor
- Bus (BUS) → per-km emission factor
- Meals/Other → spend-based estimation fallback

**Distance estimation**: Airport pairs (JFK→LHR) use lookup table. Unknown pairs default to 1000km with a warning. Car rental defaults to 50km/day. These are flagged as "estimated" for analyst review.

## 5. Emission Factors: Embedded in Code (Not DB in Prototype)

**Chosen**: Hardcoded factor dictionary in the normalizer, backed by a DB table for reference.

**Why**: The model has an EmissionFactor table, but the normalizer uses a hardcoded dict for speed and reliability. In production, the normalizer would query the DB. For the prototype, dict lookup is deterministic and avoids N+1 queries during batch ingestion.

**Factors used**: DEFRA 2024 (UK government conversion factors) for fuels and travel, EPA eGRID 2023 (US average) for grid electricity. These are the two most widely accepted factor sources in corporate carbon accounting.

## 6. Unit Normalization: SI Base Units + Domain Units

**Chosen**: Normalize to liters (volume), kWh (energy), km (distance), nights (hotel), tonnes CO2e (emissions).

**Why**: These are the units used by emission factor databases. DEFRA publishes in litres and kWh. EPA eGRID publishes in kWh. Why reinvent: the carbon accounting industry has settled on these units.

**Conversion approach**: Simple multiplication factors in the UNIT_NORMALIZATION_MAP dict. Natural gas in kg gets converted to kWh using 13.6 kWh/kg (a standard calorific value). This is flagged as a conversion warning so the analyst can verify.

## 7. Suspicion Detection: Rule-Based

**Chosen**: A set of hardcoded rules that flag records.

**Why**: ML-based anomaly detection would be overengineered for known data quality issues. The rules target things we know are common in carbon data: wrong units (kWh for fuel), impossible quantities, estimated meter readings, impossible airport pairs, German date formats.

**Rules implemented**:
- Fuel records with energy units → suspicious
- Extremely large quantities → suspicious
- Estimated meter readings (from utility notes column) → suspicious
- Unknown airport pairs → suspicious
- Category/distance mismatch (short-haul label on long-haul distance) → suspicious
- DD.MM.YYYY date format → suspicious (German export indicator)

## 8. Review Workflow: Two-Level

**Chosen**: Individual record actions + batch-level actions.

**Why**: Some batches are clean and can be approved in one click. Others have individual problematic rows that need per-row treatment. The two-level workflow handles both: batch approve for clean SAP runs, per-row reject for the one bad row in a utility upload.

**Locking**: Batch-level lock transitions all non-rejected records to "locked". Individual lock is also supported. A locked record can be unlocked (logged in audit trail) but not edited — editing would require creating a new version.

## 9. Frontend: React SPA with Django Serving the Build

**Chosen**: Single-page React app in /frontend, built to dist/, served by Django as static files via WhiteNoise.

**Why**: Avoids CORS issues in production (same origin). Simplifies deployment to a single server. The build step runs at deploy time.

**Why not Next.js/Gatsby**: Overkill for a dashboard with 3 pages. Vite + React is faster to build and deploy.

## 10. Authentication: None in Prototype

**Chosen**: No authentication. The API is open.

**Why**: Authentication adds a signup/login flow, password management, and session handling that is orthogonal to the data model and ingestion pipeline. The prototype focuses on the core value: ingesting, normalizing, and reviewing carbon data.

**What I'd add in production**: API key authentication for the upload endpoint (mapped to an Organization), Django session auth for the web UI, and role-based access (analyst vs auditor vs admin). All of these are Django/REST framework built-ins that bolt on without changing the data model.
