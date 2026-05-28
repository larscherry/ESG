from django.contrib import admin
from .models import (
    Organization, DataSource, IngestionBatch,
    SourceRecord, NormalizedRecord, AuditLog,
    EmissionFactor, UnitConversion,
)

admin.site.register(Organization)
admin.site.register(DataSource)
admin.site.register(IngestionBatch)
admin.site.register(SourceRecord)
admin.site.register(NormalizedRecord)
admin.site.register(AuditLog)
admin.site.register(EmissionFactor)
admin.site.register(UnitConversion)
