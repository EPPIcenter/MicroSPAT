/** Light/dark theme. 'system' follows the OS; the choice persists. */
import { create } from 'zustand'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'microspat.theme'

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // ignore
  }
  return 'system'
}

function systemDark(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
}

function apply(pref: ThemePref): boolean {
  const dark = pref === 'dark' || (pref === 'system' && systemDark())
  document.documentElement.classList.toggle('dark', dark)
  return dark
}

interface ThemeState {
  pref: ThemePref
  dark: boolean
  setPref(p: ThemePref): void
  toggle(): void
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const pref = typeof window === 'undefined' ? 'system' : readPref()
  const dark = typeof window === 'undefined' ? false : apply(pref)
  if (typeof matchMedia !== 'undefined') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().pref === 'system') set({ dark: apply('system') })
    })
  }
  return {
    pref,
    dark,
    setPref(p) {
      try {
        localStorage.setItem(KEY, p)
      } catch {
        // ignore
      }
      set({ pref: p, dark: apply(p) })
    },
    toggle() {
      get().setPref(get().dark ? 'light' : 'dark')
    },
  }
})
