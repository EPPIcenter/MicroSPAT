import type { ReactNode } from 'react'

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-line-strong bg-surface-2 px-1 font-mono text-[10px] leading-none text-muted">
      {children}
    </kbd>
  )
}
