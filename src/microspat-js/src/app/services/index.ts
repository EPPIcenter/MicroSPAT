import { ArtifactEquationService } from './artifact-estimator/artifact-equation';
import { ArtifactEstimatorService } from './artifact-estimator/artifact-estimator';
import { LocusArtifactEstimatorService } from './artifact-estimator/locus-artifact-estimator';
import { ArtifactEstimatorLocusParamsService } from './artifact-estimator/locus-params';
import { ArtifactEstimatorProjectService } from './artifact-estimator/project';
import { BinService } from './bin-estimator/bin';
import { LocusBinSetService } from './bin-estimator/locus-bin-set';
import { BinEstimatorLocusParamsService } from './bin-estimator/locus-params';
import { BinEstimatorProjectService } from './bin-estimator/project';
import { GenotypingLocusParamsService } from './genotyping/locus-params';
import { GenotypingProjectService } from './genotyping/project';
import { LocusSetService } from './locus/locus-set';
import { LocusService } from './locus/locus';
import { ProjectChannelAnnotationsService } from './project/channel-annotations';
import { ProjectSampleAnnotationsService } from './project/sample-annotations';
import { QuantificationBiasEstimatorLocusParamsService } from './quantification-bias-estimator/locus-params';
import { QuantificationBiasEstimatorProjectService } from './quantification-bias-estimator/project';
import { ControlSampleAssociationService } from './sample/control-sample-association';
import { ControlService } from './sample/control';
import { GenotypeService } from './sample/genotype';
import { SampleLocusAnnotationService } from './sample/sample-locus-annotation';
import { SampleService } from './sample/sample';
import { ChannelService } from './ce/channel';
import { WellService } from './ce/well';
import { PlateService } from './ce/plate';
import { LadderService } from './ce/ladder';

import * as fromArtifactEquation from '../reducers/db/artifact-estimator/artifact-equation';
import * as fromArtifactEstimator from '../reducers/db/artifact-estimator/artifact-estimator';
import * as fromLocusArtifactEstimator from '../reducers/db/artifact-estimator/locus-artifact-estimator';
import * as fromArtifactEstimatorLocusParams from '../reducers/db/artifact-estimator/locus-params';
import * as fromArtifactEstimatorProject from '../reducers/db/artifact-estimator/project';
import * as fromBin from '../reducers/db/bin-estimator/bin';
import * as fromLocusBinSet from '../reducers/db/bin-estimator/locus-bin-set';
import * as fromBinEstimatorLocusParams from '../reducers/db/bin-estimator/locus-params';
import * as fromBinEstimatorProject from '../reducers/db/bin-estimator/project';
import * as fromGenotypingLocusParams from '../reducers/db/genotyping/locus-params';
import * as fromGenotypingProject from '../reducers/db/genotyping/project';
import * as fromLocusSet from '../reducers/db/locus/locus-set';
import * as fromLocus from '../reducers/db/locus/locus';
import * as fromProjectChannelAnnotations from '../reducers/db/project/channel-annotations';
import * as fromProjectSampleAnnotations from '../reducers/db/project/sample-annotations';
import * as fromQuantificationBiasEstimatorLocusParams from '../reducers/db/quantification-bias-estimator/locus-params';
import * as fromQuantificationBiasEstimatorProject from '../reducers/db/quantification-bias-estimator/project';
import * as fromControlSampleAssociation from '../reducers/db/sample/control-sample-association';
import * as fromControl from '../reducers/db/sample/control';
import * as fromGenotype from '../reducers/db/sample/genotype';
import * as fromSampleLocusAnnotation from '../reducers/db/sample/sample-locus-annotation';
import * as fromSample from '../reducers/db/sample/sample';
import * as fromChannel from '../reducers/db/ce/channel';
import * as fromWell from '../reducers/db/ce/well';
import * as fromPlate from '../reducers/db/ce/plate';
import * as fromLadder from '../reducers/db/ce/ladder';


export const modelToService = {
  [fromArtifactEquation.MODEL]: ArtifactEquationService,
  [fromArtifactEstimator.MODEL]: ArtifactEstimatorService,
  [fromLocusArtifactEstimator.MODEL]: LocusArtifactEstimatorService,
  [fromArtifactEstimatorLocusParams.MODEL]: ArtifactEstimatorLocusParamsService,
  [fromArtifactEstimatorProject.MODEL]: ArtifactEstimatorProjectService,
  [fromBin.MODEL]: BinService,
  [fromLocusBinSet.MODEL]: LocusBinSetService,
  [fromBinEstimatorLocusParams.MODEL]: BinEstimatorLocusParamsService,
  [fromBinEstimatorProject.MODEL]: BinEstimatorProjectService,
  [fromGenotypingLocusParams.MODEL]: GenotypingLocusParamsService,
  [fromGenotypingProject.MODEL]: GenotypingProjectService,
  [fromLocusSet.MODEL]: LocusSetService,
  [fromLocus.MODEL]: LocusService,
  [fromProjectChannelAnnotations.MODEL]: ProjectChannelAnnotationsService,
  [fromProjectSampleAnnotations.MODEL]: ProjectSampleAnnotationsService,
  [fromQuantificationBiasEstimatorLocusParams.MODEL]: QuantificationBiasEstimatorLocusParamsService,
  [fromQuantificationBiasEstimatorProject.MODEL]: QuantificationBiasEstimatorProjectService,
  [fromControlSampleAssociation.MODEL]: ControlSampleAssociationService,
  [fromControl.MODEL]: ControlService,
  [fromGenotype.MODEL]: GenotypeService,
  [fromSampleLocusAnnotation.MODEL]: SampleLocusAnnotationService,
  [fromSample.MODEL]: SampleService,
  [fromChannel.MODEL]: ChannelService,
  [fromWell.MODEL]: WellService,
  [fromPlate.MODEL]: PlateService,
  [fromLadder.MODEL]: LadderService,
}
