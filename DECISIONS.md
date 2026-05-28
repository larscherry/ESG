# Decisions

## Architecture

### Session auth over tokens
We chose Django session authentication with httpOnly cookies instead of the
original TokenAuthentication + localStorage. Reason: httpOnly cookies are
inaccessible to JavaScript, eliminating XSS token theft. The tradeoff is that
SPA requests need CSRF token handling, which we added via `X-CSRFToken` header.

**What I'd ask the PM**: "Do any external systems (scripts, API clients) need
token-based access? If so, we should keep TokenAuthentication as a secondary
option for API keys while keeping session auth for the browser SPA."

### ReadOnlyModelViewSet over permission classes
We restricted API surface to read-only by default (`ReadOnlyModelViewSet` on
all data views) rather than implementing per-object permission classes. Reason:
safer to limit what any user can do than to trust permissions are configured
correctly. Write actions (upload, approve, reject, flag, lock, batch actions)
are gated behind explicit `@action` endpoints.

**What I'd ask the PM**: "Is there a business need for users to edit records
in bulk (e.g., edit quantity or category)? We'd need additional endpoints and
a UI for inline editing."

### Organization query param → request.organization middleware
The original design let clients pass `?organization=` to scope queries. We
replaced this with a middleware that reads the user's organization from their
`UserProfile` and sets `request.organization`. Reason: a client-supplied org ID
makes multi-tenant isolation a frontend responsibility, which is a security
risk. The middleware approach guarantees isolation at the server level.

**What I'd ask the PM**: "Should superusers/staff be able to impersonate other
organizations for support purposes? If yes, we can add an admin override that
only staff can use."

### Emission factor DB-first, hardcoded fallback
`get_emission_factor()` queries the `EmissionFactor` table first, then falls
back to a hardcoded dict in `_FALLBACK_EMISSION_FACTORS`. Reason: admins can
update factors via Django admin without deploying code, but the hardcoded
fallback guarantees the app never returns a 500 if the table is empty.

**What I'd ask the PM**: "Should we add a versioning/review workflow for
emission factor changes? Currently an admin can change a factor silently and
all historical calculations are affected."

---

## Source Parsing

### Which fields we handle from each source

| Source | Handled | Ignored |
|--------|---------|---------|
| **sap_fuel** | `Material`, `Menge`, `MEINS`, `BUDAT`, `material_description`, `Plant`, `MAKTX`, `MATL_GROUP`, `movement_type` | `SGTXT`, `CHARG`, `BWTAR`, `WERKS` (plant is used, `WERKS` is an alias) |
| **utility_electricity** | `Meter ID`, `TYPE`, `START DATE`, `END DATE`, `USAGE`, `UNITS` | `COST`, `NOTES` (stored in raw_data but not parsed) |
| **corporate_travel** | `Employee`, `ExpenseType`, `TransactionDate`, `Amount`, `Currency`, `Origin`, `Destination`, `Description`, `Quantity`, `Nights` | `CheckIn`/`CheckOut` (hotel dates stored but not parsed separately), `Meals` expense types |

We extract the minimum set of fields needed to determine: quantity, unit, date,
description, and (for travel) origin/destination. All other fields are
preserved in `raw_data` JSONField for future use.

### Flight distance estimation
We use a hardcoded lookup table of ~50 known airport pairs (e.g., JFK→LHR =
5,550 km) rather than querying a geocoding API. Reason: offline-capable, no
API costs, instant. Pairs not in the table use a fallback category.

**What I'd ask the PM**: "Should we integrate a flight distance API like
Great Circle Mapper or Google Maps for unknown routes? This would improve
accuracy but add latency and cost."

### Date parsing
We accept `YYYY-MM-DD`, `DD.MM.YYYY`, `MM/DD/YYYY`, and `MONTH YYYY` (German
abbreviations like "Jan 2024"). The original SAP sample used month-only dates
(`01.2024`), which we changed to `01.01.2024` in the sample data because
month-only dates cannot be accurately placed without assuming day 1.

**What I'd ask the PM**: "How should we handle dates with only month and year?
Assume day 1, or flag them for manual review?"

---

## Frontend

### Local state over Redux/Zustand
The app uses React `useState`/`useEffect` for all state management. No global
store. Reason: the app has one primary user flow (upload → review → approve)
with minimal cross-page state. A store would add complexity without benefit at
this scale.

**What I'd ask the PM**: "If the app grows to support multi-user collaboration
(live notifications, shared filters), we should introduce a state management
solution."

### Recharts over Chart.js/D3
We chose Recharts for the analytics dashboard. Reason: it's React-native,
declarative, and covers the chart types we need (bar, line, pie) without
wrapping an imperative library.

---

## Deployment

### Render free tier over AWS/GCP
We target Render's free tier (Python + PostgreSQL). Reason: zero-cost hosting,
built-in PostgreSQL, automatic HTTPS, and simple `render.yaml` blueprint. The
tradeoff is a 15-minute idle spin-down and 512 MB RAM limit.

**What I'd ask the PM**: "Is the 15-second cold start acceptable for a demo,
or should we budget for a paid tier ($7/mo basic) that eliminates it?"

### build.sh compiles frontend inside Python environment
The `build.sh` script installs Node via nvm, runs `npm ci`, builds the Vite
frontend, then collects static files. Reason: single build command, no separate
frontend hosting needed. The compiled assets are served by Django/Whitenoise.

**What I'd ask the PM**: "For a production deployment with higher traffic,
consider splitting frontend (Vercel/Netlify) and backend (Render/Fly) for
independent scaling."
