import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
// The DOM provider: it lets a navigation ask for a synchronous route change (`flushSync`), which a workspace switch needs.
import { RouterProvider } from 'react-router/dom'
import { createQueryClient, connectEvents } from '@/api/query'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { Toaster } from '@/components/ui/Toaster'
import { createRouter } from '@/app/router'
import '@/stores/theme'
import '@/styles/index.css'

const queryClient = createQueryClient()
const router = createRouter()

function App() {
  useEffect(() => connectEvents(queryClient), [])
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={400} skipDelayDuration={150}>
        <RouterProvider router={router} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
