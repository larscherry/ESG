# Source Research

## Source 1: SAP Fuel & Procurement Data

### Format Researched
SAP transaction **MB5B (Stocks for Posting Date)** with ALV grid output exported to spreadsheet/CSV.

### What I Learned
SAP MM (Materials Management) tracks inventory movements through material documents. Transaction MB5B (report RM07MLBD) displays opening stock, receipts, issues, and closing stock for a given date range. The output can be saved as a spreadsheet from the SAP GUI. Key tables involved:

- **MSEG**: Material document segment — every inventory movement (receipt, issue, transfer) produces one row
- **EKPO**: Purchasing document item — procurement details per purchase order line
- **MARAM**: Material master general data
- **T156S**: Movement type definitions

Real-world complications:
- Column headers can be German (Werk = Plant, Buch.datum = Posting Date, Menge = Quantity, MEINS = Base Unit of Measure)
- Plant codes are internal SAP codes (DE01, US01) that mean nothing without a lookup table
- Units are inconsistent (L for diesel, GAL for imported fuel, kWh for natural gas, KG for some materials)
- Movement types determine whether a row is a receipt (101, 102) or an issue (261, 321)
- Material groups categorize items (FUEL, RAW, HALB, FERT, etc.)
- Dates use DD.MM.YYYY format by default in German-language configurations

### Sample Data Rationale
The sample SAP CSV includes:
- Diesel in liters (L) — the common unit for distillate fuel
- Natural gas in kWh (direct energy purchase) and KG (mass-based, converted)
- Gasoline in gallons (GAL) — US plants measure fuel in gallons, not liters
- Kerosene in liters — jet fuel/industrial kerosene
- Procurement items (steel brackets in STK, lubricant in KG) — non-fuel materials that still get spend-based Scope 3 emissions
- A German-header row (Werk/Buch.datum) to test the normalizer's header detection
- A zero-quantity row (movement reversal)
- A non-numeric quantity row (data entry error)
- An extremely large quantity (Steam — 3,000,000 kWh — to trigger the suspicion rule)
- A row with an invalid date

### What Would Break in Real Deployment
- **Plant code mapping**: Real plant codes must map to facility names and locations. Without a lookup table (e.g., via a Plant master data import), the facility field shows raw SAP codes.
- **Movement type filtering**: Not all movement types should be included. A real deployment needs movement type allowlist configuration. Reversals (102, 262) can cause double-counting if not properly filtered.
- **Material group to emission category mapping**: The normalizer uses keyword matching (mat_desc contains "DIESEL"). A real deployment needs a proper mapping table (e.g., material group 0001 → diesel).
- **Multi-currency values**: The MB5B shows stock values in local currency. Multi-company-code SAP instances have different currencies.
- **Volume corrections**: Fuel volume changes with temperature. SAP's Oil & Gas module (IS-OIL) handles temperature-corrected volumes. Our prototype assumes standard temperature.

## Source 2: Utility Electricity Data

### Format Researched
**Green Button Download My Data** CSV format, as implemented by PECO (PA), SCE (CA), BGE (MD), and the ESB Networks (Ireland) HDF format.

### What I Learned
Green Button is a US-standard utility data export format, established by the Obama administration's "Green Button" initiative. It's supported by most major US utilities. Key research findings:

- PECO (Pennsylvania): Exports hourly interval data CSV with columns TYPE, DATE, START TIME, END TIME, USAGE (kWh), NOTES. Estimated reads flagged with asterisk.
- SCE (Southern California Edison): Exports pipe-delimited CSVs with 15-min interval data, daily billing data, and monthly summaries. Columns include Mtr_Id, Rdng_Value (watts), BillPer_Strt_Dt, BillPer_End_Dt, Mnthly_Cnsum.
- BGE (Baltimore Gas & Electric): Supports CSV and XML exports for monthly usage, 15-min interval, and hourly interval data.
- ESB Networks (Ireland): Smart meter HDF format — 30-min readings in calculated kWh, with MPRN, Meter Serial Number, Read Value, Read Type (Active Import/Export), Read Date and End Time.
- Oracle Utility Opower: Enterprise Green Button implementation with columns TYPE, START DATE, END DATE, USAGE, UNITS, COST, NOTES.

Common columns across all: Meter ID / Usage Point ID, date range (start/end), energy usage, units (always kWh in Green Button), cost, and an estimated-read flag.

### Sample Data Rationale
The sample utility CSV includes:
- Monthly billing periods (not calendar months — e.g., Jan 1-31, Feb 1-28) reflecting real billing cycles
- Two meters (MTR-001 with typical 40-65 MWh/month for a mid-size facility, MTR-002 with 115-135 MWh/month for a larger facility)
- A small meter (MTR-003 at 8.5 MWh/month — small office)
- An estimated reading flagged in the NOTES column
- A row with missing usage (data gap)
- A row with MWh units instead of kWh (unit mismatch)

### What Would Break in Real Deployment
- **Interval data**: Real utilities offer 15-min or hourly interval data, which has different structure than monthly billing data. Our normalizer handles only monthly billing periods.
- **Time-of-use tariffs**: Many commercial tariffs have peak/off-peak splits. Green Button can include TOU rates, but our model doesn't track tariff-specific consumption.
- **Multiple fuels**: Gas and electric come in the same export format. Our normalizer assumes electricity.
- **Meter count**: Large facilities have dozens of meters. The dashboard needs aggregation by facility.
- **Solar export**: Customers with solar panels have negative readings (net metering). Our normalizer treats all usage as positive.

## Source 3: Corporate Travel Data

### Format Researched
**SAP Concur Expense Extract** (v4 API and CSV extract) and **Navan/TripActions** expense API.

### What I Learned
SAP Concur dominates the corporate T&E market. The expense data model:

- **Report**: Top-level container for a trip or expense submission. Has approval status, payment status, total.
- **Expense Entry**: Individual expense line item. Fields include ExpenseType (AIRFR=airfare, HOTEL=hotel, CAR=car rental, BUSML= mileage, MEALS=meals), TransactionAmount, TransactionDate, CurrencyCode, LocationName, LocationCountry, VendorDescription.
- **Itemization**: Optional breakdown of a single expense (e.g., individual days in a hotel stay).
- **Journey**: Mileage-specific data with distance and route.

Navan (TripActions) has a similar structure with the Navan Expense API. Key fields: amount, category, merchant, transaction date, employee, custom fields (project codes, cost centers).

Real-world data issues:
- Expense types are platform-specific codes that need mapping to emission categories
- Airfare expenses don't always include origin/destination — sometimes just the total cost
- Hotel expenses don't always include number of nights
- Currency varies (some reports mix USD and local currency without conversion)
- Distances aren't given — you infer from airport codes or use spend-based estimation
- Itemization is optional, so a "flight" expense might include taxes and fees without separate breakdown

### Sample Data Rationale
The sample travel CSV includes:
- Flights with airport codes (JFK, LHR, SFO, ORD, LAX, NRT) enabling distance lookup from the known pairs table
- Hotel stays with check-in/check-out dates → nights count (3 nights in London, 5 in Tokyo)
- Car rentals with days count → estimated km/day
- Rail with explicit distance (TGV Paris-Lyon, 465km)
- Bus with distance (Tokyo-Yokohama, 30km)
- A meals expense (no travel category → spend-based estimation)
- Unknown airport pairs (SFO-ORD not in lookup table → estimated 1000km with warning)

### What Would Break in Real Deployment
- **Airport code coverage**: Only 8 airport pairs are in the lookup table. Real deployment needs a comprehensive airport distance database (e.g., OpenFlights airport data).
- **Route inference**: A flight JFK→LHR is straightforward. Multi-segment itineraries (JFK→LHR→FRA) require parsing connection logic.
- **Hotel night counting**: The prototype reads "Nights" as a column. Real Concur data needs either itemization (per-night costs) or explicit night counts from travel booking data.
- **Currency conversion**: All sample data uses USD. Real data mixes currencies (GBP for UK hotels, EUR for European rail). CO2e calculations don't need currency, but spend-based estimates do.
- **Employee anonymization**: The prototype uses employee names. Real deployment would anonymize PII or use employee IDs.
- **Car rental actual distance**: The prototype defaults to 50km/day. Real car rental emissions depend on actual distance driven, vehicle class, and fuel type — none of which are in standard Concur extracts.
