import { Action } from '@ngrx/store';
import { BaseModel } from '../models/base';

export const GET_RECEIVED = '[DB] Get Received';
export const GET_FAILED = '[DB] Get Failed';
export const LOCAL_UPDATE = '[DB] Local Update';
export const GET_UPDATED_RECEIVED = '[DB] Get Updated Received';
export const GET_REQUESTED = '[DB] Get Requested';
export const UPDATE_REQUESTED = '[DB] Update Requested';
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

export interface GetFailedPayload {
  model: string;
  entities: (string | number)[];
}

export interface LocalUpdatePayload {
  model: string;
  entities: BaseModel[];
}

export interface ModifiedEntityPayload {
  model: string;
  ids: (string | number)[];
}

export interface UpdateRequestedPayload extends ModifiedEntityPayload {
  detailed: boolean;
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

export class GetFailedAction implements Action {
  readonly type = GET_FAILED;
  constructor(public payload: GetFailedPayload) {}
}

export class LocalUpdateAction implements Action {
  readonly type = LOCAL_UPDATE;
  constructor(public payload: LocalUpdatePayload) {};
}

export class GetUpdatedReceivedAction implements Action {
  readonly type = GET_UPDATED_RECEIVED;
  constructor(public payload: GetEntityPayload) {};
}

export class GetRequestedAction implements Action {
  readonly type = GET_REQUESTED;
  constructor(public payload: ModifiedEntityPayload) {};
}

export class UpdateRequestedAction implements Action {
  readonly type = UPDATE_REQUESTED;
  constructor(public payload: UpdateRequestedPayload) {};
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
 | GetFailedAction
 | LocalUpdateAction
 | GetUpdatedReceivedAction
 | GetRequestedAction
 | UpdateRequestedAction
 | GetInFlightAction
 | ListReceivedAction
 | UpdateReceivedAction
 | DeleteReceivedAction
 | CreateReceivedAction
 | SetStaleAction;
