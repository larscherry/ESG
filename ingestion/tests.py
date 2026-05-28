import io
import csv
import unittest
from decimal import Decimal
from datetime import datetime

from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status

from .normalizer import parse_date, parse_quantity, normalize_unit, get_flight_category, estimate_flight_distance
from .models import Organization, DataSource, UserProfile


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


@override_settings(SECURE_SSL_REDIRECT=False)
class AuthTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Test Corp', slug='test-corp')
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        UserProfile.objects.create(user=self.user, organization=self.org)

    def test_csrf_endpoint_sets_cookie(self):
        resp = self.client.get('/api/auth/csrf')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('csrftoken', resp.cookies)

    def test_login_success(self):
        resp = self.client.post('/api/auth/login', {'username': 'testuser', 'password': 'testpass123'}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('user', resp.data)
        self.assertEqual(resp.data['user']['username'], 'testuser')

    def test_login_failure(self):
        resp = self.client.post('/api/auth/login', {'username': 'testuser', 'password': 'wrong'}, format='json')
        self.assertEqual(resp.status_code, 400)

    def test_me_authenticated(self):
        self.client.login(username='testuser', password='testpass123')
        resp = self.client.get('/api/auth/me')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['username'], 'testuser')

    def test_me_unauthenticated(self):
        resp = self.client.get('/api/auth/me')
        self.assertEqual(resp.status_code, 401)

    def test_logout(self):
        self.client.login(username='testuser', password='testpass123')
        resp = self.client.post('/api/auth/logout')
        self.assertEqual(resp.status_code, 200)
        resp2 = self.client.get('/api/auth/me')
        self.assertEqual(resp2.status_code, 401)


@override_settings(SECURE_SSL_REDIRECT=False)
class MultiTenantTests(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name='Org A', slug='org-a')
        self.org_b = Organization.objects.create(name='Org B', slug='org-b')
        self.user_a = User.objects.create_user(username='usera', password='pass123')
        self.user_b = User.objects.create_user(username='userb', password='pass123')
        UserProfile.objects.create(user=self.user_a, organization=self.org_a)
        UserProfile.objects.create(user=self.user_b, organization=self.org_b)
        self.source_a = DataSource.objects.create(organization=self.org_a, source_type='sap_fuel', name='SAP A')
        self.source_b = DataSource.objects.create(organization=self.org_b, source_type='sap_fuel', name='SAP B')

    def test_user_only_sees_own_org(self):
        self.client.login(username='usera', password='pass123')
        resp = self.client.get('/api/organizations')
        self.assertEqual(len(resp.data['results']), 1)
        self.assertEqual(resp.data['results'][0]['slug'], 'org-a')

    def test_user_only_sees_own_sources(self):
        self.client.login(username='usera', password='pass123')
        resp = self.client.get('/api/sources')
        self.assertEqual(len(resp.data['results']), 1)
        self.assertEqual(resp.data['results'][0]['name'], 'SAP A')

    def test_other_user_sees_different_org(self):
        self.client.login(username='userb', password='pass123')
        resp = self.client.get('/api/organizations')
        self.assertEqual(len(resp.data['results']), 1)
        self.assertEqual(resp.data['results'][0]['slug'], 'org-b')

    def test_upload_rejects_wrong_org(self):
        self.client.login(username='usera', password='pass123')
        csv_file = io.StringIO()
        writer = csv.writer(csv_file)
        writer.writerow(['Material', 'Menge', 'MEINS', 'BUDAT', 'material_description'])
        writer.writerow(['001', '100', 'L', '01.01.2024', 'Diesel'])
        csv_file.seek(0)
        resp = self.client.post('/api/upload/csv', {
            'source_id': self.source_b.id,
            'file': io.BytesIO(csv_file.getvalue().encode('utf-8-sig')),
        }, format='multipart')
        self.assertEqual(resp.status_code, 403)


@override_settings(SECURE_SSL_REDIRECT=False)
class UploadIntegrationTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Test Corp', slug='test-corp')
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        UserProfile.objects.create(user=self.user, organization=self.org)
        self.source = DataSource.objects.create(organization=self.org, source_type='sap_fuel', name='SAP Test')
        self.client.login(username='testuser', password='testpass123')

    def _make_csv(self, rows: list[dict], fieldnames: list[str] | None = None) -> io.BytesIO:
        output = io.StringIO()
        if not fieldnames and rows:
            fieldnames = list(rows[0].keys())
        writer = csv.DictWriter(output, fieldnames=fieldnames or [])
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
        return io.BytesIO(output.getvalue().encode('utf-8-sig'))

    def test_upload_valid_csv(self):
        csv_file = self._make_csv([
            {'Material': '001', 'Menge': '100', 'MEINS': 'L', 'BUDAT': '01.01.2024', 'material_description': 'Diesel'},
        ])
        resp = self.client.post('/api/upload/csv', {'source_id': self.source.id, 'file': csv_file}, format='multipart')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('batch_id', resp.data)
        self.assertEqual(resp.data['total'], 1)

    def test_upload_empty_csv(self):
        csv_file = self._make_csv([])
        resp = self.client.post('/api/upload/csv', {'source_id': self.source.id, 'file': csv_file}, format='multipart')
        self.assertEqual(resp.status_code, 400)

    def test_upload_wrong_headers(self):
        csv_file = self._make_csv([{'Wrong': 'data'}], fieldnames=['Wrong'])
        resp = self.client.post('/api/upload/csv', {'source_id': self.source.id, 'file': csv_file}, format='multipart')
        self.assertEqual(resp.status_code, 400)

    def test_upload_large_file_rejected(self):
        with unittest.mock.patch('ingestion.views.MAX_UPLOAD_BYTES', 1024):
            large_data = b'Material,Menge,MEINS,BUDAT,material_description\n' + b'a,b,c,d,e\n' * 100
            csv_file = io.BytesIO(large_data)
            resp = self.client.post('/api/upload/csv', {'source_id': self.source.id, 'file': csv_file}, format='multipart')
            self.assertEqual(resp.status_code, 413)

    def test_upload_and_verify_normalization(self):
        rows = [
            {'Material': '001', 'Menge': '5000', 'MEINS': 'L', 'BUDAT': '01.03.2024', 'material_description': 'Diesel'},
            {'Material': '002', 'Menge': '200', 'MEINS': 'KG', 'BUDAT': '02.03.2024', 'material_description': 'Natural Gas'},
        ]
        csv_file = self._make_csv(rows)
        resp = self.client.post('/api/upload/csv', {'source_id': self.source.id, 'file': csv_file}, format='multipart')
        self.assertEqual(resp.status_code, 200)
        batch_id = resp.data['batch_id']
        rec_resp = self.client.get(f'/api/records?batch={batch_id}')
        self.assertEqual(rec_resp.status_code, 200)
        records = rec_resp.data['results']
        self.assertEqual(len(records), 2)
        self.assertIsNotNone(records[0]['co2e'])


@override_settings(SECURE_SSL_REDIRECT=False)
class BulkActionTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Test Corp', slug='test-corp')
        self.user = User.objects.create_user(username='testuser', password='testpass123')
        UserProfile.objects.create(user=self.user, organization=self.org)
        self.source = DataSource.objects.create(organization=self.org, source_type='sap_fuel', name='SAP Test')
        self.client.login(username='testuser', password='testpass123')
        csv_file = self._make_csv([
            {'Material': '001', 'Menge': '100', 'MEINS': 'L', 'BUDAT': '01.01.2024', 'material_description': 'Diesel'},
            {'Material': '002', 'Menge': '200', 'MEINS': 'L', 'BUDAT': '02.01.2024', 'material_description': 'Gasoline'},
        ])
        resp = self.client.post('/api/upload/csv', {'source_id': self.source.id, 'file': csv_file}, format='multipart')
        rec_resp = self.client.get(f'/api/records?batch={resp.data["batch_id"]}')
        self.record_ids = [r['id'] for r in rec_resp.data['results']]

    def _make_csv(self, rows: list[dict]) -> io.BytesIO:
        output = io.StringIO()
        if rows:
            fieldnames = list(rows[0].keys())
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            for row in rows:
                writer.writerow(row)
        return io.BytesIO(output.getvalue().encode('utf-8-sig'))

    def test_bulk_approve(self):
        resp = self.client.post('/api/records/bulk_action', {
            'action': 'approve', 'record_ids': self.record_ids[:1],
        }, format='json')
        self.assertEqual(resp.status_code, 200)

    def test_bulk_approve_updates_status(self):
        self.client.post('/api/records/bulk_action', {
            'action': 'approve', 'record_ids': self.record_ids[:1],
        }, format='json')
        rec_resp = self.client.get(f'/api/records/{self.record_ids[0]}')
        self.assertEqual(rec_resp.data['status'], 'approved')

    def test_bulk_reject_with_reason(self):
        self.client.post('/api/records/bulk_action', {
            'action': 'reject', 'record_ids': self.record_ids[:1], 'rejection_reason': 'Invalid data',
        }, format='json')
        rec_resp = self.client.get(f'/api/records/{self.record_ids[0]}')
        self.assertEqual(rec_resp.data['status'], 'rejected')
        self.assertEqual(rec_resp.data['rejection_reason'], 'Invalid data')

    def test_bulk_action_creates_audit_log(self):
        self.client.post('/api/records/bulk_action', {
            'action': 'flag', 'record_ids': self.record_ids[:1],
        }, format='json')
        log_resp = self.client.get('/api/audit-logs')
        self.assertGreaterEqual(len(log_resp.data['results']), 1)
        latest = log_resp.data['results'][0]
        self.assertEqual(latest['action'], 'record_flagged')
        self.assertIn('changes', latest)
        self.assertIn('old_status', latest['changes'])
        self.assertIn('new_status', latest['changes'])

    def test_bulk_action_increments_version(self):
        self.client.post('/api/records/bulk_action', {
            'action': 'approve', 'record_ids': self.record_ids[:1],
        }, format='json')
        rec_resp = self.client.get(f'/api/records/{self.record_ids[0]}')
        self.assertGreaterEqual(rec_resp.data['version'], 2)
