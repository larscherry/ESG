from django.contrib import admin
from .models import (
    Organization, DataSource, IngestionBatch,
    SourceRecord, NormalizedRecord, AuditLog,
    EmissionFactor, UnitConversion,
)


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'created_at']
    prepopulated_fields = {'slug': ('name',)}


@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
    list_display = ['name', 'source_type', 'organization', 'created_at']
    list_filter = ['source_type', 'organization']


@admin.register(IngestionBatch)
class IngestionBatchAdmin(admin.ModelAdmin):
    list_display = ['id', 'source', 'status', 'total_records', 'passed_count', 'failed_count', 'suspicious_count', 'created_at']
    list_filter = ['status', 'source']
    search_fields = ['source__name', 'uploaded_by']


@admin.register(SourceRecord)
class SourceRecordAdmin(admin.ModelAdmin):
    list_display = ['id', 'batch', 'row_number', 'status', 'data_source', 'created_at']
    list_filter = ['status', 'data_source']


@admin.register(NormalizedRecord)
class NormalizedRecordAdmin(admin.ModelAdmin):
    list_display = ['id', 'category', 'scope', 'activity_date', 'quantity', 'unit', 'co2e', 'status', 'batch']
    list_filter = ['status', 'scope', 'category', 'source_type']
    search_fields = ['facility', 'description']


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'action', 'actor', 'organization', 'record_type', 'record_id']
    list_filter = ['action', 'organization']
    readonly_fields = ['created_at']


@admin.register(EmissionFactor)
class EmissionFactorAdmin(admin.ModelAdmin):
    list_display = ['category', 'scope', 'region', 'factor', 'source', 'valid_from']
    list_filter = ['category', 'region']


@admin.register(UnitConversion)
class UnitConversionAdmin(admin.ModelAdmin):
    list_display = ['from_unit', 'to_unit', 'factor', 'category']
