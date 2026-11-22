/** "Check quality": runs `compute_plate_quality` (an engine task) for some plates, or every plate without a current report. */
import { useMutation } from '@tanstack/react-query'
import { api } from '@/api/client'
import { countOf } from '@/lib/format'
import { useTaskRunning } from '@/stores/tasks'
import { toast } from '@/stores/toasts'

export function useCheckQuality() {
  const running = useTaskRunning('compute_plate_quality')
  const m = useMutation({
    mutationFn: (ids?: number[]) => api.compute_plate_quality(ids ? { ids } : {}),
    meta: { errorTitle: 'Could not check plate quality' },
    onSuccess: (r) => toast.success('Quality checked', r.plate_ids.length ? countOf(r.plate_ids.length, 'plate') : 'Every plate was already checked'),
  })
  return { check: (ids?: number[]) => m.mutate(ids), busy: m.isPending || running }
}
