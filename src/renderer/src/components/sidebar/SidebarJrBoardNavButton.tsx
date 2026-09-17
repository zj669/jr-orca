import React from 'react'
import { LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'

type SidebarJrBoardNavButtonProps = {
  open: boolean
  onToggle: () => void
}

export function SidebarJrBoardNavButton({
  open,
  onToggle
}: SidebarJrBoardNavButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-current={open ? 'page' : undefined}
      aria-pressed={open}
      data-sidebar-jr-board=""
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium tracking-tight transition-colors',
        open
          ? 'bg-worktree-sidebar-accent text-worktree-sidebar-accent-foreground'
          : 'text-worktree-sidebar-foreground/60 hover:bg-worktree-sidebar-foreground/8'
      )}
    >
      <LayoutDashboard
        className={cn('size-4 shrink-0', !open && 'text-worktree-sidebar-foreground/30')}
        strokeWidth={open ? 2.25 : 1.75}
      />
      <span className="flex-1">JR 交付</span>
    </button>
  )
}
