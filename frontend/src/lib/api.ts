const BASE = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || res.statusText)
  }
  return res.json()
}

export interface Organization {
  id: number; name: string; slug: string; created_at: string
}

export interface DataSource {
  id: number; organization: number; source_type: string; name: string; config: Record<string, unknown>; created_at: string
}

export interface IngestionBatch {
  id: number; source: number; source_name: string; source_type: string;
  status: string; total_records: number; passed_count: number;
  failed_count: number; suspicious_count: number;
  uploaded_by: string; notes: string; created_at: string; updated_at: string
}

export interface SourceRecord {
  id: number; batch: number; row_number: number; raw_data: Record<string, string>;
  data_source: string; raw_quantity: string; raw_unit: string; raw_date: string;
  raw_description: string; status: string; failure_reasons: string[];
  validation_warnings: string[]; created_at: string
}

export interface NormalizedRecord {
  id: number; source_record: number | null; batch: number; organization: number;
  scope: number; category: string; source_type: string;
  activity_date: string; facility: string; description: string;
  quantity: string; unit: string; co2e: string | null; co2e_unit: string;
  metadata: Record<string, unknown>; raw_values: Record<string, string>;
  status: string; version: number; reviewed_by: string; reviewed_at: string | null;
  rejection_reason: string; created_at: string; updated_at: string
}

export interface AuditLog {
  id: number; organization: number; action: string; actor: string;
  record_type: string; record_id: number | null; changes: Record<string, unknown>;
  description: string; created_at: string
}

export interface PaginatedResponse<T> {
  count: number; next: string | null; previous: string | null; results: T[]
}

export interface AnalyticsData {
  by_scope: { scope: number; total_co2e: number; count: number }[]
  by_category: { category: string; total_co2e: number; count: number }[]
  monthly: { month: string; total_co2e: number; total_qty: number; count: number }[]
  yearly: { year: number; total_co2e: number; total_qty: number; count: number }[]
  by_source: { source_type: string; total_co2e: number; total_qty: number; count: number }[]
  by_status: { status: string; count: number }[]
  total: { total_co2e: number | null; total_qty: number | null; total_count: number }
}

export interface AnalyticsDates {
  years: number[]
  months: number[]
}

export interface UploadResult {
  batch_id: number
  total: number
  passed: number
  failed: number
  suspicious: number
}

export const api = {
  getOrganizations: () => request<PaginatedResponse<Organization>>('/organizations'),
  getSources: (orgId?: number) =>
    request<PaginatedResponse<DataSource>>(`/sources${orgId ? `?organization=${orgId}` : ''}`),
  getBatches: (sourceId?: number) =>
    request<PaginatedResponse<IngestionBatch>>(`/batches${sourceId ? `?source=${sourceId}` : ''}`),
  getRecords: (params?: { batch?: number; status?: string; scope?: number; source_type?: string }) => {
    const q = new URLSearchParams()
    if (params?.batch) q.set('batch', String(params.batch))
    if (params?.status) q.set('status', params.status)
    if (params?.scope) q.set('scope', String(params.scope))
    if (params?.source_type) q.set('source_type', params.source_type)
    return request<PaginatedResponse<NormalizedRecord>>(`/records?${q}`)
  },
  getSourceRecords: (batchId: number) =>
    request<PaginatedResponse<SourceRecord>>(`/source-records?batch=${batchId}`),
  getAuditLogs: (orgId?: number) =>
    request<PaginatedResponse<AuditLog>>(`/audit-logs${orgId ? `?organization=${orgId}` : ''}`),
  getAnalytics: (params?: { year?: string; month?: string }) => {
    const q = new URLSearchParams()
    if (params?.year) q.set('year', params.year)
    if (params?.month) q.set('month', params.month)
    return request<AnalyticsData>(`/analytics?${q}`)
  },
  getAnalyticsDates: () => request<AnalyticsDates>('/analytics/dates'),
  uploadCSV: async (sourceId: number, file: File, uploadedBy?: string) => {
    const form = new FormData()
    form.append('source_id', String(sourceId))
    form.append('file', file)
    if (uploadedBy) form.append('uploaded_by', uploadedBy)
    const res = await fetch(`${BASE}/upload/csv`, { method: 'POST', body: form })
    if (!res.ok) throw new Error(await res.text())
    return res.json() as Promise<UploadResult>
  },
  bulkAction: (action: string, recordIds: number[], reviewedBy = 'analyst', reason = '') =>
    request('/records/bulk_action', {
      method: 'POST',
      body: JSON.stringify({ action, record_ids: recordIds, reviewed_by: reviewedBy, rejection_reason: reason }),
    }),
  approveBatch: (batchId: number) =>
    request(`/batches/${batchId}/approve`, { method: 'POST' }),
  lockBatch: (batchId: number) =>
    request(`/batches/${batchId}/lock`, { method: 'POST' }),
}

export const SCOPE_LABELS: Record<number, string> = {
  1: 'Scope 1 - Direct',
  2: 'Scope 2 - Purchased Energy',
  3: 'Scope 3 - Value Chain',
}

export const STATUS_COLORS: Record<string, string> = {
  needs_review: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  flagged: 'bg-orange-100 text-orange-800',
  locked: 'bg-blue-100 text-blue-800',
  staged: 'bg-gray-100 text-gray-800',
  importing: 'bg-purple-100 text-purple-800',
}

export const CATEGORY_LABELS: Record<string, string> = {
  diesel: 'Diesel', gasoline: 'Gasoline', natural_gas: 'Natural Gas',
  kerosene: 'Kerosene', jet_fuel: 'Jet Fuel', grid_electricity: 'Grid Electricity',
  flight_short: 'Flight (<500km)', flight_medium: 'Flight (500-1500km)',
  flight_long: 'Flight (>1500km)', hotel: 'Hotel Stay', car_rental: 'Car Rental',
  bus: 'Bus Travel', rail: 'Rail Travel', procurement: 'Procurement',
}
