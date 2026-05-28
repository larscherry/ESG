import csv, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))
os.environ['DJANGO_SETTINGS_MODULE'] = 'breatheesg.settings'

import django
django.setup()

from ingestion.management.commands.seed_sample_data import SAP_ROWS, UTILITY_ROWS, TRAVEL_ROWS

def write_csv(path, rows):
    if not rows: return
    keys = set()
    for r in rows: keys.update(r.keys())
    keys = list(keys)
    with open(path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, '') for k in keys})
    print(f'Wrote {len(rows)} rows to {path}')

base = os.path.join(os.path.dirname(__file__), 'sample_data')
os.makedirs(base, exist_ok=True)
write_csv(os.path.join(base, 'sap_fuel_export.csv'), SAP_ROWS)
write_csv(os.path.join(base, 'utility_green_button.csv'), UTILITY_ROWS)
write_csv(os.path.join(base, 'concur_travel_export.csv'), TRAVEL_ROWS)
