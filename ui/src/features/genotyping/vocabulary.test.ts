/** The genotyping screens are about mixtures: no diploid vocabulary anywhere in them. */
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('vocabulary', () => {
  it('never uses diploid terms in genotyping or shared project code', () => {
    const files = Object.entries(sources).filter(([p]) => p.includes('/genotyping/') || p.includes('/projects-shared/'))
    expect(files.length).toBeGreaterThan(10)
    for (const [path, text] of files) expect(text, path).not.toMatch(/homozyg|heterozyg|genotype pair|diploid/i)
  })
})
