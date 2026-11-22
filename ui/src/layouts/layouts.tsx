/**
 * Page layouts reused by feature pages:
 * - Page: header + body filling the main area.
 * - ListDetailLayout: resizable list pane + detail pane.
 * - TabbedDetail: entity header + tabs.
 * - PlotWorkspace: toolbar + full-bleed plot + optional side panel.
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SplitView } from '@/components/ui/SplitView'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs'

export function PageHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex h-11 shrink-0 items-center gap-2.5 border-b border-line bg-surface px-3', className)}>
      {icon && <span className="text-muted [&_svg]:size-4">{icon}</span>}
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        {subtitle && <span className="truncate text-xs text-muted">{subtitle}</span>}
      </div>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  )
}

/** A full-height page: header and a body that fills the rest. */
export function Page({ header, children, className }: { header?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-full min-h-0 min-w-0 flex-col', className)}>
      {header}
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}

/** Titled pane with optional toolbar; body scrolls unless `fill`. */
export function Pane({
  title,
  actions,
  children,
  fill,
  className,
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** Body is a flex column that does not scroll (for tables/plots that manage their own). */
  fill?: boolean
  className?: string
}) {
  return (
    <section className={cn('flex min-h-0 min-w-0 flex-1 flex-col bg-surface', className)}>
      {(title || actions) && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
          {title && <h2 className="truncate text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>}
          {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
        </div>
      )}
      <div className={cn('min-h-0 flex-1', fill ? 'flex flex-col' : 'overflow-auto')}>{children}</div>
    </section>
  )
}

export interface ListDetailLayoutProps {
  /** Storage key for the list width. */
  id: string
  list: ReactNode
  detail: ReactNode
  listWidth?: number
  minListWidth?: number
}

/** List on the left, detail on the right, resizable. */
export function ListDetailLayout({ id, list, detail, listWidth = 300, minListWidth = 200 }: ListDetailLayoutProps) {
  return (
    <SplitView
      id={`list-detail.${id}`}
      defaultSize={listWidth}
      minSize={minListWidth}
      minSecond={420}
      first={<div className="flex min-h-0 flex-1 flex-col border-r-0 bg-surface">{list}</div>}
      second={<div className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg">{detail}</div>}
    />
  )
}

export interface DetailTab {
  value: string
  label: ReactNode
  icon?: ReactNode
  content: ReactNode
  disabled?: boolean
  /** Small count or status after the label. */
  badge?: ReactNode
}

export interface TabbedDetailProps {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  /** Line of facts under the title (dates, counts, status chips). */
  meta?: ReactNode
  tabs: DetailTab[]
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
}

/** Entity header with tabs; each tab's content fills the rest. */
export function TabbedDetail({ title, subtitle, actions, meta, tabs, value, defaultValue, onValueChange }: TabbedDetailProps) {
  return (
    <Tabs
      value={value}
      defaultValue={defaultValue ?? tabs[0]?.value}
      onValueChange={onValueChange}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <div className="shrink-0 border-b border-line bg-surface">
        <div className="flex items-start gap-3 px-4 pt-3 pb-1">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold">{title}</h2>
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
        {meta && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-1 text-xs text-muted">{meta}</div>}
        <TabsList className="border-b-0">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value} disabled={t.disabled}>
              {t.icon}
              {t.label}
              {t.badge != null && <span className="num ml-0.5 text-2xs text-faint">{t.badge}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="flex flex-col">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}

export interface PlotWorkspaceProps {
  /** Controls above the plot (locus picker, filters, zoom presets). */
  toolbar?: ReactNode
  plot: ReactNode
  /** Panel to the right (selected item details, parameters). */
  side?: ReactNode
  sideWidth?: number
  /** Strip under the plot (e.g. a list of runs to step through). */
  bottom?: ReactNode
  bottomHeight?: number
  id?: string
}

/** Full-bleed plot area. The plot element should fill its parent (h-full w-full). */
export function PlotWorkspace({ toolbar, plot, side, sideWidth = 300, bottom, bottomHeight = 220, id = 'plot' }: PlotWorkspaceProps) {
  const main = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {toolbar && <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line bg-surface px-2">{toolbar}</div>}
      {bottom ? (
        <SplitView
          id={`${id}.bottom`}
          direction="vertical"
          defaultSize={480}
          minSize={180}
          minSecond={Math.min(120, bottomHeight)}
          first={<div className="flex min-h-0 flex-1 p-1.5">{plot}</div>}
          second={<div className="flex min-h-0 flex-1 flex-col bg-surface">{bottom}</div>}
        />
      ) : (
        <div className="flex min-h-0 flex-1 p-1.5">{plot}</div>
      )}
    </div>
  )
  if (!side) return main
  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      {main}
      <aside className="flex min-h-0 shrink-0 flex-col border-l border-line bg-surface" style={{ width: sideWidth }}>
        {side}
      </aside>
    </div>
  )
}
