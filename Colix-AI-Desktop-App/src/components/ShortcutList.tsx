import { Shortcut } from '../types/shortcut'
import ShortcutItem from './ShortcutItem'

interface ShortcutListProps {
  shortcuts: Shortcut[]
  onEdit: (shortcut: Shortcut) => void
  onDelete: (id: string) => void
  onCopy: (content: string) => void
  isLoading?: boolean
  searchQuery?: string
}

export default function ShortcutList({
  shortcuts,
  onEdit,
  onDelete,
  onCopy,
  isLoading = false,
  searchQuery = '',
}: ShortcutListProps) {
  const filteredShortcuts = shortcuts.filter(shortcut =>
    shortcut.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    shortcut.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    shortcut.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="bg-white border border-gray-200 rounded-lg p-5 animate-pulse"
          >
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/4"></div>
          </div>
        ))}
      </div>
    )
  }

  if (filteredShortcuts.length === 0) {
    return (
      <div className="text-center py-12 bg-white border border-gray-200 rounded-lg">
        <svg
          className="w-16 h-16 text-gray-300 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">
          {searchQuery ? 'No shortcuts found' : 'No shortcuts yet'}
        </h3>
        <p className="text-gray-500 text-sm">
          {searchQuery
            ? 'Try adjusting your search'
            : 'Create your first shortcut to get started'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">
          Shortcuts ({filteredShortcuts.length})
        </h2>
      </div>

      <div className="space-y-3">
        {filteredShortcuts.map(shortcut => (
          <ShortcutItem
            key={shortcut.id}
            shortcut={shortcut}
            onEdit={onEdit}
            onDelete={onDelete}
            onCopy={onCopy}
          />
        ))}
      </div>
    </div>
  )
}