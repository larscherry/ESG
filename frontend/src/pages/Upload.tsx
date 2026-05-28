import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import type { DataSource } from '../lib/api'

const SOURCE_INFO: Record<string, { desc: string; expected: string; icon: string }> = {
  sap_fuel: {
    icon: '🏭',
    desc: 'SAP MM inventory movements and fuel consumption',
    expected: 'Material, Plant, Menge, MEINS, BUDAT, material_description, MATL_GROUP',
  },
  utility_electricity: {
    icon: '⚡',
    desc: 'Utility Green Button format with meter readings',
    expected: 'Meter ID, TYPE, START DATE, END DATE, USAGE, UNITS, COST',
  },
  corporate_travel: {
    icon: '✈️',
    desc: 'Concur/Navan expense report extract',
    expected: 'Employee, ExpenseType, TransactionDate, Amount, Currency, Origin, Destination',
  },
}

function FilePreview({ file }: { file: File }) {
  const [preview, setPreview] = useState<string[][]>([])
  useEffect(() => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.split('\n').filter(Boolean)
      const rows = lines.slice(0, 4).map((l) => l.split(',').map((c) => c.trim()))
      setPreview(rows)
    }
    reader.readAsText(file.slice(0, 4096))
  }, [file])

  if (preview.length === 0) return null

  return (
    <div className="mt-4 bg-gray-50 rounded-xl border border-[#eef0f2] p-4 overflow-x-auto">
      <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider mb-2">Preview (first rows)</p>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr>
            {preview[0]?.map((h, i) => (
              <th key={i} className="text-left px-2 py-1 text-[#1ea97c] font-semibold border-b border-[#eef0f2] whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.slice(1).map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-2 py-1 border-b border-[#eef0f2] text-[#6b7280] truncate max-w-40">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Upload() {
  const [sources, setSources] = useState<DataSource[]>([])
  const [selectedSource, setSelectedSource] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [step, setStep] = useState<'select' | 'preview' | 'done'>('select')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.getSources().then((s) => setSources(s.results))
  }, [])

  const source = sources.find((s) => String(s.id) === selectedSource)
  const sourceInfo = source ? SOURCE_INFO[source.source_type] : null

  const handleFile = useCallback((f: File | null) => {
    if (!f) return
    if (!f.name.endsWith('.csv')) {
      setError('Only CSV files are accepted')
      return
    }
    setError('')
    setFile(f)
    setStep('preview')
    setResult(null)
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const handleUpload = async () => {
    if (!selectedSource || !file) return
    setUploading(true)
    setError('')
    setResult(null)
    try {
      const res = await api.uploadCSV(Number(selectedSource), file)
      setResult(res)
      setStep('done')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const reset = () => {
    setFile(null)
    setResult(null)
    setError('')
    setStep('select')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1a1a]">Upload Data</h1>
          <p className="text-sm text-[#6b7280] mt-1">Ingest a CSV file from any supported source</p>
        </div>
        {step === 'done' && (
          <button onClick={reset} className="text-sm text-[#1ea97c] hover:text-[#178f69] font-medium">
            Upload another →
          </button>
        )}
      </div>

      {step !== 'done' && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {sources.map((s) => {
              const info = SOURCE_INFO[s.source_type]
              const active = String(s.id) === selectedSource
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelectedSource(String(s.id)); setStep('select') }}
                  className={`text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                    active
                      ? 'border-[#1ea97c] bg-[#e8f6ef] shadow-sm'
                      : 'border-[#eef0f2] bg-white hover:border-[#1ea97c] hover:bg-[#e8f6ef]/30'
                  }`}
                >
                  <span className="text-2xl">{info?.icon}</span>
                  <p className="text-sm font-medium text-[#1a1a1a] mt-2">{s.name}</p>
                  <p className="text-[11px] text-[#6b7280] mt-0.5">{info?.desc}</p>
                </button>
              )
            })}
          </div>

          {sourceInfo && (
            <div className="rounded-xl border border-[#eef0f2] bg-[#e8f6ef]/30 p-4 text-sm text-[#1a1a1a]">
              <p className="font-medium mb-1">Expected columns:</p>
              <code className="text-xs text-[#1ea97c]">{sourceInfo.expected}</code>
            </div>
          )}
        </>
      )}

      {step !== 'done' && (
        <div
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 cursor-pointer ${
            dragging
              ? 'border-[#1ea97c] bg-[#e8f6ef] scale-[1.01]'
              : 'border-[#eef0f2] bg-white hover:border-[#1ea97c] hover:bg-[#e8f6ef]/20'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <span className="text-3xl">📄</span>
              <div className="text-left">
                <p className="font-medium text-[#1ea97c]">{file.name}</p>
                <p className="text-sm text-[#6b7280]">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); reset() }}
                className="ml-4 text-[#9ca3af] hover:text-[#6b7280] text-xl"
              >
                ×
              </button>
            </div>
          ) : (
            <div>
              <div className="text-4xl mb-3 opacity-50">📂</div>
              <p className="text-[#6b7280] font-medium">Drop your CSV file here, or click to browse</p>
              <p className="text-sm text-[#9ca3af] mt-1">Supports SAP MB5B exports, Green Button utility, and Concur travel CSVs</p>
            </div>
          )}
          {dragging && (
            <div className="absolute inset-0 rounded-2xl bg-[#1ea97c]/5 flex items-center justify-center">
              <span className="text-[#1ea97c] font-semibold text-lg">Drop to upload</span>
            </div>
          )}
        </div>
      )}

      {file && step === 'preview' && source && (
        <>
          <FilePreview file={file} />
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full bg-[#1ea97c] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#178f69] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Uploading & Normalizing...
              </>
            ) : (
              <>
                <span>↑</span>
                Upload & Normalize
              </>
            )}
          </button>
        </>
      )}

      {error && (
        <div className="bg-[#fde8e1] border border-[#f5c6b3] text-[#c2410c] px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <span>⚠</span>
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-2xl border border-[#eef0f2] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-[#e8f6ef] flex items-center justify-center text-[#1ea97c] text-lg font-bold">✓</div>
            <div>
              <h3 className="font-semibold text-[#1a1a1a]">Ingestion Complete</h3>
              <p className="text-sm text-[#1ea97c]">Batch #{result.batch_id as number}</p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Total', value: result.total as number, color: 'text-[#1a1a1a]', bg: 'bg-gray-100' },
              { label: 'Passed', value: result.passed as number, color: 'text-green-600', bg: 'bg-green-100' },
              { label: 'Failed', value: result.failed as number, color: 'text-red-600', bg: 'bg-red-100' },
              { label: 'Suspicious', value: result.suspicious as number, color: 'text-amber-600', bg: 'bg-amber-100' },
            ].map((s) => (
              <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-[#eef0f2]">
            <a href="/review" className="text-sm font-medium text-[#1ea97c] hover:text-[#178f69] flex items-center gap-1">
              Review this batch →
            </a>
          </div>
        </div>
      )}

      {step === 'select' && sources.length > 0 && (
        <div className="rounded-xl border border-[#eef0f2] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider mb-3">Sample Files</p>
          <div className="grid grid-cols-3 gap-2">
            {sources.map((s) => (
              <a
                key={s.id}
                href={`/static/${s.source_type === 'sap_fuel' ? 'sap_fuel_export' : s.source_type === 'utility_electricity' ? 'utility_green_button' : 'concur_travel_export'}.csv`}
                download
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-[#eef0f2] text-xs text-[#6b7280] hover:border-[#1ea97c] hover:text-[#1ea97c] transition-colors"
              >
                <span>📥</span>
                {s.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
