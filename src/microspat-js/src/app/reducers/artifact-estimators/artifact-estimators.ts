import { createSelector, createFeatureSelector } from '@ngrx/store';

import * as fromDB from '../db';

import * as DBActions from 'app/actions/db';
import * as ArtifactEstimatorActions from 'app/actions/artifact-estimators';
import * as NavigationActions from 'app/actions/navigation';

import { EntityMap } from 'app/models/base';
import { ArtifactEstimatorProject } from 'app/models/artifact-estimator/project';
import { LocusSet } from 'app/models/locus/locus-set';
import { Locus } from 'app/models/locus/locus';
import { Sample } from 'app/models/sample/sample';
import { ProjectSampleAnnotations } from 'app/models/project/sample-annotations';
import { LocusArtifactEstimator } from 'app/models/artifact-estimator/locus-artifact-estimator';
import { ArtifactEstimator } from 'app/models/artifact-estimator/artifact-estimator';
import { ArtifactEquation } from 'app/models/artifact-estimator/artifact-equation';
import { Circle, Line } from 'app/containers/components/plots/canvas';


export interface State {
  appState: 'list' | 'details';
  artifactEstimatorsLoaded: boolean;
  loadingArtifactEstimators: boolean;
  activeArtifactEstimatorProjectID: number;
  activeLocusArtifactEstimatorID: number;
  activeArtifactEstimatorID: number;
}

const initialState: State = {
  appState: 'list',
  artifactEstimatorsLoaded: false,
  loadingArtifactEstimators: false,
  activeArtifactEstimatorProjectID: null,
  activeLocusArtifactEstimatorID: null,
  activeArtifactEstimatorID: null
};

export function reducer(state = initialState, action: DBActions.Actions | ArtifactEstimatorActions.Actions | NavigationActions.Actions) {
  switch (action.type) {
    case DBActions.LIST_RECEIVED:
      return dbListReceived(state, action);

    case DBActions.DELETE_RECEIVED:
      return dbDeleteReceived(state, action);

    case NavigationActions.ACTIVATE_ARTIFACT_ESTIMATOR_PATH:
      return activateArtifactEstimatorPath(state, action);

    case ArtifactEstimatorActions.LOADING_ARTIFACT_ESTIMATOR_PROJECTS:
      return loadingArtifactEstimators(state, action);

    case ArtifactEstimatorActions.LOADING_ARTIFACT_ESTIMATOR:
      return activateArtifactEstimatorProject(state, action);

    case ArtifactEstimatorActions.ACTIVATE_ARTIFACT_ESTIMATOR_PROJECT:
      return activateArtifactEstimatorProject(state, action);

    case ArtifactEstimatorActions.ACTIVATE_LIST_PATH:
      return activateListPath(state, action);

    case ArtifactEstimatorActions.DEACTIVATE_ARTIFACT_ESTIMATOR_PROJECT:
      return deactivateArtifactEstimatorProject(state, action);

    case ArtifactEstimatorActions.SELECT_LOCUS_ARTIFACT_ESTIMATOR:
      return activateLocusArtifactEstimator(state, action);

    case ArtifactEstimatorActions.SELECT_ARTIFACT_ESTIMATOR:
      return selectArtifactEstimator(state, action);

    case ArtifactEstimatorActions.DELETE_ARTIFACT_ESTIMATOR:
      return deactivateArtifactEstimator(state, action);

    default:
      return state

  }
}

function dbListReceived(state: State, action: DBActions.ListReceivedAction) {
  if (action.payload.model === fromDB.models.artifactEstimatorProject) {
    return Object.assign({}, state, {
      loadingArtifactEstimators: false,
      artifactEstimatorsLoaded: true
    })
  }
  return state;
}

function dbDeleteReceived(state: State, action: DBActions.DeleteReceivedAction) {
  if (action.payload && action.payload.model === fromDB.models.artifactEstimatorProject) {
    return initialState;
  }
  return state;
}

function activateArtifactEstimatorPath(state: State, action: NavigationActions.ActivateArtifactEstimatorPathAction) {
  return Object.assign({}, state, {
    appState: 'list',
    activeArtifactEstimatorProjectID: null,
    activeLocusArtifactEstimatorID: null,
    activeArtifactEstimatorEquationSetID: null,
    activeArtifactEstimatorID: null
  })
}

function loadingArtifactEstimators(state: State, action: ArtifactEstimatorActions.LoadingArtifactEstimatorsAction) {
  return Object.assign({}, state, {
    loadingArtifactEstimators: true
  })
}

function activateArtifactEstimatorProject(state: State, action: ArtifactEstimatorActions.LoadingArtifactEstimatorAction | ArtifactEstimatorActions.ActivateArtifactEstimatorAction) {
  return Object.assign({}, state, {
    activeArtifactEstimatorProjectID: action.payload,
    activeLocusArtifactEstimatorID: null,
    activeArtifactEstimatorEquationSetID: null,
    activeArtifactEstimatorID: null,
    appState: 'details'
  })
}

function activateListPath(state: State, action: ArtifactEstimatorActions.ActivateListPath) {
  return Object.assign({}, state, {
    appState: 'list',
    activeArtifactEstimatorProjectID: null,
    activeLocusArtifactEstimatorID: null,
    activeArtifactEstimatorEquationSetID: null,
    activeArtifactEstimatorID: null,
  })
}

function deactivateArtifactEstimatorProject(state: State, action: ArtifactEstimatorActions.DeactivateArtifactEstimatorProjectAction) {
  return Object.assign({}, state, {
    activeArtifactEstimatorProjectID: null,
    activeLocusArtifactEstimatorID: null,
    activeArtifactEstimatorEquationSetID: null,
    activeArtifactEstimatorID: null,
    appState: 'list'
  })
}

function activateLocusArtifactEstimator(state: State, action: ArtifactEstimatorActions.SelectLocusArtifactEstimatorAction) {
  return Object.assign({}, state, {
    activeLocusArtifactEstimatorID: action.payload,
    activeArtifactEstimatorEquationSetID: null,
    activeArtifactEstimatorID: null
  });
}

function selectArtifactEstimator(state: State, action: ArtifactEstimatorActions.SelectArtifactEstimatorAction) {
  return Object.assign({}, state, {
    activeArtifactEstimatorID: action.payload
  })
}

function deactivateArtifactEstimator(state: State, action: ArtifactEstimatorActions.DeleteArtifactEstimatorAction) {
  return Object.assign({}, state, {
    activeArtifactEstimatorID: null
  })
}

export const selectArtifactEstimatorState = createFeatureSelector<State>('artifactEstimators');
export const selectAppState = createSelector(selectArtifactEstimatorState, (state: State) => state.appState);
export const selectLoadingArtifactEstimatorProjects = createSelector(selectArtifactEstimatorState, (state: State) => state.loadingArtifactEstimators);
export const selectArtifactEstimatorsLoaded = createSelector(selectArtifactEstimatorState, (state: State) => state.artifactEstimatorsLoaded);
export const selectActiveArtifactEstimatorProjectID = createSelector(selectArtifactEstimatorState, (state: State) => state.activeArtifactEstimatorProjectID);
export const selectActiveLocusArtifactEstimatorID = createSelector(selectArtifactEstimatorState, (state: State) => state.activeLocusArtifactEstimatorID);
export const selectActiveArtifactEstimatorID = createSelector(selectArtifactEstimatorState, (state: State) => state.activeArtifactEstimatorID);

export const selectActiveArtifactEstimatorProject = createSelector(
  fromDB.selectArtifactEstimatorProjectEntities,
  selectActiveArtifactEstimatorProjectID,
  (entities, id): ArtifactEstimatorProject => entities[id]
);

export const selectActiveLocusSet = createSelector(fromDB.selectLocusSetEntities, selectActiveArtifactEstimatorProject, (locusSets, artifactEstimator): LocusSet => {
  if (locusSets && artifactEstimator) {
    return locusSets[artifactEstimator.locus_set];
  } else {
    return null;
  }
});

export const selectActiveArtifactEstimatorSamples = createSelector(
  selectActiveArtifactEstimatorProject,
  fromDB.selectProjectSampleAnnotationsEntities,
  fromDB.selectSampleEntities, (artifactEstimatorProject, psaMap, sampleMap): Sample[] => {
    if (!artifactEstimatorProject || !artifactEstimatorProject.detailed) {
      return [];
    }

    return artifactEstimatorProject.sample_annotations.map(id => {
      const annotation: ProjectSampleAnnotations = psaMap[id];
      if (annotation) {
        return sampleMap[annotation.sample as string];
      } else {
        return null
      }
    }).filter(e => e != null);
  }
);

export const selectInactiveSamples = createSelector(
  selectActiveArtifactEstimatorProject,
  fromDB.selectProjectSampleAnnotationsEntities,
  fromDB.selectSampleEntities, (artifactEstimatorProject, psaMap, sampleMap): Sample[] => {
    if (!artifactEstimatorProject || !artifactEstimatorProject.detailed) {
      return [];
    }

    const inactiveSamples = Object.assign({}, sampleMap);
    let annotation: ProjectSampleAnnotations;

    artifactEstimatorProject.sample_annotations.forEach(id => {
      annotation = psaMap[id];
      if (annotation) {
        delete inactiveSamples[annotation.sample as string];
      }
    });

    return Object.keys(inactiveSamples).map(id => inactiveSamples[id]);
  }
);

export const selectActiveLoci = createSelector(selectActiveLocusSet, fromDB.selectLocusEntities, (locusSet, loci) => {
  if (locusSet) {
    return locusSet.loci.map(id => loci[id]);
  } else {
    return [];
  }
});

export const selectActiveLocusParameters = createSelector(
  selectActiveArtifactEstimatorProject,
  fromDB.selectArtifactEstimatorLocusParamsEntities,
   fromDB.selectLocusEntities,
  (be, locusParams, loci) => {
    if (be && locusParams && loci) {
      return be.locus_parameters.map(id => {
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

export const selectActiveLocusArtifactEstimators = createSelector(
  selectActiveArtifactEstimatorProject,
  fromDB.selectLocusArtifactEstimatorEntities,
  fromDB.selectLocusEntities, (ae, locusArtifactEstimators, loci) => {
    if (ae && locusArtifactEstimators && loci) {
      return ae.locus_artifact_estimators.map(id => {
        const lbs = locusArtifactEstimators[id];
        if (lbs) {
          return Object.assign({}, lbs, {locus: loci[lbs.locus]});
        } else {
          return null;
        }
      }).filter(e => e != null);
    } else {
      return []
    }
});

export const selectActiveLocusArtifactEstimator = createSelector(
  selectActiveLocusArtifactEstimatorID,
  fromDB.selectLocusArtifactEstimatorEntities,
  (id, entities): LocusArtifactEstimator => id ? entities[id] : null
);

export const selectActiveArtifactEstimators = createSelector(
  selectActiveLocusArtifactEstimator,
  fromDB.selectArtifactEstimatorEntities,
  (locusArtifactEstimator, artifactEstimatorEntities) => {
    if (locusArtifactEstimator) {
      return locusArtifactEstimator.artifact_estimators.map(id => {
        return artifactEstimatorEntities[id]
      }).filter(e => e != null)
    } else {
      return [];
    }
});

export const selectActiveArtifactEstimator = createSelector(
  selectActiveArtifactEstimatorID,
  fromDB.selectArtifactEstimatorEntities,
  fromDB.selectArtifactEquationEntities,
  (id, artifactEstimatorEntities, artifactEquationEntities: EntityMap<ArtifactEquation>) => {
    if (id && artifactEstimatorEntities && artifactEquationEntities) {
      const artifactEstimator: ArtifactEstimator = artifactEstimatorEntities[id];
      if (artifactEstimator == null) {
        return null;
      }
      const equationIDs = <string[]>artifactEstimator.artifact_equations;
      return Object.assign({}, artifactEstimator, {
        artifact_equations: equationIDs.map(eq_id => artifactEquationEntities[eq_id]).filter(ae => ae != null)
      });
    } else {
      return null;
    }
  }
)

export const selectArtifactPlot = createSelector(
  selectActiveArtifactEstimator,
  selectActiveLocusArtifactEstimator,
  fromDB.selectLocusEntities,
  (artifactEstimator, locusArtifactEstimator, loci) => {
    if (!artifactEstimator || !locusArtifactEstimator || !loci) {
      return null;
    }
    const locusID = <string>locusArtifactEstimator.locus
    const locus: Locus = loci[locusID];
    const points = artifactEstimator.peak_data.map(peak => {
      const point: Circle = {
        center: [peak.peak_size, peak.relative_peak_height],
        radius: 2,
        color: 'red',
        opacity: 1
      }
      return point;
    });

    const lines = artifactEstimator.artifact_equations.map(eq => {
      const line: Line = {
        slope: eq.slope,
        intercept: eq.intercept,
        start: eq.start_size,
        end: eq.end_size,
        color: '#00D5FF' // blue
      }

      const sdLines = [1, 2, 3].map(dist => {
        const sdLine: Line = {
          slope: eq.slope,
          intercept: eq.intercept + dist * eq.sd,
          start: eq.start_size,
          end: eq.end_size,
          color: 'green'
        }
        return sdLine;
      })

      sdLines.push(line);
      return sdLines;
    }).reduce((prev: Line[], curr: Line[]) => {
      return prev.concat(curr);
    }, []);

    const domain = [locus.min_base_length, locus.max_base_length];
    const range = [-.1, 1.1];

    return {
      points: points,
      lines: lines,
      domain: domain,
      range: range
    }
  }
)
