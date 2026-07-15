import { Explorer } from './Explorer'
import { SearchPanel } from './SearchPanel'
import { useAppStore } from '@renderer/store/app-store'

export function Sidebar() {
  const sidebarView = useAppStore((s) => s.sidebarView)

  const title = sidebarView === 'search' ? 'Search' : 'Explorer'

  return (
    <aside className="flex w-64 min-w-64 flex-col border-r border-surface-border bg-surface-raised">
      <div className="border-b border-surface-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {sidebarView === 'search' ? <SearchPanel /> : <Explorer />}
      </div>
    </aside>
  )
}
