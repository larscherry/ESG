import re
from decimal import Decimal, InvalidOperation
from datetime import datetime, date

from .models import SourceRecord, NormalizedRecord, EmissionFactor, UnitConversion, AuditLog


GERMAN_MONTH_MAP = {
    'jan': '01', 'feb': '02', 'mär': '03', 'apr': '04', 'mai': '05', 'jun': '06',
    'jul': '07', 'aug': '08', 'sep': '09', 'okt': '10', 'nov': '11', 'dez': '12',
}


def parse_date(raw: str):
    if not raw or raw == 'nan':
        return None, []
    raw = raw.strip()
    warnings = []

    try:
        return datetime.strptime(raw, '%Y-%m-%d').date(), warnings
    except ValueError:
        pass

    try:
        return datetime.strptime(raw, '%d.%m.%Y').date(), warnings
    except ValueError:
        pass

    try:
        return datetime.strptime(raw, '%m/%d/%Y').date(), warnings
    except ValueError:
        pass

    try:
        return datetime.strptime(raw, '%Y-%m-%dT%H:%M:%S').date(), warnings
    except ValueError:
        pass

    lower = raw.lower()
    for de_month, num in GERMAN_MONTH_MAP.items():
        if de_month in lower:
            try:
                parts = raw.replace('.', ' ').replace('/', ' ').split()
                day = [p for p in parts if p.isdigit() and len(p) <= 2]
                year = [p for p in parts if len(p) == 4 and p.isdigit()]
                if day and year:
                    return date(int(year[0]), int(num), int(day[0])), ['german_date_format']
            except (ValueError, IndexError):
                pass

    return None, [f'unparseable_date: {raw}']


def parse_quantity(raw: str):
    if not raw or raw == 'nan':
        return None, ['missing_quantity']
    raw = raw.strip().replace(',', '.')
    try:
        val = Decimal(raw)
        if val <= 0:
            return None, ['non_positive_quantity']
        return val, []
    except InvalidOperation:
        return None, [f'unparseable_quantity: {raw}']


UNIT_NORMALIZATION_MAP = {
    'l': ('liters', Decimal('1')),
    'liter': ('liters', Decimal('1')),
    'litre': ('liters', Decimal('1')),
    'litres': ('liters', Decimal('1')),
    'ltr': ('liters', Decimal('1')),
    'gal': ('liters', Decimal('3.78541')),
    'gallon': ('liters', Decimal('3.78541')),
    'gallons': ('liters', Decimal('3.78541')),
    'us gal': ('liters', Decimal('3.78541')),
    'kg': ('kg', Decimal('1')),
    'kilogram': ('kg', Decimal('1')),
    'kgs': ('kg', Decimal('1')),
    't': ('tonnes', Decimal('1')),
    'ton': ('tonnes', Decimal('1')),
    'metric ton': ('tonnes', Decimal('1')),
    'mt': ('tonnes', Decimal('1')),
    'kwh': ('kWh', Decimal('1')),
    'mwh': ('kWh', Decimal('1000')),
    'mj': ('kWh', Decimal('0.277778')),
    'therm': ('kWh', Decimal('29.3071')),
    'btu': ('kWh', Decimal('0.000293071')),
    'mmbtu': ('kWh', Decimal('293.071')),
    'stk': ('pieces', Decimal('1')),
    'pc': ('pieces', Decimal('1')),
    'pieces': ('pieces', Decimal('1')),
    'km': ('km', Decimal('1')),
    'mi': ('km', Decimal('1.60934')),
    'miles': ('km', Decimal('1.60934')),
}


def normalize_unit(raw: str):
    if not raw or raw == 'nan':
        return None, 'unknown', ['missing_unit']
    raw = raw.strip().lower()
    if raw in UNIT_NORMALIZATION_MAP:
        return UNIT_NORMALIZATION_MAP[raw][1], UNIT_NORMALIZATION_MAP[raw][0], []
    return Decimal('1'), raw, [f'unknown_unit: {raw}']


_FALLBACK_EMISSION_FACTORS = {
    'diesel': {'scope': 1, 'factor': Decimal('0.00268'), 'unit': 'tonnes_CO2e_per_liter', 'source': 'DEFRA 2024'},
    'gasoline': {'scope': 1, 'factor': Decimal('0.00231'), 'unit': 'tonnes_CO2e_per_liter', 'source': 'DEFRA 2024'},
    'natural_gas': {'scope': 1, 'factor': Decimal('0.000184'), 'unit': 'tonnes_CO2e_per_kWh', 'source': 'DEFRA 2024'},
    'kerosene': {'scope': 1, 'factor': Decimal('0.00252'), 'unit': 'tonnes_CO2e_per_liter', 'source': 'DEFRA 2024'},
    'jet_fuel': {'scope': 3, 'factor': Decimal('0.00252'), 'unit': 'tonnes_CO2e_per_liter', 'source': 'DEFRA 2024'},
    'grid_electricity': {'scope': 2, 'factor': Decimal('0.000372'), 'unit': 'tonnes_CO2e_per_kWh', 'source': 'EPA eGRID 2023 (US avg)'},
    'flight_short': {'scope': 3, 'factor': Decimal('0.000158'), 'unit': 'tonnes_CO2e_per_km', 'source': 'DEFRA 2024'},
    'flight_medium': {'scope': 3, 'factor': Decimal('0.000115'), 'unit': 'tonnes_CO2e_per_km', 'source': 'DEFRA 2024'},
    'flight_long': {'scope': 3, 'factor': Decimal('0.000092'), 'unit': 'tonnes_CO2e_per_km', 'source': 'DEFRA 2024'},
    'hotel': {'scope': 3, 'factor': Decimal('0.015'), 'unit': 'tonnes_CO2e_per_night', 'source': 'DEFRA 2024'},
    'car_rental': {'scope': 3, 'factor': Decimal('0.0002'), 'unit': 'tonnes_CO2e_per_km', 'source': 'DEFRA 2024'},
}


def get_emission_factor(category):
    ef = EmissionFactor.objects.filter(category=category).first()
    if ef:
        return {
            'scope': ef.scope,
            'factor': ef.factor,
            'unit': ef.factor_unit,
            'source': ef.source,
        }
    return _FALLBACK_EMISSION_FACTORS.get(category)

AIRPORT_DISTANCES_KM = {
    ('JFK', 'LHR'): 5550,
    ('LHR', 'JFK'): 5550,
    ('SFO', 'JFK'): 4220,
    ('JFK', 'SFO'): 4220,
    ('ORD', 'LHR'): 6350,
    ('LHR', 'ORD'): 6350,
    ('AMS', 'JFK'): 5850,
    ('JFK', 'AMS'): 5850,
    ('CDG', 'JFK'): 5830,
    ('JFK', 'CDG'): 5830,
    ('FRA', 'JFK'): 6200,
    ('JFK', 'FRA'): 6200,
    ('SFO', 'LHR'): 8620,
    ('LHR', 'SFO'): 8620,
    ('LAX', 'NRT'): 8770,
    ('NRT', 'LAX'): 8770,
}


def detect_suspicions(normalized, raw_record, raw_unit, raw_date):
    warnings = []
    raw = raw_record.raw_data

    unit_lower = raw_unit.strip().lower() if raw_unit else ''
    cat = normalized.category

    if cat in ('diesel', 'gasoline', 'natural_gas', 'kerosene') and unit_lower in ('kwh', 'mwh', 'mj'):
        warnings.append('suspicious_unit_for_fuel: expected volume/mass got energy unit')

    if unit_lower == 'kwh' and cat in ('grid_electricity',) and normalized.quantity > Decimal('1000000'):
        warnings.append('unusually_high_quantity')

    if raw_record.data_source == 'utility_electricity':
        notes = str(raw.get('NOTES', ''))
        if 'estimated' in notes.lower() or '*' in notes:
            warnings.append('estimated_meter_reading')

    if cat in ('flight_short', 'flight_medium', 'flight_long'):
        origin = str(raw.get('Origin', '')).strip().upper()
        dest = str(raw.get('Destination', '')).strip().upper()
        if len(origin) == 3 and len(dest) == 3 and origin != dest:
            dist = AIRPORT_DISTANCES_KM.get((origin, dest))
            if dist is None:
                warnings.append(f'unknown_airport_pair: {origin}-{dest}')
            elif dist < 100 and cat != 'flight_short':
                pass
            elif dist > 1500 and cat == 'flight_short':
                warnings.append(f'category_mismatch: flight_short but distance ~{dist}km')
            elif dist <= 1500 and cat == 'flight_long':
                warnings.append(f'category_mismatch: flight_long but distance ~{dist}km')

    if raw_date and re.match(r'^\d{2}\.', raw_date):
        warnings.append('german_date_format')

    raw_qty = str(raw_record.raw_quantity).replace(',', '.')
    try:
        qty = Decimal(raw_qty)
        if qty > Decimal('999999'):
            warnings.append('large_quantity_flag')
    except InvalidOperation:
        pass

    return warnings


def normalize_sap_fuel(raw_record):
    row = raw_record.raw_data
    warnings = []

    matl_group = str(row.get('MATL_GROUP', row.get('MATKL', ''))).upper()
    mat_desc = str(row.get('material_description', row.get('MAKTX', ''))).upper()
    mov_type = str(row.get('movement_type', row.get('BWART', '')))

    if 'FUEL' in matl_group or 'DIESEL' in mat_desc or 'GASOLINE' in mat_desc or 'KEROSENE' in mat_desc:
        return normalize_fuel_item(raw_record, mat_desc)
    elif 'NG' in matl_group or 'NATURAL GAS' in mat_desc or ('GAS' in mat_desc and 'GASOLINE' not in mat_desc):
        return normalize_fuel_item(raw_record, mat_desc)
    else:
        return normalize_procurement_item(raw_record)


def normalize_fuel_item(raw_record, raw_desc_upper):
    row = raw_record.raw_data
    warnings = []
    desc = raw_desc_upper or str(row.get('material_description', row.get('MAKTX', ''))).upper()

    qty, qty_warnings = parse_quantity(raw_record.raw_quantity)
    warnings.extend(qty_warnings)
    if qty is None:
        qty = Decimal('0')

    unit_factor, norm_unit, unit_warnings = normalize_unit(raw_record.raw_unit)
    warnings.extend(unit_warnings)
    norm_qty = qty * unit_factor

    activity_date, date_warnings = parse_date(raw_record.raw_date)
    warnings.extend(date_warnings)

    facility = str(row.get('Plant', row.get('WERKS', '')))

    if 'DIESEL' in desc:
        category = 'diesel'
    elif 'GASOLINE' in desc or 'PETROL' in desc:
        category = 'gasoline'
    elif 'NATURAL GAS' in desc or 'NG' in desc.replace('_', ' '):
        category = 'natural_gas'
        if norm_unit == 'kWh':
            pass
        elif norm_unit == 'kg':
            ng_per_kg_kwh = Decimal('13.6')
            norm_qty = norm_qty * ng_per_kg_kwh
            norm_unit = 'kWh'
            warnings.append('unit_converted_kg_to_kWh_natural_gas')
    elif 'KEROSENE' in desc:
        category = 'kerosene'
    elif 'JET' in desc:
        category = 'jet_fuel'
    else:
        category = 'diesel'

    ef = get_emission_factor(category)
    if not ef:
        return None, ['unknown_fuel_category']

    scope = ef['scope']
    co2e = (norm_qty * ef['factor']).quantize(Decimal('0.000001')) if qty > 0 else Decimal('0')

    raw_values = {
        'raw_quantity': str(qty),
        'raw_unit': raw_record.raw_unit,
        'normalized_quantity': str(norm_qty),
        'normalized_unit': norm_unit,
        'material': row.get('Material', ''),
        'plant': facility,
    }

    sus_warnings = detect_suspicions(
        type('obj', (object,), {'category': category, 'quantity': norm_qty})(),
        raw_record, raw_record.raw_unit, raw_record.raw_date
    )
    warnings.extend(sus_warnings)

    norm = NormalizedRecord(
        source_record=raw_record,
        batch=raw_record.batch,
        organization=raw_record.batch.source.organization,
        scope=scope,
        category=category,
        source_type='sap_fuel',
        activity_date=activity_date or date.today(),
        facility=facility,
        description=fuel_description(category, row),
        quantity=norm_qty,
        unit=norm_unit,
        co2e=co2e,
        co2e_unit='tonnes_CO2e',
        raw_values=raw_values,
        status='needs_review',
    )
    return norm, warnings


def fuel_description(category, row):
    mat = row.get('material_description', row.get('MAKTX', row.get('Material', '')))
    plant = row.get('Plant', row.get('WERKS', ''))
    return f"{mat} - Plant {plant}"


def normalize_procurement_item(raw_record):
    row = raw_record.raw_data
    warnings = []

    qty, qty_warnings = parse_quantity(raw_record.raw_quantity)
    warnings.extend(qty_warnings)
    if qty is None:
        qty = Decimal('0')

    unit_factor, norm_unit, unit_warnings = normalize_unit(raw_record.raw_unit)
    warnings.extend(unit_warnings)
    norm_qty = qty * unit_factor

    activity_date, date_warnings = parse_date(raw_record.raw_date)
    warnings.extend(date_warnings)

    facility = str(row.get('Plant', row.get('WERKS', '')))
    mat_desc = str(row.get('material_description', row.get('MAKTX', row.get('Material', ''))))

    co2e = (norm_qty * Decimal('0.0005')).quantize(Decimal('0.000001')) if qty > 0 else Decimal('0')

    raw_values = {
        'raw_quantity': str(qty),
        'raw_unit': raw_record.raw_unit,
        'normalized_quantity': str(norm_qty),
        'normalized_unit': norm_unit,
        'material': row.get('Material', ''),
        'plant': facility,
    }

    sus_warnings = detect_suspicions(
        type('obj', (object,), {'category': 'procurement', 'quantity': norm_qty})(),
        raw_record, raw_record.raw_unit, raw_record.raw_date
    )
    warnings.extend(sus_warnings)

    norm = NormalizedRecord(
        source_record=raw_record,
        batch=raw_record.batch,
        organization=raw_record.batch.source.organization,
        scope=3,
        category='procurement',
        source_type='sap_fuel',
        activity_date=activity_date or date.today(),
        facility=facility,
        description=f"Procurement: {mat_desc}",
        quantity=norm_qty,
        unit=norm_unit,
        co2e=co2e,
        co2e_unit='tonnes_CO2e',
        raw_values=raw_values,
        status='needs_review',
    )
    return norm, warnings


def normalize_utility_electricity(raw_record):
    row = raw_record.raw_data
    warnings = []

    usage_raw = str(row.get('USAGE', row.get('usage', '0')))
    units_raw = str(row.get('UNITS', row.get('units', 'kWh')))
    start_date_raw = str(row.get('START DATE', row.get('start_date', '')))
    end_date_raw = str(row.get('END DATE', row.get('end_date', '')))
    meter_id = str(row.get('Meter ID', row.get('Meter', '')))
    notes = str(row.get('NOTES', ''))

    qty, qty_warnings = parse_quantity(usage_raw)
    warnings.extend(qty_warnings)
    if qty is None:
        qty = Decimal('0')

    unit_factor, norm_unit, unit_warnings = normalize_unit(units_raw)
    warnings.extend(unit_warnings)
    norm_qty = qty * unit_factor

    activity_date, date_warnings = parse_date(start_date_raw or end_date_raw)
    warnings.extend(date_warnings)

    co2e = (norm_qty * Decimal('0.000372')).quantize(Decimal('0.000001')) if qty > 0 else Decimal('0')

    if 'estimated' in notes.lower():
        warnings.append('estimated_meter_reading')

    raw_values = {
        'raw_quantity': usage_raw,
        'raw_unit': units_raw,
        'normalized_quantity': str(norm_qty),
        'normalized_unit': norm_unit,
        'meter_id': meter_id,
        'start_date': start_date_raw,
        'end_date': end_date_raw,
    }

    sus_warnings = detect_suspicions(
        type('obj', (object,), {'category': 'grid_electricity', 'quantity': norm_qty})(),
        raw_record, units_raw, start_date_raw
    )
    warnings.extend(sus_warnings)

    norm = NormalizedRecord(
        source_record=raw_record,
        batch=raw_record.batch,
        organization=raw_record.batch.source.organization,
        scope=2,
        category='grid_electricity',
        source_type='utility_electricity',
        activity_date=activity_date or date.today(),
        facility=meter_id,
        description=f"Electricity - Meter {meter_id} ({start_date_raw} to {end_date_raw})",
        quantity=norm_qty,
        unit=norm_unit,
        co2e=co2e,
        co2e_unit='tonnes_CO2e',
        raw_values=raw_values,
        status='needs_review',
    )
    return norm, warnings


def estimate_flight_distance(origin, dest):
    o = origin.strip().upper()
    d = dest.strip().upper()
    if len(o) == 3 and len(d) == 3 and o != d:
        cached = AIRPORT_DISTANCES_KM.get((o, d))
        if cached:
            return cached
        return None
    return None


def get_flight_category(dist_km):
    if dist_km is None:
        return 'flight_medium'
    if dist_km < 500:
        return 'flight_short'
    elif dist_km <= 1500:
        return 'flight_medium'
    else:
        return 'flight_long'


def normalize_corporate_travel(raw_record):
    row = raw_record.raw_data
    warnings = []

    exp_type = str(row.get('ExpenseType', row.get('expense_type', ''))).upper().strip()
    amount_raw = str(row.get('Amount', row.get('amount', '0')))
    currency = str(row.get('Currency', row.get('currency', 'USD')))
    trans_date_raw = str(row.get('TransactionDate', row.get('transaction_date', '')))
    employee = str(row.get('Employee', row.get('employee', '')))
    description = str(row.get('Description', row.get('description', '')))
    origin = str(row.get('Origin', ''))
    dest = str(row.get('Destination', ''))

    qty, qty_warnings = parse_quantity(str(row.get('Quantity', row.get('quantity', row.get('Nights', row.get('Days', '1'))))))
    if qty is None:
        qty = Decimal('1')

    activity_date, date_warnings = parse_date(trans_date_raw)
    warnings.extend(date_warnings)

    if exp_type in ('AIRFR', 'FLIGHT', 'AIRFARE'):
        dist_km = estimate_flight_distance(origin, dest)
        category = get_flight_category(dist_km)
        scope = 3
        norm_unit = 'km'
        if dist_km:
            norm_qty = Decimal(str(dist_km)) * qty
        else:
            norm_qty = qty * Decimal('1000')
            warnings.append('estimated_flight_distance')
        amount_res = Decimal(amount_raw) if amount_raw.replace('.', '', 1).isdigit() else Decimal('0')
        ef = get_emission_factor(category) or _FALLBACK_EMISSION_FACTORS.get(category, {'factor': Decimal('0.0001')})
        co2e = (norm_qty * ef['factor']).quantize(Decimal('0.000001'))
        facility = f"{origin}-{dest}"

    elif exp_type in ('HOTEL', 'LODGING'):
        category = 'hotel'
        scope = 3
        norm_unit = 'nights'
        nights = parse_quantity(str(row.get('Nights', row.get('nights', '1'))))
        norm_qty = nights[0] if nights[0] else Decimal('1')
        ef = get_emission_factor('hotel') or _FALLBACK_EMISSION_FACTORS.get('hotel', {'factor': Decimal('0.015')})
        co2e = (norm_qty * ef['factor']).quantize(Decimal('0.000001'))
        facility = str(row.get('HotelName', row.get('hotel_name', '')))

    elif exp_type in ('CAR', 'CAR_RENTAL', 'RENTAL'):
        category = 'car_rental'
        scope = 3
        norm_unit = 'km'
        days = parse_quantity(str(row.get('Days', row.get('days', '1'))))
        days_qty = days[0] if days[0] else Decimal('1')
        norm_qty = days_qty * Decimal('50')
        warnings.append('estimated_car_distance: 50km/day default')
        ef = get_emission_factor('car_rental') or _FALLBACK_EMISSION_FACTORS.get('car_rental', {'factor': Decimal('0.0002')})
        co2e = (norm_qty * ef['factor']).quantize(Decimal('0.000001'))
        facility = str(row.get('Location', row.get('location', '')))

    elif exp_type in ('BUS', 'RAIL', 'TRAIN'):
        if exp_type in ('RAIL', 'TRAIN'):
            category = 'rail'
        else:
            category = 'bus'
        scope = 3
        norm_unit = 'km'
        dist = parse_quantity(str(row.get('Distance', row.get('distance', '100'))))
        norm_qty = dist[0] if dist[0] else Decimal('100')
        warnings.append('estimated_ground_distance')
        co2e = (norm_qty * Decimal('0.00015')).quantize(Decimal('0.000001'))
        facility = f"{origin}-{dest}" if origin or dest else ''

    else:
        category = 'procurement'
        scope = 3
        norm_unit = 'USD'
        amt = parse_quantity(amount_raw)
        norm_qty = amt[0] if amt[0] else Decimal('0')
        co2e = (norm_qty * Decimal('0.0001')).quantize(Decimal('0.000001'))
        warnings.append('estimated_spend_based_emissions')
        facility = employee

    raw_values = {
        'expense_type': exp_type,
        'amount': amount_raw,
        'currency': currency,
        'employee': employee,
        'origin': origin,
        'destination': dest,
    }

    sus_warnings = detect_suspicions(
        type('obj', (object,), {'category': category, 'quantity': norm_qty})(),
        raw_record, '', trans_date_raw
    )
    warnings.extend(sus_warnings)

    norm = NormalizedRecord(
        source_record=raw_record,
        batch=raw_record.batch,
        organization=raw_record.batch.source.organization,
        scope=scope,
        category=category,
        source_type='corporate_travel',
        activity_date=activity_date or date.today(),
        facility=facility,
        description=description or f"{employee} - {exp_type}",
        quantity=norm_qty,
        unit=norm_unit,
        co2e=co2e,
        co2e_unit='tonnes_CO2e',
        raw_values=raw_values,
        status='needs_review',
    )
    return norm, warnings


NORMALIZERS = {
    'sap_fuel': normalize_sap_fuel,
    'utility_electricity': normalize_utility_electricity,
    'corporate_travel': normalize_corporate_travel,
}


def normalize_batch(batch):
    total = 0
    passed = 0
    failed = 0
    suspicious = 0

    batch_records = SourceRecord.objects.filter(batch=batch)

    for sr in batch_records:
        total += 1
        normalizer_func = NORMALIZERS.get(sr.data_source)
        if not normalizer_func:
            sr.status = 'failed'
            sr.failure_reasons = [f'unknown_data_source: {sr.data_source}']
            sr.save()
            failed += 1
            continue

        try:
            norm_record, warnings = normalizer_func(sr)
        except Exception as e:
            sr.status = 'failed'
            sr.failure_reasons = [f'normalization_error: {str(e)}']
            sr.save()
            failed += 1
            continue

        if norm_record is None:
            sr.status = 'failed'
            sr.failure_reasons = warnings
            sr.save()
            failed += 1
            continue

        norm_record.save()
        sr.validation_warnings = warnings

        if not warnings:
            sr.status = 'passed'
            passed += 1
        else:
            has_error = any('failed' in w or 'missing' in w or 'unparseable' in w for w in warnings)
            has_suspicious = any('suspicious' in w or 'estimated' in w or 'flagged' in w or 'mismatch' in w or 'unknown' in w for w in warnings)

            if has_error:
                sr.status = 'failed'
                sr.failure_reasons = warnings
                failed += 1
            elif has_suspicious:
                sr.status = 'suspicious'
                suspicious += 1
            else:
                sr.status = 'passed'
                passed += 1

        sr.save()

    return {
        'total': total,
        'passed': passed,
        'failed': failed,
        'suspicious': suspicious,
    }
