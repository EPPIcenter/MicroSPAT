import { Action } from '@ngrx/store';

export const LOAD_PLATES = '[Plate] Load Plates';
export const LOADING_PLATES = '[Plate] Loading Plates';
export const LOAD_PLATE = '[Plate] Load Plate';
export const LOADING_PLATE = '[Plate] Loading Plate';
export const SELECT_PLATE = '[Plate] Select Plate';
export const ACTIVATE_PLATE = '[Plate] Activate Plate';

export const LOAD_WELL = '[Plate] Load Well';
export const LOADING_WELL = '[Plate] Loading Well';
export const SELECT_WELL = '[Plate] Select Well';
export const ACTIVATE_WELL = '[Plate] Activate Well';

export const LOAD_CHANNEL = '[Plate] Load Channel';
export const LOADING_CHANNEL = '[Plate] Loading Channel';
export const SELECT_CHANNEL = '[Plate] Select Channel';
export const ACTIVATE_CHANNEL = '[Plate] Activate Channel';
export const CLEAR_SELECTED_CHANNELS = '[Plate] Clear Selected Channels';
export const ACTIVATE_LOCUS = '[Plate] Activate Locus';

export const SET_LADDER_PEAK_INDICES = '[Plate] Set Ladder Peak Indices';

export const RECALCULATE_WELL_LADDER = '[Plate] Recalculate Well Ladder';

export const RECALCULATE_PLATE_LADDER = '[Plate] Recalculate Plate Ladder';
export const RECALCULATE_PLATE_LADDER_TASK_IN_PROGRESS = '[Plate] Recalculate Plate Ladder Task In Progress';
export const RECALCULATE_PLATE_LADDER_TASK_FINISHED = '[Plate] Recalculate Plate Ladder Task In Progress';

export const UPLOAD_PLATES = '[Plate] Upload Plates';

export const UPLOAD_PLATE_MAP = '[Plate] Upload Plate Map';

export const SET_NON_EXISTENT_SAMPLES = '[Plate] Set Non Existent Samples Toggle';

export class LoadPlatesAction implements Action {
  readonly type = LOAD_PLATES;
  constructor() {};
}

export class LoadingPlatesAction implements Action {
  readonly type = LOADING_PLATES;
  constructor() {};
}

export class LoadPlateAction implements Action {
  readonly type = LOAD_PLATE;
  constructor(public payload: number | string) {};
}

export class LoadingPlateAction implements Action {
  readonly type = LOADING_PLATE;
  constructor(public payload: number | string) {};
}

export class SelectPlateAction implements Action {
  readonly type = SELECT_PLATE;
  constructor(public payload: number | string) {};
}

export class ActivatePlateAction implements Action {
  readonly type = ACTIVATE_PLATE;
  constructor(public payload: number | string | null) {};
}

export class LoadWellAction implements Action {
  readonly type = LOAD_WELL;
  constructor(public payload: number | string) {};
}

export class LoadingWellAction implements Action {
  readonly type = LOADING_WELL;
  constructor(public payload: number | string) {};
}

export class SelectWellAction implements Action {
  readonly type = SELECT_WELL;
  constructor(public payload: number | string) {};
}

export class ActivateWellAction implements Action {
  readonly type = ACTIVATE_WELL;
  constructor(public payload: number | string) {};
}

export class LoadChannelAction implements Action {
  readonly type = LOAD_CHANNEL;
  constructor(public payload: number | string) {};
}

export class LoadingChannelAction implements Action {
  readonly type = LOADING_CHANNEL;
  constructor(public payload: number | string) {};
}

export class SelectChannelAction implements Action {
  readonly type = SELECT_CHANNEL;
  constructor(public payload: number | string) {};
}

export class ActivateChannelAction implements Action {
  readonly type = ACTIVATE_CHANNEL;
  constructor(public payload: number | string) {};
}

export class ClearSelectedChannelsAction implements Action {
  readonly type = CLEAR_SELECTED_CHANNELS;
  constructor() {};
}

export class ActivateLocusAction implements Action {
  readonly type = ACTIVATE_LOCUS;
  constructor(public payload: number) {}
}

export class SetLadderPeakIndicesAction implements Action {
  readonly type = SET_LADDER_PEAK_INDICES;
  constructor(public payload: number[]) {};
}

export class RecalculateWellLadderAction implements Action {
  readonly type = RECALCULATE_WELL_LADDER;
  constructor() {};
}

export class RecalculatePlateLadderAction implements Action {
  readonly type = RECALCULATE_PLATE_LADDER;
  constructor(public payload: number | string) {};
}

export class UploadPlatesAction implements Action {
  readonly type = UPLOAD_PLATES;
  constructor(public payload: {
    plateFiles: FileList,
    ladderID: number
  }) {}
}

export class SetRecalculatePlateLadderTaskInProgress implements Action {
  readonly type = RECALCULATE_PLATE_LADDER_TASK_IN_PROGRESS;
  constructor() {}
}

export class SetRecalculatePlateLadderTaskFinished implements Action {
  readonly type = RECALCULATE_PLATE_LADDER_TASK_FINISHED;
  constructor() {}
}

export class SetNonExistentSamplesAction implements Action {
  readonly type = SET_NON_EXISTENT_SAMPLES;
  constructor(public payload: boolean) {};
}

export type Actions
= LoadPlatesAction
| LoadingPlatesAction
| LoadingPlateAction
| SelectPlateAction
| ActivatePlateAction
| LoadWellAction
| LoadingWellAction
| SelectWellAction
| ActivateWellAction
| LoadChannelAction
| LoadingChannelAction
| SelectChannelAction
| ActivateChannelAction
| ClearSelectedChannelsAction
| ActivateLocusAction
| SetLadderPeakIndicesAction
| RecalculateWellLadderAction
| RecalculatePlateLadderAction
| SetRecalculatePlateLadderTaskInProgress
| SetRecalculatePlateLadderTaskFinished
| SetNonExistentSamplesAction
| UploadPlatesAction;
