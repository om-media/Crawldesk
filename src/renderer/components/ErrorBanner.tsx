interface ErrorBannerProps {
  message: string
  onRetry?: () => void
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="mb-4 rounded-xl p-3 bg-[#3b171b] border border-red-900 text-red-400 text-sm flex items-center justify-between">
      <span className="flex-1">&#9888; {message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-secondary !py-1.5 !px-3 text-xs ml-4 shrink-0"
        >
          Retry
        </button>
      )}
    </div>
  )
}