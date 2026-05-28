export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4 border border-[#eef0f2]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-[#1a1a1a]">{title}</h3>
        <p className="text-sm text-[#6b7280] mt-2">{message}</p>
        <div className="flex gap-2 mt-5 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-[#6b7280] hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium bg-[#1ea97c] text-white rounded-lg hover:bg-[#178f69] transition-colors">
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}
