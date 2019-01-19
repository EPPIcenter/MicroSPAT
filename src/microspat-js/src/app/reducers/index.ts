import { Injectable } from '@angular/core';
import { ActionReducerMap, MetaReducer, ActionReducer } from '@ngrx/store';
import { storeFreeze } from 'ngrx-store-freeze';
import { environment } from 'environments/environment';
import * as fromDB from './db';
import * as fromPlates from './plates/plates';
import * as fromLadders from './ladders/ladders';
import * as fromLoci from './loci/loci';
import * as fromLocusSets from './locus-sets/locus-sets';
import * as fromSamples from './samples/samples';
import * as fromControls from './controls/controls';
import * as fromBinEstimators from './bin-estimators/bin-estimators';
import * as fromArtifactEstimators from './artifact-estimators/artifact-estimators';
import * as fromQuantificationBiasEstimators from './quant-bias-estimators/quant-bias-estimators';
import * as fromGenotypingProjects from './genotyping-projects/genotyping-projects';
import * as fromKeyboard from './keyboard';
import * as fromTasks from './tasks';

export interface AppState {
  db: fromDB.DBState;
  plates: fromPlates.State;
  ladders: fromLadders.State;
  loci: fromLoci.State;
  locusSets: fromLocusSets.State;
  samples: fromSamples.State;
  controls: fromControls.State;
  binEstimators: fromBinEstimators.State;
  artifactEstimators: fromArtifactEstimators.State;
  quantificationBiasEstimators: fromQuantificationBiasEstimators.State;
  genotypingProjects: fromGenotypingProjects.State;
  keyboard: fromKeyboard.State;
  tasks: fromTasks.State
}

export function logger(reducer: ActionReducer<AppState>): ActionReducer<AppState> {
  return function(state: AppState, action: any): AppState {
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
      ladders: fromLadders.reducer,
      loci: fromLoci.reducer,
      locusSets: fromLocusSets.reducer,
      samples: fromSamples.reducer,
      controls: fromControls.reducer,
      binEstimators: fromBinEstimators.reducer,
      artifactEstimators: fromArtifactEstimators.reducer,
      quantificationBiasEstimators: fromQuantificationBiasEstimators.reducer,
      genotypingProjects: fromGenotypingProjects.reducer,
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
