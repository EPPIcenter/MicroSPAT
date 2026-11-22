/** Background tasks reported by the engine through `task` events. */
import { create } from 'zustand'
import type { TaskInfo } from '@/api/transport'

export interface TrackedTask extends TaskInfo {
  startedAt: number
  updatedAt: number
}

interface TaskState {
  tasks: Record<string, TrackedTask>
  upsert(task: TaskInfo): void
  dismiss(id: string): void
  clearFinished(): void
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: {},
  upsert(task) {
    set((s) => {
      const now = Date.now()
      const prev = s.tasks[task.id]
      return { tasks: { ...s.tasks, [task.id]: { ...task, startedAt: prev?.startedAt ?? now, updatedAt: now } } }
    })
  },
  dismiss(id) {
    set((s) => {
      const { [id]: _, ...rest } = s.tasks
      return { tasks: rest }
    })
  },
  clearFinished() {
    set((s) => ({
      tasks: Object.fromEntries(Object.entries(s.tasks).filter(([, t]) => t.status === 'running')),
    }))
  },
}))

/** Tasks sorted newest first. */
export function sortTasks(tasks: Record<string, TrackedTask>): TrackedTask[] {
  return Object.values(tasks).sort((a, b) => b.startedAt - a.startedAt)
}

/** True while any task of `kind` (or any task at all) is running. */
export function useTaskRunning(kind?: string): boolean {
  return useTaskStore((s) => Object.values(s.tasks).some((t) => t.status === 'running' && (!kind || t.kind === kind)))
}
