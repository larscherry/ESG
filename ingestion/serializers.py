from rest_framework import serializers
from .models import (
    Organization, DataSource, IngestionBatch,
    SourceRecord, NormalizedRecord, AuditLog,
    EmissionFactor, UnitConversion,
)


class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = '__all__'


class DataSourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataSource
        fields = '__all__'


class IngestionBatchSerializer(serializers.ModelSerializer):
    source_name = serializers.CharField(source='source.name', read_only=True)
    source_type = serializers.CharField(source='source.source_type', read_only=True)

    class Meta:
        model = IngestionBatch
        fields = '__all__'


class SourceRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = SourceRecord
        fields = '__all__'


class NormalizedRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = NormalizedRecord
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'version']


class NormalizedRecordActionSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=['approve', 'reject', 'flag', 'lock'])
    record_ids = serializers.ListField(child=serializers.IntegerField())
    reviewed_by = serializers.CharField(max_length=255, default='analyst')
    rejection_reason = serializers.CharField(required=False, allow_blank=True)


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = '__all__'


class EmissionFactorSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmissionFactor
        fields = '__all__'


class UnitConversionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnitConversion
        fields = '__all__'


class UploadSerializer(serializers.Serializer):
    source_id = serializers.IntegerField()
    file = serializers.FileField()
