import { Action } from '@ngrx/store';
import { BaseModel } from 'app/models/base';

export const GET_RECEIVED = '[DB] Get Received';
export const LIST_RECEIVED = '[DB] List Received';
export const UPDATE_RECEIVED = '[DB] Update Received';
export const DELETE_RECEIVED = '[DB] Delete Received';
export const CREATE_RECEIVED = '[DB] Create Received';

export interface GetEntityPayload {
  model: string;
  entities: BaseModel[];
}

export interface ModifiedEntityPayload {
  model: string;
  ids: string[];
}

export class GetReceivedAction implements Action {
  readonly type = GET_RECEIVED;
  constructor(public payload: GetEntityPayload) {};
}

export class ListReceivedAction implements Action {
  readonly type = LIST_RECEIVED;
  constructor(public payload: GetEntityPayload) {};
}

export class UpdateReceivedAction implements Action {
  readonly type = UPDATE_RECEIVED;
  constructor(public payload: ModifiedEntityPayload) {};
}

export class DeleteReceivedAction implements Action {
  readonly type = DELETE_RECEIVED;
  constructor(public payload: ModifiedEntityPayload) {};
}

export class CreateReceivedAction implements Action {
  readonly type = CREATE_RECEIVED;
  constructor(public payload: ModifiedEntityPayload) {};
}

export type Actions
 = GetReceivedAction
 | ListReceivedAction
 | UpdateReceivedAction
 | DeleteReceivedAction
 | CreateReceivedAction;
