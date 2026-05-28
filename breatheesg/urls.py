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
from breatheesg.auth_views import login, me, logout as auth_logout, csrf_token

router = DefaultRouter(trailing_slash=False)
router.register(r'organizations', OrganizationViewSet, basename='organization')
router.register(r'sources', DataSourceViewSet, basename='datasource')
router.register(r'batches', IngestionBatchViewSet, basename='ingestionbatch')
router.register(r'source-records', SourceRecordViewSet, basename='sourcerecord')
router.register(r'records', NormalizedRecordViewSet, basename='normalizedrecord')
router.register(r'audit-logs', AuditLogViewSet, basename='auditlog')
router.register(r'emission-factors', EmissionFactorViewSet)
router.register(r'unit-conversions', UnitConversionViewSet)
router.register(r'analytics', AnalyticsViewSet, basename='analytics')
router.register(r'upload', UploadViewSet, basename='upload')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/csrf', csrf_token, name='auth-csrf'),
    path('api/auth/login', login, name='auth-login'),
    path('api/auth/me', me, name='auth-me'),
    path('api/auth/logout', auth_logout, name='auth-logout'),
    path('api/', include(router.urls)),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

urlpatterns += [
    re_path(r'^.*$', TemplateView.as_view(template_name='index.html')),
]
