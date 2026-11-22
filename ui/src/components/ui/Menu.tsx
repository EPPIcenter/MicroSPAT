/** Dropdown and context menus sharing one look. */
import { ContextMenu as C, DropdownMenu as D } from 'radix-ui'
import { Check } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/cn'

const contentCls =
  'z-50 min-w-44 overflow-hidden rounded-md border border-line bg-surface p-1 text-[13px] text-fg shadow-xl data-[state=open]:animate-[fade-in_100ms_ease-out]'
const itemCls =
  'relative flex h-7 cursor-default items-center gap-2 rounded-[4px] px-2 outline-none select-none data-[disabled]:opacity-45 data-[highlighted]:bg-accent-soft data-[highlighted]:text-fg [&_svg]:size-3.5 [&_svg]:text-muted'

export const DropdownMenu = D.Root
export const DropdownMenuTrigger = D.Trigger
export const DropdownMenuGroup = D.Group

export function DropdownMenuContent({ className, sideOffset = 4, ...p }: ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Content sideOffset={sideOffset} className={cn(contentCls, className)} {...p} />
    </D.Portal>
  )
}

export function DropdownMenuItem({
  className,
  shortcut,
  danger,
  children,
  ...p
}: ComponentProps<typeof D.Item> & { shortcut?: string; danger?: boolean }) {
  return (
    <D.Item className={cn(itemCls, danger && 'text-danger [&_svg]:text-danger', className)} {...p}>
      {children}
      {shortcut && <span className="ml-auto pl-4 font-mono text-2xs text-faint">{shortcut}</span>}
    </D.Item>
  )
}

export function DropdownMenuCheckboxItem({ className, children, ...p }: ComponentProps<typeof D.CheckboxItem>) {
  return (
    <D.CheckboxItem className={cn(itemCls, 'pl-7', className)} {...p}>
      <D.ItemIndicator className="absolute left-2">
        <Check />
      </D.ItemIndicator>
      {children}
    </D.CheckboxItem>
  )
}

export function DropdownMenuLabel({ className, ...p }: ComponentProps<typeof D.Label>) {
  return <D.Label className={cn('px-2 pt-1.5 pb-1 text-2xs font-semibold tracking-wide text-faint uppercase', className)} {...p} />
}

export function DropdownMenuSeparator({ className, ...p }: ComponentProps<typeof D.Separator>) {
  return <D.Separator className={cn('my-1 h-px bg-line', className)} {...p} />
}

export const ContextMenu = C.Root

export function ContextMenuTrigger(p: ComponentProps<typeof C.Trigger>) {
  return <C.Trigger {...p} />
}

export function ContextMenuContent({ className, ...p }: ComponentProps<typeof C.Content>) {
  return (
    <C.Portal>
      <C.Content className={cn(contentCls, className)} {...p} />
    </C.Portal>
  )
}

export function ContextMenuItem({
  className,
  danger,
  children,
  ...p
}: ComponentProps<typeof C.Item> & { danger?: boolean; children?: ReactNode }) {
  return (
    <C.Item className={cn(itemCls, danger && 'text-danger [&_svg]:text-danger', className)} {...p}>
      {children}
    </C.Item>
  )
}

export function ContextMenuSeparator({ className, ...p }: ComponentProps<typeof C.Separator>) {
  return <C.Separator className={cn('my-1 h-px bg-line', className)} {...p} />
}
