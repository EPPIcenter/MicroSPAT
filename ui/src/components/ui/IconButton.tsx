import type { ReactNode } from 'react'
import { Button, type ButtonProps } from './Button'
import { Tooltip } from './Tooltip'

/** Square icon button with a required accessible label shown as tooltip. */
export function IconButton({
  label,
  children,
  size = 'icon',
  variant = 'ghost',
  shortcut,
  ...rest
}: Omit<ButtonProps, 'children'> & { label: string; children: ReactNode; shortcut?: string }) {
  return (
    <Tooltip
      content={
        <span className="flex items-center gap-2">
          {label}
          {shortcut && <kbd className="font-mono text-2xs text-muted">{shortcut}</kbd>}
        </span>
      }
    >
      <Button aria-label={label} size={size} variant={variant} {...rest}>
        {children}
      </Button>
    </Tooltip>
  )
}
