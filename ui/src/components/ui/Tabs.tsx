import { Tabs as T } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export const Tabs = T.Root

export function TabsList({ className, ...p }: ComponentProps<typeof T.List>) {
  return <T.List className={cn('flex h-9 shrink-0 items-end gap-1 border-b border-line px-3', className)} {...p} />
}

export function TabsTrigger({ className, ...p }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        '-mb-px inline-flex h-8 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[13px] text-muted outline-none hover:text-fg focus-visible:bg-surface-2 disabled:opacity-40 data-[state=active]:border-accent data-[state=active]:font-medium data-[state=active]:text-fg [&_svg]:size-3.5',
        className,
      )}
      {...p}
    />
  )
}

export function TabsContent({ className, ...p }: ComponentProps<typeof T.Content>) {
  return <T.Content className={cn('min-h-0 flex-1 outline-none data-[state=inactive]:hidden', className)} {...p} />
}
