import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { api, STATUS_COLORS } from '../lib/api'
import type { IngestionBatch, DataSource, AuditLog, AnalyticsData } from '../lib/api'
import type { LayoutContext } from '../Layout'

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 120
  const h = 32
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(' ')
  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { esgTab, sourceFilter } = useOutletContext<LayoutContext>()
  const [batches, setBatches] = useState<IngestionBatch[]>([])
  const [_sources, setSources] = useState<DataSource[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getSources(), api.getBatches(), api.getAuditLogs()]).then(
      ([src, bat, log]) => {
        setSources(src.results)
        setBatches(bat.results)
        setLogs(log.results)
        setLoading(false)
      }
    )
  }, [])

  useEffect(() => {
    const params: { scope?: string; source_type?: string } = {}
    if (esgTab === 'Social') params.scope = '2'
    else if (esgTab === 'Governance') params.scope = '3'
    if (sourceFilter) {
      const src = _sources.find((s) => s.id === sourceFilter)
      if (src) params.source_type = src.source_type
    }
    api.getAnalytics(params).then(setAnalytics).catch(() => {})
  }, [esgTab, sourceFilter, _sources])

  const totalRecords = batches.reduce((s, b) => s + b.total_records, 0)
  const totalFailed = batches.reduce((s, b) => s + b.failed_count, 0)
  const totalSuspicious = batches.reduce((s, b) => s + b.suspicious_count, 0)
  const totalPassed = batches.reduce((s, b) => s + b.passed_count, 0)
  const totalCo2e = Number(analytics?.total?.total_co2e || 0)
  const scopeMap = useMemo(() => {
    const m: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
    for (const s of analytics?.by_scope || []) m[s.scope] = Number(s.total_co2e) || 0
    return m
  }, [analytics])
  const scope1 = scopeMap[1]
  const scope2 = scopeMap[2]
  const scope3 = scopeMap[3]

  const monthlyCounts = useMemo(() => {
    if (!analytics?.monthly) return []
    return analytics.monthly.map((m) => ({
      month: m.month || '',
      count: m.count || 0,
    }))
  }, [analytics])

  const pendingReview = batches.filter((b) => b.status === 'staged').length
  const approved = batches.filter((b) => b.status === 'approved').length
  const locked = batches.filter((b) => b.status === 'locked').length

  const passRate = totalRecords > 0 ? Math.round((totalPassed / totalRecords) * 100) : 0
  const failRate = totalRecords > 0 ? Math.round((totalFailed / totalRecords) * 100) : 0
  const susRate = totalRecords > 0 ? Math.round((totalSuspicious / totalRecords) * 100) : 0
  const recordCount = analytics?.total?.total_count || 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#1ea97c] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[#9ca3af]">Loading dashboard...</span>
        </div>
      </div>
    )
  }

  const scopeColors: Record<number, string> = { 1: 'from-rose-500 to-pink-600', 2: 'from-blue-500 to-cyan-600', 3: 'from-amber-500 to-orange-600' }
  const scopeBgColors: Record<number, string> = { 1: 'bg-rose-100 text-rose-700', 2: 'bg-blue-100 text-blue-700', 3: 'bg-amber-100 text-amber-700' }
  const maxScope = Math.max(scope1, scope2, scope3, 0.001)

  const statusDots: Record<string, string> = {
    staged: 'bg-yellow-400', approved: 'bg-green-400', locked: 'bg-blue-400',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Dashboard</h1>
          <p className="text-sm text-[#6b7280] mt-1">Overview of all ingestion activity and emissions data</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-[#9ca3af]">
          <span className="w-2 h-2 rounded-full bg-[#1ea97c] animate-pulse" />
          System active
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Records"
          value={totalRecords.toLocaleString()}
          sub={passRate + failRate + susRate > 0 ? `${passRate}% pass rate` : undefined}
          trend={passRate >= 80 ? 'up' : 'down'}
        />
        <StatCard
          label="Total CO₂e"
          value={`${totalCo2e.toLocaleString(undefined, { maximumFractionDigits: 1 })} t`}
          sub={`S1: ${scope1.toFixed(1)} · S2: ${scope2.toFixed(1)} · S3: ${scope3.toFixed(1)}`}
        />
        <StatCard
          label="Pending Review"
          value={String(pendingReview)}
          sub={`${approved} approved · ${locked} locked`}
          urgent={pendingReview > 0}
          onClick={() => navigate('/review')}
        />
        <StatCard
          label="Data Quality"
          value={`${failRate}% failed`}
          sub={`${totalSuspicious} suspicious rows flagged`}
          trend={failRate > 10 ? 'down' : undefined}
          onClick={() => navigate('/review')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-[#eef0f2] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Emissions by Scope</h2>
              <span className="text-xs text-[#9ca3af]">{recordCount} records</span>
            </div>
            <div className="space-y-4">
              {[
                { scope: 1, label: 'Scope 1 — Direct', value: scope1 },
                { scope: 2, label: 'Scope 2 — Purchased Energy', value: scope2 },
                { scope: 3, label: 'Scope 3 — Value Chain', value: scope3 },
              ].map((s) => (
                <div key={s.scope}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${scopeBgColors[s.scope]}`}>
                        S{s.scope}
                      </span>
                      <span className="text-sm text-[#4b5563]">{s.label}</span>
                    </div>
                    <span className="text-sm font-mono font-medium text-[#1a1a1a]">
                      {s.value.toFixed(1)} tCO₂e
                    </span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${scopeColors[s.scope]} transition-all duration-1000`}
                      style={{ width: `${maxScope > 0 ? (s.value / maxScope) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#eef0f2] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Ingestion Batches</h2>
              <span className="text-xs text-[#9ca3af]">{batches.length} total</span>
            </div>
            <div className="overflow-hidden rounded-xl border border-[#eef0f2]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f9fafb] text-left text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">✓</th>
                    <th className="px-4 py-3 text-right">✗</th>
                    <th className="px-4 py-3 text-right">⚠</th>
                    <th className="px-4 py-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} onClick={() => navigate(`/review?batch=${b.id}`)} className="border-t border-[#eef0f2] hover:bg-[#e8f6ef]/30 transition-colors cursor-pointer">
                      <td className="px-4 py-3 font-medium text-[#1a1a1a]">{b.source_name}</td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-[#6b7280] uppercase">
                          {b.source_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[b.status] || ''}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDots[b.status] || 'bg-gray-400'}`} />
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-[#1a1a1a]">{b.total_records}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-green-600">{b.passed_count}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-red-500">{b.failed_count}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-amber-500">{b.suspicious_count}</td>
                      <td className="px-4 py-3 text-right text-xs text-[#9ca3af]">
                        {new Date(b.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-[#eef0f2] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Data Quality</h2>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${failRate > 10 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                {failRate > 10 ? 'Needs attention' : 'Good'}
              </span>
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[#6b7280]">Passed</span>
                  <span className="font-mono text-green-600 font-medium">{passRate}%</span>
                </div>
                <MiniBar value={passRate} max={100} color="bg-gradient-to-r from-green-400 to-emerald-500" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[#6b7280]">Failed</span>
                  <span className="font-mono text-red-500 font-medium">{failRate}%</span>
                </div>
                <MiniBar value={failRate} max={100} color="bg-gradient-to-r from-red-400 to-rose-500" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[#6b7280]">Suspicious</span>
                  <span className="font-mono text-amber-500 font-medium">{susRate}%</span>
                </div>
                <MiniBar value={susRate} max={100} color="bg-gradient-to-r from-amber-400 to-yellow-500" />
              </div>
            </div>
            {monthlyCounts.length > 0 && (
              <div className="mt-6 pt-4 border-t border-[#eef0f2]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[#1a1a1a]">Records per Month</span>
                  <Sparkline data={monthlyCounts.map((m) => m.count)} color="#10b981" />
                </div>
                <div className="flex items-end gap-1 h-16">
                  {monthlyCounts.map((m, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-emerald-400 to-teal-400 transition-all duration-500"
                        style={{ height: `${(m.count / Math.max(...monthlyCounts.map((x) => x.count))) * 48}px` }}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-[#9ca3af] mt-1">
                  <span>Jan</span><span>Jun</span><span>Dec</span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#eef0f2] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-[#1a1a1a]">Recent Activity</h2>
              <span className="text-xs text-[#9ca3af]">Latest {Math.min(logs.length, 8)}</span>
            </div>
            <div className="relative">
              <div className="absolute left-2 top-1 bottom-1 w-px bg-[#eef0f2]" />
              <div className="space-y-0">
                {logs.slice(0, 8).map((log) => (
                  <div key={log.id} className="relative flex items-start gap-3 pb-3 pl-6">
                    <div className="absolute left-1.5 top-1.5 w-1.5 h-1.5 rounded-full bg-[#1ea97c] ring-2 ring-white z-10" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-[#1ea97c] uppercase tracking-wider">{log.action.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-[#9ca3af]">{new Date(log.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      {log.description && <p className="text-xs text-[#6b7280] truncate mt-0.5">{log.description}</p>}
                      <span className="text-[10px] text-[#9ca3af]">by {log.actor}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, trend, urgent, onClick }: {
  label: string; value: string; sub?: string; trend?: string; urgent?: boolean; onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`relative rounded-2xl border bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-200 ${
        onClick ? 'hover:shadow-md cursor-pointer hover:border-[#1ea97c]' : ''
      } ${urgent ? 'border-[#fde8e1]' : 'border-[#eef0f2]'}`}
    >
      {urgent && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-[#e94e1b] rounded-full animate-ping opacity-75" />
      )}
      <div className="flex items-start justify-between">
        <div className="text-left">
          <p className="text-xs font-medium text-[#9ca3af] uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-[#1a1a1a] mt-1">{value}</p>
          {sub && <p className="text-[11px] text-[#9ca3af] mt-1">{sub}</p>}
        </div>
        <div className="flex flex-col items-end gap-1">
          {trend === 'up' && <span className="text-[10px] text-green-500 font-medium">↑</span>}
          {trend === 'down' && <span className="text-[10px] text-red-400 font-medium">↓</span>}
        </div>
      </div>
    </Comp>
  )
}
