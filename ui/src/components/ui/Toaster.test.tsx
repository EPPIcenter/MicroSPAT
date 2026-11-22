import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Toaster } from '@/components/ui/Toaster'
import { toast, useToastStore } from '@/stores/toasts'

beforeEach(() => {
  vi.useFakeTimers()
  useToastStore.setState({ toasts: [] })
})

afterEach(() => {
  cleanup()
  useToastStore.setState({ toasts: [] })
  vi.useRealTimers()
})

describe('Toaster', () => {
  it('auto-dismisses a toast after its duration', () => {
    render(<Toaster />)
    act(() => {
      toast.success('Saved')
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3999)
    })
    expect(screen.getByText('Saved')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('still auto-dismisses subsequent toasts after manually dismissing the last toast', () => {
    render(<Toaster />)
    act(() => {
      toast.success('First')
    })
    const first = screen.getByText('First')
    fireEvent.pointerMove(first)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('First')).not.toBeInTheDocument()

    act(() => {
      toast.success('Second')
    })
    expect(screen.getByText('Second')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByText('Second')).not.toBeInTheDocument()
  })

  it('still auto-dismisses remaining toasts after clicking Dismiss on one of multiple toasts', () => {
    render(<Toaster />)
    act(() => {
      toast.success('First')
      toast.success('Second')
    })
    const dismissButtons = screen.getAllByRole('button', { name: 'Dismiss' })
    fireEvent.pointerMove(dismissButtons[0]!)
    dismissButtons[0]!.focus()
    fireEvent.click(dismissButtons[0]!)
    fireEvent.pointerLeave(screen.getByRole('region'))

    expect(screen.queryByText('First')).not.toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByText('Second')).not.toBeInTheDocument()
  })

  it('still auto-dismisses even if the window blurs while a toast is open', () => {
    render(<Toaster />)
    act(() => {
      toast.success('Exported')
    })
    fireEvent.blur(window)

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByText('Exported')).not.toBeInTheDocument()
  })

  it('pauses auto-dismiss while hovering a toast and resumes with remaining time', () => {
    render(<Toaster />)
    act(() => {
      toast.success('Hover me')
    })
    const item = screen.getByText('Hover me').closest('li')!

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    fireEvent.pointerEnter(item)

    act(() => {
      vi.advanceTimersByTime(10000)
    })
    expect(screen.getByText('Hover me')).toBeInTheDocument()

    fireEvent.pointerLeave(item)
    act(() => {
      vi.advanceTimersByTime(2499)
    })
    expect(screen.getByText('Hover me')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText('Hover me')).not.toBeInTheDocument()
  })

  it('auto-dismisses reliably under StrictMode and respects error toast duration', () => {
    render(
      <StrictMode>
        <Toaster />
      </StrictMode>,
    )
    act(() => {
      toast.error('Failed')
    })
    expect(screen.getByText('Failed')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(7999)
    })
    expect(screen.getByText('Failed')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText('Failed')).not.toBeInTheDocument()
  })
})
