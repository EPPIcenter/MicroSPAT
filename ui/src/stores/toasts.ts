/** Toast queue. Call `toast.error(...)` from anywhere, including non-React code. */
import { create } from 'zustand'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  description?: string
  duration: number
}

interface ToastState {
  toasts: ToastItem[]
  push(t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }): number
  remove(id: number): void
}

let seq = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push(t) {
    const id = ++seq
    const duration = t.duration ?? (t.tone === 'error' ? 8000 : 4000)
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id, duration }] }))
    return id
  },
  remove(id) {
    set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) }))
  },
}))

export const toast = {
  info: (title: string, description?: string) => useToastStore.getState().push({ tone: 'info', title, description }),
  success: (title: string, description?: string) => useToastStore.getState().push({ tone: 'success', title, description }),
  error: (title: string, description?: string) => useToastStore.getState().push({ tone: 'error', title, description }),
}
