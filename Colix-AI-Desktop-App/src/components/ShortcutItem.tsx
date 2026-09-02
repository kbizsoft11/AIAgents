import { Shortcut } from '../types/shortcut'

interface ShortcutItemProps {
  shortcut: Shortcut
  onEdit: (shortcut: Shortcut) => void
  onDelete: (id: string) => void
  onCopy: (content: string) => void
}

export default function ShortcutItem({
  shortcut,
  onEdit,
  onDelete,
  onCopy,
}: ShortcutItemProps) {
  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        {/* Content Section */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <code className="inline-block bg-gray-100 text-blue-600 px-3 py-1 rounded font-mono text-sm font-semibold">
              {shortcut.name}
            </code>
            <h3 className="text-lg font-semibold text-gray-900">{shortcut.label.trim() || shortcut.name}</h3>
          </div>

          <p className="text-gray-600 text-sm mb-3 line-clamp-2">
            {shortcut.content}
          </p>

          <p className="text-xs text-gray-400">
            Updated {formatDate(shortcut.updatedAt)}
          </p>
        </div>

        {/* Actions Section */}
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => onCopy(shortcut.content)}
            title="Copy content to clipboard"
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
          </button>

          <button
            onClick={() => onEdit(shortcut)}
            title="Edit shortcut"
            className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-7.5-1.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0M15 6a1 1 0 11-2 0 1 1 0 012 0z"
              />
            </svg>
          </button>

          <button
            onClick={() => onDelete(shortcut.id)}
            title="Delete shortcut"
            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
