from django.db import models
from django.contrib.auth import get_user_model
from decimal import Decimal

User = get_user_model()


class Organization(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class DataSource(models.Model):
    SOURCE_TYPES = [
        ('sap_fuel', 'SAP Fuel & Procurement'),
        ('utility_electricity', 'Utility Electricity'),
        ('corporate_travel', 'Corporate Travel'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='sources')
    source_type = models.CharField(max_length=50, choices=SOURCE_TYPES)
    name = models.CharField(max_length=255)
    config = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['organization', 'source_type']

    def __str__(self):
        return f"{self.organization.name} - {self.get_source_type_display()}"


class IngestionBatch(models.Model):
    STATUS_CHOICES = [
        ('importing', 'Importing'),
        ('staged', 'Staged for Review'),
        ('reviewing', 'Under Review'),
        ('approved', 'Approved'),
        ('locked', 'Locked for Audit'),
    ]

    source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name='batches')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='importing')
    total_records = models.IntegerField(default=0)
    passed_count = models.IntegerField(default=0)
    failed_count = models.IntegerField(default=0)
    suspicious_count = models.IntegerField(default=0)
    uploaded_by = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Batch {self.id} - {self.source} - {self.status}"


class SourceRecord(models.Model):
    STATUS_CHOICES = [
        ('staged', 'Staged'),
        ('passed', 'Passed Validation'),
        ('failed', 'Failed Validation'),
        ('suspicious', 'Suspicious'),
    ]

    batch = models.ForeignKey(IngestionBatch, on_delete=models.CASCADE, related_name='source_records')
    row_number = models.IntegerField()
    raw_data = models.JSONField()
    data_source = models.CharField(max_length=50, choices=DataSource.SOURCE_TYPES)

    raw_quantity = models.CharField(max_length=255, blank=True)
    raw_unit = models.CharField(max_length=50, blank=True)
    raw_date = models.CharField(max_length=255, blank=True)
    raw_description = models.TextField(blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='staged')
    failure_reasons = models.JSONField(default=list, blank=True)
    validation_warnings = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['batch', 'row_number']
        indexes = [
            models.Index(fields=['batch', 'status']),
        ]

    def __str__(self):
        return f"SR {self.id} (row {self.row_number}) - {self.status}"


class EmissionFactor(models.Model):
    CATEGORY_CHOICES = [
        ('diesel', 'Diesel'),
        ('gasoline', 'Gasoline'),
        ('natural_gas', 'Natural Gas'),
        ('kerosene', 'Kerosene'),
        ('jet_fuel', 'Jet Fuel'),
        ('grid_electricity', 'Grid Electricity'),
        ('flight_short', 'Flight < 500 km'),
        ('flight_medium', 'Flight 500-1500 km'),
        ('flight_long', 'Flight > 1500 km'),
        ('hotel', 'Hotel Stay'),
        ('car_rental', 'Car Rental'),
        ('bus', 'Bus Travel'),
        ('rail', 'Rail Travel'),
    ]

    REGION_CHOICES = [
        ('GLOBAL', 'Global Average'),
        ('US', 'United States'),
        ('EU', 'European Union'),
        ('UK', 'United Kingdom'),
    ]

    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    scope = models.IntegerField(choices=[(1, 'Scope 1'), (2, 'Scope 2'), (3, 'Scope 3')])
    region = models.CharField(max_length=20, choices=REGION_CHOICES, default='GLOBAL')
    factor = models.DecimalField(max_digits=20, decimal_places=10)
    factor_unit = models.CharField(max_length=100, help_text="e.g. tonnes_CO2e_per_kWh, kg_CO2e_per_km")
    source = models.CharField(max_length=255, help_text="e.g. DEFRA 2024, EPA eGRID 2023")
    valid_from = models.DateField()
    valid_to = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['category', 'region', '-valid_from']
        indexes = [
            models.Index(fields=['category', 'region', 'valid_from']),
        ]

    def __str__(self):
        return f"{self.get_category_display()} - {self.region} - {self.factor}"


class UnitConversion(models.Model):
    from_unit = models.CharField(max_length=50)
    to_unit = models.CharField(max_length=50)
    factor = models.DecimalField(max_digits=20, decimal_places=10)
    category = models.CharField(max_length=50, blank=True, help_text="Optional: restrict to emission category")

    class Meta:
        unique_together = ['from_unit', 'to_unit', 'category']
        ordering = ['from_unit']

    def __str__(self):
        return f"1 {self.from_unit} = {self.factor} {self.to_unit}"


class NormalizedRecord(models.Model):
    SCOPE_CHOICES = [
        (1, 'Scope 1 - Direct'),
        (2, 'Scope 2 - Purchased Energy'),
        (3, 'Scope 3 - Value Chain'),
    ]

    CATEGORY_CHOICES = [
        ('diesel', 'Diesel'),
        ('gasoline', 'Gasoline'),
        ('natural_gas', 'Natural Gas'),
        ('kerosene', 'Kerosene'),
        ('jet_fuel', 'Jet Fuel'),
        ('grid_electricity', 'Grid Electricity'),
        ('flight_short', 'Flight < 500 km'),
        ('flight_medium', 'Flight 500-1500 km'),
        ('flight_long', 'Flight > 1500 km'),
        ('hotel', 'Hotel Stay'),
        ('car_rental', 'Car Rental'),
        ('bus', 'Bus Travel'),
        ('rail', 'Rail Travel'),
        ('procurement', 'General Procurement'),
    ]

    STATUS_CHOICES = [
        ('needs_review', 'Needs Review'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
        ('flagged', 'Flagged for Review'),
        ('locked', 'Locked for Audit'),
    ]

    source_record = models.ForeignKey(SourceRecord, on_delete=models.SET_NULL, null=True, blank=True, related_name='normalized_records')
    batch = models.ForeignKey(IngestionBatch, on_delete=models.CASCADE, related_name='normalized_records')
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='records')

    scope = models.IntegerField(choices=SCOPE_CHOICES)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)
    source_type = models.CharField(max_length=50, choices=DataSource.SOURCE_TYPES)

    activity_date = models.DateField()
    facility = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)

    quantity = models.DecimalField(max_digits=20, decimal_places=6)
    unit = models.CharField(max_length=50)

    co2e = models.DecimalField(max_digits=20, decimal_places=6, null=True, blank=True)
    co2e_unit = models.CharField(max_length=50, default='tonnes_CO2e')

    metadata = models.JSONField(default=dict, blank=True)
    raw_values = models.JSONField(default=dict, blank=True, help_text="Snapshot of raw values for diff view")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='needs_review')
    version = models.IntegerField(default=1)
    reviewed_by = models.CharField(max_length=255, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['organization', 'status']),
            models.Index(fields=['batch', 'status']),
            models.Index(fields=['scope', 'category']),
        ]

    def __str__(self):
        return f"NR {self.id} - {self.get_category_display()} - {self.quantity} {self.unit}"


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='members')

    class Meta:
        ordering = ['user__username']

    def __str__(self):
        return f"{self.user.username} @ {self.organization.name}"


class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('batch_created', 'Batch Created'),
        ('record_ingested', 'Record Ingested'),
        ('record_approved', 'Record Approved'),
        ('record_rejected', 'Record Rejected'),
        ('record_flagged', 'Record Flagged'),
        ('record_locked', 'Record Locked'),
        ('record_unlocked', 'Record Unlocked'),
        ('batch_locked', 'Batch Locked'),
        ('batch_approved', 'Batch Approved'),
        ('record_edited', 'Record Edited'),
    ]

    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name='audit_logs')
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    actor = models.CharField(max_length=255, blank=True)
    record_type = models.CharField(max_length=50, blank=True, help_text="Model name")
    record_id = models.IntegerField(null=True, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.created_at.isoformat()} - {self.action} by {self.actor}"
