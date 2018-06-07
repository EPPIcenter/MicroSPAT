import { createSelector } from 'reselect';
import { Injectable } from '@angular/core';
import { ActionReducerMap, compose, combineReducers, MetaReducer, ActionReducer } from '@ngrx/store';
import { storeFreeze } from 'ngrx-store-freeze';
import { environment } from 'environments/environment';
import * as fromDB from './db';
import * as fromPlates from './plates/plates';
import * as fromKeyboard from './keyboard';
import * as fromTasks from './tasks';

export interface AppState {
  db: fromDB.DBState;
  plates: fromPlates.State;
  keyboard: fromKeyboard.State;
  tasks: fromTasks.State
}

export function logger(reducer: ActionReducer<AppState>): ActionReducer<AppState> {
  return function(state: AppState, action: any): AppState {
    console.log('state', state);
    console.log('action', action);
    return reducer(state, action);
  };
}

@Injectable()
export class AppReducer {
  private reducers: ActionReducerMap<AppState>;

  private metaReducers: MetaReducer<AppState>[] = !environment.production
  ? [logger, storeFreeze]
  : [];

  constructor() {
    this.reducers = {
      db: fromDB.reducer,
      plates: fromPlates.reducer,
      keyboard: fromKeyboard.reducer,
      tasks: fromTasks.reducer
    };
  };

  getReducers() {
    return this.reducers;
  }

  getMetaReducers() {
    return this.metaReducers;
  }
}
