import { Action } from '@ngrx/store';
import { BaseModel } from 'app/models/base';

export const GET_RECEIVED = '[DB] Get Received';
export const GET_REQUESTED = '[DB] Get Requested';
export const GET_IN_FLIGHT = '[DB] Get In Flight';
export const LIST_RECEIVED = '[DB] List Received';
export const UPDATE_RECEIVED = '[DB] Update Received';
export const DELETE_RECEIVED = '[DB] Delete Received';
export const CREATE_RECEIVED = '[DB] Create Received';
export const SET_STALE = '[DB] Set Stale';

export interface GetEntityPayload {
  model: string;
  entities: BaseModel[];
}

export interface ModifiedEntityPayload {
  model: string;
  ids: (string | number)[];
}

export interface UpdatedEntityPayload {
  model: string;
  details: {
    id: number,
    last_updated: Date
  }[];
}

export class GetReceivedAction implements Action {
  readonly type = GET_RECEIVED;
  constructor(public payload: GetEntityPayload) {};
}

export class GetRequestedAction implements Action {
  readonly type = GET_REQUESTED;
  constructor(public payload: ModifiedEntityPayload) {};
}

export class GetInFlightAction implements Action {
  readonly type = GET_IN_FLIGHT;
  constructor(public payload: ModifiedEntityPayload) {};
}

export class ListReceivedAction implements Action {
  readonly type = LIST_RECEIVED;
  constructor(public payload: GetEntityPayload) {};
}

export class UpdateReceivedAction implements Action {
  readonly type = UPDATE_RECEIVED;
  constructor(public payload: UpdatedEntityPayload) {};
}

export class DeleteReceivedAction implements Action {
  readonly type = DELETE_RECEIVED;
  constructor(public payload: ModifiedEntityPayload) {};
}

export class CreateReceivedAction implements Action {
  readonly type = CREATE_RECEIVED;
  constructor(public payload: ModifiedEntityPayload) {};
}

export class SetStaleAction implements Action {
  readonly type = SET_STALE;
  constructor(public payload: ModifiedEntityPayload) {};
}

export type Actions
 = GetReceivedAction
 | GetRequestedAction
 | GetInFlightAction
 | ListReceivedAction
 | UpdateReceivedAction
 | DeleteReceivedAction
 | CreateReceivedAction
 | SetStaleAction;
