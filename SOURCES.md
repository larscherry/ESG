# Source Formats

## SAP Fuel & Procurement (`sap_fuel`)

### Real-world format researched
We examined SAP MM (Materials Management) inventory movement exports. The
actual SAP table is `MSEG` (material document segment), commonly exported via
transaction `MB51` or `MB5B`. Key columns:
- `MATNR` — material number
- `WERKS` — plant
- `MENGE` — quantity in base unit
- `MEINS` — base unit of measure
- `BUDAT` — posting date
- `MAKTX` — material description
- `MATL_GROUP` — material group
- `BWART` — movement type

### What we learned
SAP dates use `DD.MM.YYYY` format (not ISO). Quantities can be in any unit
the material master defines (L, KG, kWh, MWh, GAL, etc.). The same material
number can have different unit conventions across plants.

A real export often includes 50+ columns. We chose a subset because the
normalizer only needs: quantity → `MENGE`, unit → `MEINS`, date → `BUDAT`,
description → `material_description`/`MAKTX`, facility → `Plant`/`WERKS`.

### Sample data design
Our sample contains:
- 6 materials (diesel, natural gas, gasoline, kerosene, steam, lubricant oil)
- 3 plants (DE01, US01, FR01)
- 5 years × 12 months of data
- Edge cases: zero quantity, unknown plant (`UK01`, `NL01`, `CN01`), invalid
  unit (`GAL`), non-numeric quantity (`abc`), invalid date, abnormally high
  quantity (3,000,000 kWh steam), negative quantity

### What would break in production
1. **SAP column names**: Real SAP exports use German column names (`MENGE`,
   `BUDAT`) or English aliases depending on the user's SAP language setting.
   We handle both but don't handle all possible aliases (e.g., `Menge` vs
   `Quantity` vs `MENGE`).
2. **Multi-line cells**: SAP descriptions occasionally contain newlines. The
   CSV parser would fail or produce misaligned rows.
3. **Encoding**: SAP exports can use Latin-1 instead of UTF-8. We assume
   UTF-8 with BOM (`utf-8-sig`).
4. **Unit of measure**: SAP allows arbitrary user-defined units. Unknown units
   (`GAL`, `STK`, `T`) fall through to the normalizer's unit conversion table,
   which must be kept up to date.

---

## Utility Electricity (`utility_electricity`)

### Real-world format researched
We examined utility portal exports from providers like E.ON, Enel, and
Schneider Electric's Resource Advisor. The data varies wildly by provider but
commonly includes: meter ID, start/end date, usage (kWh or MWh), demand (kW),
and cost.

### What we learned
Utility data is the most inconsistent format across the three sources. Meter
IDs can be alphanumeric, dates can be US or European format, and the usage
column may have different names (`USAGE`, `Consumption`, `kWh`, `Usage (kWh)`).
Some providers send cumulative readings (reset monthly), others send
interval data (hourly or 15-minute).

### Sample data design
Our sample contains:
- 5 meters with varying usage patterns
- 5 years × 12 months of data
- Edge cases: missing usage (empty string), abnormally high usage
  (2,500,000 kWh), wrong unit (`MWh` instead of `kWh`), estimated readings
  flagged in notes

### What would break in production
1. **Multi-provider formats**: Each utility has a different CSV layout. A
   single `utility_electricity` source type can't handle all formats without a
   column-mapping configuration UI.
2. **Interval data**: Hourly data would generate unreviewable row counts
   (8,760 rows per meter per year). The current ingest flow doesn't batch
   interval data into monthly aggregates.
3. **Demand charges**: We only parse usage (kWh). Real electricity bills
   include demand (kW), power factor, and tariff components that affect
   emission calculations differently.

---

## Corporate Travel (`corporate_travel`)

### Real-world format researched
We examined SAP Concur, Chrome River, and Expensify exports. Common columns:
employee name, expense type, transaction date, amount, currency, and
type-specific fields (origin/destination for flights, check-in/out for hotels).

### What we learned
Travel data is the richest but most variable source. A single expense report
can contain flights, hotels, car rentals, meals, and miscellaneous fees — each
with different emission factors. Corporate card feeds often merge multiple
transactions into one line, making it hard to isolate individual emissions.

Flight emission calculations are especially complex because they depend on
aircraft type, seat class, load factor, and radiative forcing. We use distance
bands (<500 km, 500–1500 km, >1500 km) as a proxy, which is a common
simplification.

### Sample data design
Our sample contains:
- 5 employees with flight, hotel, car rental, rail, bus, and meal expenses
- 8 flight routes (short to long haul)
- Edge cases: hotel stays with varying lengths, different currencies (USD,
  EUR, GBP), car rental without distance (`Quantity: 1` means per-rental, not
  per-km)

### What would break in production
1. **Policy compliance**: Real travel systems include policy violations
   (out-of-policy bookings, missing receipts). Our system ignores policy data.
2. **Multi-currency conversion**: We treat `Amount` as the billed amount in
   the transaction currency but don't convert to a base currency for
   normalization. Emission factors assume the amount is in the factor's
   currency region.
3. **Hotel emission factors**: Hotel emissions depend on location, not just
   nightly rate. We use an average per-night factor, but a real system would
   look up the hotel's country or region.
4. **Car rental distance**: Most corporate card feeds don't include distance
   driven. We currently skip car rental emissions when `Quantity` is 1
   (per-rental) rather than a distance.
