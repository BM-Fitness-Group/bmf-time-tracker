import { AlertTriangle, X } from 'lucide-react'

type Props = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Modal confirmation dialog. Render conditionally — when mounted it shows;
 * unmount it to hide. Clicking the backdrop or Cancel calls onCancel.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'CONFIRM',
  cancelLabel = 'CANCEL',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div
      className="fixed inset-0 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-center p-5 z-50"
      onClick={onCancel}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white border border-zinc-200 rounded-xl p-5 w-full max-w-sm shadow-xl"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {danger && <AlertTriangle className="w-4 h-4 text-brand" />}
            <div className="text-sm font-black tracking-tight">{title}</div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-zinc-500 hover:text-zinc-900"
            aria-label="cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="text-xs text-zinc-600 leading-relaxed mb-5">{message}</div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="border border-zinc-300 rounded-lg px-4 py-2 text-xs font-bold tracking-widest hover:bg-zinc-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`font-black px-4 py-2 rounded-lg text-xs tracking-widest text-white ${
              danger ? 'bg-brand hover:bg-brand-hover' : 'bg-zinc-900 hover:bg-zinc-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
