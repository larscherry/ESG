from django.contrib import admin
from django.urls import path, include, re_path
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static

from rest_framework.routers import DefaultRouter
from ingestion.views import (
    OrganizationViewSet, DataSourceViewSet,
    IngestionBatchViewSet, SourceRecordViewSet,
    NormalizedRecordViewSet, AuditLogViewSet,
    EmissionFactorViewSet, UnitConversionViewSet,
    AnalyticsViewSet, UploadViewSet,
)

router = DefaultRouter(trailing_slash=False)
router.register(r'organizations', OrganizationViewSet)
router.register(r'sources', DataSourceViewSet)
router.register(r'batches', IngestionBatchViewSet)
router.register(r'source-records', SourceRecordViewSet)
router.register(r'records', NormalizedRecordViewSet)
router.register(r'audit-logs', AuditLogViewSet)
router.register(r'emission-factors', EmissionFactorViewSet)
router.register(r'unit-conversions', UnitConversionViewSet)
router.register(r'analytics', AnalyticsViewSet, basename='analytics')
router.register(r'upload', UploadViewSet, basename='upload')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

urlpatterns += [
    re_path(r'^.*$', TemplateView.as_view(template_name='index.html')),
]
