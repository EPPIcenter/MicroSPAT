/**
 * Routes. Each section maps to its feature page, loaded lazily. Detail routes
 * are `/<section>/:id` so list + detail pages can deep-link the selection.
 * The component gallery (`/dev/gallery`) exists in development builds only.
 */
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { createBrowserRouter, Link, Navigate, type RouteObject } from 'react-router'
import { Spinner } from '@/components/ui/ProgressBar'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { AppShell } from './AppShell'
import { ALL_NAV_ITEMS, type NavItem } from './nav'

// Dropped from production bundles: `import.meta.env.DEV` is a build-time constant.
const Gallery = import.meta.env.DEV ? lazy(() => import('@/pages/dev/Gallery')) : null

/** Feature page of every section, by path. */
const FEATURE_PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  '/plates': lazy(() => import('@/features/plates/PlatesPage')),
  '/samples': lazy(() => import('@/features/samples/SamplesPage')),
  '/loci': lazy(() => import('@/features/loci/LociPage')),
  '/locus-sets': lazy(() => import('@/features/locus-sets/LocusSetsPage')),
  '/ladders': lazy(() => import('@/features/ladders/LaddersPage')),
  '/projects': lazy(() => import('@/features/genotyping/GenotypingPage')),
  '/bin-estimators': lazy(() => import('@/features/bin-estimators/BinEstimatorsPage')),
  '/artifact-estimators': lazy(() => import('@/features/artifact-estimators/ArtifactEstimatorsPage')),
  '/controls': lazy(() => import('@/features/controls/ControlsPage')),
  '/quant-bias': lazy(() => import('@/features/quant-bias/QuantBiasPage')),
  '/settings': lazy(() => import('@/features/settings/SettingsPage')),
}

function Loading() {
  return (
    <div className="grid h-full place-items-center text-muted">
      <Spinner />
    </div>
  )
}

function sectionElement(item: NavItem) {
  const Feature = FEATURE_PAGES[item.path]
  if (!Feature) throw new Error(`No page for section ${item.path}`)
  return (
    <Suspense fallback={<Loading />}>
      <Feature />
    </Suspense>
  )
}

// One route per section with an optional id, so selecting an item keeps the
// page mounted (filters, scroll and selection survive).
const sectionRoutes: RouteObject[] = ALL_NAV_ITEMS.map((item) => ({ path: `${item.path}/:id?`, element: sectionElement(item) }))

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/plates" replace /> },
      ...sectionRoutes,
      ...(Gallery
        ? [
            {
              path: '/dev/gallery',
              element: (
                <Suspense fallback={<Loading />}>
                  <Gallery />
                </Suspense>
              ),
            },
          ]
        : []),
      {
        path: '*',
        element: (
          <EmptyState
            title="Page not found"
            action={
              <Button asChild size="sm" variant="primary">
                <Link to="/plates">Go to Plates</Link>
              </Button>
            }
          >
            This address is not a page of MicroSPAT.
          </EmptyState>
        ),
      },
    ],
  },
]

export function createRouter() {
  return createBrowserRouter(routes)
}
