import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, STATUS_COLORS, CATEGORY_LABELS } from '../lib/api'
import type { IngestionBatch, NormalizedRecord, SourceRecord } from '../lib/api'
import ConfirmDialog from '../components/ConfirmDialog'
import RecordDetail from './RecordDetail'

type SortKey = 'scope' | 'category' | 'activity_date' | 'quantity' | 'status' | 'co2e'
type SortDir = 'asc' | 'desc'

export default function Review() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [batches, setBatches] = useState<IngestionBatch[]>([])
  const [selectedBatch, setSelectedBatch] = useState(searchParams.get('batch') || '')
  const [records, setRecords] = useState<NormalizedRecord[]>([])
  const [sourceRecords, setSourceRecords] = useState<Map<number, SourceRecord>>(new Map())
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [actionMsg, setActionMsg] = useState('')
  const [error, setError] = useState('')
  const [confirmAction, setConfirmAction] = useState<{ action: string } | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('activity_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [search, setSearch] = useState('')

  useEffect(() => {
    api.getBatches()
      .then((b) => {
        setBatches(b.results)
        if (!searchParams.get('batch') && b.results.length > 0) {
          const pending = b.results.find((batch) => batch.status === 'staged')
          if (pending) {
            setSelectedBatch(String(pending.id))
          }
        }
      })
      .catch(() => setError('Failed to load batches'))
  }, [])

  useEffect(() => {
    if (expandedRow) {
      setTimeout(() => {
        document.getElementById(`detail-${expandedRow}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [expandedRow])

  useEffect(() => {
    if (!selectedBatch) { setRecords([]); return }
    setLoading(true)
    setError('')
    const params: Record<string, string | number | undefined> = { batch: Number(selectedBatch) }
    if (statusFilter) params.status = statusFilter
    api.getRecords(params)
      .then(async (r) => {
        setRecords(r.results)
        if (r.results.length > 0) {
          try {
            const sr = await api.getSourceRecords(Number(selectedBatch))
            const map = new Map<number, SourceRecord>()
            sr.results.forEach((s) => map.set(s.id, s))
            setSourceRecords(map)
          } catch {
            // source records are non-critical
          }
        }
        setLoading(false)
      })
      .catch((e) => {
        setError(`Failed to load records: ${e.message}`)
        setLoading(false)
      })
  }, [selectedBatch, statusFilter])

  const sort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const sorted = [...records].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    let cmp = 0
    switch (sortKey) {
      case 'scope': cmp = a.scope - b.scope; break
      case 'category': cmp = a.category.localeCompare(b.category); break
      case 'activity_date': cmp = a.activity_date.localeCompare(b.activity_date); break
      case 'quantity': cmp = Number(a.quantity) - Number(b.quantity); break
      case 'co2e': cmp = Number(a.co2e || 0) - Number(b.co2e || 0); break
      case 'status': cmp = a.status.localeCompare(b.status); break
    }
    return cmp * dir
  })

  const filtered = search
    ? sorted.filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(search.toLowerCase()))
      )
    : sorted

  const toggle = (id: number) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((r) => r.id)))
  }

  const doAction = async (action: string, _reason = '') => {
    if (selected.size === 0) return
    setConfirmAction(null)
    try {
      await api.bulkAction(action, Array.from(selected), action === 'reject' ? 'Rejected by analyst' : '')
      setActionMsg(`${action} applied to ${selected.size} records`)
      setSelected(new Set())
      await refreshRecords()
      setTimeout(() => setActionMsg(''), 3000)
    } catch (e: unknown) {
      setActionMsg(`Error: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  const doBatchAction = async (action: 'approve' | 'lock') => {
    if (!selectedBatch) return
    setConfirmAction(null)
    try {
      const fn = action === 'approve' ? api.approveBatch : api.lockBatch
      await fn(Number(selectedBatch))
      setActionMsg(`Batch ${action}d`)
      setTimeout(() => setActionMsg(''), 3000)
      api.getBatches().then((b) => setBatches(b.results)).catch(() => {})
      await refreshRecords()
    } catch (e: unknown) {
      setActionMsg(`Error: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  const refreshRecords = async () => {
    if (!selectedBatch) return
    const params: Record<string, string | number | undefined> = { batch: Number(selectedBatch) }
    if (statusFilter) params.status = statusFilter
    const r = await api.getRecords(params)
    setRecords(r.results)
  }

  const batch = batches.find((b) => String(b.id) === selectedBatch)

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

  const countByStatus = (status: string) => records.filter((r) => r.status === status).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Review & Approve</h1>
          <p className="text-sm text-[#6b7280] mt-1">Verify normalized data, flag issues, and approve for audit</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#eef0f2] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-[#6b7280] uppercase tracking-wider mb-1.5">Batch</label>
            <select
              className="w-full border border-[#eef0f2] rounded-xl px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1ea97c]/20 focus:border-[#1ea97c] outline-none transition-all"
              value={selectedBatch}
              onChange={(e) => { const val = e.target.value; setSelectedBatch(val); setSelected(new Set()); setExpandedRow(null); if (val) setSearchParams({ batch: val }); else setSearchParams({}) }}
            >
              <option value="">Select a batch to review...</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.source_name} · {b.total_records} rows · {b.status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6b7280] uppercase tracking-wider mb-1.5">Status</label>
            <select
              className="border border-[#eef0f2] rounded-xl px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1ea97c]/20 focus:border-[#1ea97c] outline-none transition-all"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="needs_review">Needs Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="flagged">Flagged</option>
              <option value="locked">Locked</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#6b7280] uppercase tracking-wider mb-1.5">Search</label>
            <input
              type="text"
              placeholder="Search records..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-[#eef0f2] rounded-xl px-4 py-2.5 text-sm bg-white focus:ring-2 focus:ring-[#1ea97c]/20 focus:border-[#1ea97c] outline-none transition-all w-48"
            />
          </div>
        </div>
      </div>

      {batch && (
        <div className="rounded-2xl border border-[#eef0f2] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-semibold text-[#1a1a1a]">{batch.source_name}</span>
            <span className="text-[#9ca3af]">·</span>
            <span className="text-[#6b7280]">Total: <strong className="text-[#1a1a1a]">{batch.total_records}</strong></span>
            <span className="flex items-center gap-1 text-[#6b7280]">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              Passed: <strong className="text-green-600">{batch.passed_count}</strong>
            </span>
            <span className="flex items-center gap-1 text-[#6b7280]">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              Failed: <strong className="text-red-500">{batch.failed_count}</strong>
            </span>
            <span className="flex items-center gap-1 text-[#6b7280]">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Suspicious: <strong className="text-amber-500">{batch.suspicious_count}</strong>
            </span>
            <span className="text-[#9ca3af]">·</span>
            <span className="text-xs text-[#9ca3af]">{new Date(batch.created_at).toLocaleString()}</span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => setConfirmAction({ action: 'approve_batch' })}
                disabled={batch.status === 'locked' || batch.status === 'approved'}
                className="px-4 py-2 bg-[#1ea97c] text-white rounded-xl text-sm font-medium hover:bg-[#178f69] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
              >
                ✓ Approve All
              </button>
              <button
                onClick={() => setConfirmAction({ action: 'lock_batch' })}
                disabled={batch.status === 'locked'}
                className="px-4 py-2 bg-[#0d0d0d] text-white rounded-xl text-sm font-medium hover:bg-[#1a1a1a] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
              >
                🔒 Lock for Audit
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-3 text-xs">
            {['needs_review', 'approved', 'rejected', 'flagged', 'locked'].map((s) => {
              const count = countByStatus(s)
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    statusFilter === s ? 'ring-2 ring-[#1ea97c]' : ''
                  } ${STATUS_COLORS[s] || ''}`}
                >
                  {s.replace('_', ' ')} ({count})
                </button>
              )
            })}
          </div>
        </div>
      )}

      {actionMsg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2 shadow-sm">
          <span>{actionMsg.includes('Error') ? '⚠' : '✓'}</span>
          {actionMsg}
        </div>
      )}

      {error && (
        <div className="bg-[#fde8e1] border border-[#f5c6b3] text-[#c2410c] px-4 py-3 rounded-xl text-sm flex items-center gap-2 shadow-sm">
          <span>⚠</span>
          {error}
        </div>
      )}

      {selected.size > 0 && (
        <div className="rounded-2xl border border-[#eef0f2] bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] flex items-center gap-3 sticky top-20 z-40">
          <span className="text-sm font-medium text-[#6b7280]">{selected.size} selected</span>
          <div className="flex gap-1.5">
            <button onClick={() => setConfirmAction({ action: 'approve' })} className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors">
              ✓ Approve
            </button>
            <button onClick={() => setConfirmAction({ action: 'reject' })} className="px-3 py-1.5 bg-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors">
              ✗ Reject
            </button>
            <button onClick={() => setConfirmAction({ action: 'flag' })} className="px-3 py-1.5 bg-orange-100 text-orange-600 rounded-lg text-sm font-medium hover:bg-orange-200 transition-colors">
              ⚑ Flag
            </button>
            <button onClick={() => setConfirmAction({ action: 'lock' })} className="px-3 py-1.5 bg-blue-100 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors">
              🔒 Lock
            </button>
          </div>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-[#9ca3af] hover:text-[#6b7280]">
            Clear
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-[#1ea97c] border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-[#9ca3af]">Loading records...</span>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#9ca3af]">
          <div className="text-4xl mb-3">📭</div>
          <p className="font-medium">{selectedBatch ? 'No records match the current filters' : 'Select a batch to begin'}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#eef0f2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f9fafb] text-left text-xs font-semibold text-[#6b7280] uppercase tracking-wider">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      onChange={toggleAll}
                      checked={selected.size === filtered.length && filtered.length > 0}
                      className="rounded border-gray-300 text-[#1ea97c] focus:ring-[#1ea97c]"
                    />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-[#1a1a1a] select-none" onClick={() => sort('scope')}>
                    Scope{sortArrow('scope')}
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-[#1a1a1a] select-none" onClick={() => sort('category')}>
                    Category{sortArrow('category')}
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-[#1a1a1a] select-none" onClick={() => sort('activity_date')}>
                    Date{sortArrow('activity_date')}
                  </th>
                  <th className="px-4 py-3">Facility</th>
                  <th className="px-4 py-3 cursor-pointer hover:text-[#1a1a1a] select-none text-right" onClick={() => sort('quantity')}>
                    Quantity{sortArrow('quantity')}
                  </th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3 cursor-pointer hover:text-[#1a1a1a] select-none text-right" onClick={() => sort('co2e')}>
                    CO₂e (t){sortArrow('co2e')}
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-[#1a1a1a] select-none" onClick={() => sort('status')}>
                    Status{sortArrow('status')}
                  </th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isExpanded = expandedRow === r.id
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-[#eef0f2] transition-colors ${
                        isExpanded ? 'bg-[#e8f6ef]/30' : 'hover:bg-[#e8f6ef]/20'
                      } ${selected.has(r.id) ? 'bg-[#e8f6ef]/40' : ''}`}
                    >
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          className="rounded border-gray-300 text-[#1ea97c] focus:ring-[#1ea97c]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          r.scope === 1 ? 'bg-rose-100 text-rose-700' : r.scope === 2 ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          S{r.scope}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-[#1a1a1a]">{CATEGORY_LABELS[r.category] || r.category}</td>
                      <td className="px-4 py-3 text-[#6b7280] text-xs">{r.activity_date}</td>
                      <td className="px-4 py-3 text-[#6b7280] max-w-40 truncate text-xs" title={r.facility}>{r.facility || '—'}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-[#1a1a1a]">{Number(r.quantity).toLocaleString()}</td>
                      <td className="px-4 py-3 text-[#6b7280] text-xs">{r.unit}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm text-[#1a1a1a]">{r.co2e ? Number(r.co2e).toFixed(3) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || ''}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            r.status === 'needs_review' ? 'bg-yellow-400 animate-pulse' :
                            r.status === 'approved' ? 'bg-green-400' :
                            r.status === 'rejected' ? 'bg-red-400' :
                            r.status === 'flagged' ? 'bg-orange-400' :
                            r.status === 'locked' ? 'bg-blue-400' : 'bg-gray-400'
                          }`} />
                          {r.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedRow(isExpanded ? null : r.id)}
                          className="text-[#9ca3af] hover:text-[#6b7280] transition-colors text-lg"
                        >
                          {isExpanded ? '▾' : '▸'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {expandedRow !== null && (() => {
            const expandedRecord = filtered.find((r) => r.id === expandedRow)
            if (!expandedRecord) return null
            return (
              <RecordDetail
                record={expandedRecord}
                sourceRecords={sourceRecords}
                onAction={(action, ids) => { setSelected(ids); setConfirmAction({ action }) }}
              />
            )
          })()}
        </div>
      )}

      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction?.action === 'approve' ? 'Approve Records' :
          confirmAction?.action === 'reject' ? 'Reject Records' :
          confirmAction?.action === 'flag' ? 'Flag Records' :
          confirmAction?.action === 'lock' ? 'Lock Records' :
          confirmAction?.action === 'approve_batch' ? 'Approve Entire Batch' :
          confirmAction?.action === 'lock_batch' ? 'Lock Batch for Audit' : 'Confirm'
        }
        message={
          confirmAction?.action === 'approve' ? `Approve ${selected.size} selected record(s)?` :
          confirmAction?.action === 'reject' ? `Reject ${selected.size} selected record(s)?` :
          confirmAction?.action === 'flag' ? `Flag ${selected.size} selected record(s) for review?` :
          confirmAction?.action === 'lock' ? `Lock ${selected.size} selected record(s)? This prevents further changes.` :
          confirmAction?.action === 'approve_batch' ? 'Approve all non-rejected records in this batch?' :
          confirmAction?.action === 'lock_batch' ? 'Lock this entire batch for audit? This action is irreversible without an admin unlock.' : ''
        }
        onConfirm={() => {
          if (confirmAction?.action === 'approve_batch') doBatchAction('approve')
          else if (confirmAction?.action === 'lock_batch') doBatchAction('lock')
          else if (confirmAction?.action) doAction(confirmAction.action)
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  )
}
