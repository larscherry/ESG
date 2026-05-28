from decimal import Decimal
from django.test import TestCase
from .normalizer import parse_date, parse_quantity, normalize_unit, get_flight_category, estimate_flight_distance


class ParseDateTests(TestCase):
    def test_iso_date(self):
        d, w = parse_date('2024-03-15')
        self.assertIsNotNone(d)
        self.assertEqual(w, [])

    def test_european_date(self):
        d, w = parse_date('15.03.2024')
        self.assertIsNotNone(d)

    def test_us_date(self):
        d, w = parse_date('03/15/2024')
        self.assertIsNotNone(d)

    def test_empty(self):
        d, w = parse_date('')
        self.assertIsNone(d)
        self.assertEqual(w, [])

    def test_invalid(self):
        d, w = parse_date('not-a-date')
        self.assertIsNone(d)
        self.assertTrue(any('unparseable' in w for w in w))


class ParseQuantityTests(TestCase):
    def test_integer_string(self):
        q, w = parse_quantity('500')
        self.assertEqual(q, Decimal('500'))
        self.assertEqual(w, [])

    def test_decimal_string(self):
        q, w = parse_quantity('123.45')
        self.assertEqual(q, Decimal('123.45'))
        self.assertEqual(w, [])

    def test_negative(self):
        q, w = parse_quantity('-5')
        self.assertIsNone(q)

    def test_empty(self):
        q, w = parse_quantity('')
        self.assertIsNone(q)

    def test_german_decimal(self):
        q, w = parse_quantity('123,45')
        self.assertEqual(q, Decimal('123.45'))
        self.assertEqual(w, [])


class NormalizeUnitTests(TestCase):
    def test_liters(self):
        factor, unit, w = normalize_unit('L')
        self.assertEqual(unit, 'liters')

    def test_unknown(self):
        factor, unit, w = normalize_unit('xyz')
        self.assertEqual(unit, 'xyz')

    def test_empty(self):
        factor, unit, w = normalize_unit('')
        self.assertEqual(unit, 'unknown')

    def test_gallons_to_liters(self):
        factor, unit, w = normalize_unit('gal')
        self.assertEqual(unit, 'liters')
        self.assertAlmostEqual(factor, Decimal('3.78541'))


class FlightDistanceTests(TestCase):
    def test_known_route(self):
        dist = estimate_flight_distance('JFK', 'LHR')
        self.assertEqual(dist, 5550)

    def test_unknown_route(self):
        dist = estimate_flight_distance('AAA', 'BBB')
        self.assertIsNone(dist)

    def test_known_jfk_lhr(self):
        dist = estimate_flight_distance('JFK', 'LHR')
        self.assertEqual(dist, 5550)


class FlightCategoryTests(TestCase):
    def test_short(self):
        self.assertEqual(get_flight_category(300), 'flight_short')

    def test_medium(self):
        self.assertEqual(get_flight_category(1000), 'flight_medium')

    def test_long(self):
        self.assertEqual(get_flight_category(2000), 'flight_long')

    def test_none(self):
        self.assertEqual(get_flight_category(None), 'flight_medium')
