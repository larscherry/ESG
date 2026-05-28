import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
  AreaChart, Area,
} from 'recharts'
import { CATEGORY_LABELS, SCOPE_LABELS } from '../lib/api'

const CHART_TYPES = ['Bar', 'Pie', 'Line', 'Area'] as const
const METRICS = [
  { value: 'co2e', label: 'CO₂e (t)' },
  { value: 'qty', label: 'Quantity' },
  { value: 'count', label: 'Record Count' },
] as const
const GROUP_BY = [
  { value: 'scope', label: 'Scope' },
  { value: 'category', label: 'Category' },
  { value: 'source_type', label: 'Source Type' },
  { value: 'year', label: 'Year' },
  { value: 'month', label: 'Month' },
  { value: 'status', label: 'Status' },
] as const

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const PIE_COLORS = ['#1ea97c', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function formatData(raw: any, groupBy: string, metric: string) {
  const metricKey = metric === 'co2e' ? 'total_co2e' : metric === 'qty' ? 'total_qty' : 'count'

  if (groupBy === 'scope') {
    return (raw.by_scope || []).map((d: any) => ({
      name: SCOPE_LABELS[d.scope] || `Scope ${d.scope}`,
      value: d[metricKey] ?? 0,
    }))
  }
  if (groupBy === 'category') {
    return (raw.by_category || []).map((d: any) => ({
      name: CATEGORY_LABELS[d.category] || d.category,
      value: d[metricKey] ?? 0,
    }))
  }
  if (groupBy === 'source_type') {
    return (raw.by_source || []).map((d: any) => ({
      name: d.source_type.replace(/_/g, ' '),
      value: d[metricKey] ?? 0,
    }))
  }
  if (groupBy === 'month') {
    return (raw.monthly || []).map((d: any) => ({
      name: d.month,
      value: d[metricKey] ?? 0,
    }))
  }
  if (groupBy === 'year') {
    return (raw.yearly || []).map((d: any) => ({
      name: d.year,
      value: d[metricKey] ?? 0,
    }))
  }
  if (groupBy === 'status') {
    return (raw.by_status || []).map((d: any) => ({
      name: d.status.replace(/_/g, ' '),
      value: d.count,
    }))
  }
  return []
}

function ChartWidget({ chartType, data, metric }: {
  chartType: typeof CHART_TYPES[number]
  data: { name: string; value: number }[]
  metric: string
}) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-64 text-[#9ca3af] text-base">No data available for selected filters</div>
  }

  const valueLabel = METRICS.find((m) => m.value === metric)?.label || 'Value'

  if (chartType === 'Pie') {
    return (
      <ResponsiveContainer width="100%" height={400}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={140} innerRadius={50} label={({ name, value }) => `${name}: ${Number(value).toFixed(1)}`}>
            {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(v: any) => [Number(v).toFixed(2), valueLabel]} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (chartType === 'Line') {
    return (
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid stroke="#eef0f2" strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fill: '#374151', fontSize: 12 }} angle={-35} textAnchor="end" height={60} />
          <YAxis tick={{ fill: '#374151', fontSize: 12 }} />
          <Tooltip formatter={(v: any) => [Number(v).toFixed(2), valueLabel]} />
          <Line type="monotone" dataKey="value" stroke="#1ea97c" strokeWidth={2.5} dot={{ fill: '#1ea97c', r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    )
  }

  if (chartType === 'Area') {
    return (
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1ea97c" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#1ea97c" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eef0f2" strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fill: '#374151', fontSize: 12 }} angle={-35} textAnchor="end" height={60} />
          <YAxis tick={{ fill: '#374151', fontSize: 12 }} />
          <Tooltip formatter={(v: any) => [Number(v).toFixed(2), valueLabel]} />
          <Area type="monotone" dataKey="value" stroke="#1ea97c" strokeWidth={2.5} fill="url(#areaGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
        <CartesianGrid stroke="#eef0f2" strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fill: '#374151', fontSize: 12 }} angle={-35} textAnchor="end" height={60} />
        <YAxis tick={{ fill: '#374151', fontSize: 12 }} />
        <Tooltip formatter={(v: any) => [Number(v).toFixed(2), valueLabel]} />
        <Bar dataKey="value" fill="#1ea97c" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export default function Analytics() {
  const [data, setData] = useState<any>(null)
  const [chartType, setChartType] = useState<typeof CHART_TYPES[number]>('Bar')
  const [metric, setMetric] = useState('co2e')
  const [groupBy, setGroupBy] = useState('scope')
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [availableYears, setAvailableYears] = useState<number[]>([])
  const [availableMonths, setAvailableMonths] = useState<number[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/dates')
      .then((r) => r.json())
      .then((d) => {
        setAvailableYears(d.years || [])
        setAvailableMonths(d.months || [])
      })
      .catch(() => {})
  }, [])

  const fetchAnalytics = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedYear) params.set('year', selectedYear)
    if (selectedMonth) params.set('month', selectedMonth)
    fetch(`/api/analytics?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedYear, selectedMonth])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const chartData = data ? formatData(data, groupBy, metric) : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Analytics</h1>
          <p className="text-sm text-[#6b7280] mt-1">Explore emissions data with interactive charts and date filters</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-[#6b7280] bg-gray-50 px-4 py-2 rounded-lg border border-[#eef0f2]">
            {data?.total?.total_count || 0} records · {Number(data?.total?.total_co2e || 0).toFixed(1)} tCO₂e
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="rounded-2xl border border-[#eef0f2] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-end gap-4">
          {/* Date filters */}
          <div>
            <label className="block text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5">Year</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="border border-[#d1d5db] rounded-lg px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1ea97c]/20 focus:border-[#1ea97c] outline-none transition-all min-w-[110px] text-[#1a1a1a] font-medium"
            >
              <option value="">All Years</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5">Month</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="border border-[#d1d5db] rounded-lg px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1ea97c]/20 focus:border-[#1ea97c] outline-none transition-all min-w-[120px] text-[#1a1a1a] font-medium"
            >
              <option value="">All Months</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>{MONTH_NAMES[m] || m}</option>
              ))}
            </select>
          </div>
          <div className="w-px h-8 bg-[#eef0f2] self-center" />
          {/* Chart type */}
          <div>
            <label className="block text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5">Chart</label>
            <div className="flex gap-1 rounded-lg border border-[#d1d5db] p-0.5 bg-gray-50">
              {CHART_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setChartType(t)}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                    chartType === t ? 'bg-white text-[#1ea97c] shadow-sm border border-[#d1d5db]' : 'text-[#6b7280] hover:text-[#1a1a1a]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5">Metric</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="border border-[#d1d5db] rounded-lg px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1ea97c]/20 focus:border-[#1ea97c] outline-none transition-all text-[#1a1a1a] font-medium"
            >
              {METRICS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-1.5">Group By</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="border border-[#d1d5db] rounded-lg px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1ea97c]/20 focus:border-[#1ea97c] outline-none transition-all text-[#1a1a1a] font-medium"
            >
              {GROUP_BY.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-[#eef0f2] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-[#1ea97c] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ChartWidget chartType={chartType} data={chartData} metric={metric} />
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Records', value: String(data?.total?.total_count || 0) },
          { label: 'Total CO₂e', value: `${Number(data?.total?.total_co2e || 0).toFixed(1)} t` },
          { label: 'Total Quantity', value: `${Number(data?.total?.total_qty || 0).toLocaleString()} units` },
          { label: 'Data Points', value: String(chartData.length) },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-[#eef0f2] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">{s.label}</p>
            <p className="text-xl font-bold text-[#1a1a1a] mt-1">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
