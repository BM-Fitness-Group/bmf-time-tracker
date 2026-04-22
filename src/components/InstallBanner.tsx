import { Download, Share, X } from 'lucide-react'
import { useInstallPrompt } from '@/lib/install'

export default function InstallBanner() {
  const { state, dismiss } = useInstallPrompt()

  if (state.kind === 'hidden') return null

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm bg-white border border-zinc-200 rounded-xl p-4 shadow-xl z-40">
      <div className="flex items-start gap-3">
        <div className="bg-red-50 rounded-lg p-2 shrink-0">
          <Download className="w-5 h-5 text-red-800" />
        </div>
        <div className="flex-1 min-w-0">
          {state.kind === 'prompt' ? (
            <>
              <div className="text-xs font-bold tracking-widest mb-1 text-zinc-900">
                INSTALL BMF TIME
              </div>
              <div className="text-xs text-zinc-600 mb-3 leading-relaxed">
                Add to your home screen for faster access and offline support.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void state.trigger()}
                  className="bg-red-800 hover:bg-red-900 text-white font-black px-3 py-1.5 rounded text-[10px] tracking-widest"
                >
                  INSTALL
                </button>
                <button
                  onClick={dismiss}
                  className="text-[10px] font-bold tracking-widest text-zinc-500 hover:text-zinc-900 px-2"
                >
                  NOT NOW
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs font-bold tracking-widest mb-1 text-zinc-900">
                ADD TO HOME SCREEN
              </div>
              <div className="text-xs text-zinc-600 leading-relaxed">
                Tap <Share className="w-3 h-3 inline mx-0.5 -translate-y-[1px]" />
                in Safari, then <span className="text-zinc-900">Add to Home Screen</span>.
              </div>
            </>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="dismiss"
          className="text-zinc-400 hover:text-zinc-900 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
