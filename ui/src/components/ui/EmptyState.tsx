import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { isRpcError } from '@/api/transport'
import { Button } from './Button'
import { cn } from '@/lib/cn'

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex h-full min-h-32 flex-col items-center justify-center gap-2 p-6 text-center', className)}>
      {icon && <div className="text-faint [&_svg]:size-7 [&_svg]:stroke-[1.5]">{icon}</div>}
      <div className="text-sm font-medium text-fg">{title}</div>
      {children && <div className="max-w-md text-xs leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  )
}

/**
 * An item the URL names that cannot be shown: gone (deleted, or a link from
 * another workspace) or failing to load. One look on every page.
 */
export function NotFound({ what, error, back }: { what: string; error?: unknown; back?: { to: string; label: string } }) {
  const missing = error == null || (isRpcError(error) && error.code === 'not_found')
  return (
    <EmptyState
      title={missing ? `${what[0]!.toUpperCase()}${what.slice(1)} not found` : `Could not open this ${what}`}
      action={
        back && (
          <Button asChild size="sm">
            <Link to={back.to}>{back.label}</Link>
          </Button>
        )
      }
    >
      <span data-testid="not-found">
        {missing
          ? 'It may have been deleted, or the link is from another workspace.'
          : error instanceof Error || isRpcError(error)
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Could not load data.'}
      </span>
    </EmptyState>
  )
}
