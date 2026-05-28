import { SCOPE_LABELS, CATEGORY_LABELS } from '../lib/api'
import type { NormalizedRecord, SourceRecord } from '../lib/api'

export default function RecordDetail({ record, sourceRecords, onAction }: {
  record: NormalizedRecord
  sourceRecords: Map<number, SourceRecord>
  onAction: (action: string, ids: Set<number>) => void
}) {
  const sr = record.source_record ? sourceRecords.get(record.source_record) : null
  return (
    <div key={`detail-${record.id}`} id={`detail-${record.id}`} className="bg-[#e8f6ef]/20 border-t border-[#eef0f2] px-6 py-5 overflow-visible space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-[#eef0f2] bg-white p-4">
          <h4 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Full Original Record
          </h4>
          <table className="w-full text-xs">
            <tbody>
              {sr ? (
                (() => {
                  const metaRows: [string, string][] = [
                    ['Row Number', String(sr.row_number)],
                    ['Status', sr.status],
                    ['Source Type', record.source_type.replace(/_/g, ' ')],
                  ];
                  const dataRows = Object.entries(sr.raw_data || {});
                  return [...metaRows, ...dataRows].map(([k, v]) => (
                    <tr key={k} className="border-b border-[#eef0f2]">
                      <td className="py-1.5 pr-4 text-[#6b7280] font-mono w-2/5 whitespace-nowrap">{k}</td>
                      <td className="py-1.5 font-mono text-[#1a1a1a] break-all">{String(v || '')}</td>
                    </tr>
                  ));
                })()
              ) : (
                Object.entries(record.raw_values || {}).map(([k, v]) => (
                  <tr key={k} className="border-b border-[#eef0f2]">
                    <td className="py-1.5 pr-4 text-[#6b7280] font-mono w-2/5 whitespace-nowrap">{k}</td>
                    <td className="py-1.5 font-mono text-[#1a1a1a] break-all">{String(v)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-[#eef0f2] bg-white p-4">
          <h4 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Normalized Values
          </h4>
          <table className="w-full text-xs">
            <tbody>
              {[
                { label: 'Quantity', value: `${record.quantity} ${record.unit}`, diff: record.raw_values?.raw_quantity ? `${record.raw_values.raw_quantity} ${record.raw_values.raw_unit}` : null },
                { label: 'Activity Date', value: record.activity_date, diff: record.raw_values?.start_date || record.raw_values?.raw_date || null },
                { label: 'Scope', value: SCOPE_LABELS[record.scope] },
                { label: 'Category', value: CATEGORY_LABELS[record.category] || record.category },
                { label: 'CO₂e', value: record.co2e ? `${Number(record.co2e).toFixed(4)} ${record.co2e_unit}` : 'Not calculated' },
                { label: 'Facility', value: record.facility || '—' },
                { label: 'Description', value: record.description || '—' },
                { label: 'Source Type', value: record.source_type.replace(/_/g, ' ') },
              ].map(({ label, value, diff }) => (
                <tr key={label} className="border-b border-[#eef0f2]">
                  <td className="py-1.5 pr-4 text-[#6b7280] w-1/3 whitespace-nowrap">{label}</td>
                  <td className="py-1.5">
                    <span className="font-mono text-[#1a1a1a]">{value}</span>
                    {diff && String(diff) !== String(value) && (
                      <span className="ml-2 text-[10px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">
                        was: {diff}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {sr && (
        <div className="rounded-xl border border-[#eef0f2] bg-white p-4">
          <h4 className="text-xs font-semibold text-[#6b7280] uppercase tracking-wider mb-3">Changes from Source</h4>
          <div className="text-xs font-mono space-y-1.5">
            {(() => {
              const rawQty = String(record.raw_values?.raw_quantity ?? sr.raw_data?.Menge ?? sr.raw_data?.USAGE ?? '')
              const rawUnit = String(record.raw_values?.raw_unit ?? sr.raw_data?.MEINS ?? sr.raw_data?.UNITS ?? '')
              const changes: { field: string; from: string; to: string }[] = []
              if (rawQty && String(record.quantity) !== rawQty) changes.push({ field: 'Quantity', from: rawQty, to: String(record.quantity) })
              if (rawUnit && record.unit !== rawUnit.toLowerCase()) changes.push({ field: 'Unit', from: rawUnit, to: record.unit })
              if (changes.length === 0) return <p className="text-[#9ca3af] italic">No changes — raw values match normalized values</p>
              return changes.map((c) => (
                <div key={c.field} className="flex items-center gap-3 text-[#6b7280]">
                  <span className="text-[#9ca3af] w-16 text-right text-[10px] uppercase tracking-wider">{c.field}</span>
                  <span className="text-[#9ca3af] line-through">{c.from}</span>
                  <span className="text-[#1ea97c] font-bold">→</span>
                  <span className="text-[#1a1a1a] font-medium">{c.to}</span>
                </div>
              ))
            })()}
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={() => onAction('approve', new Set([record.id]))} className="px-5 py-2 text-sm font-medium bg-[#1ea97c] text-white rounded-xl hover:bg-[#178f69] transition-all shadow-sm">
          ✓ Approve
        </button>
        <button onClick={() => onAction('reject', new Set([record.id]))} className="px-5 py-2 text-sm font-medium bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-sm">
          ✗ Reject
        </button>
        <button onClick={() => onAction('flag', new Set([record.id]))} className="px-5 py-2 text-sm font-medium bg-orange-400 text-white rounded-xl hover:bg-orange-500 transition-all shadow-sm">
          ⚑ Flag
        </button>
        {record.rejection_reason && (
          <span className="text-xs text-red-500 ml-2">Reason: {record.rejection_reason}</span>
        )}
      </div>
    </div>
  )
}
