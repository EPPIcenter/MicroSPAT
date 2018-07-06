import { Task, InProgressTask, START, IN_PROGRESS } from 'app/models/task';
import * as TaskActions from 'app/actions/tasks';
import { createFeatureSelector, Action } from '@ngrx/store';
import { createSelector } from 'reselect';

export interface State {
  tasks: {
    [taskID: string]: Task
  }
  // displayedTasks: {
    // [taskID: string]: MatDialogRef<TaskDisplayComponent>
  // }
}

const initialState: State = {
  tasks: {},
  // displayedTasks: {}
};

export function reducer(state = initialState, action: TaskActions.Actions) {
  switch (action.type) {
    // case TaskActions.REGISTER_TASK:
    //   return registerTask(state, action);
    case TaskActions.SET_TASK:
      return setTask(state, action);
    case TaskActions.TASK_STARTED:
      return taskStarted(state, action);
    case TaskActions.TASK_PROGRESSED:
      return taskProgressed(state, action);
    // case TaskActions.TASK_FAILED:
    //   return taskFailed(state, action);
    case TaskActions.TASK_COMPLETED:
      return taskCompleted(state, action);
    case TaskActions.CLEAR_TASK:
      return clearTask(state, action);
    // case TaskActions.ADD_DISPLAY_TASK:
    //   return addDisplayTask(state, action);
    default:
      return state;
  }
}

// function registerTask(state: State, action: TaskActions.RegisterTaskAction) {
//   const {namespace, task} = action.payload;
//   return Object.assign({}, state, {
//     taskNamespaces: {
//       [namespace]: {
//         [task]: []
//       }
//     }
//   })
// }

function setTask(state: State, action: TaskActions.ServerTaskActions) {
  const {namespace, task, id, status, payload, task_args} = action.payload;

  const newTasks = Object.assign({}, state.tasks, {
    [id]: {
      ...action.payload
    }
  });

  return Object.assign({}, state, {
    tasks: newTasks
  });
}

function taskStarted(state: State, action: TaskActions.TaskStartedAction) {
  return setTask(state, action);
}

function taskProgressed(state: State, action: TaskActions.TaskProgressAction) {
  const {namespace, task, id, status, payload, task_args} = action.payload;
  if (id in state.tasks) {
    const oldTask = state.tasks[id];
    if (oldTask.status === START || (oldTask.status === IN_PROGRESS && payload.current_state > oldTask.payload.current_state)) {
      return setTask(state, action);
    } else {
      return state
    }
  } else {
    return setTask(state, action);
  }
}

function taskFailed(state: State, action: TaskActions.TaskFailureAction) {
  return setTask(state, action);
}

function taskCompleted(state: State, action: TaskActions.TaskSuccessAction) {
  return setTask(state, action);
}

function clearTask(state: State, action: TaskActions.ClearTaskAction) {
  const taskId = action.payload;
  const {[taskId]: taskToRemove, ...remainingTasks} = state.tasks;
  // const {[taskId]: displayedtaskToRemove, ...remainingDisplayedTasks} = state.displayedTasks;
  return Object.assign({}, state, {
    tasks: remainingTasks,
    // displayedTasks: remainingDisplayedTasks
  });
}

// function addDisplayTask(state: State, action: TaskActions.AddDisplayTaskAction) {
//   const taskID = action.payload.taskID;
//   const displayRef = action.payload.displayRef
//   const displayedTasks = Object.assign({}, state.displayedTasks, {
//     [taskID]: displayRef
//   });
//   return Object.assign({}, state, {
//     displayedTasks: displayedTasks
//   })
// }

export const selectTasksState = createFeatureSelector<State>('tasks');

export function selectTask(id: string) {
  return createSelector(selectTasksState, (state) => state.tasks[id])
}

export function selectActiveTasks(namespace: string = null, taskType: string = null) {
  return createSelector(selectTasksState, (state: State): Task[] => {
    return Object.keys(state.tasks).filter(id => {
      const e = state.tasks[id];
      if (namespace && e.namespace !== namespace) {
        return false;
      }
      if (taskType && e.task !== taskType) {
        return false;
      }
      if (['start', 'in_progress'].some(s => s === e.status)) {
        return true;
      } else {
        return false;
      }
    }).map(id => state.tasks[id]);
  });
}

export function selectFailedTasks(namespace: string = null, taskType: string = null) {
  return createSelector(selectTasksState, (state: State): Task[] => {
    return Object.keys(state.tasks).filter(id => {
      const e = state.tasks[id];
      if (namespace && e.namespace !== namespace) {
        return false;
      }
      if (taskType && e.task !== taskType) {
        return false;
      }
      if (['failure'].some(s => s === e.status)) {
        return true;
      } else {
        return false;
      }
    }).map(id => state.tasks[id]);
  });
}

export function selectSuccessfulTasks(namespace: string = null, taskType: string = null) {
  return createSelector(selectTasksState, (state: State): Task[] => {
    return Object.keys(state.tasks).filter(id => {
      const e = state.tasks[id];
      if (namespace && e.namespace !== namespace) {
        return false;
      }
      if (taskType && e.task !== taskType) {
        return false;
      }
      if (['success'].some(s => s === e.status)) {
        return true;
      } else {
        return false;
      }
    }).map(id => state.tasks[id]);
  });
}
