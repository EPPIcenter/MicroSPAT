import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { ParameterForm } from '@/components/form/ParameterForm'
import { PlateGrid } from '@/components/PlateGrid'
import { clampSplit } from '@/components/ui/SplitView'
import { binEstimatorParams } from '@/params/schemas'

describe('clampSplit', () => {
  it('keeps both panes above their minimum', () => {
    expect(clampSplit(50, 1000, 160, 240)).toBe(160)
    expect(clampSplit(900, 1000, 160, 240)).toBe(760)
    expect(clampSplit(400, 300, 160, 240)).toBe(160)
  })
})

describe('ParameterForm', () => {
  it('tracks dirty state, validates, saves only changes, reverts', async () => {
    const onSave = vi.fn()
    render(
      <TooltipProvider>
        <ParameterForm schema={binEstimatorParams} values={{ min_peak_frequency: 10 }} onSave={onSave} />
      </TooltipProvider>,
    )
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    const input = screen.getByLabelText('Min peak frequency')
    await userEvent.clear(input)
    await userEvent.type(input, '2.5')
    expect(screen.getByRole('alert')).toHaveTextContent('Must be a whole number')
    expect(save).toBeDisabled()
    await userEvent.clear(input)
    await userEvent.type(input, '12')
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    await userEvent.click(save)
    expect(onSave).toHaveBeenCalledWith({ min_peak_frequency: 12, default_bin_buffer: 0.75 }, ['min_peak_frequency'])
    await userEvent.click(screen.getByRole('button', { name: /Revert/ }))
    expect(input).toHaveValue('10')
  })
  it('arrow keys step numbers', async () => {
    render(
      <TooltipProvider>
        <ParameterForm schema={binEstimatorParams} values={{}} onSave={() => {}} />
      </TooltipProvider>,
    )
    const input = screen.getByLabelText('Default bin buffer')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input).toHaveValue('0.8')
  })
})

describe('PlateGrid', () => {
  it('selects by click, shift-rectangle and keyboard', () => {
    const onSel = vi.fn()
    const { container, rerender } = render(
      <PlateGrid format={96} wells={{ A01: { status: 'ok' } }} mode="status" selected={[]} onSelectionChange={onSel} />,
    )
    const cell = (w: string) => container.querySelector(`[data-well=${w}]`)!
    fireEvent.mouseDown(cell('B02'), { button: 0 })
    expect(onSel).toHaveBeenLastCalledWith(['B02'])
    rerender(<PlateGrid format={96} wells={{ A01: { status: 'ok' } }} mode="status" selected={['B02']} onSelectionChange={onSel} />)
    fireEvent.mouseDown(cell('C03'), { button: 0, shiftKey: true })
    expect(onSel).toHaveBeenLastCalledWith(['B02', 'B03', 'C02', 'C03'])
    fireEvent.keyDown(screen.getByRole('grid'), { key: 'ArrowDown' })
    expect(onSel).toHaveBeenLastCalledWith(['D03'])
  })
  it('skips disabled wells', () => {
    const onSel = vi.fn()
    const { container } = render(
      <PlateGrid format={96} wells={{ H12: { status: 'empty', disabled: true } }} mode="status" selected={[]} onSelectionChange={onSel} />,
    )
    fireEvent.mouseDown(container.querySelector('[data-well=H12]')!, { button: 0 })
    expect(onSel).not.toHaveBeenCalled()
  })
})
