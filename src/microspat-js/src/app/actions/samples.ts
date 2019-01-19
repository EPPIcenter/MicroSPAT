import { Action } from '@ngrx/store';
import { Sample } from '../models/sample/sample';

export const LOAD_SAMPLES = '[Samples] Load Samples';
export const LOADING_SAMPLES = '[Samples] Loading Samples';

export const SELECT_SAMPLE = '[Samples] Select Sample';
export const ACTIVATE_SAMPLE = '[Samples] Activate Sample';
export const LOADING_SAMPLE = '[Samples] Loading Sample';
export const DEACTIVATE_SAMPLE = '[Samples] Deactivate Sample';

export const SUBMIT_SAMPLE = '[Samples] Submit Sample';
export const DELETE_SAMPLE = '[Samples] Delete Sample';
export const UPLOAD_SAMPLES = '[Samples] Upload Samples';

export const SELECT_CHANNEL = '[Samples] Select Channel';
export const LOADING_CHANNEL = '[Samples] Loading Channel';
export const CHANNEL_SELECTED = '[Samples] Channel Selected';

export class LoadSamplesAction implements Action {
  readonly type = LOAD_SAMPLES;
  constructor() {};
}

export class LoadingSamplesAction implements Action {
  readonly type = LOADING_SAMPLES;
  constructor() {};
}

export class SelectSampleAction implements Action {
  readonly type = SELECT_SAMPLE;
  constructor(public payload: number) {};
}

export class LoadingSampleAction implements Action {
  readonly type = LOADING_SAMPLE;
  constructor(public payload: number) {};
}

export class ActivateSampleAction implements Action {
  readonly type = ACTIVATE_SAMPLE;
  constructor(public payload: number) {};
}

export class DeactivateSampleAction implements Action {
  readonly type = DEACTIVATE_SAMPLE;
  constructor() {};
}

export class SubmitSampleAction implements Action {
  readonly type = SUBMIT_SAMPLE;
  constructor(public payload: Sample) {};
}

export class DeleteSampleAction implements Action {
  readonly type = DELETE_SAMPLE;
  constructor(public payload: number) {};
}

export class UploadSamplesAction implements Action {
  readonly type = UPLOAD_SAMPLES;
  constructor(public payload: File) {};
}

export class SelectChannelAction implements Action {
  readonly type = SELECT_CHANNEL;
  constructor(public payload: number) {};
}

export class LoadingChannelAction implements Action {
  readonly type = LOADING_CHANNEL;
  constructor(public payload: number) {};
}

export class ChannelSelectedAction implements Action {
  readonly type = CHANNEL_SELECTED;
  constructor(public payload: number) {};
}

export type Actions
= LoadSamplesAction
| LoadingSamplesAction
| LoadingSampleAction
| SelectSampleAction
| ActivateSampleAction
| DeactivateSampleAction
| SubmitSampleAction
| DeleteSampleAction
| UploadSamplesAction
| SelectChannelAction
| LoadingChannelAction
| ChannelSelectedAction;
