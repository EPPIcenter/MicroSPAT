import { QuantificationBiasEstimatorProject } from './../../models/quantification-bias-estimator/project';
import { createSelector, createFeatureSelector } from '@ngrx/store';

import * as fromDB from '../db';

import * as DBActions from 'app/actions/db';
import * as QuantificationBiasEstimatorActions from 'app/actions/quant-bias-estimators';
import * as NavigationActions from 'app/actions/navigation';

import { EntityMap } from 'app/models/base';
import { ProjectSampleAnnotations } from 'app/models/project/sample-annotations';
import { Sample } from 'app/models/sample/sample';
import { ControlSampleAssociation } from 'app/models/sample/control-sample-association';
import { Control } from 'app/models/sample/control';

export interface State {
  appState: 'list' | 'details';
  quantificationBiasEstimatorsLoaded: boolean;
  loadingQuantificationBiasEstimators: boolean;
  activeQuantificationBiasEstimatorProjectID: number;
  activeLocusQuantificationBiasEstimatorID: number;
  selectedSampleID: number;
}

const initialState: State = {
  appState: 'list',
  quantificationBiasEstimatorsLoaded: false,
  loadingQuantificationBiasEstimators: false,
  activeQuantificationBiasEstimatorProjectID: null,
  activeLocusQuantificationBiasEstimatorID: null,
  selectedSampleID: null
};

export function reducer(state = initialState, action: DBActions.Actions | QuantificationBiasEstimatorActions.Actions | NavigationActions.Actions) {
  switch (action.type) {
    case DBActions.LIST_RECEIVED:
      return dbListReceived(state, action);

    case DBActions.DELETE_RECEIVED:
      return dbDeleteReceived(state, action);

    case NavigationActions.ACTIVATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT_PATH:
      return activateQuantificationBiasEstimatorPath(state, action);

    case QuantificationBiasEstimatorActions.LOADING_QUANTIFICATION_BIAS_ESTIMATOR_PROJECTS:
      return loadingQuantificationBiasEstimators(state, action);

    case QuantificationBiasEstimatorActions.LOADING_QUANTIFICATION_BIAS_ESTIMATOR:
      return activateQuantificationBiasEstimatorProject(state, action);

    case QuantificationBiasEstimatorActions.ACTIVATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT:
      return activateQuantificationBiasEstimatorProject(state, action);

    case QuantificationBiasEstimatorActions.ACTIVATE_LIST_PATH:
      return activateListPath(state, action);

    case QuantificationBiasEstimatorActions.DEACTIVATE_QUANTIFICATION_BIAS_ESTIMATOR_PROJECT:
      return deactivateQuantificationBiasEstimatorProject(state, action);

    case QuantificationBiasEstimatorActions.SELECT_SAMPLE:
      return selectSample(state, action);

    default:
      return state
  }
}

function dbListReceived(state: State, action: DBActions.ListReceivedAction): State {
  if (action.payload.model === fromDB.models.quantificationBiasEstimatorProject) {
    return Object.assign({}, state, {
      loadingQuantificationBiasEstimators: false,
      quantificationBiasEstimatorsLoaded: true
    })
  }
  return state;
};

function dbDeleteReceived(state: State, action: DBActions.DeleteReceivedAction): State {
  if (action.payload.model === fromDB.models.quantificationBiasEstimatorProject) {
    const deletedIDs = action.payload.ids.map(id => +id);
    if (deletedIDs.indexOf(+state.activeQuantificationBiasEstimatorProjectID) !== -1) {
      return Object.assign({}, state, {
        appState: 'list',
        activeQuantificationBiasEstimatorProjectID: null,
        activeLocusQuantificationBiasEstimatorID: null,
      })
    }
  }
  return state;
}

function activateQuantificationBiasEstimatorPath(state: State, action: NavigationActions.ActivateQuantificationBiasEstimatorPathAction): State {
  return Object.assign({}, state, {
    appState: 'list',
    activeQuantificationBiasEstimatorProjectID: null,
    activeLocusQuantificationBiasEstimatorID: null,
    selectedSampleID: null,
  })
};

function loadingQuantificationBiasEstimators(state: State, action: QuantificationBiasEstimatorActions.LoadingQuantificationBiasEstimatorsAction): State {
  return Object.assign({}, state, {
    loadingArtifactEstimators: true
  })
}

function activateQuantificationBiasEstimatorProject(
  state: State,
  action: QuantificationBiasEstimatorActions.LoadingQuantificationBiasEstimatorAction | QuantificationBiasEstimatorActions.ActivateQuantificationBiasEstimatorAction
  ): State {
    return Object.assign({}, state, {
      activeQuantificationBiasEstimatorProjectID: action.payload,
      activeLocusQuantificationBiasEstimatorID: null,
      appState: 'details',
      selectedSampleID: null,
    })
}

function activateListPath(state: State, action: QuantificationBiasEstimatorActions.ActivateListPath) {
  return Object.assign({}, state, {
    appState: 'list',
    activeQuantificationBiasEstimatorProjectID: null,
    selectedSampleID: null,
  })
}

function deactivateQuantificationBiasEstimatorProject(state: State, action: QuantificationBiasEstimatorActions.DeactivateQuantificationBiasEstimatorProjectAction): State {
  return Object.assign({}, state, {
    appState: 'list',
    activeQuantificationBiasEstimatorProjectID: null,
  selectedSampleID: null,
  })
}

function selectSample(state: State, action: QuantificationBiasEstimatorActions.SelectSampleAction): State {
  return Object.assign({}, state, {
    selectedSampleID: action.payload
  })
}

export const selectQuantificationBiasEstimatorState = createFeatureSelector<State>('quantificationBiasEstimators');
export const selectAppState = createSelector(selectQuantificationBiasEstimatorState, (state: State) => state.appState);
export const selectLoadingQuantificationBiasEstimatorProjects = createSelector(selectQuantificationBiasEstimatorState, (state: State) => state.loadingQuantificationBiasEstimators);
export const selectQuantificationBiasEstimatorProjectsLoaded = createSelector(selectQuantificationBiasEstimatorState, (state: State) => state.quantificationBiasEstimatorsLoaded);
export const selectActiveQuantificationBiasEstimatorProjectID = createSelector(selectQuantificationBiasEstimatorState, (state: State) => state.activeQuantificationBiasEstimatorProjectID)
export const selectActiveLocusQuantificationBiasEstimatorID = createSelector(selectQuantificationBiasEstimatorState, (state: State) => state.activeLocusQuantificationBiasEstimatorID);
export const selectSelectedSampleID = createSelector(selectQuantificationBiasEstimatorState, (state: State) => state.selectedSampleID);

export const selectActiveQuantificationBiasEstimatorProject = createSelector(
  fromDB.selectQuantificationBiasEstimatorProjectEntities,
  selectActiveQuantificationBiasEstimatorProjectID,
  (entities, id): QuantificationBiasEstimatorProject => entities[id]
);

export const selectActiveLocusSet = createSelector(
  selectActiveQuantificationBiasEstimatorProject,
  fromDB.selectLocusSetEntities,
  (qbe, locus_sets) => qbe ? locus_sets[qbe.locus_set] : null
);

export const selectActiveBinEstimatorProject = createSelector(
  selectActiveQuantificationBiasEstimatorProject,
  fromDB.selectBinEstimatorProjectEntities,
  (qbe, bin_estimators) => qbe ? bin_estimators[qbe.bin_estimator] : null
);

export const selectActiveArtifactEstimatorProject = createSelector(
  selectActiveQuantificationBiasEstimatorProject,
  fromDB.selectArtifactEstimatorProjectEntities,
  (qbe, artifactEstimators) => {
    if (qbe) {
      return qbe.artifact_estimator ? artifactEstimators[qbe.artifact_estimator] : null;
    } else {
      return null;
    }
  }
)

export const selectActiveSamples = createSelector(
  selectActiveQuantificationBiasEstimatorProject,
  fromDB.selectProjectSampleAnnotationsEntities,
  fromDB.selectSampleEntities,
  (qbeProject, projectSampleAnnotations: EntityMap<ProjectSampleAnnotations>, samples: EntityMap<Sample>) => {
    if (!qbeProject || !qbeProject.sample_annotations) {
      return [];
    }
    const activeSamples = qbeProject.sample_annotations
      .map(id => {
        const psa = projectSampleAnnotations[id];
        if (!psa) {
          return null;
        }
        return samples[+psa.sample];
      })
      .filter(e => e != null);

    const tmp = qbeProject.sample_annotations.map(id => projectSampleAnnotations[id]);
    return activeSamples;
  }
)

export const selectSelectedSample = createSelector(
  selectSelectedSampleID,
  fromDB.selectSampleEntities,
  (id, samples: EntityMap<Sample>) => {
    return samples[id];
  }
)

export const selectActiveControls = createSelector(
  selectSelectedSample,
  fromDB.selectProjectSampleAnnotationsList,
  fromDB.selectControlSampleAssociationList,
  fromDB.selectControlEntities,
  (sample, projectSampleAnnotations: ProjectSampleAnnotations[], controlSampleAssociations: ControlSampleAssociation[], controls: EntityMap<Control>) => {
    if (!sample) {
      return [];
    }

    const psa = projectSampleAnnotations.find((psa) => +psa.sample === +sample.id);

    if (!psa) {
      return [];
    }

    return controlSampleAssociations.filter(csa => +csa.sample_annotation === +psa.id)
      .map(csa => {
        return Object.assign({}, csa,
          {
            control: controls[+csa.control],
            sample_annotation: psa
          })
      });
  }
)

export const selectActiveLocusParameters = createSelector(
  selectActiveQuantificationBiasEstimatorProject,
  fromDB.selectQuantificationBiasEstimatorLocusParamsEntities,
  fromDB.selectLocusEntities,
  (project, locusParams, loci) => {
    if (project && locusParams && loci) {
      return project.locus_parameters.map(id => {
        const locusParam = locusParams[id];
        if (locusParam) {
          return Object.assign({}, locusParam, {locus: loci[locusParam.locus]});
        } else {
          return null;
        }
      }).filter(e => e != null)
    } else {
      return [];
    }
});