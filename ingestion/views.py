import csv
import io
import json
import re
from decimal import Decimal, InvalidOperation
from datetime import datetime

from django.db import models, transaction
from django.db.models import Sum, Count
from django.db.models.functions import TruncMonth, ExtractYear, ExtractMonth
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import (
    Organization, DataSource, IngestionBatch,
    SourceRecord, NormalizedRecord, AuditLog,
    EmissionFactor, UnitConversion,
)
from .serializers import (
    OrganizationSerializer, DataSourceSerializer,
    IngestionBatchSerializer, SourceRecordSerializer,
    NormalizedRecordSerializer, NormalizedRecordActionSerializer,
    AuditLogSerializer, EmissionFactorSerializer,
    UnitConversionSerializer, UploadSerializer,
)
from .normalizer import normalize_batch


class OrganizationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer


class DataSourceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DataSource.objects.all()
    serializer_class = DataSourceSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        org_id = self.request.query_params.get('organization')
        if org_id:
            qs = qs.filter(organization_id=org_id)
        return qs


class IngestionBatchViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = IngestionBatch.objects.all()
    serializer_class = IngestionBatchSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        source_id = self.request.query_params.get('source')
        if source_id:
            qs = qs.filter(source_id=source_id)
        return qs

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        batch = self.get_object()
        batch.status = 'approved'
        batch.save()
        NormalizedRecord.objects.filter(batch=batch, status='needs_review').update(
            status='approved', reviewed_by=request.user.username, reviewed_at=datetime.now()
        )
        AuditLog.objects.create(
            organization=batch.source.organization,
            action='batch_approved',
            actor=request.user.username,
            record_type='IngestionBatch',
            record_id=batch.id,
            description=f"Batch {batch.id} approved",
        )
        return Response({'status': 'approved'})

    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        batch = self.get_object()
        batch.status = 'locked'
        batch.save()
        NormalizedRecord.objects.filter(batch=batch).exclude(status='rejected').update(
            status='locked'
        )
        AuditLog.objects.create(
            organization=batch.source.organization,
            action='batch_locked',
            actor=request.user.username,
            record_type='IngestionBatch',
            record_id=batch.id,
            description=f"Batch {batch.id} locked for audit",
        )
        return Response({'status': 'locked'})


class SourceRecordViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SourceRecord.objects.all()
    serializer_class = SourceRecordSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        batch_id = self.request.query_params.get('batch')
        if batch_id:
            qs = qs.filter(batch_id=batch_id)
        return qs


class NormalizedRecordViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = NormalizedRecord.objects.all()
    serializer_class = NormalizedRecordSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        batch_id = self.request.query_params.get('batch')
        status_filter = self.request.query_params.get('status')
        scope = self.request.query_params.get('scope')
        source_type = self.request.query_params.get('source_type')
        if batch_id:
            qs = qs.filter(batch_id=batch_id)
        if status_filter:
            qs = qs.filter(status=status_filter)
        if scope:
            qs = qs.filter(scope=scope)
        if source_type:
            qs = qs.filter(source_type=source_type)
        return qs

    @action(detail=False, methods=['post'])
    def bulk_action(self, request):
        serializer = NormalizedRecordActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        action = serializer.validated_data['action']
        record_ids = serializer.validated_data['record_ids']
        reason = serializer.validated_data.get('rejection_reason', '')

        status_map = {
            'approve': 'approved',
            'reject': 'rejected',
            'flag': 'flagged',
            'lock': 'locked',
        }
        action_map = {
            'approve': 'record_approved',
            'reject': 'record_rejected',
            'flag': 'record_flagged',
            'lock': 'record_locked',
        }

        records = NormalizedRecord.objects.filter(id__in=record_ids)
        org = records.first().organization if records.exists() else None

        now = datetime.now()
        update_fields = {
            'status': status_map[action],
            'reviewed_by': request.user.username,
            'reviewed_at': now,
        }
        if action == 'reject':
            update_fields['rejection_reason'] = reason

        records.update(**update_fields)
        records.update(version=models.F('version') + 1)

        if org:
            audit_logs = [
                AuditLog(
                    organization=org,
                    action=action_map[action],
                    actor=request.user.username,
                    record_type='NormalizedRecord',
                    record_id=rid,
                    description=reason if action == 'reject' else '',
                )
                for rid in record_ids
            ]
            AuditLog.objects.bulk_create(audit_logs)

        return Response({'status': 'ok', 'action': action, 'count': len(record_ids)})


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        org_id = self.request.query_params.get('organization')
        if org_id:
            qs = qs.filter(organization_id=org_id)
        return qs


class EmissionFactorViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = EmissionFactor.objects.all()
    serializer_class = EmissionFactorSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        category = self.request.query_params.get('category')
        if category:
            qs = qs.filter(category=category)
        return qs


class UnitConversionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = UnitConversion.objects.all()
    serializer_class = UnitConversionSerializer


class AnalyticsViewSet(viewsets.ViewSet):
    def list(self, request):
        records = NormalizedRecord.objects.all()
        org_id = request.query_params.get('organization')
        if org_id:
            records = records.filter(organization_id=org_id)
        source_type = request.query_params.get('source_type')
        scope = request.query_params.get('scope')
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        if source_type:
            records = records.filter(source_type=source_type)
        if scope:
            records = records.filter(scope=scope)
        if year:
            records = records.filter(activity_date__year=year)
        if month:
            records = records.filter(activity_date__month=month)

        by_scope = list(records.values('scope').annotate(
            total_co2e=Sum('co2e'), count=Count('id')
        ).order_by('scope'))

        by_category = list(records.values('category').annotate(
            total_co2e=Sum('co2e'), count=Count('id')
        ).order_by('-total_co2e'))

        monthly = list(records.annotate(
            month=TruncMonth('activity_date')
        ).values('month').annotate(
            total_co2e=Sum('co2e'), total_qty=Sum('quantity'), count=Count('id')
        ).order_by('month'))

        yearly = list(records.annotate(
            year=ExtractYear('activity_date')
        ).values('year').annotate(
            total_co2e=Sum('co2e'), total_qty=Sum('quantity'), count=Count('id')
        ).order_by('year'))

        by_source = list(records.values('source_type').annotate(
            total_co2e=Sum('co2e'), total_qty=Sum('quantity'), count=Count('id')
        ).order_by('source_type'))

        by_status = list(records.values('status').annotate(
            count=Count('id')
        ).order_by('status'))

        total = records.aggregate(
            total_co2e=Sum('co2e'), total_qty=Sum('quantity'), total_count=Count('id')
        )

        return Response({
            'by_scope': [{**s, 'total_co2e': float(s['total_co2e'] or 0)} for s in by_scope],
            'by_category': [{**c, 'total_co2e': float(c['total_co2e'] or 0)} for c in by_category],
            'monthly': [{
                **m,
                'month': m['month'].strftime('%Y-%m') if m['month'] else None,
                'total_co2e': float(m['total_co2e'] or 0),
                'total_qty': float(m['total_qty'] or 0),
            } for m in monthly],
            'yearly': [{**y, 'total_co2e': float(y['total_co2e'] or 0), 'total_qty': float(y['total_qty'] or 0)} for y in yearly],
            'by_source': [{**s, 'total_co2e': float(s['total_co2e'] or 0), 'total_qty': float(s['total_qty'] or 0)} for s in by_source],
            'by_status': by_status,
            'total': {k: float(v or 0) if isinstance(v, Decimal) else v for k, v in total.items()},
        })

    @action(detail=False, methods=['get'])
    def dates(self, request):
        records = NormalizedRecord.objects.all()
        org_id = request.query_params.get('organization')
        if org_id:
            records = records.filter(organization_id=org_id)
        years = list(records.annotate(
            year=ExtractYear('activity_date')
        ).values('year').annotate(count=Count('id')).order_by('year'))
        months = list(records.annotate(
            month=ExtractMonth('activity_date')
        ).values('month').distinct().order_by('month'))
        return Response({
            'years': [y['year'] for y in years],
            'months': [m['month'] for m in months],
        })


MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100 MB


class UploadViewSet(viewsets.ViewSet):
    @action(detail=False, methods=['post'])
    def csv(self, request):
        serializer = UploadSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        source = DataSource.objects.get(id=serializer.validated_data['source_id'])
        file = serializer.validated_data['file']

        if file.size > MAX_UPLOAD_BYTES:
            return Response(
                {'error': f'File too large ({file.size / 1024 / 1024:.1f} MB). Maximum is {MAX_UPLOAD_BYTES / 1024 / 1024:.0f} MB.'},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        try:
            decoded = file.read().decode('utf-8-sig')
            reader = csv.DictReader(io.StringIO(decoded))
            rows = list(reader)
        except Exception as e:
            return Response({'error': f'Failed to parse CSV: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        if not rows:
            return Response({'error': 'CSV file is empty'}, status=status.HTTP_400_BAD_REQUEST)

        expected_headers = {
            'sap_fuel': {'Material', 'Menge', 'MEINS', 'BUDAT', 'material_description', 'Plant'},
            'utility_electricity': {'Meter ID', 'TYPE', 'START DATE', 'END DATE', 'USAGE', 'UNITS'},
            'corporate_travel': {'Employee', 'ExpenseType', 'TransactionDate', 'Amount', 'Currency'},
        }
        detected = set(reader.fieldnames or [])
        expected = expected_headers.get(source.source_type, set())
        if expected and not expected.intersection(detected):
            return Response({
                'error': f'CSV headers don\'t match expected format for {source.source_type}. '
                         f'Expected at least one of: {", ".join(sorted(expected))}. '
                         f'Got: {", ".join(sorted(detected)) or "none"}'
            }, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            batch = IngestionBatch.objects.create(
                source=source,
                status='importing',
                total_records=len(rows),
                uploaded_by=request.user.username,
            )

            source_records = []

            for i, row in enumerate(rows):
                raw_quantity = str(row.get('quantity', row.get('Menge', row.get('USAGE', ''))))
                raw_unit = str(row.get('unit', row.get('MEINS', row.get('UNITS', ''))))
                raw_date = str(row.get('date', row.get('BUDAT', row.get('START DATE', row.get('TransactionDate', '')))))
                raw_desc = str(row.get('description', row.get('material_description', row.get('MAKTX', row.get('TYPE', '')))))

                sr = SourceRecord(
                    batch=batch,
                    row_number=i + 1,
                    raw_data=row,
                    data_source=source.source_type,
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
            organization=source.organization,
            action='batch_created',
            actor=request.user.username,
            record_type='IngestionBatch',
            record_id=batch.id,
            description=f"Ingested {len(rows)} rows from {source.name}",
        )

        return Response({
            'batch_id': batch.id,
            'total': result['total'],
            'passed': result['passed'],
            'failed': result['failed'],
            'suspicious': result['suspicious'],
        })

    @action(detail=False, methods=['get'])
    def preview(self, request):
        source_type = request.query_params.get('source_type', 'sap_fuel')
        csv_template = SAMPLE_CSVS.get(source_type, SAMPLE_CSVS['sap_fuel'])
        return Response({'source_type': source_type, 'sample_headers': csv_template[:3], 'row_count': len(csv_template)})


SAMPLE_CSVS = {
    'sap_fuel': [
        {'Material': '30003543', 'Plant': 'DE01', 'Menge': '5000', 'MEINS': 'L', 'BUDAT': '01.03.2024', 'material_description': 'Diesel', 'MATL_GROUP': 'FUEL', 'movement_type': '321'},
        {'Material': '30003544', 'Plant': 'DE01', 'Menge': '200', 'MEINS': 'KG', 'BUDAT': '02.03.2024', 'material_description': 'Natural Gas', 'MATL_GROUP': 'FUEL', 'movement_type': '101'},
    ],
    'utility_electricity': [
        {'Meter ID': 'MTR-001', 'TYPE': 'Electric usage', 'START DATE': '2024-01-01', 'END DATE': '2024-01-31', 'USAGE': '45000', 'UNITS': 'kWh', 'COST': '5400.00', 'NOTES': ''},
        {'Meter ID': 'MTR-001', 'TYPE': 'Electric usage', 'START DATE': '2024-02-01', 'END DATE': '2024-02-28', 'USAGE': '42000', 'UNITS': 'kWh', 'COST': '5040.00', 'NOTES': '* This was estimated'},
    ],
    'corporate_travel': [
        {'Employee': 'JSmith', 'ExpenseType': 'AIRFR', 'TransactionDate': '2024-03-15', 'Amount': '1250.00', 'Currency': 'USD', 'Origin': 'JFK', 'Destination': 'LHR', 'Description': 'NY-London flight'},
        {'Employee': 'JSmith', 'ExpenseType': 'HOTEL', 'TransactionDate': '2024-03-15', 'Amount': '850.00', 'Currency': 'USD', 'CheckIn': '2024-03-15', 'CheckOut': '2024-03-18', 'Description': 'London Marriott'},
    ],
}
