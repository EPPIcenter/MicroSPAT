import { combineReducers } from '@ngrx/store';
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

export interface State {
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
