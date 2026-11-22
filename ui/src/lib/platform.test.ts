import { describe, expect, it } from 'vitest'
import { kbd } from './platform'

describe('kbd', () => {
  it('keeps Mac notation on a Mac', () => {
    expect(kbd('⇧⌘S', true)).toBe('⇧⌘S')
  })
  it('spells shortcuts out elsewhere', () => {
    expect(kbd('⇧⌘S', false)).toBe('Ctrl+Shift+S')
    expect(kbd('⌘↵', false)).toBe('Ctrl+Enter')
    expect(kbd('Save the bins of this locus (⌘S)', false)).toBe('Save the bins of this locus (Ctrl+S)')
  })
})
