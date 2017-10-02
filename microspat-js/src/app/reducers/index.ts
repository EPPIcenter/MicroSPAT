import { createSelector } from 'reselect';
import { Injectable } from '@angular/core';
import { ActionReducerMap, compose, combineReducers, MetaReducer, ActionReducer } from '@ngrx/store';
import { storeFreeze } from 'ngrx-store-freeze';
import { environment } from 'environments/environment';
import * as fromDB from './db';

export interface State {
  db: fromDB.State;
}

export function logger(reducer: ActionReducer<State>): ActionReducer<State> {
  return function(state: State, action: any): State {
    console.log('state', state);
    console.log('action', action);

    return reducer(state, action);
  };
}

@Injectable()
export class DBReducer {
  private reducers: ActionReducerMap<State>;

  private metaReducers: MetaReducer<State>[] = !environment.production
  ? [logger, storeFreeze]
  : [];

  constructor() {
    this.reducers = {
      db: fromDB.reducer
    };
  };

  getReducers() {
    return this.reducers;
  }

  getMetaReducers() {
    return this.metaReducers;
  }
}
