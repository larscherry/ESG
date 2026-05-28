import csv
import io
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction
from rest_framework.authtoken.models import Token

from ingestion.models import (
    Organization, DataSource, IngestionBatch,
    SourceRecord, NormalizedRecord, EmissionFactor,
    UnitConversion, AuditLog,
)
from ingestion.normalizer import normalize_batch


YEARS = [2020, 2021, 2022, 2023, 2024]
MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]


def _gen_sap_rows():
    rows = []
    materials = [
        ('30003543', 'Diesel', 'FUEL', '321'),
        ('30003544', 'Natural Gas', 'NG', '101'),
        ('30003545', 'Gasoline', 'FUEL', '321'),
        ('30003546', 'Kerosene', 'FUEL', '321'),
        ('30003547', 'Steam', 'UTIL', '101'),
        ('40000001', 'Lubricant Oil', 'MFG', '101'),
    ]
    plants = ['DE01', 'US01', 'FR01']
    base = 1000
    for mat, desc, group, mv in materials:
        for year in YEARS:
            for i, plant in enumerate(plants):
                for j, mm in enumerate(MONTHS):
                    growth = (year - 2020) * 100
                    seasonal = (j % 4) * 200
                    qty = base * (j + 1) + (i * 500) + growth + seasonal
                    unit = 'kWh' if group in ('NG', 'UTIL') else 'L'
                    day = ((j * 7 + i * 3) % 28) + 1
                    rows.append({
                        'Material': mat,
                        'Plant': plant,
                        'Menge': str(qty),
                        'MEINS': unit,
                        'BUDAT': f'{year}-{mm:02d}-{day:02d}',
                        'material_description': desc,
                        'MATL_GROUP': group,
                        'movement_type': mv,
                    })
    rows.append({'Material': '30003543', 'Plant': 'DE01', 'Menge': '0', 'MEINS': 'L', 'BUDAT': '15.04.2024', 'material_description': 'Diesel', 'MATL_GROUP': 'FUEL', 'movement_type': '321'})
    rows.append({'Werk': 'DE01', 'Material': '30003553', 'Menge': '1000', 'MEINS': 'L', 'Buch.datum': '01.04.2024', 'material_description': 'Diesel', 'MATL_GROUP': 'FUEL', 'movement_type': '321'})
    rows.append({'Material': '30003554', 'Plant': 'DE01', 'Menge': '100', 'MEINS': 'GAL', 'BUDAT': '01.04.2024', 'material_description': 'Diesel', 'MATL_GROUP': 'FUEL', 'movement_type': '321'})
    rows.append({'Material': '30003551', 'Plant': 'DE01', 'Menge': 'abc', 'MEINS': 'L', 'BUDAT': '01.03.2024', 'material_description': 'Diesel', 'MATL_GROUP': 'FUEL', 'movement_type': '321'})
    rows.append({'Material': '30003552', 'Plant': 'UK01', 'Menge': '2500', 'MEINS': 'L', 'BUDAT': 'invalid_date', 'material_description': 'Diesel', 'MATL_GROUP': 'FUEL', 'movement_type': '321'})
    rows.append({'Material': '30003549', 'Plant': 'NL01', 'Menge': '3000000', 'MEINS': 'kWh', 'BUDAT': '01.06.2024', 'material_description': 'Steam', 'MATL_GROUP': 'UTIL', 'movement_type': '101'})
    rows.append({'Material': '30003550', 'Plant': 'CN01', 'Menge': '15000', 'MEINS': 'L', 'BUDAT': '01.07.2024', 'material_description': 'Diesel', 'MATL_GROUP': 'FUEL', 'movement_type': '321'})
    rows.append({'Material': '30003555', 'Plant': 'DE01', 'Menge': '-500', 'MEINS': 'L', 'BUDAT': '01.05.2024', 'material_description': 'Gasoline', 'MATL_GROUP': 'FUEL', 'movement_type': '321'})
    return rows


def _gen_utility_rows():
    rows = []
    meters = ['MTR-001', 'MTR-002', 'MTR-003', 'MTR-004', 'MTR-005']
    for year in YEARS:
        for i, mid in enumerate(meters):
            base_usage = 40000 + (i * 30000)
            growth = (year - 2020) * 5000
            for m in MONTHS:
                month_str = f'{m:02d}'
                usage = base_usage + (m * 2000) + (i * 1000) + growth
                rows.append({
                    'Meter ID': mid,
                    'TYPE': 'Electric usage',
                    'START DATE': f'{year}-{month_str}-01',
                    'END DATE': f'{year}-{month_str}-28' if m == 2 else f'{year}-{month_str}-30' if m in (4, 6, 9, 11) else f'{year}-{month_str}-31',
                    'USAGE': str(usage),
                    'UNITS': 'kWh',
                    'COST': str(round(usage * 0.12, 2)),
                    'NOTES': '' if m % 3 != 0 else '* This was estimated',
                })
    rows.append({'Meter ID': 'MTR-006', 'TYPE': 'Electric usage', 'START DATE': '2024-04-01', 'END DATE': '2024-04-30', 'USAGE': '950000', 'UNITS': 'MWh', 'COST': '11400000.00', 'NOTES': ''})
    rows.append({'Meter ID': 'MTR-001', 'TYPE': 'Electric usage', 'START DATE': '2024-01-01', 'END DATE': '2024-01-31', 'USAGE': '', 'UNITS': 'kWh', 'COST': '', 'NOTES': ''})
    rows.append({'Meter ID': 'MTR-001', 'TYPE': 'Electric usage', 'START DATE': '2024-01-01', 'END DATE': '2024-01-31', 'USAGE': '2500000', 'UNITS': 'kWh', 'COST': '300000.00', 'NOTES': 'Unusually high'})
    return rows


def _gen_travel_rows():
    rows = []
    employees = ['JSmith', 'AGarcia', 'RNakamura', 'MJones', 'LWang']
    flight_routes = [
        ('JFK', 'LHR', 5500, 1250),
        ('SFO', 'ORD', 3000, 890),
        ('LAX', 'NRT', 8700, 2100),
        ('JFK', 'LAX', 4000, 600),
        ('ORD', 'MIA', 2000, 450),
        ('LHR', 'CDG', 350, 180),
        ('SFO', 'SEA', 1100, 320),
        ('NRT', 'HKG', 2900, 750),
    ]
    for year in YEARS:
        for i, emp in enumerate(employees):
            for j, (origin, dest, dist, amt) in enumerate(flight_routes):
                month = ((i + j + year) % 12) + 1
                day = ((i * 3 + j * 7 + year) % 28) + 1
                rows.append({
                    'Employee': emp,
                    'ExpenseType': 'AIRFR',
                    'TransactionDate': f'{year}-{month:02d}-{day:02d}',
                    'Amount': str(amt),
                    'Currency': 'USD',
                    'Origin': origin,
                    'Destination': dest,
                    'Description': f'{origin}-{dest} flight',
                    'Quantity': '1',
                })
    hotel_destinations = [
        ('London', 3, 850), ('Chicago', 2, 420), ('Tokyo', 5, 1200),
        ('Paris', 4, 950), ('Zurich', 3, 1500),
    ]
    for year in YEARS:
        for emp in employees[:3]:
            for dest, nights, rate in hotel_destinations:
                month = (hash(f'{emp}{dest}{year}') % 12) + 1
                day = (hash(f'{emp}{dest}n{year}') % 20) + 1
                rows.append({
                    'Employee': emp,
                    'ExpenseType': 'HOTEL',
                    'TransactionDate': f'{year}-{month:02d}-{day:02d}',
                    'Amount': str(rate),
                    'Currency': 'USD',
                    'CheckIn': f'{year}-{month:02d}-{day:02d}',
                    'CheckOut': f'{year}-{month:02d}-{(day + nights) % 28 + 1:02d}',
                    'Description': f'{dest} {["Hilton", "Marriott", "Hyatt"][hash(f"{emp}{dest}") % 3]}',
                    'Nights': str(nights),
                })
    other_expenses = [
        ('CAR_RENTAL', '300', 'USD', 'London'),
        ('RAIL', '150', 'EUR', 'Paris-Lyon'),
        ('BUS', '45', 'USD', 'Tokyo-Yokohama'),
        ('MEALS', '85', 'GBP', 'Client dinner'),
        ('CAR_RENTAL', '180', 'USD', 'Chicago'),
        ('MEALS', '120', 'USD', 'Team lunch'),
    ]
    for year in YEARS:
        for emp in employees[:4]:
            for typ, amt, cur, loc in other_expenses:
                month = (hash(f'{emp}{typ}{year}') % 12) + 1
                day = (hash(f'{emp}{typ}d{year}') % 28) + 1
                row = {
                    'Employee': emp,
                    'ExpenseType': typ,
                    'TransactionDate': f'{year}-{month:02d}-{day:02d}',
                    'Amount': amt,
                    'Currency': cur,
                }
                if typ == 'CAR_RENTAL':
                    row['Location'] = loc
                    row['Days'] = '2'
                elif typ == 'RAIL':
                    row['Origin'] = loc.split('-')[0]
                    row['Destination'] = loc.split('-')[1]
                    row['Distance'] = '465'
                elif typ == 'BUS':
                    row['Origin'] = loc.split('-')[0]
                    row['Destination'] = loc.split('-')[1]
                    row['Distance'] = '30'
                elif typ == 'MEALS':
                    pass
                row['Description'] = loc
                rows.append(row)
    return rows


def write_csv_to_string(rows, fieldnames=None):
    output = io.StringIO()
    if rows:
        if not fieldnames:
            all_keys = set()
            for row in rows:
                all_keys.update(row.keys())
            fieldnames = list(all_keys)
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            clean = {k: row.get(k, '') for k in fieldnames}
            writer.writerow(clean)
    return output.getvalue()


SAP_ROWS = _gen_sap_rows()
UTILITY_ROWS = _gen_utility_rows()
TRAVEL_ROWS = _gen_travel_rows()


class Command(BaseCommand):
    help = 'Seeds sample data for the Breathe ESG demo'

    def handle(self, *args, **options):
        with transaction.atomic():
            org, _ = Organization.objects.get_or_create(name='Acme Corp', slug='acme-corp')

            sap_source, _ = DataSource.objects.get_or_create(
                organization=org, source_type='sap_fuel',
                defaults={'name': 'SAP MM - Fuel & Procurement'}
            )
            utility_source, _ = DataSource.objects.get_or_create(
                organization=org, source_type='utility_electricity',
                defaults={'name': 'Utility Portal - Electricity'}
            )
            travel_source, _ = DataSource.objects.get_or_create(
                organization=org, source_type='corporate_travel',
                defaults={'name': 'Concur - Business Travel'}
            )

            sap_fields = ['Material', 'Plant', 'Menge', 'MEINS', 'BUDAT', 'material_description', 'MATL_GROUP', 'movement_type', 'Werk', 'Buch.datum']
            self._process_source(org, sap_source, SAP_ROWS, 'sap_fuel', sap_fields)
            self._process_source(org, utility_source, UTILITY_ROWS, 'utility_electricity')
            self._process_source(org, travel_source, TRAVEL_ROWS, 'corporate_travel')

            self._seed_emission_factors()
            self._seed_unit_conversions()
            self._seed_user(org)

            self.stdout.write(self.style.SUCCESS('Sample data seeded successfully'))

    def _process_source(self, org, source, rows, source_type, fieldnames=None):
        csv_content = write_csv_to_string(rows, fieldnames)
        reader = csv.DictReader(io.StringIO(csv_content))
        rows_list = list(reader)

        batch = IngestionBatch.objects.create(
            source=source,
            status='importing',
            total_records=len(rows_list),
            uploaded_by='seed_script',
        )

        source_records = []
        for i, row in enumerate(rows_list):
            raw_quantity = str(row.get('quantity', row.get('Menge', row.get('USAGE', ''))))
            raw_unit = str(row.get('unit', row.get('MEINS', row.get('UNITS', ''))))
            raw_date = str(row.get('date', row.get('BUDAT', row.get('START DATE', row.get('TransactionDate', '')))))
            raw_desc = str(row.get('description', row.get('material_description', row.get('MAKTX', row.get('TYPE', '')))))

            sr = SourceRecord(
                batch=batch,
                row_number=i + 1,
                raw_data=row,
                data_source=source_type,
                raw_quantity=raw_quantity,
                raw_unit=raw_unit,
                raw_date=raw_date,
                raw_description=raw_desc,
                status='staged',
            )
            source_records.append(sr)

        SourceRecord.objects.bulk_create(source_records)

        batch = IngestionBatch.objects.get(id=batch.id)

        result = normalize_batch(batch)

        batch.total_records = result['total']
        batch.passed_count = result['passed']
        batch.failed_count = result['failed']
        batch.suspicious_count = result['suspicious']
        batch.status = 'staged'
        batch.save()

        AuditLog.objects.create(
            organization=org,
            action='batch_created',
            actor='seed_script',
            record_type='IngestionBatch',
            record_id=batch.id,
            description=f'Seeded {result["total"]} rows from {source.name} ({result["passed"]} passed, {result["failed"]} failed, {result["suspicious"]} suspicious)',
        )

        self.stdout.write(f'  {source.name}: {result["total"]} rows, {result["passed"]} passed, {result["failed"]} failed, {result["suspicious"]} suspicious')

    def _seed_emission_factors(self):
        factors = [
            {'category': 'diesel', 'scope': 1, 'region': 'GLOBAL', 'factor': '0.00268', 'factor_unit': 'tonnes_CO2e_per_liter', 'source': 'DEFRA 2024', 'valid_from': '2024-01-01'},
            {'category': 'gasoline', 'scope': 1, 'region': 'GLOBAL', 'factor': '0.00231', 'factor_unit': 'tonnes_CO2e_per_liter', 'source': 'DEFRA 2024', 'valid_from': '2024-01-01'},
            {'category': 'natural_gas', 'scope': 1, 'region': 'GLOBAL', 'factor': '0.000184', 'factor_unit': 'tonnes_CO2e_per_kWh', 'source': 'DEFRA 2024', 'valid_from': '2024-01-01'},
            {'category': 'kerosene', 'scope': 1, 'region': 'GLOBAL', 'factor': '0.00252', 'factor_unit': 'tonnes_CO2e_per_liter', 'source': 'DEFRA 2024', 'valid_from': '2024-01-01'},
            {'category': 'jet_fuel', 'scope': 3, 'region': 'GLOBAL', 'factor': '0.00252', 'factor_unit': 'tonnes_CO2e_per_liter', 'source': 'DEFRA 2024', 'valid_from': '2024-01-01'},
            {'category': 'grid_electricity', 'scope': 2, 'region': 'US', 'factor': '0.000372', 'factor_unit': 'tonnes_CO2e_per_kWh', 'source': 'EPA eGRID 2023', 'valid_from': '2024-01-01'},
            {'category': 'grid_electricity', 'scope': 2, 'region': 'EU', 'factor': '0.000251', 'factor_unit': 'tonnes_CO2e_per_kWh', 'source': 'EU JRC 2023', 'valid_from': '2024-01-01'},
            {'category': 'flight_short', 'scope': 3, 'region': 'GLOBAL', 'factor': '0.000158', 'factor_unit': 'tonnes_CO2e_per_km', 'source': 'DEFRA 2024', 'valid_from': '2024-01-01'},
            {'category': 'flight_medium', 'scope': 3, 'region': 'GLOBAL', 'factor': '0.000115', 'factor_unit': 'tonnes_CO2e_per_km', 'source': 'DEFRA 2024', 'valid_from': '2024-01-01'},
            {'category': 'flight_long', 'scope': 3, 'region': 'GLOBAL', 'factor': '0.000092', 'factor_unit': 'tonnes_CO2e_per_km', 'source': 'DEFRA 2024', 'valid_from': '2024-01-01'},
            {'category': 'hotel', 'scope': 3, 'region': 'GLOBAL', 'factor': '0.015', 'factor_unit': 'tonnes_CO2e_per_night', 'source': 'DEFRA 2024', 'valid_from': '2024-01-01'},
            {'category': 'car_rental', 'scope': 3, 'region': 'GLOBAL', 'factor': '0.0002', 'factor_unit': 'tonnes_CO2e_per_km', 'source': 'DEFRA 2024', 'valid_from': '2024-01-01'},
        ]
        for f in factors:
            EmissionFactor.objects.get_or_create(
                category=f['category'], region=f['region'], valid_from=f['valid_from'],
                defaults=f
            )

    def _seed_unit_conversions(self):
        conversions = [
            {'from_unit': 'GAL', 'to_unit': 'L', 'factor': '3.78541', 'category': ''},
            {'from_unit': 'MWh', 'to_unit': 'kWh', 'factor': '1000', 'category': ''},
            {'from_unit': 'm3', 'to_unit': 'L', 'factor': '1000', 'category': ''},
            {'from_unit': 'KG', 'to_unit': 'kg', 'factor': '1', 'category': ''},
            {'from_unit': 'T', 'to_unit': 'tonnes', 'factor': '1', 'category': ''},
            {'from_unit': 'STK', 'to_unit': 'pieces', 'factor': '1', 'category': ''},
            {'from_unit': 'mi', 'to_unit': 'km', 'factor': '1.60934', 'category': ''},
        ]
        for c in conversions:
            UnitConversion.objects.get_or_create(
                from_unit=c['from_unit'], to_unit=c['to_unit'],
                defaults={'factor': c['factor'], 'category': c['category']}
            )

    def _seed_user(self, org):
        user, created = User.objects.get_or_create(
            username='analyst',
            defaults={'email': 'analyst@breathe-esg.com', 'is_staff': True},
        )
        if created:
            user.set_password('breathe2024')
            user.save()
        token, _ = Token.objects.get_or_create(user=user)
        self.stdout.write(f'  User: analyst / breathe2024  (token: {token.key})')
