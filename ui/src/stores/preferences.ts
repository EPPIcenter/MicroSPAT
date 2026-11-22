/** Application preferences kept in this browser (not in the workspace file). */
import { create } from 'zustand'
import type { QualityMeasure } from '@/features/plates/model/quality'

export type PlateMode = 'ladder' | 'signal' | 'quality'

const PLATE_MODE_KEY = 'microspat.plates.mode'
const QUALITY_MEASURE_KEY = 'microspat.plates.qualityMeasure'
const SPLIT_PREFIX = 'microspat.split.'

const PLATE_MODES: readonly PlateMode[] = ['ladder', 'signal', 'quality']
const MEASURES: readonly QualityMeasure[] = ['ladder_height', 'signal', 'noise', 'separation']

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    if (v !== null && (allowed as readonly string[]).includes(v)) return v as T
  } catch {
    // ignore
  }
  return fallback
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

interface PreferencesState {
  plateMode: PlateMode
  setPlateMode: (m: PlateMode) => void
  qualityMeasure: QualityMeasure
  setQualityMeasure: (m: QualityMeasure) => void
}

export const usePreferencesStore = create<PreferencesState>((set) => {
  const browser = typeof window !== 'undefined'
  return {
    plateMode: browser ? read(PLATE_MODE_KEY, PLATE_MODES, 'ladder') : 'ladder',
    setPlateMode(m) {
      write(PLATE_MODE_KEY, m)
      set({ plateMode: m })
    },
    qualityMeasure: browser ? read(QUALITY_MEASURE_KEY, MEASURES, 'ladder_height') : 'ladder_height',
    setQualityMeasure(m) {
      write(QUALITY_MEASURE_KEY, m)
      set({ qualityMeasure: m })
    },
  }
})

function savedPanelKeys(): string[] {
  const keys: string[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k !== null && k.startsWith(SPLIT_PREFIX)) keys.push(k)
    }
  } catch {
    // ignore
  }
  return keys
}

/** How many split panels have a remembered size. */
export function countSavedPanels(): number {
  return savedPanelKeys().length
}

/** Forget every remembered panel size. Returns how many were removed. */
export function resetPanelSizes(): number {
  const keys = savedPanelKeys()
  let removed = 0
  for (const k of keys) {
    try {
      localStorage.removeItem(k)
      removed++
    } catch {
      // ignore
    }
  }
  return removed
}
