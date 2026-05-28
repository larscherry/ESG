# Breathe ESG

A web application for ingesting, normalizing, reviewing, and analyzing environmental (carbon emissions) data from multiple sources — SAP MM (fuel/procurement), utility electricity portals, and corporate travel systems (Concur).

**Live URL:** https://breathe-esg-z0mb.onrender.com

---

## Quick Start

1. Open the live URL above in Chrome, Edge, or Firefox
2. Sign in with: **Username:** `analyst`, **Password:** `breathe2024`
3. You'll land on the **Dashboard** showing a summary of all data

---

## Dashboard

The Dashboard is your home screen. It shows four key numbers at the top:

- **Total Records** — how many rows of data have been imported across all sources
- **Total CO₂e** — the carbon footprint in metric tonnes, broken down by Scope 1, 2, and 3
- **Pending Review** — how many batches are waiting for you to check and approve
- **Data Quality** — what percentage of records failed validation

Below the summary, you'll find:

- **Emissions by Scope** — a visual breakdown of carbon by Scope 1 (direct), 2 (purchased energy), and 3 (value chain)
- **Ingestion Batches** — a table of every data import, its status, and pass/fail counts. Click any row to go to the Review page for that batch
- **Data Quality** — a mini report showing pass/fail/suspicious rates
- **Recent Activity** — a timeline of recent actions (uploads, approvals, etc.)

---

## Uploading Data

The Upload page lets you import CSV files from three supported data sources:

1. **SAP MM — Fuel & Procurement** — expects columns like Material, Plant, Menge (quantity), MEINS (unit), BUDAT (date), MATL_GROUP
2. **Utility Portal — Electricity** — expects Green Button format: Meter ID, TYPE, START DATE, END DATE, USAGE, UNITS, COST
3. **Concur — Business Travel** — expects: Employee, ExpenseType, TransactionDate, Amount, Currency, Origin, Destination

### How to upload:

1. Go to the **Upload** page (left sidebar, second icon)
2. Click one of the three source cards to select it
3. Drag and drop a CSV file onto the upload area, or click to browse
4. A preview of the first few rows will appear
5. Click **"Upload & Normalize"** — the system will:
   - Parse the CSV
   - Validate each row
   - Normalize units and dates
   - Calculate CO₂e using built-in emission factors
   - Flag any suspicious or invalid rows

After upload, you'll see a result summary showing how many rows passed, failed, or were flagged as suspicious. Click **"Review this batch"** to go directly to the review page.

### Sample files:

You can download sample CSV files from the Upload page to see the expected format.

---

## Reviewing Data

The Review page is where you check imported data before it's locked for audit.

### Getting started:

1. Select a **batch** from the dropdown at the top
2. Filter by **status** if you only want to see pending, approved, or flagged records
3. Use the **search** bar to find specific records

### Working with records:

- **Click a row** to expand it and see the full original record alongside the normalized values
- **Check the box** next to one or more records to perform batch actions
- Use the action bar that appears to **Approve**, **Reject**, or **Flag** selected records

### Batch actions:

- **Approve All** — approves every non-rejected record in the batch at once
- **Lock for Audit** — locks the entire batch so no further changes can be made (irreversible without an admin)

Each record shows:
- Scope (1/2/3) and category (e.g., Diesel, Grid Electricity, Flight)
- Activity date, facility, quantity, unit, and calculated CO₂e
- Current status (needs review / approved / rejected / flagged / locked)
- Expand to see the original raw data vs. normalized values side by side

---

## Analytics

The Analytics page gives you interactive charts to explore emissions data.

### Controls:

- **Year / Month** — filter by time period
- **Chart type** — choose between Bar, Pie, Line, or Area chart
- **Metric** — toggle between CO₂e (tonnes), Quantity, or Record Count
- **Group By** — break down data by Scope, Category, Source Type, Year, Month, or Status

Use these controls to answer questions like:
- "What are our total emissions this year?"
- "Which category (diesel, electricity, flights) contributes the most?"
- "How do emissions trend month over month?"

The summary box at the top shows total records and total CO₂e for the current filter selection.

---

## Tips & Best Practices

- **Upload one source type at a time** — each CSV should match exactly one source (SAP, Utility, or Concur)
- **Check failed records** after every upload — they indicate format issues or missing required columns
- **Review batches promptly** — data stays editable until you lock it
- **Use status filters** on the Review page to focus on records that need attention
- **Approve records** once you've verified they look correct
- **Lock the batch** only after all records are finalized — this is the audit-ready state
- **Exploratory analysis** on the Analytics page is available at any time, even while data is still being reviewed

---

## Troubleshooting

### "Invalid credentials" when logging in
Make sure you're using **analyst** / **breathe2024** (all lowercase).

### Upload fails
- Confirm your CSV matches the expected columns for the selected source
- Check that the file is a `.csv` (not `.xlsx` or `.txt`)
- Keep files under 10 MB

### Page doesn't load
Try a hard refresh (Ctrl+F5 on Windows, Cmd+Shift+R on Mac) to clear any cached files.

---

## Need Help?

Contact your system administrator or open a ticket in the project repository.
