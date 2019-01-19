import { combineReducers, createFeatureSelector, createSelector } from '@ngrx/store';
import * as fromArtifactEquation from './artifact-estimator/artifact-equation';
import * as fromArtifactEstimator from './artifact-estimator/artifact-estimator';
import * as fromLocusArtifactEstimator from './artifact-estimator/locus-artifact-estimator';
import * as fromArtifactEstimatorLocusParams from './artifact-estimator/locus-params';
import * as fromArtifactEstimatorProject from './artifact-estimator/project';

import * as fromBin from './bin-estimator/bin';
import * as fromLocusBinSet from './bin-estimator/locus-bin-set';
import * as fromBinEstimatorLocusParams from './bin-estimator/locus-params';
import * as fromBinEstimatorProject from './bin-estimator/project';

import * as fromGenotypingLocusParams from './genotyping/locus-params';
import * as fromGenotypingProject from './genotyping/project';

import * as fromLocusSet from './locus/locus-set';
import * as fromLocus from './locus/locus';

import * as fromProjectChannelAnnotations from './project/channel-annotations';
import * as fromProjectSampleAnnotations from './project/sample-annotations';

import * as fromQuantificationBiasEstimatorLocusParams from './quantification-bias-estimator/locus-params';
import * as fromQuantificationBiasEstimatorProject from './quantification-bias-estimator/project';

import * as fromControlSampleAssociation from './sample/control-sample-association';
import * as fromControl from './sample/control';
import * as fromGenotype from './sample/genotype';
import * as fromSampleLocusAnnotation from './sample/sample-locus-annotation';
import * as fromSample from './sample/sample';

import * as fromChannel from './ce/channel';
import * as fromWell from './ce/well';
import * as fromPlate from './ce/plate';
import * as fromLadder from './ce/ladder';
import { getEntities, getIds, getPendingRequests, getList } from './dbReducer';
export { getEntities, getIds, getPendingRequests }

export interface DBState {
  artifactEquation: fromArtifactEquation.State;
  artifactEstimator: fromArtifactEstimator.State;
  locusArtifactEstimator: fromLocusArtifactEstimator.State;
  artifactEstimatorLocusParams: fromArtifactEstimatorLocusParams.State;
  artifactEstimatorProject: fromArtifactEstimatorProject.State;
  bin: fromBin.State;
  locusBinSet: fromLocusBinSet.State;
  binEstimatorLocusParams: fromBinEstimatorLocusParams.State;
  binEstimatorProject: fromBinEstimatorProject.State;
  genotypingLocusParams: fromGenotypingLocusParams.State;
  genotypingProject: fromGenotypingProject.State;
  locusSet: fromLocusSet.State;
  locus: fromLocus.State;
  projectChannelAnnotations: fromProjectChannelAnnotations.State;
  projectSampleAnnotations: fromProjectSampleAnnotations.State;
  quantificationBiasEstimatorLocusParams: fromQuantificationBiasEstimatorLocusParams.State;
  quantificationBiasEstimatorProject: fromQuantificationBiasEstimatorProject.State;
  controlSampleAssociation: fromControlSampleAssociation.State;
  control: fromControl.State;
  genotype: fromGenotype.State;
  sampleLocusAnnotation: fromSampleLocusAnnotation.State;
  sample: fromSample.State;
  channel: fromChannel.State;
  ladder: fromLadder.State;
  plate: fromPlate.State;
  well: fromWell.State;
}

export const reducer = combineReducers({
  artifactEquation: fromArtifactEquation.reducer,
  artifactEstimator: fromArtifactEstimator.reducer,
  locusArtifactEstimator: fromLocusArtifactEstimator.reducer,
  artifactEstimatorLocusParams: fromArtifactEstimatorLocusParams.reducer,
  artifactEstimatorProject: fromArtifactEstimatorProject.reducer,
  bin: fromBin.reducer,
  locusBinSet: fromLocusBinSet.reducer,
  binEstimatorLocusParams: fromBinEstimatorLocusParams.reducer,
  binEstimatorProject: fromBinEstimatorProject.reducer,
  genotypingLocusParams: fromGenotypingLocusParams.reducer,
  genotypingProject: fromGenotypingProject.reducer,
  locusSet: fromLocusSet.reducer,
  locus: fromLocus.reducer,
  projectChannelAnnotations: fromProjectChannelAnnotations.reducer,
  projectSampleAnnotations: fromProjectSampleAnnotations.reducer,
  quantificationBiasEstimatorLocusParams: fromQuantificationBiasEstimatorLocusParams.reducer,
  quantificationBiasEstimatorProject: fromQuantificationBiasEstimatorProject.reducer,
  controlSampleAssociation: fromControlSampleAssociation.reducer,
  control: fromControl.reducer,
  genotype: fromGenotype.reducer,
  sampleLocusAnnotation: fromSampleLocusAnnotation.reducer,
  sample: fromSample.reducer,
  channel: fromChannel.reducer,
  ladder: fromLadder.reducer,
  plate: fromPlate.reducer,
  well: fromWell.reducer
});

export const models = {
  artifactEquation: fromArtifactEquation.MODEL,
  artifactEstimator: fromArtifactEstimator.MODEL,
  locusArtifactEstimator: fromLocusArtifactEstimator.MODEL,
  artifactEstimatorLocusParams: fromArtifactEstimatorLocusParams.MODEL,
  artifactEstimatorProject: fromArtifactEstimatorProject.MODEL,
  bin: fromBin.MODEL,
  locusBinSet: fromLocusBinSet.MODEL,
  binEstimatorLocusParams: fromBinEstimatorLocusParams.MODEL,
  binEstimatorProject: fromBinEstimatorProject.MODEL,
  genotypingLocusParams: fromGenotypingLocusParams.MODEL,
  genotypingProject: fromGenotypingProject.MODEL,
  locusSet: fromLocusSet.MODEL,
  locus: fromLocus.MODEL,
  projectChannelAnnotations: fromProjectChannelAnnotations.MODEL,
  projectSampleAnnotations: fromProjectSampleAnnotations.MODEL,
  quantificationBiasEstimatorLocusParams: fromQuantificationBiasEstimatorLocusParams.MODEL,
  quantificationBiasEstimatorProject: fromQuantificationBiasEstimatorProject.MODEL,
  controlSampleAssociation: fromControlSampleAssociation.MODEL,
  control: fromControl.MODEL,
  genotype: fromGenotype.MODEL,
  sampleLocusAnnotation: fromSampleLocusAnnotation.MODEL,
  sample: fromSample.MODEL,
  channel: fromChannel.MODEL,
  ladder: fromLadder.MODEL,
  plate: fromPlate.MODEL,
  well: fromWell.MODEL
};

export const selectDBState = createFeatureSelector<DBState>('db');

export const selectArtifactEquationState = createSelector(selectDBState, (state: DBState) => state.artifactEquation);
export const selectArtifactEstimatorState = createSelector(selectDBState, (state: DBState) => state.artifactEstimator);
export const selectLocusArtifactEstimatorState = createSelector(selectDBState, (state: DBState) => state.locusArtifactEstimator);
export const selectArtifactEstimatorLocusParamsState = createSelector(selectDBState, (state: DBState) => state.artifactEstimatorLocusParams);
export const selectArtifactEstimatorProjectState = createSelector(selectDBState, (state: DBState) => state.artifactEstimatorProject);
export const selectBinState = createSelector(selectDBState, (state: DBState) => state.bin);
export const selectLocusBinSetState = createSelector(selectDBState, (state: DBState) => state.locusBinSet);
export const selectBinEstimatorLocusParamsState = createSelector(selectDBState, (state: DBState) => state.binEstimatorLocusParams);
export const selectBinEstimatorProjectState = createSelector(selectDBState, (state: DBState) => state.binEstimatorProject);
export const selectGenotypingLocusParamsState = createSelector(selectDBState, (state: DBState) => state.genotypingLocusParams);
export const selectGenotypingProjectState = createSelector(selectDBState, (state: DBState) => state.genotypingProject);
export const selectLocusSetState = createSelector(selectDBState, (state: DBState) => state.locusSet);
export const selectLocusState = createSelector(selectDBState, (state: DBState) => state.locus);
export const selectProjectChannelAnnotationsState = createSelector(selectDBState, (state: DBState) => state.projectChannelAnnotations);
export const selectProjectSampleAnnotationsState = createSelector(selectDBState, (state: DBState) => state.projectSampleAnnotations);
export const selectQuantificationBiasEstimatorLocusParamsState = createSelector(selectDBState, (state: DBState) => state.quantificationBiasEstimatorLocusParams);
export const selectQuantificationBiasEstimatorProjectState = createSelector(selectDBState, (state: DBState) => state.quantificationBiasEstimatorProject);
export const selectControlSampleAssociationState = createSelector(selectDBState, (state: DBState) => state.controlSampleAssociation);
export const selectControlState = createSelector(selectDBState, (state: DBState) => state.control);
export const selectGenotypeState = createSelector(selectDBState, (state: DBState) => state.genotype);
export const selectSampleLocusAnnotationState = createSelector(selectDBState, (state: DBState) => state.sampleLocusAnnotation);
export const selectSampleState = createSelector(selectDBState, (state: DBState) => state.sample);
export const selectChannelState = createSelector(selectDBState, (state: DBState) => state.channel);
export const selectLadderState = createSelector(selectDBState, (state: DBState) => state.ladder);
export const selectPlateState = createSelector(selectDBState, (state: DBState) => state.plate);
export const selectWellState = createSelector(selectDBState, (state: DBState) => state.well);

export const modelToState = {
  [fromArtifactEquation.MODEL]: selectArtifactEquationState,
  [fromArtifactEstimator.MODEL]: selectArtifactEstimatorState,
  [fromLocusArtifactEstimator.MODEL]: selectLocusArtifactEstimatorState,
  [fromArtifactEstimatorLocusParams.MODEL]: selectArtifactEstimatorLocusParamsState,
  [fromArtifactEstimatorProject.MODEL]: selectArtifactEstimatorProjectState,
  [fromBin.MODEL]: selectBinState,
  [fromLocusBinSet.MODEL]: selectLocusBinSetState,
  [fromBinEstimatorLocusParams.MODEL]: selectBinEstimatorLocusParamsState,
  [fromBinEstimatorProject.MODEL]: selectBinEstimatorProjectState,
  [fromGenotypingLocusParams.MODEL]: selectGenotypingLocusParamsState,
  [fromGenotypingProject.MODEL]: selectGenotypingProjectState,
  [fromLocusSet.MODEL]: selectLocusSetState,
  [fromLocus.MODEL]: selectLocusState,
  [fromProjectChannelAnnotations.MODEL]: selectProjectChannelAnnotationsState,
  [fromProjectSampleAnnotations.MODEL]: selectProjectSampleAnnotationsState,
  [fromQuantificationBiasEstimatorLocusParams.MODEL]: selectQuantificationBiasEstimatorLocusParamsState,
  [fromQuantificationBiasEstimatorProject.MODEL]: selectQuantificationBiasEstimatorProjectState,
  [fromControlSampleAssociation.MODEL]: selectControlSampleAssociationState,
  [fromControl.MODEL]: selectControlState,
  [fromGenotype.MODEL]: selectGenotypeState,
  [fromSampleLocusAnnotation.MODEL]: selectSampleLocusAnnotationState,
  [fromSample.MODEL]: selectSampleState,
  [fromChannel.MODEL]: selectChannelState,
  [fromLadder.MODEL]: selectLadderState,
  [fromPlate.MODEL]: selectPlateState,
  [fromWell.MODEL]: selectWellState,
}

export const selectArtifactEquationEntities = createSelector(selectArtifactEquationState, getEntities);
export const selectArtifactEstimatorEntities = createSelector(selectArtifactEstimatorState, getEntities);
export const selectLocusArtifactEstimatorEntities = createSelector(selectLocusArtifactEstimatorState, getEntities);
export const selectArtifactEstimatorLocusParamsEntities = createSelector(selectArtifactEstimatorLocusParamsState, getEntities);
export const selectArtifactEstimatorProjectEntities = createSelector(selectArtifactEstimatorProjectState, getEntities);
export const selectBinEntities = createSelector(selectBinState, getEntities);
export const selectLocusBinSetEntities = createSelector(selectLocusBinSetState, getEntities);
export const selectBinEstimatorLocusParamsEntities = createSelector(selectBinEstimatorLocusParamsState, getEntities);
export const selectBinEstimatorProjectEntities = createSelector(selectBinEstimatorProjectState, getEntities);
export const selectGenotypingLocusParamsEntities = createSelector(selectGenotypingLocusParamsState, getEntities);
export const selectGenotypingProjectEntities = createSelector(selectGenotypingProjectState, getEntities);
export const selectLocusSetEntities = createSelector(selectLocusSetState, getEntities);
export const selectLocusEntities = createSelector(selectLocusState, getEntities);
export const selectProjectChannelAnnotationsEntities = createSelector(selectProjectChannelAnnotationsState, getEntities);
export const selectProjectSampleAnnotationsEntities = createSelector(selectProjectSampleAnnotationsState, getEntities);
export const selectQuantificationBiasEstimatorLocusParamsEntities = createSelector(selectQuantificationBiasEstimatorLocusParamsState, getEntities);
export const selectQuantificationBiasEstimatorProjectEntities = createSelector(selectQuantificationBiasEstimatorProjectState, getEntities);
export const selectControlSampleAssociationEntities = createSelector(selectControlSampleAssociationState, getEntities);
export const selectControlEntities = createSelector(selectControlState, getEntities);
export const selectGenotypeEntities = createSelector(selectGenotypeState, getEntities);
export const selectSampleLocusAnnotationEntities = createSelector(selectSampleLocusAnnotationState, getEntities);
export const selectSampleEntities = createSelector(selectSampleState, getEntities);
export const selectChannelEntities = createSelector(selectChannelState, getEntities);
export const selectLadderEntities = createSelector(selectLadderState, getEntities);
export const selectPlateEntities = createSelector(selectPlateState, getEntities);
export const selectWellEntities = createSelector(selectWellState, getEntities);

export const modelToEntity = {
  [fromArtifactEquation.MODEL]: selectArtifactEquationEntities,
  [fromArtifactEstimator.MODEL]: selectArtifactEstimatorEntities,
  [fromLocusArtifactEstimator.MODEL]: selectLocusArtifactEstimatorEntities,
  [fromArtifactEstimatorLocusParams.MODEL]: selectArtifactEstimatorLocusParamsEntities,
  [fromArtifactEstimatorProject.MODEL]: selectArtifactEstimatorProjectEntities,
  [fromBin.MODEL]: selectBinEntities,
  [fromLocusBinSet.MODEL]: selectLocusBinSetEntities,
  [fromBinEstimatorLocusParams.MODEL]: selectBinEstimatorLocusParamsEntities,
  [fromBinEstimatorProject.MODEL]: selectBinEstimatorProjectEntities,
  [fromGenotypingLocusParams.MODEL]: selectGenotypingLocusParamsEntities,
  [fromGenotypingProject.MODEL]: selectGenotypingProjectEntities,
  [fromLocusSet.MODEL]: selectLocusSetEntities,
  [fromLocus.MODEL]: selectLocusEntities,
  [fromProjectChannelAnnotations.MODEL]: selectProjectChannelAnnotationsEntities,
  [fromProjectSampleAnnotations.MODEL]: selectProjectSampleAnnotationsEntities,
  [fromQuantificationBiasEstimatorLocusParams.MODEL]: selectQuantificationBiasEstimatorLocusParamsEntities,
  [fromQuantificationBiasEstimatorProject.MODEL]: selectQuantificationBiasEstimatorProjectEntities,
  [fromControlSampleAssociation.MODEL]: selectControlSampleAssociationEntities,
  [fromControl.MODEL]: selectControlEntities,
  [fromGenotype.MODEL]: selectGenotypeEntities,
  [fromSampleLocusAnnotation.MODEL]: selectSampleLocusAnnotationEntities,
  [fromSample.MODEL]: selectSampleEntities,
  [fromChannel.MODEL]: selectChannelEntities,
  [fromLadder.MODEL]: selectLadderEntities,
  [fromPlate.MODEL]: selectPlateEntities,
  [fromWell.MODEL]: selectWellEntities,
}

export const selectArtifactEquationIds = createSelector(selectArtifactEquationState, getIds);
export const selectArtifactEstimatorIds = createSelector(selectArtifactEstimatorState, getIds);
export const selectLocusArtifactEstimatorIds = createSelector(selectLocusArtifactEstimatorState, getIds);
export const selectArtifactEstimatorLocusParamsIds = createSelector(selectArtifactEstimatorLocusParamsState, getIds);
export const selectArtifactEstimatorProjectIds = createSelector(selectArtifactEstimatorProjectState, getIds);
export const selectBinIds = createSelector(selectBinState, getIds);
export const selectLocusBinSetIds = createSelector(selectLocusBinSetState, getIds);
export const selectBinEstimatorLocusParamsIds = createSelector(selectBinEstimatorLocusParamsState, getIds);
export const selectBinEstimatorProjectIds = createSelector(selectBinEstimatorProjectState, getIds);
export const selectGenotypingLocusParamsIds = createSelector(selectGenotypingLocusParamsState, getIds);
export const selectGenotypingProjectIds = createSelector(selectGenotypingProjectState, getIds);
export const selectLocusSetIds = createSelector(selectLocusSetState, getIds);
export const selectLocusIds = createSelector(selectLocusState, getIds);
export const selectProjectChannelAnnotationsIds = createSelector(selectProjectChannelAnnotationsState, getIds);
export const selectProjectSampleAnnotationsIds = createSelector(selectProjectSampleAnnotationsState, getIds);
export const selectQuantificationBiasEstimatorLocusParamsIds = createSelector(selectQuantificationBiasEstimatorLocusParamsState, getIds);
export const selectQuantificationBiasEstimatorProjectIds = createSelector(selectQuantificationBiasEstimatorProjectState, getIds);
export const selectControlSampleAssociationIds = createSelector(selectControlSampleAssociationState, getIds);
export const selectControlIds = createSelector(selectControlState, getIds);
export const selectGenotypeIds = createSelector(selectGenotypeState, getIds);
export const selectSampleLocusAnnotationIds = createSelector(selectSampleLocusAnnotationState, getIds);
export const selectSampleIds = createSelector(selectSampleState, getIds);
export const selectChannelIds = createSelector(selectChannelState, getIds);
export const selectLadderIds = createSelector(selectLadderState, getIds);
export const selectPlateIds = createSelector(selectPlateState, getIds);
export const selectWellIds = createSelector(selectWellState, getIds);


export const selectArtifactEquationPendingReqs = createSelector(selectArtifactEquationState, getPendingRequests);
export const selectArtifactEstimatorPendingReqs = createSelector(selectArtifactEstimatorState, getPendingRequests);
export const selectLocusArtifactEstimatorPendingReqs = createSelector(selectLocusArtifactEstimatorState, getPendingRequests);
export const selectArtifactEstimatorLocusParamsPendingReqs = createSelector(selectArtifactEstimatorLocusParamsState, getPendingRequests);
export const selectArtifactEstimatorProjectPendingReqs = createSelector(selectArtifactEstimatorProjectState, getPendingRequests);
export const selectBinPendingReqs = createSelector(selectBinState, getPendingRequests);
export const selectLocusBinSetPendingReqs = createSelector(selectLocusBinSetState, getPendingRequests);
export const selectBinEstimatorLocusParamsPendingReqs = createSelector(selectBinEstimatorLocusParamsState, getPendingRequests);
export const selectBinEstimatorProjectPendingReqs = createSelector(selectBinEstimatorProjectState, getPendingRequests);
export const selectGenotypingLocusParamsPendingReqs = createSelector(selectGenotypingLocusParamsState, getPendingRequests);
export const selectGenotypingProjectPendingReqs = createSelector(selectGenotypingProjectState, getPendingRequests);
export const selectLocusSetPendingReqs = createSelector(selectLocusSetState, getPendingRequests);
export const selectLocusPendingReqs = createSelector(selectLocusState, getPendingRequests);
export const selectProjectChannelAnnotationsPendingReqs = createSelector(selectProjectChannelAnnotationsState, getPendingRequests);
export const selectProjectSampleAnnotationsPendingReqs = createSelector(selectProjectSampleAnnotationsState, getPendingRequests);
export const selectQuantificationBiasEstimatorLocusParamsPendingReqs = createSelector(selectQuantificationBiasEstimatorLocusParamsState, getPendingRequests);
export const selectQuantificationBiasEstimatorProjectPendingReqs = createSelector(selectQuantificationBiasEstimatorProjectState, getPendingRequests);
export const selectControlSampleAssociationPendingReqs = createSelector(selectControlSampleAssociationState, getPendingRequests);
export const selectControlPendingReqs = createSelector(selectControlState, getPendingRequests);
export const selectGenotypePendingReqs = createSelector(selectGenotypeState, getPendingRequests);
export const selectSampleLocusAnnotationPendingReqs = createSelector(selectSampleLocusAnnotationState, getPendingRequests);
export const selectSamplePendingReqs = createSelector(selectSampleState, getPendingRequests);
export const selectChannelPendingReqs = createSelector(selectChannelState, getPendingRequests);
export const selectLadderPendingReqs = createSelector(selectLadderState, getPendingRequests);
export const selectPlatePendingReqs = createSelector(selectPlateState, getPendingRequests);
export const selectWellPendingReqs = createSelector(selectWellState, getPendingRequests);

export const modelToPendingReqs = {
  [fromArtifactEquation.MODEL]: selectArtifactEquationPendingReqs,
  [fromArtifactEstimator.MODEL]: selectArtifactEstimatorPendingReqs,
  [fromLocusArtifactEstimator.MODEL]: selectLocusArtifactEstimatorPendingReqs,
  [fromArtifactEstimatorLocusParams.MODEL]: selectArtifactEstimatorLocusParamsPendingReqs,
  [fromArtifactEstimatorProject.MODEL]: selectArtifactEstimatorProjectPendingReqs,
  [fromBin.MODEL]: selectBinPendingReqs,
  [fromLocusBinSet.MODEL]: selectLocusBinSetPendingReqs,
  [fromBinEstimatorLocusParams.MODEL]: selectBinEstimatorLocusParamsPendingReqs,
  [fromBinEstimatorProject.MODEL]: selectBinEstimatorProjectPendingReqs,
  [fromGenotypingLocusParams.MODEL]: selectGenotypingLocusParamsPendingReqs,
  [fromGenotypingProject.MODEL]: selectGenotypingProjectPendingReqs,
  [fromLocusSet.MODEL]: selectLocusSetPendingReqs,
  [fromLocus.MODEL]: selectLocusPendingReqs,
  [fromProjectChannelAnnotations.MODEL]: selectProjectChannelAnnotationsPendingReqs,
  [fromProjectSampleAnnotations.MODEL]: selectProjectSampleAnnotationsPendingReqs,
  [fromQuantificationBiasEstimatorLocusParams.MODEL]: selectQuantificationBiasEstimatorLocusParamsPendingReqs,
  [fromQuantificationBiasEstimatorProject.MODEL]: selectQuantificationBiasEstimatorProjectPendingReqs,
  [fromControlSampleAssociation.MODEL]: selectControlSampleAssociationPendingReqs,
  [fromControl.MODEL]: selectControlPendingReqs,
  [fromGenotype.MODEL]: selectGenotypePendingReqs,
  [fromSampleLocusAnnotation.MODEL]: selectSampleLocusAnnotationPendingReqs,
  [fromSample.MODEL]: selectSamplePendingReqs,
  [fromChannel.MODEL]: selectChannelPendingReqs,
  [fromLadder.MODEL]: selectLadderPendingReqs,
  [fromPlate.MODEL]: selectPlatePendingReqs,
  [fromWell.MODEL]: selectWellPendingReqs,
};


export const selectArtifactEquationList = createSelector(selectArtifactEquationState, getList);
export const selectArtifactEstimatorList = createSelector(selectArtifactEstimatorState, getList);
export const selectLocusArtifactEstimatorList = createSelector(selectLocusArtifactEstimatorState, getList);
export const selectArtifactEstimatorLocusParamsList = createSelector(selectArtifactEstimatorLocusParamsState, getList);
export const selectArtifactEstimatorProjectList = createSelector(selectArtifactEstimatorProjectState, getList);
export const selectBinList = createSelector(selectBinState, getList);
export const selectLocusBinSetList = createSelector(selectLocusBinSetState, getList);
export const selectBinEstimatorLocusParamsList = createSelector(selectBinEstimatorLocusParamsState, getList);
export const selectBinEstimatorProjectList = createSelector(selectBinEstimatorProjectState, getList);
export const selectGenotypingLocusParamsList = createSelector(selectGenotypingLocusParamsState, getList);
export const selectGenotypingProjectList = createSelector(selectGenotypingProjectState, getList);
export const selectLocusSetList = createSelector(selectLocusSetState, getList);
export const selectLocusList = createSelector(selectLocusState, getList);
export const selectProjectChannelAnnotationsList = createSelector(selectProjectChannelAnnotationsState, getList);
export const selectProjectSampleAnnotationsList = createSelector(selectProjectSampleAnnotationsState, getList);
export const selectQuantificationBiasEstimatorLocusParamsList = createSelector(selectQuantificationBiasEstimatorLocusParamsState, getList);
export const selectQuantificationBiasEstimatorProjectList = createSelector(selectQuantificationBiasEstimatorProjectState, getList);
export const selectControlSampleAssociationList = createSelector(selectControlSampleAssociationState, getList);
export const selectControlList = createSelector(selectControlState, getList);
export const selectGenotypeList = createSelector(selectGenotypeState, getList);
export const selectSampleLocusAnnotationList = createSelector(selectSampleLocusAnnotationState, getList);
export const selectSampleList = createSelector(selectSampleState, getList);
export const selectChannelList = createSelector(selectChannelState, getList);
export const selectLadderList = createSelector(selectLadderState, getList);
export const selectPlateList = createSelector(selectPlateState, getList);
export const selectWellList = createSelector(selectWellState, getList);

export const modelToList = {
  [fromArtifactEquation.MODEL]: selectArtifactEquationList,
  [fromArtifactEstimator.MODEL]: selectArtifactEstimatorList,
  [fromLocusArtifactEstimator.MODEL]: selectLocusArtifactEstimatorList,
  [fromArtifactEstimatorLocusParams.MODEL]: selectArtifactEstimatorLocusParamsList,
  [fromArtifactEstimatorProject.MODEL]: selectArtifactEstimatorProjectList,
  [fromBin.MODEL]: selectBinList,
  [fromLocusBinSet.MODEL]: selectLocusBinSetList,
  [fromBinEstimatorLocusParams.MODEL]: selectBinEstimatorLocusParamsList,
  [fromBinEstimatorProject.MODEL]: selectBinEstimatorProjectList,
  [fromGenotypingLocusParams.MODEL]: selectGenotypingLocusParamsList,
  [fromGenotypingProject.MODEL]: selectGenotypingProjectList,
  [fromLocusSet.MODEL]: selectLocusSetList,
  [fromLocus.MODEL]: selectLocusList,
  [fromProjectChannelAnnotations.MODEL]: selectProjectChannelAnnotationsList,
  [fromProjectSampleAnnotations.MODEL]: selectProjectSampleAnnotationsList,
  [fromQuantificationBiasEstimatorLocusParams.MODEL]: selectQuantificationBiasEstimatorLocusParamsList,
  [fromQuantificationBiasEstimatorProject.MODEL]: selectQuantificationBiasEstimatorProjectList,
  [fromControlSampleAssociation.MODEL]: selectControlSampleAssociationList,
  [fromControl.MODEL]: selectControlList,
  [fromGenotype.MODEL]: selectGenotypeList,
  [fromSampleLocusAnnotation.MODEL]: selectSampleLocusAnnotationList,
  [fromSample.MODEL]: selectSampleList,
  [fromChannel.MODEL]: selectChannelList,
  [fromLadder.MODEL]: selectLadderList,
  [fromPlate.MODEL]: selectPlateList,
  [fromWell.MODEL]: selectWellList,
};

export const selectAnyGetsInFlight = createSelector(selectDBState, (db) => {
  const tables = Object.keys(db);
  for (const tableName in db) {
    if (db.hasOwnProperty(tableName)) {
      const table = db[tableName];
      if(Object.keys(table.pendingRequests).length > 0) {
        return true;
      }
    }
  }
  return false;
})